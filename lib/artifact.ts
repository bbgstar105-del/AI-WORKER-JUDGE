import type { ArtifactScan } from "./types";

export const textExtensions = new Set([".html", ".css", ".js", ".ts", ".tsx", ".md", ".json", ".txt"]);
export const codeExtensions = new Set([".html", ".css", ".js", ".ts", ".tsx"]);
export const maxTextFileSize = 180 * 1024;
export const maxReadableFiles = 80;

export function extensionOf(path: string): string {
  const match = path.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

export function buildScan(input: Omit<ArtifactScan, "signals" | "risks">): ArtifactScan {
  const signals: string[] = [];
  const risks: string[] = [];

  if (input.hasEntry) signals.push("发现可运行入口或项目入口。");
  else risks.push("缺少可运行入口，例如 index.html 或 package.json。");

  if (input.hasDocs) signals.push("发现说明文档或项目规则。");
  else risks.push("缺少 README、策划书或技术架构这类说明文档。");

  if (input.hasCode) signals.push("发现代码资产。");
  else risks.push("没有明显代码文件，可能仍停留在想法或材料阶段。");

  if (input.hasStyle && input.hasScript) signals.push("同时发现样式和交互文件，具备 demo 形态。");
  if (input.hasReusableStructure) signals.push("发现可复用结构或多份文档沉淀。");
  if (input.totalFiles <= 2) risks.push("文件数量很少，需要确认它是否已经是可交付作品。");
  if (input.totalFiles > 40 && !input.hasReadme) risks.push("文件较多但缺少 README，后续接手和验收成本会高。");

  return { ...input, signals, risks };
}

