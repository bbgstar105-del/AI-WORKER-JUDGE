const API_BASE = "http://localhost:3000";
const STATUS_OPTIONS = ["消费", "转化中", "生产", "暂停"];

const state = {
  tabTitle: "",
  tabUrl: "",
  source: "unknown",
  suggestion: "建议人工判断",
  note: "",
  selectedStatus: "",
  isReady: false,
};

const titleElement = document.getElementById("project-title");
const urlElement = document.getElementById("project-url");
const suggestionPillElement = document.getElementById("suggestion-pill");
const suggestionReasonElement = document.getElementById("suggestion-reason");
const noteElement = document.getElementById("note");
const saveButtonElement = document.getElementById("save-button");
const saveMessageElement = document.getElementById("save-message");
const refreshButtonElement = document.getElementById("refresh-suggestion");
const statusButtons = Array.from(document.querySelectorAll("#status-buttons button"));

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  bindEvents();

  try {
    const tab = await getCurrentTab();
    state.tabTitle = tab.title || "未命名项目";
    state.tabUrl = tab.url || "";
    state.source = detectSource(state.tabUrl);

    renderProjectMeta();
    await loadSuggestion();
    state.isReady = true;
    updateSaveButtonState();
    setMessage("可以手动确认项目状态后保存。");
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

async function loadSuggestion() {
  try {
    const response = await fetch(`${API_BASE}/api/project-ai-suggestion`, {
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
    if (!state.selectedStatus) {
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
    renderSuggestion("无法请求本地后端，请确认 `npm run dev` 已启动。");
    if (!state.selectedStatus) {
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
    await appendTag(project.id);
    setMessage("已保存到项目状态记录。", "success");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "保存失败。", "error");
  } finally {
    updateSaveButtonState();
  }
}

async function ensureProject() {
  const listResponse = await fetch(`${API_BASE}/api/projects`);
  if (!listResponse.ok) {
    throw new Error("无法读取项目列表，请确认本地后端正在运行。");
  }

  const listResult = await listResponse.json();
  const existing = Array.isArray(listResult.projects)
    ? listResult.projects.find((project) => project.url === state.tabUrl)
    : null;

  if (existing) {
    return existing;
  }

  const createResponse = await fetch(`${API_BASE}/api/projects`, {
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

  return createResult.project;
}

async function appendTag(projectId) {
  const response = await fetch(`${API_BASE}/api/project-tags`, {
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
