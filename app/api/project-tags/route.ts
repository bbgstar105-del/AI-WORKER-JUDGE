import { NextResponse } from "next/server";

import { appendTag } from "@/lib/project-repository";
import type { AISuggestionLevel, ProjectStatus } from "@/lib/types";

type CreateProjectTagBody = {
  projectId?: string;
  humanStatus?: ProjectStatus;
  aiSuggestion?: AISuggestionLevel;
  note?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateProjectTagBody;

  if (!body.projectId || !body.humanStatus) {
    return NextResponse.json({ ok: false, error: "projectId and humanStatus are required" }, { status: 400 });
  }

  const tag = {
    id: crypto.randomUUID(),
    projectId: body.projectId,
    createdAt: new Date().toISOString(),
    humanStatus: body.humanStatus,
    aiSuggestion: body.aiSuggestion,
    note: body.note?.trim() ?? "",
  };

  const project = await appendTag(body.projectId, tag);
  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project });
}
