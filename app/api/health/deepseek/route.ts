import { NextResponse } from "next/server";
import { deepSeekConfig } from "@/lib/deepseek";

export async function GET() {
  const { apiKey, baseUrl, model } = deepSeekConfig();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing DEEPSEEK_API_KEY. Copy .env.example to .env.local and fill your key.",
        baseUrl,
        model,
      },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: "返回 {\"ok\":true,\"message\":\"ready\"}" },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        stream: false,
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `DeepSeek API returned ${response.status}`, detail: (await response.text()).slice(0, 500), baseUrl, model },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, baseUrl, model });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown health check error", baseUrl, model }, { status: 500 });
  }
}

