const weights = {
  delivery: 25,
  feedback: 20,
  reusable: 20,
  efficiency: 15,
  judgment: 10,
  next: 10,
};

const textExtensions = new Set([".html", ".css", ".js", ".ts", ".tsx", ".md", ".json", ".txt"]);
const codeExtensions = new Set([".html", ".css", ".js", ".ts", ".tsx"]);
const maxTextFileSize = 180 * 1024;
const maxReadableFiles = 80;

let currentScan = null;

const folderInput = document.querySelector("#folder-input");
const questionsPanel = document.querySelector("#questions-panel");
const judgeButton = document.querySelector("#judge-button");
const resetButton = document.querySelector("#reset-button");
const errorEl = document.querySelector("#form-error");
const resultPanel = document.querySelector(".result-panel");

const sampleScans = {
  thin: {
    folderName: "idea-notes",
    totalFiles: 1,
    readableFiles: 1,
    extensions: { ".txt": 1 },
    hasReadme: false,
    hasDocs: false,
    hasEntry: false,
    hasPackage: false,
    hasCode: false,
    hasStyle: false,
    hasScript: false,
    hasReusableStructure: false,
    docs: [],
    entries: [],
    reusableFolders: [],
    risks: ["只有零散文本，还不像一个可验收作品。", "缺少可运行入口。", "缺少说明文档。"],
    signals: ["发现少量文本材料。"],
    textHints: "一些想法和功能名，但没有 demo、README 或可运行入口。",
  },
  demo: {
    folderName: "ai-work-judge-demo",
    totalFiles: 3,
    readableFiles: 3,
    extensions: { ".html": 1, ".css": 1, ".js": 1 },
    hasReadme: false,
    hasDocs: false,
    hasEntry: true,
    hasPackage: false,
    hasCode: true,
    hasStyle: true,
    hasScript: true,
    hasReusableStructure: false,
    docs: [],
    entries: ["index.html"],
    reusableFolders: [],
    risks: ["有可运行 demo，但缺少 README 或作品说明。"],
    signals: ["发现 index.html，可作为静态入口。", "发现样式和交互文件，具备可运行形态。"],
    textHints: "静态网页 demo，包含 HTML、CSS 和 JS。",
  },
  complete: {
    folderName: "ai-work-judge",
    totalFiles: 6,
    readableFiles: 6,
    extensions: { ".md": 3, ".html": 1, ".css": 1, ".js": 1 },
    hasReadme: true,
    hasDocs: true,
    hasEntry: true,
    hasPackage: false,
    hasCode: true,
    hasStyle: true,
    hasScript: true,
    hasReusableStructure: true,
    docs: ["AGENTS.md", "策划书.md", "技术架构.md"],
    entries: ["demo/index.html"],
    reusableFolders: ["demo/"],
    risks: [],
    signals: ["发现项目规则、策划和架构文档。", "发现可运行入口和 demo 目录。", "作品结构完整，具备交付准备度。"],
    textHints: "项目包含规则、策划、技术架构和静态 demo。",
  },
};

function extensionOf(path) {
  const match = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

function filePath(file) {
  return file.webkitRelativePath || file.name;
}

async function scanFiles(fileList) {
  const files = Array.from(fileList);
  const paths = files.map(filePath);
  const extensions = {};
  let readableFiles = 0;
  let textHints = "";

  for (const file of files.slice(0, maxReadableFiles)) {
    const ext = extensionOf(file.name);
    if (!ext) continue;
    extensions[ext] = (extensions[ext] || 0) + 1;

    if (textExtensions.has(ext) && file.size <= maxTextFileSize) {
      readableFiles += 1;
      try {
        textHints += `\n--- ${filePath(file)} ---\n${(await file.text()).slice(0, 1200)}`;
      } catch {
        textHints += `\n--- ${filePath(file)} ---\n[read failed]`;
      }
    }
  }

  const lowerPaths = paths.map((path) => path.toLowerCase().replaceAll("\\", "/"));
  const docs = paths.filter((path) => /(^|\/)(readme\.md|agents\.md|策划书\.md|技术架构\.md)$/i.test(path.replaceAll("\\", "/")));
  const entries = paths.filter((path) => /(^|\/)(index\.html|package\.json|readme\.md)$/i.test(path.replaceAll("\\", "/")));
  const reusableFolders = ["components/", "lib/", "scripts/", "templates/", "demo/"].filter((folder) =>
    lowerPaths.some((path) => path.includes(`/${folder}`) || path.startsWith(folder))
  );
  const hasReadme = lowerPaths.some((path) => /(^|\/)readme\.md$/.test(path));
  const hasDocs = docs.length > 0;
  const hasEntry = lowerPaths.some((path) => /(^|\/)(index\.html|package\.json)$/.test(path));
  const hasPackage = lowerPaths.some((path) => /(^|\/)package\.json$/.test(path));
  const hasCode = files.some((file) => codeExtensions.has(extensionOf(file.name)));
  const hasStyle = files.some((file) => extensionOf(file.name) === ".css");
  const hasScript = files.some((file) => [".js", ".ts", ".tsx"].includes(extensionOf(file.name)));
  const hasReusableStructure = reusableFolders.length > 0 || docs.length >= 2;
  const folderName = paths[0]?.split(/[\\/]/)[0] || "selected-folder";

  return buildScan({
    folderName,
    totalFiles: files.length,
    readableFiles,
    extensions,
    hasReadme,
    hasDocs,
    hasEntry,
    hasPackage,
    hasCode,
    hasStyle,
    hasScript,
    hasReusableStructure,
    docs,
    entries,
    reusableFolders,
    textHints,
  });
}

function buildScan(scan) {
  const signals = [];
  const risks = [];

  if (scan.hasEntry) signals.push("发现可运行入口或项目入口。");
  else risks.push("缺少可运行入口，例如 index.html 或 package.json。");

  if (scan.hasDocs) signals.push("发现说明文档或项目规则。");
  else risks.push("缺少 README、策划书或技术架构这类说明文档。");

  if (scan.hasCode) signals.push("发现代码资产。");
  else risks.push("没有明显代码文件，可能仍停留在想法或材料阶段。");

  if (scan.hasStyle && scan.hasScript) signals.push("同时发现样式和交互文件，具备 demo 形态。");
  if (scan.hasReusableStructure) signals.push("发现可复用结构或多份文档沉淀。");
  if (scan.totalFiles <= 2) risks.push("文件数量很少，需要确认它是否已经是可交付作品。");
  if (scan.totalFiles > 40 && !scan.hasReadme) risks.push("文件较多但缺少 README，后续接手和验收成本会高。");

  return { ...scan, signals, risks };
}

function scoreArtifact(scan, context) {
  const deliveryBase = Math.min(
    22,
    (scan.hasEntry ? 10 : 0) + (scan.hasDocs ? 5 : 0) + (scan.hasCode ? 4 : 0) + (scan.hasStyle && scan.hasScript ? 3 : 0)
  );
  const reusableBase = Math.min(
    weights.reusable,
    (scan.hasReusableStructure ? 10 : 0) + (scan.hasDocs ? 6 : 0) + (scan.hasCode ? 5 : 0) + (scan.hasStyle && scan.hasScript ? 5 : 0)
  );
  const judgmentBase = Math.min(5, scan.hasDocs ? 3 : 0) + (mentionsQuality(scan.textHints) ? 2 : 0);
  const nextScore = hasClearNextAction(context.next) ? weights.next : Math.min(6, Math.floor(context.next.length / 8));

  const breakdown = {
    delivery: context.delivered ? weights.delivery : deliveryBase,
    feedback: context.feedback ? weights.feedback : 0,
    reusable: reusableBase,
    efficiency: context.efficient ? weights.efficiency : 0,
    judgment: Math.min(weights.judgment, judgmentBase + (context.judged ? 5 : 0)),
    next: nextScore,
  };

  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { total, breakdown };
}

function mentionsQuality(text) {
  return /验证|测试|反馈|复盘|架构|规则|验收|用户|发布|交付|TODO|待办/i.test(text || "");
}

function hasClearNextAction(text) {
  const actionWords = ["发布", "提交", "发给", "反馈", "整理", "补", "删", "验证", "部署", "录", "改", "测试", "写", "上线"];
  return text.length >= 12 && actionWords.some((word) => text.includes(word));
}

function classify(total) {
  if (total >= 80) {
    return {
      label: "真实生产",
      copy: "作品已经具备交付、反馈、复用或效率收益证据，可以进入下一轮真实场景。",
    };
  }
  if (total >= 50) {
    return {
      label: "潜在生产",
      copy: "作品已经成形，但还需要发布、反馈或更清楚的交付路径来完成验证。",
    };
  }
  if (total >= 20) {
    return {
      label: "学习消费",
      copy: "当前材料有学习和探索价值，但作品证据还不够强。",
    };
  }
  return {
    label: "自嗨/生产模拟器",
    copy: "目前更像在体验生产感，缺少可运行、可交付或可复用的作品证据。",
  };
}

function getContext() {
  return {
    delivered: document.querySelector("#delivered").checked,
    feedback: document.querySelector("#feedback").checked,
    efficient: document.querySelector("#efficient").checked,
    judged: document.querySelector("#judged").checked,
    next: document.querySelector("#next-context").value.trim(),
  };
}

function setContext(context) {
  document.querySelector("#delivered").checked = context.delivered;
  document.querySelector("#feedback").checked = context.feedback;
  document.querySelector("#efficient").checked = context.efficient;
  document.querySelector("#judged").checked = context.judged;
  document.querySelector("#next-context").value = context.next;
}

function buildReasons(scan, context, breakdown) {
  const reasons = [];

  if (scan.hasEntry) reasons.push("作品证据：检测到入口文件，说明它不只是聊天记录或零散想法。");
  else reasons.push("作品风险：没有检测到入口文件，用户或评委很难直接运行或查看。");

  if (scan.hasDocs) reasons.push("说明证据：检测到文档/规则文件，降低了别人理解作品的成本。");
  else reasons.push("说明缺口：缺少 README、策划书或架构说明，交付时解释成本偏高。");

  if (breakdown.reusable >= 14) reasons.push("复用证据：项目结构或文档沉淀较完整，后续可以继续迭代。");
  else reasons.push("复用不足：当前还需要沉淀模板、组件、脚本或清晰文档。");

  if (context.feedback) reasons.push("反馈证据：作品已经接受过真实用户或他人的外部校准。");
  else reasons.push("反馈缺口：文件系统无法证明有人用过，仍需要外部反馈。");

  if (breakdown.next >= 8) reasons.push("推进清晰：下一步有具体场景，不只是继续优化。");
  else reasons.push("推进模糊：下一步需要从“继续完善”压缩成一个可验证动作。");

  return reasons;
}

function buildNextAction(scan, context, total) {
  if (!scan.hasDocs) {
    return "先补一个 README：用 6 行说明它解决什么、怎么打开、核心功能、当前限制和下一步。";
  }
  if (!scan.hasEntry) {
    return "先做一个最小入口：index.html、启动命令或演示链接，让别人能在 30 秒内看到作品。";
  }
  if (!context.delivered) {
    return "不要继续内部打磨。先录屏或发链接给 3 个目标用户，确认他们是否看得懂、愿不愿意用。";
  }
  if (!context.feedback) {
    return "下一步只做收反馈：问 3 个人一个问题，‘你会在哪一步放弃使用它？’";
  }
  if (!context.judged) {
    return "回到作品里挑 3 个问题：哪里空泛、哪里不可执行、哪里不符合你的验收标准。";
  }
  if (total >= 80) {
    return "保留这个版本作为可交付基线，下一步只做一个小版本迭代，并记录反馈变化。";
  }
  return "把下一步压缩成一个可验收动作：发布、部署、补文档、收反馈或删除无效功能。";
}

function renderScan(scan) {
  const extText = Object.entries(scan.extensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext, count]) => `${ext} ${count}`)
    .join(" · ") || "未识别";

  document.querySelector("#artifact-summary").innerHTML = `
    <div class="summary-grid">
      <div><span>Folder</span><strong>${escapeHtml(scan.folderName)}</strong></div>
      <div><span>Files</span><strong>${scan.totalFiles}</strong></div>
      <div><span>Readable</span><strong>${scan.readableFiles}</strong></div>
      <div><span>Types</span><strong>${escapeHtml(extText)}</strong></div>
    </div>
    <div class="evidence-columns">
      <div>
        <h3>Detected evidence</h3>
        <ul>${listItems(scan.signals.length ? scan.signals : ["暂未发现强作品证据。"])}</ul>
      </div>
      <div>
        <h3>Risk flags</h3>
        <ul>${listItems(scan.risks.length ? scan.risks : ["暂未发现明显结构风险。"])}</ul>
      </div>
    </div>
  `;
}

function renderResult(scan, context) {
  const { total, breakdown } = scoreArtifact(scan, context);
  const verdict = classify(total);
  const reasons = buildReasons(scan, context, breakdown);
  const nextAction = buildNextAction(scan, context, total);

  document.querySelector("#score-value").textContent = total;
  document.querySelector("#verdict-label").textContent = verdict.label;
  document.querySelector("#verdict-copy").textContent = verdict.copy;
  document.querySelector("#breakdown").innerHTML = renderBreakdown(breakdown);
  document.querySelector("#reasons").innerHTML = listItems(reasons);
  document.querySelector("#next-action").textContent = nextAction;

  updatePipeline("judge");
  resultPanel.classList.remove("is-updated");
  window.requestAnimationFrame(() => resultPanel.classList.add("is-updated"));
}

function renderBreakdown(breakdown) {
  const labels = {
    delivery: ["交付", weights.delivery],
    feedback: ["反馈", weights.feedback],
    reusable: ["复用", weights.reusable],
    efficiency: ["效率", weights.efficiency],
    judgment: ["判断", weights.judgment],
    next: ["推进", weights.next],
  };

  return Object.entries(breakdown)
    .map(([key, value]) => {
      const [label, max] = labels[key];
      const percent = Math.round((value / max) * 100);
      return `
        <div class="metric">
          <span>${label}</span>
          <div class="meter" aria-hidden="true"><span style="width: ${percent}%"></span></div>
          <strong>${value}/${max}</strong>
        </div>
      `;
    })
    .join("");
}

function listItems(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updatePipeline(stage) {
  const order = ["scan", "detect", "ask", "judge"];
  const activeIndex = order.indexOf(stage);
  order.forEach((name, index) => {
    const element = document.querySelector(`#step-${name}`);
    element.classList.toggle("is-active", index <= activeIndex);
  });
}

function revealQuestions(scan) {
  currentScan = scan;
  renderScan(scan);
  questionsPanel.hidden = false;
  updatePipeline("ask");
  document.querySelector("#verdict-label").textContent = "已扫描作品";
  document.querySelector("#verdict-copy").textContent = "系统已提取文件证据。请补充文件里看不出的外部验证信息。";
  document.querySelector("#score-value").textContent = "--";
  document.querySelector("#breakdown").innerHTML = "";
  document.querySelector("#reasons").innerHTML = listItems(scan.signals.concat(scan.risks).slice(0, 5));
  document.querySelector("#next-action").textContent = "回答下方 3 个关键问题后，生成最终验收结果。";
}

function resetAll() {
  currentScan = null;
  folderInput.value = "";
  questionsPanel.hidden = true;
  document.querySelectorAll(".context-checks input").forEach((input) => {
    input.checked = false;
  });
  document.querySelector("#next-context").value = "";
  errorEl.textContent = "";
  document.querySelector("#score-value").textContent = "--";
  document.querySelector("#verdict-label").textContent = "等待作品";
  document.querySelector("#verdict-copy").textContent = "选择一个项目文件夹后，系统会先扫描结构，再追问必要信息。";
  document.querySelector("#artifact-summary").innerHTML = '<p class="empty-state">当前没有作品证据。请选择本地项目文件夹。</p>';
  document.querySelector("#breakdown").innerHTML = "";
  document.querySelector("#reasons").innerHTML = "<li>系统会优先根据文件结构、入口文件、说明文档和复用资产建立初步判断。</li>";
  document.querySelector("#next-action").textContent = "先提交作品证据，再进入审判。";
  updatePipeline("scan");
}

folderInput.addEventListener("change", async (event) => {
  const files = event.target.files;
  errorEl.textContent = "";

  if (!files || files.length === 0) {
    return;
  }

  updatePipeline("detect");
  const scan = await scanFiles(files);
  revealQuestions(scan);
});

judgeButton.addEventListener("click", () => {
  if (!currentScan) {
    errorEl.textContent = "请先选择一个项目文件夹。";
    return;
  }

  const context = getContext();
  if (!context.next) {
    errorEl.textContent = "请补充下一步准备进入的场景。";
    return;
  }

  errorEl.textContent = "";
  renderResult(currentScan, context);
});

resetButton.addEventListener("click", resetAll);

document.querySelectorAll("[data-case]").forEach((button) => {
  button.addEventListener("click", () => {
    const selected = sampleScans[button.dataset.case];
    const contextByCase = {
      thin: { delivered: false, feedback: false, efficient: false, judged: false, next: "继续让 AI 想更多功能。" },
      demo: { delivered: false, feedback: false, efficient: true, judged: true, next: "补 README 后发给 3 个同学试用。" },
      complete: { delivered: true, feedback: true, efficient: true, judged: true, next: "根据反馈删掉一个无效模块，并部署成可访问版本。" },
    };

    setContext(contextByCase[button.dataset.case]);
    revealQuestions(selected);
    renderResult(selected, contextByCase[button.dataset.case]);
  });
});
