import { NextResponse } from "next/server";
import { callDeepSeekDeliverabilityReport, DeepSeekError } from "@/lib/deepseek";
import type { WorkArtifact } from "@/lib/types";

export async function POST(request: Request) {
  let body: { artifact?: WorkArtifact; answers?: string[] };
  try {
    body = (await request.json()) as { artifact?: WorkArtifact; answers?: string[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body.artifact || !Array.isArray(body.answers)) {
    return NextResponse.json({ ok: false, error: "Missing artifact or answers" }, { status: 400 });
  }

  try {
    const report = await callDeepSeekDeliverabilityReport(body.artifact, body.answers);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const status = error instanceof DeepSeekError ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "DeepSeek report failed" },
      { status: status === 401 ? 401 : 200 },
    );
  }
}

