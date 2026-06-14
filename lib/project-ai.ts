import type { AISuggestionLevel, ProjectSource } from "@/lib/types";

export type ProjectAISuggestionInput = {
  title: string;
  url: string;
  source: ProjectSource;
  note: string;
};

export type ProjectAISuggestion = {
  suggestion: AISuggestionLevel;
  reason: string;
};

export function makeProjectSuggestionPrompt(input: ProjectAISuggestionInput): { system: string; user: unknown } {
  return {
    system: [
      "你是 AI Work Judge 的项目状态建议器。",
      "你只能给项目状态建议，不能替用户做最终决定。",
      "请只根据标题、URL、来源和备注做保守判断。",
      "如果证据不足，必须输出“建议人工判断”。",
      "输出严格 JSON，不要 Markdown，不要 JSON 外解释。",
    ].join("\n"),
    user: {
      expectedShape: {
        suggestion: "更像消费 | 更像转化中 | 更像生产 | 建议人工判断",
        reason: "string",
      },
      input,
    },
  };
}

export function normalizeProjectSuggestion(value: unknown): AISuggestionLevel {
  if (value === "更像消费" || value === "更像转化中" || value === "更像生产") {
    return value;
  }
  return "建议人工判断";
}

export function fallbackProjectSuggestion(): ProjectAISuggestion {
  return {
    suggestion: "建议人工判断",
    reason: "当前证据不足，请人工确认项目状态。",
  };
}
