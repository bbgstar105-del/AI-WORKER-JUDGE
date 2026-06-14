import type { ArtifactType, LinkArtifact } from "./types";

export function detectArtifactType(url: string): ArtifactType {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (hostname.includes("github.com")) return "github";
  if (hostname.includes("bilibili.com") || hostname.includes("b23.tv")) return "bilibili";
  if (hostname.includes("xiaohongshu.com") || hostname.includes("xhslink.com")) return "xiaohongshu";
  if (hostname.includes("weixin.qq.com") || hostname.includes("mp.weixin.qq.com")) return "wechat";
  return "web";
}

export async function fetchLinkArtifact(url: string): Promise<LinkArtifact> {
  const artifactType = detectArtifactType(url);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AI-Work-Judge/0.1 (+local-mvp)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
      },
      redirect: "follow",
    });
    const html = await response.text();
    const title = pickTitle(html) || url;
    const description = pickDescription(html);
    const textSample = htmlToText(html).slice(0, 9000);
    return {
      kind: "link",
      artifactType,
      url,
      title,
      description,
      textSample,
      fetchStatus: response.ok ? "fetched" : "limited",
    };
  } catch {
    return {
      kind: "link",
      artifactType,
      url,
      title: url,
      description: "",
      textSample: "",
      fetchStatus: "failed",
    };
  }
}

function pickTitle(html: string): string {
  return clean(matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i));
}

function pickDescription(html: string): string {
  return clean(
    matchFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
      matchFirst(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
      matchFirst(html, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i),
  );
}

function htmlToText(html: string): string {
  return clean(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  );
}

function matchFirst(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1] || "";
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

