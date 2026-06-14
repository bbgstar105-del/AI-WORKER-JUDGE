import type { AnalyzeArtifactResponse, DeepSeekJudge, DeliverabilityReport, JudgeRequest, WeeklyAiSummary, WeeklyLocalSummary, WorkArtifact } from "./types";

const allowedVerdicts = new Set(["真实生产", "潜在生产", "学习消费", "自嗨/生产模拟器"]);

export class DeepSeekError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function deepSeekConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}

export async function callDeepSeekJudge(payload: JudgeRequest): Promise<DeepSeekJudge> {
  const { apiKey, baseUrl, model } = deepSeekConfig();
  if (!apiKey) {
    throw new DeepSeekError("Missing DEEPSEEK_API_KEY", 401);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "你是 AI Work Judge 的作品验收器。",
            "只评价用户提交的作品证据，不评价用户人格。",
            "不得覆盖本地扫描事实；文件里看不出的信息必须列为 missingEvidence 或 questions。",
            "输出必须是严格 JSON，不要 Markdown，不要解释 JSON 之外的内容。",
            "nextAction 必须具体可执行，禁止写继续优化、继续努力这类空话。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            expectedShape: {
              verdict: "真实生产 | 潜在生产 | 学习消费 | 自嗨/生产模拟器",
              scoreAdjustment: "integer from -10 to 10",
              reasons: "string[] length 3-5",
              missingEvidence: "string[] length 0-4",
              questions: "string[] length 0-3",
              nextAction: "string",
              conciseSummary: "string",
            },
            payload,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new DeepSeekError(`DeepSeek API error ${response.status}: ${text.slice(0, 500)}`, response.status);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("DeepSeek response missing content");
  }

  return parseDeepSeekJudge(content);
}

export async function callDeepSeekAnalyzeArtifact(artifact: WorkArtifact): Promise<AnalyzeArtifactResponse> {
  const result = await callDeepSeekJson({
    system: [
      "你是 AI Work Judge 的作品初审员。",
      "核心思想来自“消费方便 vs 生产方便”和“AI 生产模拟器”：判断用户是在消费 AI 成就感，还是产生了可算账的生产结果。",
      "你需要内部识别作品证据，但 visibleEvidence 和 uncertainties 不会直接展示给用户。",
      "questions 必须是 4 个围绕当前作品的具体追问，但不要把重点放在技术实现、代码结构、框架或组件上。",
      "四个追问分别覆盖：1. 这件作品今天到底更偏消费还是生产；2. 有没有可算账结果，如收入、提效、降本、真实问题解决、用户反馈；3. 有没有经历痛苦判断，如推翻 AI、删掉平庸方案、重新定义标准；4. 明天如何把它推向外部验收。",
      "每个问题必须带入作品信息，比如作品标题、页面承诺、用途、可见产物或文档表达；但不要问技术细节。",
      "看不出来的信息必须变成 uncertainties 或 questions，不要臆测。",
      "所有字符串必须使用简体中文。",
      "输出严格 JSON，不要 Markdown，不要 JSON 外解释。",
    ].join("\n"),
    user: {
      expectedShape: {
        artifactType: "github | web | bilibili | xiaohongshu | wechat | folder | unknown",
        title: "string",
        summary: "string",
        visibleEvidence: "string[] length 2-5",
        uncertainties: "string[] length 1-4",
        questions: "string[] length exactly 4",
      },
      artifact,
    },
  });

  return {
    artifact,
    artifactType: normalizeArtifactType(result.artifactType),
    title: String(result.title || artifactTitle(artifact)),
    summary: String(result.summary || "作品信息不足，需要补充上下文。"),
    visibleEvidence: normalizeStringArray(result.visibleEvidence, 5),
    uncertainties: normalizeStringArray(result.uncertainties, 4),
    questions: ensureFourQuestions(normalizeStringArray(result.questions, 4)),
  };
}

export async function callDeepSeekDeliverabilityReport(artifact: WorkArtifact, answers: string[]): Promise<DeliverabilityReport> {
  const result = await callDeepSeekJson({
    system: [
      "你是 AI Work Judge 的生产性评审员。",
      "你的任务是判断用户提交的 AI 作品更像“消费幻觉”“学习消费”“潜在生产”还是“真实生产”。核心不是技术完成度，而是是否产生可算账结果。",
      "消费幻觉：主要是生成、聊天、构想、界面看起来完整，但没有交付对象、使用证据或可验证产出。",
      "学习消费：有学习、练习、实验价值，但产物主要服务于学习，不足以交付给别人使用。",
      "潜在生产：已经有作品雏形、可运行入口、明确场景或复用资产，但缺少反馈、发布、交付材料或真实使用。",
      "真实生产：已经交付给真实对象，存在反馈、使用、复用、效率收益或明确业务/创作价值。",
      "最终必须给一个处理决策：Stop 停止投入；Convert 转成可复用资产；Validate 拿去外部验证；Scale 放大有效结果。",
      "消费幻觉通常对应 Stop 或 Convert；学习消费通常对应 Convert；潜在生产通常对应 Validate；真实生产通常对应 Scale。",
      "判断时必须显式区分：做出来的爽感、学习输入、可发布产物、可算账结果。",
      "可算账结果包括：收入、成交、用户反馈、节省时间、降低成本、解决真实工作问题、形成可复用资产、带来影响力或信誉。",
      "痛苦判断包括：反驳 AI、删掉平庸输出、重构方案、明确验收标准、从跨领域拿来更好的启动词。",
      "只评价作品证据和交付距离，不评价用户本人。",
      "不要展示内部扫描清单；要把证据转译成用户能理解的生产性判断。",
      "报告会进入长期项目证据账本，所以输出要支持前后对比，不要只给一次性建议。",
      "输出必须像产品评审结论，少用概念词，多用事实句。不要写让普通用户不明所以的抽象话。",
      "每条数组内容控制在 28 个汉字以内，优先写“没有用户反馈”“还没发给别人”“只有本地 demo”这类直白表达。",
      "oneLineVerdict 必须是一句人话，格式接近：它已经有雏形，但现在还不能算生产。",
      "whyThisLevel 只解释最关键原因，不要超过 55 个汉字。",
      "evidenceConfirmed 和 evidenceMissing 是信任来源，必须基于作品和回答里的证据，不要空泛。",
      "doNotDo 必须告诉用户接下来不要继续做什么，用于止损。",
      "下一步动作必须具体到 24 小时内能做，禁止写“继续优化”“完善体验”这类空话。",
      "所有字符串必须使用简体中文。",
      "输出严格 JSON，不要 Markdown，不要 JSON 外解释。",
    ].join("\n"),
    user: {
      expectedShape: {
        productivityLevel: "消费幻觉 | 学习消费 | 潜在生产 | 真实生产",
        workDecision: "Stop | Convert | Validate | Scale",
        decisionLabel: "string，中文短标签，如 去验证",
        decisionReason: "string，一句人话解释为什么是这个决策",
        oneLineVerdict: "string",
        whyThisLevel: "string",
        evidenceConfirmed: "string[] length 2-4，已经确认的证据",
        evidenceMissing: "string[] length 2-4，还缺的证据",
        doNotDo: "string[] length exactly 3，接下来不要做什么",
        valueLedger: "string[] length 2-4，用直白短句列出已经被验证或尚未被验证的结果",
        simulationRisk: "string[] length 2-4，用直白短句指出哪里还像自嗨",
        strongestSignal: "string[] length 2-4，用直白短句说已经可以保留什么",
        missingProof: "string[] length 2-5，用直白短句说缺什么外部证据",
        nextThreeActions: "string[] length exactly 3",
        finalRecommendation: "继续 | 暂停 | 转向 | 发布前补齐",
        tomorrowAdjustment: "string，明天如何从消费端切到生产端",
        summary: "string",
      },
      artifact,
      answers,
    },
  });

  return {
    productivityLevel: normalizeProductivityLevel(result.productivityLevel),
    workDecision: normalizeWorkDecision(result.workDecision, result.productivityLevel),
    decisionLabel: String(result.decisionLabel || fallbackDecisionLabel(normalizeWorkDecision(result.workDecision, result.productivityLevel))),
    decisionReason: String(result.decisionReason || "下一步要按证据决定投入，而不是继续凭感觉打磨。"),
    oneLineVerdict: String(result.oneLineVerdict || "它已经有雏形，但现在还不能算生产。"),
    whyThisLevel: String(result.whyThisLevel || "因为还没有真实用户反馈，也没有明确的外部验收结果。"),
    evidenceConfirmed: ensureEvidenceConfirmed(normalizeStringArray(result.evidenceConfirmed, 4)),
    evidenceMissing: ensureEvidenceMissing(normalizeStringArray(result.evidenceMissing, 4)),
    doNotDo: ensureDoNotDo(normalizeStringArray(result.doNotDo, 3)),
    valueLedger: ensureValueLedger(normalizeStringArray(result.valueLedger, 4)),
    simulationRisk: ensureSimulationRisk(normalizeStringArray(result.simulationRisk, 4)),
    strongestSignal: ensureStrongSignal(normalizeStringArray(result.strongestSignal, 4)),
    missingProof: ensureMissingProof(normalizeStringArray(result.missingProof, 5)),
    nextThreeActions: ensureNextThreeActions(normalizeStringArray(result.nextThreeActions, 3)),
    finalRecommendation: normalizeFinalRecommendation(result.finalRecommendation),
    tomorrowAdjustment: String(result.tomorrowAdjustment || "明天先把它发给一个真实对象，记录对方是否看懂、是否愿意用。"),
    summary: String(result.summary || "先拿到外部反馈，再决定是否继续投入。"),
  };
}

export async function callDeepSeekWeeklySummary(summary: WeeklyLocalSummary): Promise<WeeklyAiSummary> {
  const result = await callDeepSeekJson({
    system: [
      "你是 AI Work Judge 的每周生产性复盘员。",
      "你的任务是基于本地聚合指标，总结这一周更偏消费 AI 成就感，还是更偏真实生产推进。",
      "只评价作品证据，不评价用户本人。",
      "不要编造未提供的数据，不要说教，不要鸡汤。",
      "输出要像冷静的产品评审，直接指出本周最强生产信号、最大消费风险和下周优先动作。",
      "nextWeekFocus 必须是 3 条，且每条都能在一周内执行。",
      "所有字符串必须使用简体中文。",
      "输出严格 JSON，不要 Markdown，不要 JSON 外解释。",
    ].join("\n"),
    user: {
      expectedShape: {
        weekLabel: "string",
        productionBias: "更偏生产 | 更偏消费 | 转化期",
        conciseSummary: "string",
        strongestSignal: "string",
        biggestRisk: "string",
        nextWeekFocus: "string[] length exactly 3",
      },
      summary,
    },
  });

  return {
    weekLabel: String(result.weekLabel || summary.weekLabel),
    productionBias: normalizeProductionBias(result.productionBias, summary.productionBias),
    conciseSummary: String(result.conciseSummary || localWeeklySentence(summary)),
    strongestSignal: String(result.strongestSignal || summary.strongestSignal),
    biggestRisk: String(result.biggestRisk || summary.biggestRisk),
    nextWeekFocus: ensureWeeklyFocus(normalizeStringArray(result.nextWeekFocus, 3), summary.nextWeekFocus),
  };
}

export async function callDeepSeekJson(payload: { system: string; user: unknown }): Promise<Record<string, unknown>> {
  const { apiKey, baseUrl, model } = deepSeekConfig();
  if (!apiKey) {
    throw new DeepSeekError("Missing DEEPSEEK_API_KEY", 401);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: payload.system },
        { role: "user", content: JSON.stringify(payload.user) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new DeepSeekError(`DeepSeek API error ${response.status}: ${text.slice(0, 500)}`, response.status);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new DeepSeekError("DeepSeek response missing content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new DeepSeekError("DeepSeek returned non-JSON content");
  }
  if (!isRecord(parsed)) throw new DeepSeekError("DeepSeek JSON is not an object");
  return parsed;
}

export function parseDeepSeekJudge(content: string): DeepSeekJudge {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new DeepSeekError("DeepSeek returned non-JSON content");
  }

  if (!isRecord(parsed)) throw new DeepSeekError("DeepSeek JSON is not an object");
  const verdict = String(parsed.verdict || "");
  if (!allowedVerdicts.has(verdict)) throw new DeepSeekError("DeepSeek verdict is invalid");

  return {
    verdict: verdict as DeepSeekJudge["verdict"],
    scoreAdjustment: clampAdjustment(Number(parsed.scoreAdjustment || 0)),
    reasons: normalizeStringArray(parsed.reasons, 5),
    missingEvidence: normalizeStringArray(parsed.missingEvidence, 4),
    questions: normalizeStringArray(parsed.questions, 3),
    nextAction: String(parsed.nextAction || "补充 README、发布可访问版本，并找 3 个目标用户收反馈。"),
    conciseSummary: String(parsed.conciseSummary || "AI 已完成作品证据审查。"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => String(item)).filter(Boolean);
}

function artifactTitle(artifact: WorkArtifact): string {
  if (artifact.kind === "link") return artifact.title || artifact.url;
  return artifact.scan.folderName;
}

function normalizeArtifactType(value: unknown): AnalyzeArtifactResponse["artifactType"] {
  const allowed = new Set(["github", "web", "bilibili", "xiaohongshu", "wechat", "folder", "unknown"]);
  const text = String(value || "unknown");
  return (allowed.has(text) ? text : "unknown") as AnalyzeArtifactResponse["artifactType"];
}

function normalizeProductivityLevel(value: unknown): DeliverabilityReport["productivityLevel"] {
  const allowed = new Set(["消费幻觉", "学习消费", "潜在生产", "真实生产"]);
  const text = String(value || "潜在生产");
  return (allowed.has(text) ? text : "潜在生产") as DeliverabilityReport["productivityLevel"];
}

function normalizeFinalRecommendation(value: unknown): DeliverabilityReport["finalRecommendation"] {
  const allowed = new Set(["继续", "暂停", "转向", "发布前补齐"]);
  const text = String(value || "发布前补齐");
  return (allowed.has(text) ? text : "发布前补齐") as DeliverabilityReport["finalRecommendation"];
}

function normalizeWorkDecision(value: unknown, levelValue?: unknown): DeliverabilityReport["workDecision"] {
  const allowed = new Set(["Stop", "Convert", "Validate", "Scale"]);
  const level = String(levelValue || "");
  const text = String(value || "");
  const decision = (allowed.has(text) ? text : "") as "" | DeliverabilityReport["workDecision"];
  if (level === "真实生产") return "Scale";
  if (level === "潜在生产") return decision === "Scale" ? "Scale" : "Validate";
  if (level === "学习消费") return decision === "Stop" ? "Stop" : "Convert";
  if (level === "消费幻觉") return decision === "Convert" ? "Convert" : "Stop";
  return decision || "Validate";
}

function normalizeProductionBias(value: unknown, fallback: WeeklyAiSummary["productionBias"]): WeeklyAiSummary["productionBias"] {
  const allowed = new Set(["更偏生产", "更偏消费", "转化期"]);
  const text = String(value || fallback);
  return (allowed.has(text) ? text : fallback) as WeeklyAiSummary["productionBias"];
}

function ensureWeeklyFocus(value: string[], fallback: string[]): string[] {
  const defaultFocus = ["选一个项目发给真实对象。", "记录一次明确反馈。", "把反馈写回项目账本。"];
  return [...value, ...fallback, ...defaultFocus].filter(Boolean).slice(0, 3);
}

function localWeeklySentence(summary: WeeklyLocalSummary): string {
  if (summary.totalJudgments === 0) return "本周还没有新的作品判断。";
  return `本周${summary.productionBias}，生产端 ${summary.productionCount} 次，消费端 ${summary.consumptionCount} 次。`;
}

function fallbackDecisionLabel(decision: DeliverabilityReport["workDecision"]): string {
  if (decision === "Scale") return "放大";
  if (decision === "Validate") return "去验证";
  if (decision === "Convert") return "转化";
  return "止损";
}

function ensureFourQuestions(value: string[]): string[] {
  const fallback = [
    "围绕这个作品，今天你获得的是“做出来了”的爽感，还是产生了能被别人验收的结果？请写一个具体事实。",
    "它现在有没有任何可算账结果：收入、反馈、节省时间、降低成本、解决真实问题、可复用资产？没有也直接写没有。",
    "你今天有没有对 AI 输出做过痛苦判断：推翻、删改、重构、设定验收标准，还是主要顺着 AI 往下走？",
    "明天你准备让谁或哪个真实场景来验收它？只写一个最小外部动作。",
  ];
  return [...value, ...fallback].slice(0, 4);
}

function ensureStrongSignal(value: string[]): string[] {
  const fallback = ["已经有可展示的作品。", "方向不是纯聊天记录。"];
  return [...value, ...fallback].slice(0, 3);
}

function ensureEvidenceConfirmed(value: string[]): string[] {
  const fallback = ["有一个可审阅的作品。", "已经完成一次基本产出。"];
  return [...value, ...fallback].slice(0, 4);
}

function ensureEvidenceMissing(value: string[]): string[] {
  const fallback = ["还没有真实用户反馈。", "还没有明确交付记录。"];
  return [...value, ...fallback].slice(0, 4);
}

function ensureDoNotDo(value: string[]): string[] {
  const fallback = ["不要继续加功能。", "不要继续问 AI 生成方案。", "不要只在本地打磨。"];
  return [...value, ...fallback].slice(0, 3);
}

function ensureValueLedger(value: string[]): string[] {
  const fallback = ["还没有用户反馈。", "还没证明它省时或解决问题。"];
  return [...value, ...fallback].slice(0, 4);
}

function ensureSimulationRisk(value: string[]): string[] {
  const fallback = ["完成感主要来自做出来了。", "还没有被别人检验过。"];
  return [...value, ...fallback].slice(0, 4);
}

function ensureMissingProof(value: string[]): string[] {
  const fallback = ["缺少真实用户反馈。", "缺少一次公开或交付记录。"];
  return [...value, ...fallback].slice(0, 5);
}

function ensureNextThreeActions(value: string[]): string[] {
  const fallback = ["写 5 行说明：给谁用，解决什么问题。", "录 60 秒演示，展示一次完整使用。", "发给 3 个人，问他们哪里看不懂。"];
  return [...value, ...fallback].slice(0, 3);
}

function clampAdjustment(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-10, Math.min(10, Math.round(value)));
}
