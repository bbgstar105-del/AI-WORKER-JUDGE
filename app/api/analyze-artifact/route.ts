import { NextResponse } from "next/server";
import { callDeepSeekAnalyzeArtifact, DeepSeekError } from "@/lib/deepseek";
import type { WorkArtifact } from "@/lib/types";

export async function POST(request: Request) {
  let body: { artifact?: WorkArtifact };
  try {
    body = (await request.json()) as { artifact?: WorkArtifact };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!body.artifact) {
    return NextResponse.json({ ok: false, error: "Missing artifact" }, { status: 400 });
  }

  try {
    const analysis = await callDeepSeekAnalyzeArtifact(body.artifact);
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    const status = error instanceof DeepSeekError ? error.status : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "DeepSeek analyze failed" },
      { status: status === 401 ? 401 : 200 },
    );
  }
}
