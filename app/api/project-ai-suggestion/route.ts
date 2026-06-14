import { NextResponse } from "next/server";

import { callDeepSeekJson, DeepSeekError } from "@/lib/deepseek";
import {
  fallbackProjectSuggestion,
  makeProjectSuggestionPrompt,
  normalizeProjectSuggestion,
  type ProjectAISuggestionInput,
} from "@/lib/project-ai";
import type { ProjectSource } from "@/lib/types";

type SuggestionBody = {
  title?: string;
  url?: string;
  source?: ProjectSource;
  note?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as SuggestionBody;
  if (!body.title?.trim() || !body.url?.trim()) {
    return NextResponse.json({ ok: false, error: "title and url are required" }, { status: 400 });
  }

  const input: ProjectAISuggestionInput = {
    title: body.title.trim(),
    url: body.url.trim(),
    source: body.source ?? "unknown",
    note: body.note?.trim() ?? "",
  };

  try {
    const result = await callDeepSeekJson(makeProjectSuggestionPrompt(input));
    return NextResponse.json({
      ok: true,
      suggestion: normalizeProjectSuggestion(result.suggestion),
      reason: String(result.reason || "请人工确认当前项目状态。"),
    });
  } catch (error) {
    const fallback = fallbackProjectSuggestion();
    const status = error instanceof DeepSeekError ? error.status : 500;
    return NextResponse.json(
      {
        ok: false,
        suggestion: fallback.suggestion,
        reason: fallback.reason,
        error: error instanceof Error ? error.message : "Unknown AI suggestion error",
      },
      { status: status === 401 ? 401 : 200 },
    );
  }
}
