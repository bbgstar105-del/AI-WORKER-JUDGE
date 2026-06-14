export type Verdict = "真实生产" | "潜在生产" | "学习消费" | "自嗨/生产模拟器";

export type ScoreBreakdown = {
  delivery: number;
  feedback: number;
  reusable: number;
  efficiency: number;
  judgment: number;
  next: number;
};

export type ArtifactScan = {
  folderName: string;
  totalFiles: number;
  readableFiles: number;
  extensions: Record<string, number>;
  hasReadme: boolean;
  hasDocs: boolean;
  hasEntry: boolean;
  hasPackage: boolean;
  hasCode: boolean;
  hasStyle: boolean;
  hasScript: boolean;
  hasReusableStructure: boolean;
  docs: string[];
  entries: string[];
  reusableFolders: string[];
  risks: string[];
  signals: string[];
  textHints: string;
};

export type JudgeContext = {
  delivered: boolean;
  feedback: boolean;
  efficient: boolean;
  judged: boolean;
  next: string;
};

export type LocalJudge = {
  total: number;
  verdict: Verdict;
  breakdown: ScoreBreakdown;
  reasons: string[];
  nextAction: string;
};

export type DeepSeekJudge = {
  verdict: Verdict;
  scoreAdjustment: number;
  reasons: string[];
  missingEvidence: string[];
  questions: string[];
  nextAction: string;
  conciseSummary: string;
};

export type JudgeRequest = {
  scan: ArtifactScan;
  context: JudgeContext;
  localJudge: LocalJudge;
};

export type JudgeResponse = {
  ok: boolean;
  source: "deepseek" | "local";
  localJudge: LocalJudge;
  aiJudge?: DeepSeekJudge;
  finalScore: number;
  finalVerdict: Verdict;
  error?: string;
};

export type ArtifactType = "github" | "web" | "bilibili" | "xiaohongshu" | "wechat" | "folder" | "unknown";

export type LinkArtifact = {
  kind: "link";
  artifactType: ArtifactType;
  url: string;
  title: string;
  description: string;
  textSample: string;
  fetchStatus: "fetched" | "limited" | "failed";
};

export type FolderArtifact = {
  kind: "folder";
  artifactType: "folder";
  scan: ArtifactScan;
};

export type WorkArtifact = LinkArtifact | FolderArtifact;

export type AnalyzeArtifactResponse = {
  artifact: WorkArtifact;
  artifactType: ArtifactType;
  title: string;
  summary: string;
  visibleEvidence: string[];
  uncertainties: string[];
  questions: string[];
};

export type ProductivityLevel = "消费幻觉" | "学习消费" | "潜在生产" | "真实生产";

export type FinalRecommendation = "继续" | "暂停" | "转向" | "发布前补齐";

export type WorkDecision = "Stop" | "Convert" | "Validate" | "Scale";

export type SyncStatus = "local" | "pending" | "synced";

export type DeliverabilityReport = {
  productivityLevel: ProductivityLevel;
  workDecision: WorkDecision;
  decisionLabel: string;
  decisionReason: string;
  oneLineVerdict: string;
  whyThisLevel: string;
  evidenceConfirmed: string[];
  evidenceMissing: string[];
  doNotDo: string[];
  valueLedger: string[];
  simulationRisk: string[];
  strongestSignal: string[];
  missingProof: string[];
  nextThreeActions: string[];
  finalRecommendation: FinalRecommendation;
  tomorrowAdjustment: string;
  summary: string;
};

export type LedgerEntry = {
  id: string;
  createdAt: string;
  version: "v0.1.0";
  artifactTitle: string;
  productivityLevel: ProductivityLevel;
  workDecision: WorkDecision;
  evidenceConfirmed: string[];
  evidenceMissing: string[];
  doNotDo: string[];
  nextThreeActions: string[];
  answers: string[];
  rebuttal?: string;
};

export type ProjectLedger = {
  id: string;
  title: string;
  sourceType: "link" | "folder";
  sourceLabel: string;
  createdAt: string;
  updatedAt: string;
  currentLevel: ProductivityLevel;
  currentDecision: WorkDecision;
  entries: LedgerEntry[];
  syncStatus?: SyncStatus;
  remoteId?: string;
};

export type ProductionBias = "更偏生产" | "更偏消费" | "转化期";

export type WeeklyTrendPoint = {
  weekKey: string;
  weekLabel: string;
  total: number;
  levels: Record<ProductivityLevel, number>;
};

export type WeeklyLocalSummary = {
  weekKey: string;
  weekLabel: string;
  totalJudgments: number;
  activeProjects: number;
  productionCount: number;
  consumptionCount: number;
  productionRatio: number;
  consumptionRatio: number;
  productionBias: ProductionBias;
  decisionCounts: Record<WorkDecision, number>;
  levelCounts: Record<ProductivityLevel, number>;
  strongestSignal: string;
  biggestRisk: string;
  missingEvidence: string[];
  nextWeekFocus: string[];
  projectMovement: {
    improved: number;
    stalled: number;
    regressed: number;
  };
};

export type WeeklyAiSummary = {
  weekLabel: string;
  productionBias: ProductionBias;
  conciseSummary: string;
  strongestSignal: string;
  biggestRisk: string;
  nextWeekFocus: string[];
};

export type ProjectStatus = "消费" | "转化中" | "生产" | "暂停";

export type ProjectSource = "web" | "github" | "notion" | "docs" | "unknown";

export type AISuggestionLevel = "更像消费" | "更像转化中" | "更像生产" | "建议人工判断";

export type ProjectTagRecord = {
  id: string;
  projectId: string;
  createdAt: string;
  humanStatus: ProjectStatus;
  aiSuggestion?: AISuggestionLevel;
  note: string;
};

export type ProjectRecord = {
  id: string;
  title: string;
  url: string;
  source: ProjectSource;
  currentStatus: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  aiSuggestion?: AISuggestionLevel;
  tags: ProjectTagRecord[];
};
