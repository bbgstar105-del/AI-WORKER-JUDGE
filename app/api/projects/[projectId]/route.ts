import { NextResponse } from "next/server";

import { getProjectById, updateProject } from "@/lib/project-repository";
import type { AISuggestionLevel, ProjectSource, ProjectStatus } from "@/lib/types";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type UpdateProjectBody = {
  title?: string;
  url?: string;
  source?: ProjectSource;
  currentStatus?: ProjectStatus;
  lastNote?: string;
  aiSuggestion?: AISuggestionLevel;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const project = await getProjectById(projectId);

  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const body = (await request.json()) as UpdateProjectBody;

  const project = await updateProject(projectId, {
    title: body.title?.trim(),
    url: body.url?.trim(),
    source: body.source,
    currentStatus: body.currentStatus,
    lastNote: body.lastNote?.trim(),
    aiSuggestion: body.aiSuggestion,
  });

  if (!project) {
    return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project });
}
