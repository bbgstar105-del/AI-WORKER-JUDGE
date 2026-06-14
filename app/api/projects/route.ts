import { NextResponse } from "next/server";

import { createProject, listProjects } from "@/lib/project-repository";
import type { AISuggestionLevel, ProjectSource, ProjectStatus } from "@/lib/types";

type CreateProjectBody = {
  title?: string;
  url?: string;
  source?: ProjectSource;
  currentStatus?: ProjectStatus;
  lastNote?: string;
  aiSuggestion?: AISuggestionLevel;
};

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateProjectBody;
  if (!body.title?.trim() || !body.url?.trim()) {
    return NextResponse.json({ ok: false, error: "title and url are required" }, { status: 400 });
  }

  const project = await createProject({
    title: body.title.trim(),
    url: body.url.trim(),
    source: body.source,
    currentStatus: body.currentStatus,
    lastNote: body.lastNote?.trim(),
    aiSuggestion: body.aiSuggestion,
  });

  return NextResponse.json({ ok: true, project }, { status: 201 });
}
