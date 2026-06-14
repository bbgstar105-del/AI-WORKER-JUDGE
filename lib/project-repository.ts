import { promises as fs } from "node:fs";
import path from "node:path";

import type { ProjectRecord, ProjectSource, ProjectStatus, ProjectTagRecord } from "@/lib/types";

function projectDataPath(): string {
  const configuredPath = process.env.PROJECTS_DATA_PATH?.trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
  }

  return path.join(process.cwd(), "data", "projects.json");
}

async function ensureDataFile(): Promise<void> {
  const dataPath = projectDataPath();
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  try {
    await fs.access(dataPath);
  } catch {
    await fs.writeFile(dataPath, "[]\n", "utf8");
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const dataPath = projectDataPath();
  await ensureDataFile();
  const raw = await fs.readFile(dataPath, "utf8");
  const parsed = JSON.parse(raw) as ProjectRecord[];
  return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveProjects(projects: ProjectRecord[]): Promise<void> {
  const dataPath = projectDataPath();
  await ensureDataFile();
  await fs.writeFile(dataPath, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
}

export async function getProjectById(projectId: string): Promise<ProjectRecord | null> {
  const projects = await listProjects();
  return projects.find((project) => project.id === projectId) ?? null;
}

export async function createProject(input: {
  title: string;
  url: string;
  source?: ProjectSource;
  currentStatus?: ProjectStatus;
  lastNote?: string;
  aiSuggestion?: ProjectRecord["aiSuggestion"];
}): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: crypto.randomUUID(),
    title: input.title,
    url: input.url,
    source: input.source ?? "unknown",
    currentStatus: input.currentStatus ?? "消费",
    createdAt: now,
    updatedAt: now,
    lastNote: input.lastNote ?? "",
    aiSuggestion: input.aiSuggestion,
    tags: [],
  };

  const projects = await listProjects();
  await saveProjects([project, ...projects]);
  return project;
}

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<ProjectRecord, "title" | "url" | "source" | "currentStatus" | "lastNote" | "aiSuggestion">>,
): Promise<ProjectRecord | null> {
  const projects = await listProjects();
  let updatedProject: ProjectRecord | null = null;

  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) return project;
    updatedProject = {
      ...project,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return updatedProject;
  });

  if (!updatedProject) return null;
  await saveProjects(nextProjects);
  return updatedProject;
}

export async function appendTag(projectId: string, tag: ProjectTagRecord): Promise<ProjectRecord | null> {
  const projects = await listProjects();
  let updatedProject: ProjectRecord | null = null;

  const nextProjects = projects.map((project) => {
    if (project.id !== projectId) return project;
    updatedProject = {
      ...project,
      currentStatus: tag.humanStatus,
      updatedAt: tag.createdAt,
      lastNote: tag.note,
      aiSuggestion: tag.aiSuggestion,
      tags: [tag, ...project.tags],
    };
    return updatedProject;
  });

  if (!updatedProject) return null;
  await saveProjects(nextProjects);
  return updatedProject;
}
