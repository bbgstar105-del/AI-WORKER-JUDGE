import { NextResponse } from "next/server";
import { callDeepSeekAnalyzeArtifact, DeepSeekError } from "@/lib/deepseek";
import { fetchLinkArtifact } from "@/lib/link";

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const rawUrl = String(body.url || "").trim();
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "请提交有效链接。" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return NextResponse.json({ ok: false, error: "只支持 http 或 https 链接。" }, { status: 400 });
  }

  const artifact = await fetchLinkArtifact(url.toString());
  try {
    const analysis = await callDeepSeekAnalyzeArtifact(artifact);
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    const status = error instanceof DeepSeekError ? error.status : 500;
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "DeepSeek analyze failed",
        artifact,
      },
      { status: status === 401 ? 401 : 200 },
    );
  }
}

