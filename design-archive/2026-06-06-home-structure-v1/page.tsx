"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { buildScan, codeExtensions, extensionOf, maxReadableFiles, maxTextFileSize, textExtensions } from "@/lib/artifact";
import type {
  AnalyzeArtifactResponse,
  ArtifactScan,
  DeliverabilityReport,
  FolderArtifact,
  ProductivityLevel,
  ProjectLedger,
  WeeklyAiSummary,
  WeeklyLocalSummary,
  WeeklyTrendPoint,
  WorkArtifact,
  WorkDecision,
} from "@/lib/types";

type Phase = "idle" | "inspect" | "question" | "verdict";
type ProductModule =
  | "dashboard"
  | "projects"
  | "new-audit"
  | "weekly-review"
  | "standards"
  | "help";
type HistoryRecord = {
  id: string;
  createdAt: string;
  title: string;
  artifact: WorkArtifact;
  answers: string[];
  report: DeliverabilityReport;
};

const questionTotal = 4;
const inspectLines = ["读取作品表面", "核对外部结果", "判断生产含量"];
const stageLabels = ["提交", "初审", "定位", "结果", "判断", "行动", "结论"];
const appVersion = "v0.1.0";
const historyKey = "ai-work-judge-history-v1";
const ledgerKey = "ai-work-judge-project-ledgers-v1";
const weeklySummaryKey = "ai-work-judge-weekly-summaries-v1";
const maxLedgers = 20;
const maxEntriesPerLedger = 20;
const productModules: Array<{ id: ProductModule; label: string }> = [
  { id: "new-audit", label: "开始判断" },
  { id: "dashboard", label: "总览" },
  { id: "projects", label: "项目账本" },
  { id: "weekly-review", label: "每周回看" },
  { id: "standards", label: "判断标准" },
  { id: "help", label: "关于产品" },
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [artifact, setArtifact] = useState<WorkArtifact | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeArtifactResponse | null>(null);
  const [answers, setAnswers] = useState<string[]>(Array(questionTotal).fill(""));
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [report, setReport] = useState<DeliverabilityReport | null>(null);
  const [showRebuttal, setShowRebuttal] = useState(false);
  const [rebuttalText, setRebuttalText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [activeModule, setActiveModule] = useState<ProductModule | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authIdentity, setAuthIdentity] = useState("");
  const [ledgers, setLedgers] = useState<ProjectLedger[]>([]);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [activeLedgerTitle, setActiveLedgerTitle] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [weeklyAiSummaries, setWeeklyAiSummaries] = useState<Record<string, WeeklyAiSummary>>({});
  const [weeklyAiLoading, setWeeklyAiLoading] = useState(false);
  const [weeklyAiError, setWeeklyAiError] = useState("");

  useEffect(() => {
    try {
      const storedLedgers = window.localStorage.getItem(ledgerKey);
      if (storedLedgers) {
        setLedgers(sanitizeLedgers(JSON.parse(storedLedgers) as ProjectLedger[]));
      } else {
        const storedHistory = window.localStorage.getItem(historyKey);
        if (storedHistory) {
          const migrated = migrateHistoryToLedgers(JSON.parse(storedHistory) as HistoryRecord[]);
          setLedgers(migrated);
          window.localStorage.setItem(ledgerKey, JSON.stringify(migrated));
        }
      }
    } catch {
      setLedgers([]);
      setStorageWarning("本地账本读取失败，本次仍可继续判断。");
    }

    try {
      const storedSummaries = window.localStorage.getItem(weeklySummaryKey);
      if (storedSummaries) setWeeklyAiSummaries(JSON.parse(storedSummaries) as Record<string, WeeklyAiSummary>);
    } catch {
      setWeeklyAiSummaries({});
    }
  }, []);

  const progress = useMemo(() => {
    if (phase === "idle") return 0;
    if (phase === "inspect") return 18;
    if (phase === "question") return 32 + currentQuestion * 16;
    return 100;
  }, [currentQuestion, phase]);

  const stageLabel = useMemo(() => {
    if (phase === "idle") return "Ready";
    if (phase === "inspect") return stageLabels[1];
    if (phase === "question") return stageLabels[currentQuestion + 2] || "Question";
    return "Verdict";
  }, [currentQuestion, phase]);

  async function handleUrlSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    setError("");
    setReport(null);

    if (!isValidUrl(trimmed)) {
      setError("请提交一个有效的 http/https 作品链接。");
      return;
    }

    setPhase("inspect");
    setLoading(true);
    try {
      const response = await fetch("/api/analyze-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "链接分析失败");
      beginQuestionFlow(data.analysis);
    } catch (requestError) {
      setPhase("idle");
      setError(requestError instanceof Error ? requestError.message : "链接分析失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleFolderChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    setError("");
    setReport(null);
    if (!files || files.length === 0) return;

    setPhase("inspect");
    setLoading(true);
    try {
      const scan = await scanFiles(files);
      const folderArtifact: FolderArtifact = { kind: "folder", artifactType: "folder", scan };
      const response = await fetch("/api/analyze-artifact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact: folderArtifact }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "文件夹分析失败");
      beginQuestionFlow(data.analysis);
    } catch (requestError) {
      setPhase("idle");
      setError(requestError instanceof Error ? requestError.message : "文件夹分析失败");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function beginQuestionFlow(nextAnalysis: AnalyzeArtifactResponse) {
    setAnalysis(nextAnalysis);
    setArtifact(nextAnalysis.artifact);
    setAnswers(Array(questionTotal).fill(""));
    setCurrentQuestion(0);
    setDraftAnswer("");
    setPhase("question");
  }

  async function submitCurrentAnswer() {
    if (!analysis || !artifact || loading) return;
    if (!draftAnswer.trim()) {
      setError("先回答这个问题，再继续。");
      return;
    }

    const nextAnswers = [...answers];
    nextAnswers[currentQuestion] = draftAnswer.trim();
    setAnswers(nextAnswers);
    setError("");

    if (currentQuestion < questionTotal - 1) {
      setCurrentQuestion((value) => value + 1);
      setDraftAnswer(nextAnswers[currentQuestion + 1] || "");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/deliverability-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact, answers: nextAnswers }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "生产性判定生成失败");
      setReport(data.report);
      saveLedgerEntry(artifact, nextAnswers, data.report);
      setActiveModule("projects");
      setShowRebuttal(false);
      setRebuttalText("");
      setPhase("verdict");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生产性判定生成失败");
    } finally {
      setLoading(false);
    }
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitCurrentAnswer();
    }
  }

  function resetFlow() {
    setPhase("idle");
    setArtifact(null);
    setAnalysis(null);
    setAnswers(Array(questionTotal).fill(""));
    setCurrentQuestion(0);
    setDraftAnswer("");
    setReport(null);
    setShowRebuttal(false);
    setRebuttalText("");
    setError("");
    setActiveModule(null);
  }

  async function handleRejudgeWithEvidence() {
    if (!artifact || !rebuttalText.trim() || loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/deliverability-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifact, answers: [...answers, `补充证据：${rebuttalText.trim()}`] }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "重新判定失败");
      setReport(data.report);
      saveLedgerEntry(artifact, [...answers, `补充证据：${rebuttalText.trim()}`], data.report, rebuttalText.trim());
      setActiveModule("projects");
      setShowRebuttal(false);
      setRebuttalText("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重新判定失败");
    } finally {
      setLoading(false);
    }
  }

  function saveLedgerEntry(nextArtifact: WorkArtifact, nextAnswers: string[], nextReport: DeliverabilityReport, rebuttal?: string) {
    const now = new Date().toISOString();
    const source = ledgerSource(nextArtifact);
    const entry = {
      id: `${Date.now()}`,
      createdAt: now,
      version: appVersion as "v0.1.0",
      artifactTitle: artifactTitle(nextArtifact),
      productivityLevel: nextReport.productivityLevel,
      workDecision: nextReport.workDecision,
      evidenceConfirmed: nextReport.evidenceConfirmed,
      evidenceMissing: nextReport.evidenceMissing,
      doNotDo: nextReport.doNotDo,
      nextThreeActions: nextReport.nextThreeActions,
      answers: nextAnswers,
      rebuttal,
    };
    const existing = ledgers.find((item) => ledgerIdentity(item.sourceType, item.sourceLabel) === ledgerIdentity(source.sourceType, source.sourceLabel));
    const nextLedger: ProjectLedger = existing
      ? {
          ...existing,
          title: source.title || existing.title,
          updatedAt: now,
          currentLevel: nextReport.productivityLevel,
          currentDecision: nextReport.workDecision,
          entries: [entry, ...existing.entries].slice(0, maxEntriesPerLedger),
        }
      : {
          id: `ledger-${stableId(source.sourceType, source.sourceLabel)}`,
          title: source.title,
          sourceType: source.sourceType,
          sourceLabel: source.sourceLabel,
          createdAt: now,
          updatedAt: now,
          currentLevel: nextReport.productivityLevel,
          currentDecision: nextReport.workDecision,
          entries: [entry],
          syncStatus: "local",
        };
    const nextLedgers = [nextLedger, ...ledgers.filter((item) => item.id !== nextLedger.id)]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, maxLedgers);
    setLedgers(nextLedgers);
    setActiveLedgerTitle(nextLedger.title);
    setSelectedLedgerId(nextLedger.id);
    setStorageWarning("");
    try {
      window.localStorage.setItem(ledgerKey, JSON.stringify(nextLedgers));
    } catch {
      setStorageWarning("本地历史保存失败，但本次判断结果不受影响。");
    }
  }

  function openLedgerEntry(ledger: ProjectLedger, entry = ledger.entries[0]) {
    setArtifact(null);
    setReport(reportFromLedgerEntry(entry));
    setAnswers(entry.answers);
    setActiveLedgerTitle(ledger.title);
    setSelectedLedgerId(ledger.id);
    setActiveModule("projects");
    setShowRebuttal(false);
    setRebuttalText("");
    setPhase("verdict");
  }

  function judgeAgainLedger(ledger: ProjectLedger) {
    setSelectedLedgerId(ledger.id);
    setActiveLedgerTitle(ledger.title);
    setActiveModule("new-audit");
    if (ledger.sourceType === "link") {
      setUrl(ledger.sourceLabel);
      setError("已填入这个项目的链接，可以重新开始判断。");
      return;
    }
    setError("浏览器不能重新打开本地文件夹，请再次选择这个项目文件夹。");
    setShowFolder(true);
  }

  async function enhanceWeeklySummary(summary: WeeklyLocalSummary) {
    setWeeklyAiLoading(true);
    setWeeklyAiError("");
    try {
      const response = await fetch("/api/weekly-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "AI summary unavailable");
      const nextSummaries = { ...weeklyAiSummaries, [summary.weekKey]: data.summary as WeeklyAiSummary };
      setWeeklyAiSummaries(nextSummaries);
      window.localStorage.setItem(weeklySummaryKey, JSON.stringify(nextSummaries));
    } catch (requestError) {
      setWeeklyAiError(requestError instanceof Error ? requestError.message : "AI summary unavailable");
    } finally {
      setWeeklyAiLoading(false);
    }
  }

  return (
    <main className={`app-shell app-shell-${phase}`}>
      <ProgressHUD progress={progress} label={stageLabel} visible={phase !== "idle"} />

      {phase === "idle" ? (
        <LandingWorkspace
          activeModule={activeModule}
          onModuleChange={setActiveModule}
          onCloseModule={() => setActiveModule(null)}
          onOpenAuth={() => setShowAuthModal(true)}
          url={url}
          onUrlChange={setUrl}
          onUrlSubmit={handleUrlSubmit}
          loading={loading}
          showFolder={showFolder}
          onToggleFolder={() => setShowFolder((value) => !value)}
          onFolderChange={handleFolderChange}
          error={error}
          storageWarning={storageWarning}
          ledgers={ledgers}
          selectedLedgerId={selectedLedgerId}
          onSelectLedger={setSelectedLedgerId}
          onOpenLedgerEntry={openLedgerEntry}
          onJudgeAgainLedger={judgeAgainLedger}
          weeklyAiSummaries={weeklyAiSummaries}
          weeklyAiLoading={weeklyAiLoading}
          weeklyAiError={weeklyAiError}
          onEnhanceWeeklySummary={enhanceWeeklySummary}
        />
      ) : null}

      {showAuthModal ? (
        <AuthModal
          mode={authMode}
          identity={authIdentity}
          onIdentityChange={setAuthIdentity}
          onModeChange={setAuthMode}
          onClose={() => setShowAuthModal(false)}
          onEnter={() => setShowAuthModal(false)}
        />
      ) : null}

      {phase === "inspect" ? <Inspecting error={error} /> : null}

      {phase === "question" && analysis ? (
        <section className="question-screen">
          <div className="question-meta">
            <span>{analysis.title}</span>
            <strong>{currentQuestion + 1}/{questionTotal}</strong>
          </div>
          <article className="question-panel">
            <p className="eyebrow">{stageLabel}</p>
            <h2>{analysis.questions[currentQuestion]}</h2>
            <textarea
              autoFocus
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
              rows={5}
              placeholder="写事实，不写感受：有没有结果、谁验收过、是否省时/降本/收到反馈、你有没有推翻 AI。Shift + Enter 换行。"
            />
            <div className="question-actions">
              <button className="ghost-button" type="button" onClick={resetFlow}>重新开始</button>
              <button className="primary-button" type="button" onClick={submitCurrentAnswer} disabled={loading}>
                {loading ? "生成中" : currentQuestion === questionTotal - 1 ? "查看结论" : "继续"}
              </button>
            </div>
          </article>
          {error ? <p className="error-line">{error}</p> : null}
        </section>
      ) : null}

      {phase === "verdict" && report ? (
        <VerdictReport
          report={report}
          ledgerTitle={activeLedgerTitle}
          storageWarning={storageWarning}
          canRejudge={Boolean(artifact)}
          onReset={resetFlow}
          showRebuttal={showRebuttal}
          rebuttalText={rebuttalText}
          loading={loading}
          error={error}
          onToggleRebuttal={() => setShowRebuttal((value) => !value)}
          onRebuttalChange={setRebuttalText}
          onRejudge={handleRejudgeWithEvidence}
        />
      ) : null}
    </main>
  );
}

function JudgingStandards() {
  return (
    <section className="standards-panel">
      <div>
        <p className="eyebrow">Standard v0.1</p>
        <h2>判断依据</h2>
      </div>
      <div className="standard-grid">
        <article>
          <span>01</span>
          <strong>外部验收</strong>
          <p>有没有被真实对象看过、用过、评价过。</p>
        </article>
        <article>
          <span>02</span>
          <strong>可算账结果</strong>
          <p>有没有收入、提效、降本、反馈或真实问题解决。</p>
        </article>
        <article>
          <span>03</span>
          <strong>痛苦判断</strong>
          <p>有没有推翻 AI、删掉平庸方案、重设验收标准。</p>
        </article>
        <article>
          <span>04</span>
          <strong>下一步动作</strong>
          <p>明天是否能做一次明确的验证、转化或放大。</p>
        </article>
      </div>
    </section>
  );
}

function LandingWorkspace({
  activeModule,
  onModuleChange,
  onCloseModule,
  onOpenAuth,
  url,
  onUrlChange,
  onUrlSubmit,
  loading,
  showFolder,
  onToggleFolder,
  onFolderChange,
  error,
  storageWarning,
  ledgers,
  selectedLedgerId,
  onSelectLedger,
  onOpenLedgerEntry,
  onJudgeAgainLedger,
  weeklyAiSummaries,
  weeklyAiLoading,
  weeklyAiError,
  onEnhanceWeeklySummary,
}: {
  activeModule: ProductModule | null;
  onModuleChange: (module: ProductModule | null) => void;
  onCloseModule: () => void;
  onOpenAuth: () => void;
  url: string;
  onUrlChange: (value: string) => void;
  onUrlSubmit: (event: FormEvent) => void;
  loading: boolean;
  showFolder: boolean;
  onToggleFolder: () => void;
  onFolderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error: string;
  storageWarning: string;
  ledgers: ProjectLedger[];
  selectedLedgerId: string | null;
  onSelectLedger: (id: string | null) => void;
  onOpenLedgerEntry: (ledger: ProjectLedger, entry?: ProjectLedger["entries"][number]) => void;
  onJudgeAgainLedger: (ledger: ProjectLedger) => void;
  weeklyAiSummaries: Record<string, WeeklyAiSummary>;
  weeklyAiLoading: boolean;
  weeklyAiError: string;
  onEnhanceWeeklySummary: (summary: WeeklyLocalSummary) => void;
}) {
  const trend = buildWeeklyTrend(ledgers);
  const localSummary = buildWeeklyLocalSummary(ledgers, trend);
  const aiSummary = weeklyAiSummaries[localSummary.weekKey];
  const activeTitle = activeModule ? moduleTitle(activeModule) : "";
  const activeDescription = activeModule ? moduleDescription(activeModule) : "";

  return (
    <>
      <section className="home-surface">
        <header className="home-topbar">
          <span className="home-version">{appVersion}</span>
          <button className="ghost-button home-login" type="button" onClick={onOpenAuth}>登录</button>
        </header>

        <section className="home-center">
          <div className="home-brand-block">
            <p className="eyebrow">AI Work Judge</p>
            <h1>AI Work Judge</h1>
          </div>

          <form className="home-command" onSubmit={onUrlSubmit}>
            <input
              aria-label="提交作品链接"
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="粘贴作品链接，开始判断"
            />
            <button type="submit" disabled={loading}>提交</button>
          </form>

          <div className="home-secondary-actions">
            <button className="ghost-button" type="button" onClick={onToggleFolder}>
              {showFolder ? "收起本地文件夹" : "选择本地文件夹"}
            </button>
          </div>

          {showFolder ? (
            <label className="folder-picker home-folder-picker">
              <input type="file" multiple {...{ webkitdirectory: "", directory: "" }} onChange={onFolderChange} />
              <span>选择项目文件夹</span>
            </label>
          ) : null}

          {error ? <p className="error-line home-error">{error}</p> : null}
          {storageWarning ? <p className="error-line home-error">{storageWarning}</p> : null}

          <nav className="home-module-nav" aria-label="快捷入口">
            {productModules.filter((item) => item.id !== "new-audit").map((item) => (
              <button type="button" key={item.id} onClick={() => onModuleChange(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
        </section>
      </section>

      {activeModule ? (
        <ProductModal title={activeTitle} description={activeDescription} onClose={onCloseModule}>
          {activeModule === "dashboard" ? (
            <DashboardModule
              ledgers={ledgers}
              trend={trend}
              summary={localSummary}
              aiSummary={aiSummary}
              aiLoading={weeklyAiLoading}
              aiError={weeklyAiError}
              onEnhance={() => onEnhanceWeeklySummary(localSummary)}
              onNewAudit={() => onModuleChange("new-audit")}
              onOpenProjects={() => onModuleChange("projects")}
              onSelectLedger={onSelectLedger}
            />
          ) : null}

          {activeModule === "projects" ? (
            <ProjectLedgerPanel
              ledgers={ledgers}
              selectedLedgerId={selectedLedgerId}
              onSelect={onSelectLedger}
              onOpen={onOpenLedgerEntry}
              onJudgeAgain={onJudgeAgainLedger}
              weeklyAiSummaries={weeklyAiSummaries}
              weeklyAiLoading={weeklyAiLoading}
              weeklyAiError={weeklyAiError}
              onEnhanceWeeklySummary={onEnhanceWeeklySummary}
            />
          ) : null}

          {activeModule === "new-audit" ? (
            <NewAuditModule
              url={url}
              onUrlChange={onUrlChange}
              onUrlSubmit={onUrlSubmit}
              loading={loading}
              showFolder={showFolder}
              onToggleFolder={onToggleFolder}
              onFolderChange={onFolderChange}
              error={error}
              storageWarning={storageWarning}
            />
          ) : null}

          {activeModule === "weekly-review" ? (
            <TrendDashboard
              trend={trend}
              summary={localSummary}
              aiSummary={aiSummary}
              aiLoading={weeklyAiLoading}
              aiError={weeklyAiError}
              onEnhance={() => onEnhanceWeeklySummary(localSummary)}
            />
          ) : null}

          {activeModule === "standards" ? <JudgingStandards /> : null}
          {activeModule === "help" ? <HelpModule /> : null}
        </ProductModal>
      ) : null}
    </>
  );
}

function AuthModal({
  mode,
  identity,
  onIdentityChange,
  onModeChange,
  onClose,
  onEnter,
}: {
  mode: "login" | "signup";
  identity: string;
  onIdentityChange: (value: string) => void;
  onModeChange: (mode: "login" | "signup") => void;
  onClose: () => void;
  onEnter: () => void;
}) {
  return (
    <div className="product-modal-backdrop" role="dialog" aria-modal="true" aria-label="登录">
      <section className="auth-card auth-card-modal">
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>登录</button>
          <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => onModeChange("signup")}>注册</button>
        </div>
        <div className="auth-copy">
          <h2>{mode === "login" ? "欢迎回来" : "创建你的工作台"}</h2>
          <p>{mode === "login" ? "进入你的 AI 工作判断桌面。" : "先创建一个账号外观，后续可继续接真实鉴权。"}
          </p>
        </div>
        <label className="auth-field">
          <span>邮箱或团队名</span>
          <input
            value={identity}
            onChange={(event) => onIdentityChange(event.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <label className="auth-field">
          <span>密码</span>
          <input type="password" placeholder="至少 8 位" />
        </label>
        <button className="primary-button auth-submit" type="button" onClick={onEnter}>
          {mode === "login" ? "进入工作台" : "创建并进入"}
        </button>
        <button className="ghost-button auth-close" type="button" onClick={onClose}>关闭</button>
      </section>
    </div>
  );
}

function ProductModal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="product-modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="product-modal">
        <header className="product-modal-head">
          <div>
            <p className="eyebrow">Module</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>关闭</button>
        </header>
        <div className="product-modal-body">
          {children}
        </div>
      </section>
    </div>
  );
}

function DashboardModule({
  ledgers,
  trend,
  summary,
  aiSummary,
  aiLoading,
  aiError,
  onEnhance,
  onNewAudit,
  onOpenProjects,
  onSelectLedger,
}: {
  ledgers: ProjectLedger[];
  trend: WeeklyTrendPoint[];
  summary: WeeklyLocalSummary;
  aiSummary?: WeeklyAiSummary;
  aiLoading: boolean;
  aiError: string;
  onEnhance: () => void;
  onNewAudit: () => void;
  onOpenProjects: () => void;
  onSelectLedger: (id: string | null) => void;
}) {
  const recentEntries = ledgers
    .flatMap((ledger) => ledger.entries.slice(0, 2).map((entry) => ({ ledger, entry })))
    .sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime())
    .slice(0, 4);

  return (
    <div className="dashboard-grid">
      <TrendDashboard
        trend={trend}
        summary={summary}
        aiSummary={aiSummary}
        aiLoading={aiLoading}
        aiError={aiError}
        onEnhance={onEnhance}
      />
      <section className="module-panel">
        <div className="module-head">
          <div>
            <p className="eyebrow">Projects</p>
            <h2>项目账本</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onOpenProjects}>查看全部</button>
        </div>
        {ledgers.length === 0 ? (
          <div className="empty-state">
            <strong>还没有项目记录</strong>
            <p>先做一次判断，之后这里会持续追踪证据变化。</p>
            <button className="primary-button" type="button" onClick={onNewAudit}>开始判断</button>
          </div>
        ) : (
          <div className="compact-projects">
            {ledgers.slice(0, 4).map((ledger) => (
              <button type="button" key={ledger.id} onClick={() => { onSelectLedger(ledger.id); onOpenProjects(); }}>
                <strong>{ledger.title}</strong>
                <span>{ledger.currentLevel} · {decisionDescription(ledger.currentDecision).label}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="module-panel">
        <div className="module-head">
          <div>
            <p className="eyebrow">Recent audits</p>
            <h2>最近变化</h2>
          </div>
        </div>
        {recentEntries.length === 0 ? (
          <p className="history-empty">完成一次判断后，这里会显示最近记录。</p>
        ) : (
          <div className="activity-list">
            {recentEntries.map(({ ledger, entry }) => (
              <div key={`${ledger.id}-${entry.id}`}>
                <span>{formatDate(entry.createdAt)}</span>
                <strong>{ledger.title}</strong>
                <small>{entry.productivityLevel} → {decisionDescription(entry.workDecision).label}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function NewAuditModule({
  url,
  onUrlChange,
  onUrlSubmit,
  loading,
  showFolder,
  onToggleFolder,
  onFolderChange,
  error,
  storageWarning,
}: {
  url: string;
  onUrlChange: (value: string) => void;
  onUrlSubmit: (event: FormEvent) => void;
  loading: boolean;
  showFolder: boolean;
  onToggleFolder: () => void;
  onFolderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error: string;
  storageWarning: string;
}) {
  return (
    <section className="audit-panel">
      <div className="audit-layout">
        <div className="audit-intro">
          <p className="eyebrow">Start here</p>
          <h2>开始一次判断</h2>
          <p>提交一个链接，或选择本地项目文件夹。系统会追问 4 个问题，然后给出结论和下一步。</p>
        </div>

        <div className="audit-methods">
          <form className="audit-method-card" onSubmit={onUrlSubmit}>
            <div className="audit-method-copy">
              <h3>提交公开链接</h3>
            </div>
            <div className="command-bar">
              <input
                aria-label="Submit work link"
                value={url}
                onChange={(event) => onUrlChange(event.target.value)}
                placeholder="粘贴作品链接，例如 https://..."
              />
              <button type="submit" disabled={loading}>开始判断</button>
            </div>
          </form>

          <section className="audit-method-card audit-method-card--secondary">
            <div className="audit-method-copy">
              <h3>扫描本地文件夹</h3>
            </div>
            <button className="ghost-button" type="button" onClick={onToggleFolder}>
              {showFolder ? "收起文件夹选择器" : "选择本地项目文件夹"}
            </button>
            {showFolder ? (
              <label className="folder-picker">
                <input type="file" multiple {...{ webkitdirectory: "", directory: "" }} onChange={onFolderChange} />
                <span>选择项目文件夹</span>
              </label>
            ) : null}
          </section>
        </div>
      </div>
      {showFolder ? (
        <p className="module-tip">文件夹审计只会提取有限文本摘要和结构信息，不会把整个项目上传到云端。</p>
      ) : null}
      {error ? <p className="error-line">{error}</p> : null}
      {storageWarning ? <p className="error-line">{storageWarning}</p> : null}
    </section>
  );
}

function HelpModule() {
  return (
    <section className="module-panel help-panel">
      <p className="eyebrow">Help / About</p>
      <h2>它判断作品，不判断你。</h2>
      <p>AI Work Judge 用公开标准追踪项目证据：外部验收、可算账结果、痛苦判断和下一步动作。当前版本只保存在本机，不上传完整文件夹，不做云同步。</p>
      <div className="help-grid">
        <section><h4>数据是否上传</h4><p>链接审计会抓取网页摘要；文件夹审计只发送有限文本摘要和结构信息。</p></section>
        <section><h4>为什么要追踪</h4><p>一次判断容易变成情绪反馈，持续账本才能看到项目是否真的推进。</p></section>
      </div>
    </section>
  );
}

function ProjectLedgerPanel({
  ledgers,
  selectedLedgerId,
  onSelect,
  onOpen,
  onJudgeAgain,
  weeklyAiSummaries,
  weeklyAiLoading,
  weeklyAiError,
  onEnhanceWeeklySummary,
}: {
  ledgers: ProjectLedger[];
  selectedLedgerId: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (ledger: ProjectLedger, entry?: ProjectLedger["entries"][number]) => void;
  onJudgeAgain: (ledger: ProjectLedger) => void;
  weeklyAiSummaries: Record<string, WeeklyAiSummary>;
  weeklyAiLoading: boolean;
  weeklyAiError: string;
  onEnhanceWeeklySummary: (summary: WeeklyLocalSummary) => void;
}) {
  const selectedLedger = ledgers.find((item) => item.id === selectedLedgerId) || null;
  const trend = buildWeeklyTrend(ledgers);
  const localSummary = buildWeeklyLocalSummary(ledgers, trend);
  const aiSummary = weeklyAiSummaries[localSummary.weekKey];

  return (
    <section className="history-panel">
      <div className="history-head">
        <div>
          <p className="eyebrow">Project ledgers</p>
          <h2>项目账本</h2>
          <p className="module-tip">用时间线看一个项目到底有没有从“做了点东西”走到“形成真实生产证据”。</p>
        </div>
        {selectedLedger ? <button className="ghost-button" type="button" onClick={() => onSelect(null)}>返回列表</button> : null}
      </div>
      {ledgers.length === 0 ? (
        <>
          <TrendDashboard
            trend={trend}
            summary={localSummary}
            aiSummary={aiSummary}
            aiLoading={weeklyAiLoading}
            aiError={weeklyAiError}
            onEnhance={() => onEnhanceWeeklySummary(localSummary)}
          />
          <p className="history-empty">还没有项目账本。完成一次判断后，这里会出现趋势。</p>
        </>
      ) : selectedLedger ? (
        <LedgerDetail ledger={selectedLedger} onOpen={onOpen} onJudgeAgain={onJudgeAgain} />
      ) : (
        <>
          <TrendDashboard
            trend={trend}
            summary={localSummary}
            aiSummary={aiSummary}
            aiLoading={weeklyAiLoading}
            aiError={weeklyAiError}
            onEnhance={() => onEnhanceWeeklySummary(localSummary)}
          />
          <div className="ledger-list">
            {ledgers.map((ledger) => {
              const latest = ledger.entries[0];
              const recentTrend = ledger.entries.slice(0, 3).reverse();
              return (
                <button type="button" key={ledger.id} className="ledger-card" onClick={() => onSelect(ledger.id)}>
                  <span>{formatDate(ledger.updatedAt)}</span>
                  <strong>{ledger.title}</strong>
                  <small>{ledger.currentLevel} → {ledger.currentDecision}</small>
                  <div className="ledger-card-meta">
                    <span>{ledger.entries.length} 次记录</span>
                    <span>已确认 {latest?.evidenceConfirmed.length || 0}</span>
                    <span>未确认 {latest?.evidenceMissing.length || 0}</span>
                  </div>
                  <div className="trend-row">
                    {recentTrend.map((entry) => <em key={entry.id}>{entry.productivityLevel}</em>)}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <p className="history-empty">当前记录只保存在本机。未来可登录同步到云端。</p>
    </section>
  );
}

function TrendDashboard({
  trend,
  summary,
  aiSummary,
  aiLoading,
  aiError,
  onEnhance,
}: {
  trend: WeeklyTrendPoint[];
  summary: WeeklyLocalSummary;
  aiSummary?: WeeklyAiSummary;
  aiLoading: boolean;
  aiError: string;
  onEnhance: () => void;
}) {
  const total = Math.max(summary.totalJudgments, 1);
  const productionPercent = Math.round(summary.productionRatio * 100);
  const consumptionPercent = Math.round(summary.consumptionRatio * 100);
  const displaySummary = aiSummary || {
    conciseSummary: localWeeklySentence(summary),
    strongestSignal: summary.strongestSignal,
    biggestRisk: summary.biggestRisk,
    nextWeekFocus: summary.nextWeekFocus,
  };

  return (
    <section className="trend-dashboard">
      <div className="trend-head">
        <div>
          <p className="eyebrow">Weekly signal</p>
          <h3>本周证据走势</h3>
        </div>
        <button className="ghost-button" type="button" onClick={onEnhance} disabled={aiLoading || summary.totalJudgments === 0}>
          {aiLoading ? "增强中" : aiSummary ? "重新生成摘要" : "AI 增强摘要"}
        </button>
      </div>

      <div className="metric-grid">
        <div><span>本周判定</span><strong>{summary.totalJudgments}</strong></div>
        <div><span>活跃项目</span><strong>{summary.activeProjects}</strong></div>
        <div><span>生产端</span><strong>{productionPercent}%</strong></div>
        <div><span>消费端</span><strong>{consumptionPercent}%</strong></div>
      </div>

      <div className="weekly-summary-card">
        <span>{summary.weekLabel} · {summary.productionBias}</span>
        <p>{displaySummary.conciseSummary}</p>
        {summary.totalJudgments === 0 ? <small>本周暂无新判断。</small> : null}
        {aiError ? <small>AI summary unavailable: {aiError}</small> : null}
      </div>

      <div className="trend-bars" aria-label="最近 8 周生产性趋势">
        {trend.map((point) => (
          <div className="week-bar" key={point.weekKey}>
            <span>{point.weekLabel}</span>
            <div>
              <i className="level-consumption" style={{ flexGrow: point.levels["消费幻觉"] || 0 }} />
              <i className="level-learning" style={{ flexGrow: point.levels["学习消费"] || 0 }} />
              <i className="level-potential" style={{ flexGrow: point.levels["潜在生产"] || 0 }} />
              <i className="level-production" style={{ flexGrow: point.levels["真实生产"] || 0 }} />
              {point.total === 0 ? <em /> : null}
            </div>
            <strong>{point.total}</strong>
          </div>
        ))}
      </div>

      <div className="trend-legend" aria-label="Legend">
        <span><i className="level-consumption" />消费幻觉</span>
        <span><i className="level-learning" />学习消费</span>
        <span><i className="level-potential" />潜在生产</span>
        <span><i className="level-production" />真实生产</span>
      </div>

      <div className="ratio-line">
        <span style={{ width: `${(summary.consumptionCount / total) * 100}%` }} />
        <strong style={{ width: `${(summary.productionCount / total) * 100}%` }} />
      </div>
    </section>
  );
}

function LedgerDetail({
  ledger,
  onOpen,
  onJudgeAgain,
}: {
  ledger: ProjectLedger;
  onOpen: (ledger: ProjectLedger, entry?: ProjectLedger["entries"][number]) => void;
  onJudgeAgain: (ledger: ProjectLedger) => void;
}) {
  const missing = uniqueItems(ledger.entries.flatMap((entry) => entry.evidenceMissing)).slice(0, 6);
  const latestActions = ledger.entries[0]?.nextThreeActions || [];

  return (
    <div className="ledger-detail">
      <div className="ledger-detail-head">
        <div>
          <p className="eyebrow">Local only</p>
          <h3>{ledger.title}</h3>
          <p>{ledger.sourceType === "link" ? ledger.sourceLabel : `Folder: ${ledger.sourceLabel}`}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => onJudgeAgain(ledger)}>再次判断这个项目</button>
      </div>

      <div className="ledger-summary-grid">
        <div><span>当前等级</span><strong>{ledger.currentLevel}</strong></div>
        <div><span>当前决策</span><strong>{ledger.currentDecision}</strong></div>
        <div><span>记录次数</span><strong>{ledger.entries.length}</strong></div>
      </div>

      <div className="ledger-insight-grid">
        <section>
          <h4>累计缺失证据</h4>
          <ul>{missing.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section>
          <h4>最近下一步</h4>
          <ol>{latestActions.map((item) => <li key={item}>{item}</li>)}</ol>
        </section>
      </div>

      <div className="timeline-list">
        {ledger.entries.map((entry) => (
          <button type="button" key={entry.id} onClick={() => onOpen(ledger, entry)}>
            <span>{formatDate(entry.createdAt)}</span>
            <strong>{entry.productivityLevel} → {entry.workDecision}</strong>
            <small>{entry.rebuttal ? "补证据重判" : entry.artifactTitle}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProgressHUD({ progress, label, visible }: { progress: number; label: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="progress-hud" aria-label={`Progress: ${label}`}>
      <div className="progress-topline">
        <span>{label}</span>
        <strong>{Math.round(progress)}%</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-steps">
        {stageLabels.slice(1).map((item) => <span className={item === label ? "active" : ""} key={item}>{item}</span>)}
      </div>
    </div>
  );
}

function Inspecting({ error }: { error: string }) {
  return (
    <section className="inspect-screen">
      <div className="scan-mark" aria-hidden="true" />
      <p className="eyebrow">审阅中</p>
      <h2>正在区分产出和生产。</h2>
      <div className="inspect-lines">
        {inspectLines.map((line, index) => (
          <span key={line} style={{ animationDelay: `${index * 0.22}s` }}>{line}</span>
        ))}
      </div>
      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}

function VerdictReport({
  report,
  ledgerTitle,
  storageWarning,
  canRejudge,
  onReset,
  showRebuttal,
  rebuttalText,
  loading,
  error,
  onToggleRebuttal,
  onRebuttalChange,
  onRejudge,
}: {
  report: DeliverabilityReport;
  ledgerTitle: string;
  storageWarning: string;
  canRejudge: boolean;
  onReset: () => void;
  showRebuttal: boolean;
  rebuttalText: string;
  loading: boolean;
  error: string;
  onToggleRebuttal: () => void;
  onRebuttalChange: (value: string) => void;
  onRejudge: () => void;
}) {
  const levelCopy = levelDescription(report.productivityLevel);
  const decisionCopy = decisionDescription(report.workDecision);

  return (
    <section className="verdict-screen">
      <div className="verdict-topline">
        <div className="verdict-status">
          <span className="level-pill">建议 · {decisionCopy.label}</span>
          <span className="level-pill">等级 · {report.productivityLevel}</span>
        </div>
        <button className="ghost-button" type="button" onClick={onReset}>重新判断</button>
      </div>
      <div className="saved-line">
        <span>已保存到项目账本：{ledgerTitle || "本次作品"}</span>
        <strong>Local only · Sync later</strong>
      </div>
      {storageWarning ? <p className="error-line">{storageWarning}</p> : null}

      <article className="verdict-hero">
        <div className="verdict-label-row">
          <p className="eyebrow">{levelCopy.position}</p>
          <span>{report.productivityLevel}</span>
        </div>
        <h2>{decisionCopy.label}</h2>
        <p className="verdict-line">{report.oneLineVerdict}</p>
        <p className="verdict-explain">{report.decisionReason || decisionCopy.explain}</p>
      </article>

      <div className="verdict-split">
        <section className="plain-block">
          <h3>已确认的证据</h3>
          <ul>{report.evidenceConfirmed.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
        <section className="plain-block">
          <h3>还缺什么</h3>
          <ul>{report.evidenceMissing.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      </div>

      <section className="action-strip">
        <div>
          <p className="eyebrow">24 小时内</p>
          <h3>明天只做这三件事</h3>
        </div>
        <ol>
          {report.nextThreeActions.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </section>

      <section className="plain-block plain-block-muted">
        <h3>现在不要做</h3>
        <ul>{report.doNotDo.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>

      {canRejudge ? (
      <section className="rebuttal-panel">
        <div>
          <h3>不认同这个结论？</h3>
          <p>补充能推翻判定的证据，例如用户反馈、收入、使用记录、节省时间、发布链接。</p>
        </div>
        <button className="ghost-button" type="button" onClick={onToggleRebuttal}>
          {showRebuttal ? "收起" : "补充证据"}
        </button>
        {showRebuttal ? (
          <div className="rebuttal-form">
            <textarea
              value={rebuttalText}
              onChange={(event) => onRebuttalChange(event.target.value)}
              rows={4}
              placeholder="写具体证据：谁用过、有什么反馈、节省了多少时间、发到了哪里。"
            />
            <button className="primary-button" type="button" onClick={onRejudge} disabled={loading || !rebuttalText.trim()}>
              {loading ? "重新判定中" : "用新证据重判"}
            </button>
          </div>
        ) : null}
        {error ? <p className="error-line">{error}</p> : null}
      </section>
      ) : (
        <section className="rebuttal-panel">
          <div>
            <h3>历史判定</h3>
            <p>这是从本地项目账本恢复的记录。要补充证据，请回到账本详情里再次判断这个项目。</p>
          </div>
        </section>
      )}
    </section>
  );
}

function levelDescription(level: DeliverabilityReport["productivityLevel"]): { position: string; explain: string } {
  if (level === "真实生产") {
    return { position: "已经进入生产端", explain: "它已经不只是一个作品，而是开始被外部使用、反馈或复用。" };
  }
  if (level === "潜在生产") {
    return { position: "有作品，但还没被验证", explain: "东西已经做出来了一部分，下一步不是继续打磨，而是拿去给真实对象检验。" };
  }
  if (level === "学习消费") {
    return { position: "主要还是学习", explain: "它对你有练习价值，但还没有变成别人能使用、评价或受益的结果。" };
  }
  return { position: "更像生产幻觉", explain: "它给了你进展感，但还缺少外部对象、反馈和能被验证的结果。" };
}

function decisionDescription(decision: DeliverabilityReport["workDecision"]): { verb: string; label: string; explain: string } {
  if (decision === "Scale") {
    return { verb: "Scale", label: "放大它", explain: "它已经有外部结果，下一步应该放大有效信号。" };
  }
  if (decision === "Validate") {
    return { verb: "Validate", label: "去验证", explain: "它有作品雏形，但还缺真实对象的反馈。" };
  }
  if (decision === "Convert") {
    return { verb: "Convert", label: "转成资产", explain: "这次主要是学习或探索，先把它沉淀成可复用资产。" };
  }
  return { verb: "Stop", label: "先止损", explain: "现在继续投入容易变成自嗨，先停止本地打磨。" };
}

function moduleTitle(module: ProductModule): string {
  const titles: Record<ProductModule, string> = {
    dashboard: "总览",
    projects: "项目账本",
    "new-audit": "开始一次判断",
    "weekly-review": "每周回看",
    standards: "判断标准",
    help: "关于产品",
  };
  return titles[module];
}

function moduleEyebrow(module: ProductModule): string {
  const copy: Record<ProductModule, string> = {
    dashboard: "Overview",
    projects: "Project ledger",
    "new-audit": "Primary task",
    "weekly-review": "Weekly review",
    standards: "Public standard",
    help: "About",
  };
  return copy[module];
}

function moduleDescription(module: ProductModule): string {
  const copy: Record<ProductModule, string> = {
    dashboard: "只保留最关键的趋势、项目和最近变化。",
    projects: "把每次判断写回项目时间线，观察它是否真的从作品变成了可验证的外部结果。",
    "new-audit": "先完成一次判断，再谈趋势和账本。",
    "weekly-review": "只看最近 8 周，不做额外噪音。",
    standards: "公开这套产品到底按什么标准判断，避免把主观情绪伪装成客观结论。",
    help: "理解这套工具为什么存在、判断边界在哪里，以及它不打算做什么。",
  };
  return copy[module];
}

function ledgerSource(artifact: WorkArtifact): { sourceType: ProjectLedger["sourceType"]; sourceLabel: string; title: string } {
  if (artifact.kind === "link") {
    return { sourceType: "link", sourceLabel: artifact.url, title: artifact.title || artifact.url };
  }
  return { sourceType: "folder", sourceLabel: artifact.scan.folderName, title: artifact.scan.folderName };
}

function ledgerIdentity(sourceType: ProjectLedger["sourceType"], sourceLabel: string): string {
  return `${sourceType}:${sourceLabel.trim().toLowerCase()}`;
}

function stableId(sourceType: ProjectLedger["sourceType"], sourceLabel: string): string {
  return `${sourceType}-${sourceLabel.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "artifact"}`;
}

function sanitizeLedgers(value: ProjectLedger[]): ProjectLedger[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((ledger) => ledger && ledger.id && ledger.entries?.length)
    .map((ledger) => ({
      ...ledger,
      entries: ledger.entries.slice(0, maxEntriesPerLedger),
      syncStatus: ledger.syncStatus || "local",
    }))
    .slice(0, maxLedgers);
}

function migrateHistoryToLedgers(records: HistoryRecord[]): ProjectLedger[] {
  const ledgersBySource = new Map<string, ProjectLedger>();
  const sortedRecords = [...records].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const record of sortedRecords) {
    const source = ledgerSource(record.artifact);
    const key = ledgerIdentity(source.sourceType, source.sourceLabel);
    const entry = {
      id: record.id,
      createdAt: record.createdAt,
      version: appVersion as "v0.1.0",
      artifactTitle: record.title,
      productivityLevel: record.report.productivityLevel,
      workDecision: record.report.workDecision,
      evidenceConfirmed: record.report.evidenceConfirmed,
      evidenceMissing: record.report.evidenceMissing,
      doNotDo: record.report.doNotDo,
      nextThreeActions: record.report.nextThreeActions,
      answers: record.answers,
    };
    const existing = ledgersBySource.get(key);
    if (existing) {
      existing.updatedAt = record.createdAt;
      existing.currentLevel = record.report.productivityLevel;
      existing.currentDecision = record.report.workDecision;
      existing.entries = [entry, ...existing.entries].slice(0, maxEntriesPerLedger);
    } else {
      ledgersBySource.set(key, {
        id: `ledger-${stableId(source.sourceType, source.sourceLabel)}`,
        title: source.title,
        sourceType: source.sourceType,
        sourceLabel: source.sourceLabel,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
        currentLevel: record.report.productivityLevel,
        currentDecision: record.report.workDecision,
        entries: [entry],
        syncStatus: "local",
      });
    }
  }

  return Array.from(ledgersBySource.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, maxLedgers);
}

function reportFromLedgerEntry(entry: ProjectLedger["entries"][number]): DeliverabilityReport {
  const decisionCopy = decisionDescription(entry.workDecision);
  return {
    productivityLevel: entry.productivityLevel,
    workDecision: entry.workDecision,
    decisionLabel: decisionCopy.label,
    decisionReason: decisionCopy.explain,
    oneLineVerdict: `${entry.artifactTitle} 当前被判为${entry.productivityLevel}。`,
    whyThisLevel: entry.evidenceMissing[0] || "还缺少足够的外部验证证据。",
    evidenceConfirmed: entry.evidenceConfirmed,
    evidenceMissing: entry.evidenceMissing,
    doNotDo: entry.doNotDo,
    valueLedger: entry.evidenceConfirmed,
    simulationRisk: entry.evidenceMissing,
    strongestSignal: entry.evidenceConfirmed,
    missingProof: entry.evidenceMissing,
    nextThreeActions: entry.nextThreeActions,
    finalRecommendation: entry.workDecision === "Stop" ? "暂停" : entry.workDecision === "Convert" ? "继续" : "发布前补齐",
    tomorrowAdjustment: entry.nextThreeActions[0] || "明天先补齐一个能被外部验证的证据。",
    summary: entry.rebuttal ? `补充证据后重判：${entry.rebuttal}` : "这是从本地项目账本恢复的历史判定。",
  };
}

function buildWeeklyTrend(ledgers: ProjectLedger[]): WeeklyTrendPoint[] {
  const weeks = lastNWeeks(8);
  const trend = weeks.map(({ weekKey, weekLabel }) => ({
    weekKey,
    weekLabel,
    total: 0,
    levels: emptyLevelCounts(),
  }));
  const trendByKey = new Map(trend.map((point) => [point.weekKey, point]));

  for (const entry of allEntries(ledgers)) {
    const weekKey = weekKeyForDate(new Date(entry.createdAt));
    const point = trendByKey.get(weekKey);
    if (!point) continue;
    point.total += 1;
    point.levels[entry.productivityLevel] += 1;
  }

  return trend;
}

function buildWeeklyLocalSummary(ledgers: ProjectLedger[], trend: WeeklyTrendPoint[]): WeeklyLocalSummary {
  const currentWeek = trend[trend.length - 1] || {
    weekKey: weekKeyForDate(new Date()),
    weekLabel: weekLabelForDate(new Date()),
    total: 0,
    levels: emptyLevelCounts(),
  };
  const currentEntries = ledgers.flatMap((ledger) =>
    ledger.entries
      .filter((entry) => weekKeyForDate(new Date(entry.createdAt)) === currentWeek.weekKey)
      .map((entry) => ({ ledger, entry })),
  );
  const entriesForSummary = currentEntries.length > 0
    ? currentEntries
    : ledgers.flatMap((ledger) => ledger.entries.map((entry) => ({ ledger, entry }))).slice(0, 12);
  const productionCount = currentWeek.levels["潜在生产"] + currentWeek.levels["真实生产"];
  const consumptionCount = currentWeek.levels["消费幻觉"] + currentWeek.levels["学习消费"];
  const total = currentWeek.total;
  const activeProjects = new Set(currentEntries.map((item) => item.ledger.id)).size;
  const decisionCounts = emptyDecisionCounts();
  const missingEvidence = uniqueItems(entriesForSummary.flatMap((item) => item.entry.evidenceMissing)).slice(0, 6);
  const nextWeekFocus = uniqueItems(entriesForSummary.flatMap((item) => item.entry.nextThreeActions)).slice(0, 3);
  const confirmed = uniqueItems(entriesForSummary.flatMap((item) => item.entry.evidenceConfirmed));
  const movement = projectMovement(ledgers, currentWeek.weekKey);

  for (const item of currentEntries) {
    decisionCounts[item.entry.workDecision] += 1;
  }

  return {
    weekKey: currentWeek.weekKey,
    weekLabel: currentWeek.weekLabel,
    totalJudgments: total,
    activeProjects,
    productionCount,
    consumptionCount,
    productionRatio: total ? productionCount / total : 0,
    consumptionRatio: total ? consumptionCount / total : 0,
    productionBias: productionBias(productionCount, consumptionCount),
    decisionCounts,
    levelCounts: currentWeek.levels,
    strongestSignal: confirmed[0] || "还没有形成稳定生产信号。",
    biggestRisk: missingEvidence[0] || "本周缺少新的外部验证记录。",
    missingEvidence,
    nextWeekFocus: nextWeekFocus.length ? nextWeekFocus : ["选一个项目发给真实对象。", "记录一次明确反馈。", "把反馈写回项目账本。"],
    projectMovement: movement,
  };
}

function localWeeklySentence(summary: WeeklyLocalSummary): string {
  if (summary.totalJudgments === 0) return "本周还没有新的作品判断，趋势只能从旧账本里推断。";
  return `本周${summary.productionBias}：生产端 ${summary.productionCount} 次，消费端 ${summary.consumptionCount} 次。`;
}

function allEntries(ledgers: ProjectLedger[]): ProjectLedger["entries"][number][] {
  return ledgers.flatMap((ledger) => ledger.entries);
}

function emptyLevelCounts(): Record<ProductivityLevel, number> {
  return { "消费幻觉": 0, "学习消费": 0, "潜在生产": 0, "真实生产": 0 };
}

function emptyDecisionCounts(): Record<WorkDecision, number> {
  return { Stop: 0, Convert: 0, Validate: 0, Scale: 0 };
}

function productionBias(productionCount: number, consumptionCount: number): WeeklyLocalSummary["productionBias"] {
  if (productionCount > consumptionCount) return "更偏生产";
  if (consumptionCount > productionCount) return "更偏消费";
  return "转化期";
}

function projectMovement(ledgers: ProjectLedger[], weekKey: string): WeeklyLocalSummary["projectMovement"] {
  const movement = { improved: 0, stalled: 0, regressed: 0 };
  for (const ledger of ledgers) {
    const weekEntries = [...ledger.entries]
      .filter((entry) => weekKeyForDate(new Date(entry.createdAt)) === weekKey)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (weekEntries.length < 2) continue;
    const firstScore = levelScore(weekEntries[0].productivityLevel);
    const lastScore = levelScore(weekEntries[weekEntries.length - 1].productivityLevel);
    if (lastScore > firstScore) movement.improved += 1;
    else if (lastScore < firstScore) movement.regressed += 1;
    else movement.stalled += 1;
  }
  return movement;
}

function levelScore(level: ProductivityLevel): number {
  if (level === "真实生产") return 3;
  if (level === "潜在生产") return 2;
  if (level === "学习消费") return 1;
  return 0;
}

function lastNWeeks(count: number): Array<{ weekKey: string; weekLabel: string }> {
  const currentMonday = startOfLocalWeek(new Date());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(currentMonday);
    date.setDate(currentMonday.getDate() - (count - index - 1) * 7);
    return { weekKey: weekKeyForDate(date), weekLabel: weekLabelForDate(date) };
  });
}

function startOfLocalWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function weekKeyForDate(date: Date): string {
  const start = startOfLocalWeek(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function weekLabelForDate(date: Date): string {
  const start = startOfLocalWeek(date);
  return `${start.getMonth() + 1}/${start.getDate()}`;
}

function uniqueItems(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function artifactTitle(artifact: WorkArtifact): string {
  if (artifact.kind === "link") return artifact.title || artifact.url;
  return artifact.scan.folderName;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

async function scanFiles(fileList: FileList): Promise<ArtifactScan> {
  const files = Array.from(fileList);
  const paths = files.map((file) => file.webkitRelativePath || file.name);
  const extensions: Record<string, number> = {};
  let readableFiles = 0;
  let textHints = "";

  for (const file of files.slice(0, maxReadableFiles)) {
    const ext = extensionOf(file.name);
    if (!ext) continue;
    extensions[ext] = (extensions[ext] || 0) + 1;
    if (textExtensions.has(ext) && file.size <= maxTextFileSize) {
      readableFiles += 1;
      try {
        textHints += `\n--- ${file.webkitRelativePath || file.name} ---\n${(await file.text()).slice(0, 1200)}`;
      } catch {
        textHints += `\n--- ${file.webkitRelativePath || file.name} ---\n[read failed]`;
      }
    }
  }

  const lowerPaths = paths.map((path) => path.toLowerCase().replaceAll("\\", "/"));
  const docs = paths.filter((path) => /(^|\/)(readme\.md|agents\.md|策划书\.md|技术架构\.md)$/i.test(path.replaceAll("\\", "/")));
  const entries = paths.filter((path) => /(^|\/)(index\.html|package\.json|readme\.md)$/i.test(path.replaceAll("\\", "/")));
  const reusableFolders = ["components/", "lib/", "scripts/", "templates/", "demo/"].filter((folder) =>
    lowerPaths.some((path) => path.includes(`/${folder}`) || path.startsWith(folder)),
  );
  const folderName = paths[0]?.split(/[\\/]/)[0] || "selected-folder";

  return buildScan({
    folderName,
    totalFiles: files.length,
    readableFiles,
    extensions,
    hasReadme: lowerPaths.some((path) => /(^|\/)readme\.md$/.test(path)),
    hasDocs: docs.length > 0,
    hasEntry: lowerPaths.some((path) => /(^|\/)(index\.html|package\.json)$/.test(path)),
    hasPackage: lowerPaths.some((path) => /(^|\/)package\.json$/.test(path)),
    hasCode: files.some((file) => codeExtensions.has(extensionOf(file.name))),
    hasStyle: files.some((file) => extensionOf(file.name) === ".css"),
    hasScript: files.some((file) => [".js", ".ts", ".tsx"].includes(extensionOf(file.name))),
    hasReusableStructure: reusableFolders.length > 0 || docs.length >= 2,
    docs,
    entries,
    reusableFolders,
    textHints,
  });
}
