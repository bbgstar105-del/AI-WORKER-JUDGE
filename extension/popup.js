const DEFAULT_API_BASE = "http://localhost:3000";
const STATUS_OPTIONS = ["消费", "转化中", "生产", "暂停"];

const state = {
  apiBase: DEFAULT_API_BASE,
  tabTitle: "",
  tabUrl: "",
  source: "unknown",
  suggestion: "建议人工判断",
  note: "",
  selectedStatus: "",
  currentProject: null,
  isReady: false,
};

const titleElement = document.getElementById("project-title");
const urlElement = document.getElementById("project-url");
const projectStatePillElement = document.getElementById("project-state-pill");
const projectStateDetailElement = document.getElementById("project-state-detail");
const suggestionPillElement = document.getElementById("suggestion-pill");
const suggestionReasonElement = document.getElementById("suggestion-reason");
const noteElement = document.getElementById("note");
const apiBaseElement = document.getElementById("api-base");
const saveButtonElement = document.getElementById("save-button");
const saveMessageElement = document.getElementById("save-message");
const refreshButtonElement = document.getElementById("refresh-suggestion");
const saveApiBaseButtonElement = document.getElementById("save-api-base");
const testConnectionButtonElement = document.getElementById("test-connection");
const openDashboardButtonElement = document.getElementById("open-dashboard");
const statusButtons = Array.from(document.querySelectorAll("#status-buttons button"));

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  bindEvents();

  try {
    state.apiBase = await loadApiBase();
    apiBaseElement.value = state.apiBase;

    const tab = await getCurrentTab();
    state.tabTitle = tab.title || "未命名项目";
    state.tabUrl = tab.url || "";
    state.source = detectSource(state.tabUrl);

    renderProjectMeta();
    await loadExistingProject();
    await loadSuggestion();
    state.isReady = true;
    updateSaveButtonState();
    setMessage(`当前连接：${state.apiBase}`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "无法读取当前页面。", "error");
  }
}

function bindEvents() {
  noteElement.addEventListener("input", (event) => {
    state.note = event.target.value;
  });

  refreshButtonElement.addEventListener("click", async () => {
    setMessage("正在刷新 AI 建议...");
    await loadSuggestion();
  });

  saveApiBaseButtonElement.addEventListener("click", async () => {
    try {
      state.apiBase = normalizeApiBase(apiBaseElement.value);
      await chrome.storage.sync.set({ apiBase: state.apiBase });
      setMessage(`已保存后端地址：${state.apiBase}`, "success");
      await testConnection();
      await loadExistingProject();
      await loadSuggestion();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存后端地址失败。", "error");
    }
  });

  testConnectionButtonElement.addEventListener("click", async () => {
    await testConnection();
  });

  openDashboardButtonElement.addEventListener("click", async () => {
    await chrome.tabs.create({ url: state.apiBase });
  });

  statusButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedStatus = button.dataset.status || "";
      renderStatusButtons();
      updateSaveButtonState();
    });
  });

  saveButtonElement.addEventListener("click", saveCurrentProject);
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("没有找到当前标签页。");
  }
  if (!tab.url) {
    throw new Error("当前页面没有可读取的 URL。");
  }
  return tab;
}

function renderProjectMeta() {
  titleElement.textContent = state.tabTitle;
  urlElement.textContent = state.tabUrl;
}

async function loadExistingProject() {
  try {
    const response = await fetch(`${state.apiBase}/api/projects?url=${encodeURIComponent(state.tabUrl)}`, {
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "读取当前项目状态失败。");
    }

    state.currentProject = result.project || null;
    if (state.currentProject) {
      state.selectedStatus = state.currentProject.currentStatus;
      state.note = state.currentProject.lastNote || "";
      noteElement.value = state.note;
    }

    renderCurrentProject();
  } catch (error) {
    state.currentProject = null;
    renderCurrentProject(error instanceof Error ? error.message : "当前无法检查线上项目状态。");
  }
}

async function loadSuggestion() {
  try {
    const response = await fetch(`${state.apiBase}/api/project-ai-suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: state.tabTitle,
        url: state.tabUrl,
        source: state.source,
        note: state.note,
      }),
    });

    const result = await response.json();
    state.suggestion = result.suggestion || "建议人工判断";
    if (!state.currentProject && !state.selectedStatus) {
      state.selectedStatus = suggestionToStatus(state.suggestion);
    }
    renderSuggestion(result.reason || "请人工确认当前项目状态。");
    renderStatusButtons();

    if (!response.ok) {
      setMessage(result.error || "AI 建议暂不可用，已回退到人工判断。", "error");
      return;
    }

    setMessage("AI 建议已更新。");
  } catch (error) {
    state.suggestion = "建议人工判断";
    renderSuggestion("无法请求后端，请确认服务已启动且插件地址配置正确。");
    if (!state.currentProject && !state.selectedStatus) {
      state.selectedStatus = "";
    }
    renderStatusButtons();
    setMessage(error instanceof Error ? error.message : "AI 建议请求失败。", "error");
  } finally {
    updateSaveButtonState();
  }
}

function renderSuggestion(reason) {
  suggestionPillElement.textContent = state.suggestion;
  suggestionPillElement.className = `suggestion-pill ${suggestionClassName(state.suggestion)}`;
  suggestionReasonElement.textContent = reason;
}

function renderStatusButtons() {
  statusButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.status === state.selectedStatus);
  });
}

function updateSaveButtonState() {
  saveButtonElement.disabled = !state.isReady || !STATUS_OPTIONS.includes(state.selectedStatus);
}

async function saveCurrentProject() {
  if (!STATUS_OPTIONS.includes(state.selectedStatus)) {
    setMessage("请先选择一个项目状态。", "error");
    return;
  }

  saveButtonElement.disabled = true;
  setMessage("正在保存...");

  try {
    const project = await ensureProject();
    const updatedProject = await appendTag(project.id);
    state.currentProject = updatedProject;
    state.note = updatedProject.lastNote || state.note;
    renderCurrentProject();
    saveButtonElement.textContent = "更新标签";
    setMessage("已保存到项目状态记录。", "success");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "保存失败。", "error");
  } finally {
    updateSaveButtonState();
  }
}

async function ensureProject() {
  if (state.currentProject) {
    return state.currentProject;
  }

  const createResponse = await fetch(`${state.apiBase}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: state.tabTitle,
      url: state.tabUrl,
      source: state.source,
      currentStatus: state.selectedStatus,
      lastNote: state.note,
      aiSuggestion: state.suggestion,
    }),
  });

  const createResult = await createResponse.json();
  if (!createResponse.ok) {
    throw new Error(createResult.error || "新建项目失败。");
  }

  state.currentProject = createResult.project;
  renderCurrentProject();
  return createResult.project;
}

async function appendTag(projectId) {
  const response = await fetch(`${state.apiBase}/api/project-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      humanStatus: state.selectedStatus,
      aiSuggestion: state.suggestion,
      note: state.note,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "追加标签失败。");
  }

  return result.project;
}

function renderCurrentProject(errorMessage = "") {
  if (!state.currentProject) {
    projectStatePillElement.textContent = "未同步";
    projectStatePillElement.className = "state-pill state-empty";
    projectStateDetailElement.textContent = errorMessage || "当前页面还没有保存记录，首次保存后会出现在后台。";
    saveButtonElement.textContent = "保存标签";
    return;
  }

  projectStatePillElement.textContent = `已记录 · ${state.currentProject.currentStatus}`;
  projectStatePillElement.className = "state-pill state-synced";
  projectStateDetailElement.textContent = state.currentProject.lastNote
    ? `最近备注：${state.currentProject.lastNote}`
    : "这个项目已经入库，可以继续补状态和备注。";
  saveButtonElement.textContent = "更新标签";
}

async function loadApiBase() {
  const stored = await chrome.storage.sync.get(["apiBase"]);
  return normalizeApiBase(stored.apiBase || DEFAULT_API_BASE);
}

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return DEFAULT_API_BASE;
  let parsedUrl;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error("后端地址格式不正确，请填写完整的 http 或 https 地址。");
  }
  return parsedUrl.toString().replace(/\/$/, "");
}

async function testConnection() {
  try {
    const response = await fetch(`${state.apiBase}/api/health`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || "后端连接失败。");
    }
    setMessage(`连接成功：${state.apiBase}`, "success");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "测试连接失败。", "error");
  }
}

function detectSource(url) {
  if (!url) return "unknown";
  if (url.includes("github.com")) return "github";
  if (url.includes("notion.so") || url.includes("notion.site")) return "notion";
  if (url.includes("docs.") || url.includes("doc.")) return "docs";
  if (url.startsWith("http")) return "web";
  return "unknown";
}

function suggestionToStatus(suggestion) {
  if (suggestion === "更像消费") return "消费";
  if (suggestion === "更像转化中") return "转化中";
  if (suggestion === "更像生产") return "生产";
  return "";
}

function suggestionClassName(suggestion) {
  if (suggestion === "更像消费") return "suggestion-consume";
  if (suggestion === "更像转化中") return "suggestion-convert";
  if (suggestion === "更像生产") return "suggestion-produce";
  return "suggestion-neutral";
}

function setMessage(message, tone = "") {
  saveMessageElement.textContent = message;
  saveMessageElement.className = "footer-message";
  if (tone === "error") {
    saveMessageElement.classList.add("is-error");
  }
  if (tone === "success") {
    saveMessageElement.classList.add("is-success");
  }
}
