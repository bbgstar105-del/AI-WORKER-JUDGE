import { NextResponse } from "next/server";
import { callDeepSeekWeeklySummary, DeepSeekError } from "@/lib/deepseek";
import type { WeeklyLocalSummary } from "@/lib/types";

export async function POST(request: Request) {
  let body: { summary?: WeeklyLocalSummary };
  try {
    body = (await request.json()) as { summary?: WeeklyLocalSummary };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body.summary || typeof body.summary.weekLabel !== "string") {
    return NextResponse.json({ ok: false, error: "Missing weekly summary" }, { status: 400 });
  }

  try {
    const summary = await callDeepSeekWeeklySummary(body.summary);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const status = error instanceof DeepSeekError ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "DeepSeek weekly summary failed" },
      { status: status === 401 ? 401 : 200 },
    );
  }
}
