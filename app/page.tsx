"use client";

import { useEffect, useMemo, useState } from "react";

import { isNeedsAttention, projectStatusOrder } from "@/lib/project-status";
import type { ProjectRecord, ProjectStatus } from "@/lib/types";

const appVersion = "v0.1.0";

type StatusFilter = "全部" | ProjectStatus;

type ProjectsResponse = {
  ok: boolean;
  projects?: ProjectRecord[];
  error?: string;
};

type ProjectMutationResponse = {
  ok: boolean;
  project?: ProjectRecord;
  error?: string;
};

export default function Home() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("全部");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    void loadProjects(true);
  }, []);

  const filteredProjects = useMemo(() => {
    if (activeFilter === "全部") return projects;
    return projects.filter((project) => project.currentStatus === activeFilter);
  }, [activeFilter, projects]);

  const attentionProjects = useMemo(
    () => projects.filter((project) => isNeedsAttention(project.currentStatus)).slice(0, 5),
    [projects],
  );

  const counts = useMemo(
    () => ({
      total: projects.length,
      consume: projects.filter((project) => project.currentStatus === "消费").length,
      converting: projects.filter((project) => project.currentStatus === "转化中").length,
      producing: projects.filter((project) => project.currentStatus === "生产").length,
    }),
    [projects],
  );

  async function loadProjects(initial = false) {
    if (initial) setLoading(true);
    if (!initial) setRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = (await response.json()) as ProjectsResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "读取项目列表失败。");
      }
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "读取项目列表失败。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function quickMark(project: ProjectRecord, nextStatus: ProjectStatus) {
    const note = window.prompt(`给「${project.title}」补一句备注（可留空）：`, project.lastNote || "");
    if (note === null) return;

    setActionMessage("正在保存状态...");
    setError("");

    try {
      const response = await fetch("/api/project-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          humanStatus: nextStatus,
          aiSuggestion: project.aiSuggestion,
          note,
        }),
      });

      const data = (await response.json()) as ProjectMutationResponse;
      if (!response.ok || !data.ok || !data.project) {
        throw new Error(data.error || "保存状态失败。");
      }

      setProjects((previous) =>
        previous
          .map((item) => (item.id === data.project?.id ? data.project : item))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      setActionMessage(`已更新为「${nextStatus}」。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存状态失败。");
      setActionMessage("");
    }
  }

  return (
    <main className="app-shell">
      <section className="project-dashboard">
        <header className="dashboard-head">
          <div>
            <p className="eyebrow">AI Work Judge</p>
            <h1>项目推进清单</h1>
            <p className="dashboard-subtitle">插件负责写状态，这个页面只负责看哪些项目还值得继续推进。</p>
          </div>
          <div className="dashboard-head-actions">
            <span className="dashboard-version">{appVersion}</span>
            <button className="ghost-button" type="button" onClick={() => void loadProjects()} disabled={refreshing}>
              {refreshing ? "刷新中..." : "刷新"}
            </button>
          </div>
        </header>

        <section className="dashboard-stat-grid">
          <StatCard label="全部项目" value={counts.total} tone="neutral" />
          <StatCard label="消费" value={counts.consume} tone="consume" />
          <StatCard label="转化中" value={counts.converting} tone="convert" />
          <StatCard label="生产" value={counts.producing} tone="produce" />
        </section>

        <section className="dashboard-layout">
          <div className="dashboard-main">
            <section className="dashboard-panel">
              <div className="panel-toolbar">
                <div>
                  <p className="section-label">项目列表</p>
                  <h2>当前状态</h2>
                </div>
                <div className="filter-bar" aria-label="状态筛选">
                  {(["全部", ...projectStatusOrder] as StatusFilter[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={status === activeFilter ? "filter-chip is-active" : "filter-chip"}
                      onClick={() => setActiveFilter(status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? <p className="dashboard-empty">正在读取项目状态...</p> : null}
              {!loading && error ? <p className="dashboard-empty dashboard-empty-error">{error}</p> : null}
              {!loading && !error && filteredProjects.length === 0 ? (
                <p className="dashboard-empty">还没有项目记录。先用浏览器插件给一个项目打标签。</p>
              ) : null}

              {!loading && !error && filteredProjects.length > 0 ? (
                <div className="project-table">
                  {filteredProjects.map((project) => (
                    <article key={project.id} className="project-row">
                      <div className="project-row-main">
                        <div className="project-row-top">
                          <h3>{project.title}</h3>
                          <span className={`status-badge status-${statusTone(project.currentStatus)}`}>{project.currentStatus}</span>
                        </div>
                        <a href={project.url} target="_blank" rel="noreferrer" className="project-link">
                          {project.url}
                        </a>
                        <div className="project-meta">
                          <span>来源：{project.source}</span>
                          <span>更新：{formatDate(project.updatedAt)}</span>
                          <span>AI 建议：{project.aiSuggestion || "暂无"}</span>
                        </div>
                        <p className="project-note">{project.lastNote || "还没有备注。"}</p>
                      </div>

                      <div className="project-row-actions">
                        {projectStatusOrder.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={status === project.currentStatus ? "quick-tag is-current" : "quick-tag"}
                            onClick={() => void quickMark(project, status)}
                          >
                            标记为{status}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="dashboard-side">
            <section className="dashboard-panel">
              <p className="section-label">待推进</p>
              <h2>优先处理</h2>
              {attentionProjects.length === 0 ? (
                <p className="dashboard-empty">当前没有需要优先推进的项目。</p>
              ) : (
                <div className="attention-list">
                  {attentionProjects.map((project) => (
                    <button key={project.id} type="button" className="attention-card" onClick={() => setActiveFilter(project.currentStatus)}>
                      <strong>{project.title}</strong>
                      <span>{project.currentStatus}</span>
                      <small>{project.lastNote || "暂无备注"}</small>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="dashboard-panel">
              <p className="section-label">说明</p>
              <h2>现在怎么用</h2>
              <ul className="dashboard-checklist">
                <li>在浏览器里打开插件，先给项目打状态。</li>
                <li>回到这里，看哪些项目还停留在消费或转化中。</li>
                <li>用快捷标记把项目状态持续往生产推进。</li>
              </ul>
              <p className="dashboard-message">{actionMessage || "这个页面不再承担复杂审计流程。"}</p>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "consume" | "convert" | "produce" }) {
  return (
    <section className={`dashboard-stat-card tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
    </section>
  );
}

function statusTone(status: ProjectStatus): "consume" | "convert" | "produce" | "paused" {
  if (status === "消费") return "consume";
  if (status === "转化中") return "convert";
  if (status === "生产") return "produce";
  return "paused";
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}
