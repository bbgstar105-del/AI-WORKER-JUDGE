import { NextResponse } from "next/server";
import { applyScoreAdjustment, classify, makeLocalJudge } from "@/lib/scoring";
import { callDeepSeekJudge, DeepSeekError } from "@/lib/deepseek";
import type { ArtifactScan, JudgeContext, JudgeRequest, JudgeResponse } from "@/lib/types";

export async function POST(request: Request) {
  let body: Partial<JudgeRequest>;

  try {
    body = (await request.json()) as Partial<JudgeRequest>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!isValidScan(body.scan) || !isValidContext(body.context)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid scan/context payload" }, { status: 400 });
  }

  const localJudge = body.localJudge ?? makeLocalJudge(body.scan, body.context);
  const payload: JudgeRequest = {
    scan: shrinkScan(body.scan),
    context: body.context,
    localJudge,
  };

  try {
    const aiJudge = await callDeepSeekJudge(payload);
    const finalScore = applyScoreAdjustment(localJudge.total, aiJudge.scoreAdjustment);
    const response: JudgeResponse = {
      ok: true,
      source: "deepseek",
      localJudge,
      aiJudge,
      finalScore,
      finalVerdict: classify(finalScore),
    };

    return NextResponse.json(response);
  } catch (error) {
    const status = error instanceof DeepSeekError ? error.status : 500;
    const response: JudgeResponse = {
      ok: false,
      source: "local",
      localJudge,
      finalScore: localJudge.total,
      finalVerdict: localJudge.verdict,
      error: error instanceof Error ? error.message : "Unknown DeepSeek error",
    };

    return NextResponse.json(response, { status: status === 401 ? 401 : 200 });
  }
}

function isValidScan(value: unknown): value is ArtifactScan {
  return typeof value === "object" && value !== null && typeof (value as ArtifactScan).folderName === "string" && typeof (value as ArtifactScan).totalFiles === "number";
}

function isValidContext(value: unknown): value is JudgeContext {
  return typeof value === "object" && value !== null && typeof (value as JudgeContext).next === "string";
}

function shrinkScan(scan: ArtifactScan): ArtifactScan {
  return {
    ...scan,
    textHints: scan.textHints.slice(0, 8000),
    docs: scan.docs.slice(0, 20),
    entries: scan.entries.slice(0, 20),
    reusableFolders: scan.reusableFolders.slice(0, 20),
    risks: scan.risks.slice(0, 8),
    signals: scan.signals.slice(0, 8),
  };
}

