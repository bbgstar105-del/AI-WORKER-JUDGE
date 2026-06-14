# AI Work Judge Browser Plugin Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `AI-Work-Judge` 从“大而全的 AI 审计工作台”收缩成“浏览器插件 + 极简项目状态后端”的项目标记工具，让用户快速给项目打上 `消费 / 转化中 / 生产 / 暂停` 标签，并持续追踪哪些项目值得推进。

**Architecture:** 保留 Next.js 作为极简后端和管理页宿主，把现有“长流程审计”降级为 AI 建议能力。前端分成两层：`浏览器插件 Popup` 负责一键标记当前项目，`Web 管理页` 负责查看全部项目、筛选消费态项目、追踪最近更新与推进建议。后端先用文件型仓储或轻量本地存储抽象承接项目记录，后续再替换数据库。

**Tech Stack:** Next.js 16, React 19, TypeScript, Browser Extension (Manifest V3), 本地 JSON/file repository 抽象, DeepSeek API（仅作建议，不作最终判定）

---

## Scope Guard

这次重构只做一个方向：

- 浏览器插件里标记项目
- 后端记录项目状态与标签历史
- Web 页只保留“清单 + 状态 + 最近更新 + 待推进”

这次不做：

- 完整登录系统
- 大型 Dashboard
- 长篇 AI 报告
- 周报/报告导出
- 多角色协作
- 复杂同步系统

如果执行中发现要扩展为团队系统，请单独拆新 plan，不要在本计划里继续长胖。

## Future File Structure

### 保留并缩小职责

- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\page.tsx`
  - 从首页展示型入口，改成极简管理页
  - 只显示项目列表、状态筛选、最近更新、待推进项目
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\globals.css`
  - 收敛成“小工具后台 + 插件风格一致”的样式，不再承载审计式大界面
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\types.ts`
  - 收敛共享类型，只保留插件标记、项目状态、标签历史、AI 建议所需结构
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\deepseek.ts`
  - 继续保留，但用途从“完整审计生成器”改为“项目状态建议器”

### 新建文件

- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\manifest.json`
  - 浏览器插件入口配置
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.html`
  - 插件 Popup 容器
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.css`
  - 插件 Popup 样式
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.js`
  - 读取当前页面、调用后端、提交人工标签
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\background.js`
  - 插件后台，用于读取 tab 信息或后续扩展
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-status.ts`
  - 项目状态枚举、标签文案、状态转换辅助函数
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-repository.ts`
  - 统一项目读写接口，屏蔽文件存储实现
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-ai.ts`
  - 基于页面标题、URL、备注和当前状态生成 AI 建议
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\projects\route.ts`
  - 查询项目列表、新增项目
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\projects\[projectId]\route.ts`
  - 查询单个项目、更新当前状态
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\project-tags\route.ts`
  - 写入一次标签记录
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\project-ai-suggestion\route.ts`
  - 生成 AI 建议，不直接落最终标签
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\data\projects.json`
  - 本地文件仓储的默认数据文件
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\docs\plugin-product.md`
  - 插件产品定义，防止后续继续跑回“大工作台”

### 计划删除或逐步废弃

- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\analyze-artifact\route.ts`
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\analyze-link\route.ts`
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\deliverability-report\route.ts`
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\weekly-summary\route.ts`
- `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\demo\*`

这些先不在第一提交中强删，但要在代码里停止作为主流程依赖。

## Target Domain Model

```ts
export type ProjectStatus = "消费" | "转化中" | "生产" | "暂停";

export type ProjectSource = "web" | "github" | "notion" | "docs" | "unknown";

export type AISuggestionLevel = "更像消费" | "更像转化中" | "更像生产" | "建议人工判断";

export type ProjectRecord = {
  id: string;
  title: string;
  url: string;
  source: ProjectSource;
  currentStatus: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  aiSuggestion?: AISuggestionLevel;
  tags: ProjectTagRecord[];
};

export type ProjectTagRecord = {
  id: string;
  projectId: string;
  createdAt: string;
  humanStatus: ProjectStatus;
  aiSuggestion?: AISuggestionLevel;
  note: string;
};
```

## Primary UX

### 插件 Popup

- 当前页面标题
- 当前页面 URL
- AI 建议
- 人工最终标签按钮：`消费 / 转化中 / 生产 / 暂停`
- 一句备注输入框
- `保存` 按钮

### Web 管理页

- 总项目数
- 当前 `消费` 项目数
- 当前 `转化中` 项目数
- 当前 `生产` 项目数
- `最近更新`
- `值得推进`
- 项目列表筛选：全部 / 消费 / 转化中 / 生产 / 暂停

## Task 1: 收缩领域模型与产品文档

**Files:**
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\docs\plugin-product.md`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-status.ts`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\types.ts`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\策划书.md`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\技术架构.md`

- [ ] **Step 1: 新建插件产品定义文档**

```md
# AI Work Judge 插件化定义

## 一句话
浏览器插件里给项目打标签，后端持续记录哪些项目仍停留在消费态。

## 只做什么
- 标记项目
- 记录状态历史
- 给 AI 建议
- 看待推进项目

## 不做什么
- 不做长报告
- 不做复杂登录
- 不做多角色
- 不做重型仪表盘
```

- [ ] **Step 2: 新建项目状态工具文件**

```ts
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-status.ts
export type ProjectStatus = "消费" | "转化中" | "生产" | "暂停";

export const projectStatusOrder: ProjectStatus[] = ["消费", "转化中", "生产", "暂停"];

export function isProductionLike(status: ProjectStatus): boolean {
  return status === "生产";
}

export function isNeedsAttention(status: ProjectStatus): boolean {
  return status === "消费" || status === "转化中";
}
```

- [ ] **Step 3: 在共享类型里加入项目记录模型**

```ts
export type AISuggestionLevel = "更像消费" | "更像转化中" | "更像生产" | "建议人工判断";

export type ProjectSource = "web" | "github" | "notion" | "docs" | "unknown";

export type ProjectTagRecord = {
  id: string;
  projectId: string;
  createdAt: string;
  humanStatus: ProjectStatus;
  aiSuggestion?: AISuggestionLevel;
  note: string;
};

export type ProjectRecord = {
  id: string;
  title: string;
  url: string;
  source: ProjectSource;
  currentStatus: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  lastNote: string;
  aiSuggestion?: AISuggestionLevel;
  tags: ProjectTagRecord[];
};
```

- [ ] **Step 4: 重写策划书与技术架构里的产品定位**

在 `策划书.md` 和 `技术架构.md` 中把以下内容替换为新方向：

```md
- 产品默认入口不是工作台，而是浏览器插件 Popup。
- Web 页面是总后台，只负责查看项目状态与推进优先级。
- AI 只做建议，不替用户做最终标签决定。
- 项目核心状态只有：消费 / 转化中 / 生产 / 暂停。
```

- [ ] **Step 5: 运行类型检查与构建**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docs/plugin-product.md lib/project-status.ts lib/types.ts 策划书.md 技术架构.md
git commit -m "docs: redefine product as project tagging plugin"
```

## Task 2: 建立后端项目记录 API

**Files:**
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\data\projects.json`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-repository.ts`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\projects\route.ts`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\projects\[projectId]\route.ts`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\project-tags\route.ts`
- Test: `npm run typecheck`

- [ ] **Step 1: 初始化空数据文件**

```json
[]
```

- [ ] **Step 2: 编写项目仓储**

```ts
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-repository.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectRecord, ProjectTagRecord } from "@/lib/types";

const dataPath = path.join(process.cwd(), "data", "projects.json");

export async function listProjects(): Promise<ProjectRecord[]> {
  const raw = await fs.readFile(dataPath, "utf8");
  return JSON.parse(raw) as ProjectRecord[];
}

export async function saveProjects(projects: ProjectRecord[]): Promise<void> {
  await fs.writeFile(dataPath, JSON.stringify(projects, null, 2), "utf8");
}

export async function appendTag(projectId: string, tag: ProjectTagRecord): Promise<ProjectRecord | null> {
  const projects = await listProjects();
  const next = projects.map((project) => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      currentStatus: tag.humanStatus,
      updatedAt: tag.createdAt,
      lastNote: tag.note,
      aiSuggestion: tag.aiSuggestion,
      tags: [tag, ...project.tags],
    };
  });
  await saveProjects(next);
  return next.find((project) => project.id === projectId) ?? null;
}
```

- [ ] **Step 3: 编写项目列表接口**

```ts
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\projects\route.ts
import { NextResponse } from "next/server";
import { listProjects, saveProjects } from "@/lib/project-repository";

export async function GET() {
  return NextResponse.json({ ok: true, projects: await listProjects() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const projects = await listProjects();
  const nextProject = {
    id: crypto.randomUUID(),
    title: body.title,
    url: body.url,
    source: body.source ?? "unknown",
    currentStatus: body.currentStatus ?? "消费",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastNote: body.lastNote ?? "",
    aiSuggestion: body.aiSuggestion,
    tags: [],
  };
  await saveProjects([nextProject, ...projects]);
  return NextResponse.json({ ok: true, project: nextProject }, { status: 201 });
}
```

- [ ] **Step 4: 编写单项目与标签写入接口**

```ts
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\project-tags\route.ts
import { NextResponse } from "next/server";
import { appendTag } from "@/lib/project-repository";

export async function POST(request: Request) {
  const body = await request.json();
  const tag = {
    id: crypto.randomUUID(),
    projectId: body.projectId,
    createdAt: new Date().toISOString(),
    humanStatus: body.humanStatus,
    aiSuggestion: body.aiSuggestion,
    note: body.note ?? "",
  };
  const project = await appendTag(body.projectId, tag);
  if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ok: true, project });
}
```

- [ ] **Step 5: 运行检查**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add data/projects.json lib/project-repository.ts app/api/projects app/api/project-tags
git commit -m "feat: add project status repository and tagging api"
```

## Task 3: 把 AI 能力收缩成“建议器”

**Files:**
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-ai.ts`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\project-ai-suggestion\route.ts`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\deepseek.ts`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\技术架构.md`

- [ ] **Step 1: 定义 AI 建议输入输出**

```ts
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\lib\project-ai.ts
import type { AISuggestionLevel, ProjectSource } from "@/lib/types";

export type ProjectAISuggestionInput = {
  title: string;
  url: string;
  source: ProjectSource;
  note: string;
};

export type ProjectAISuggestion = {
  suggestion: AISuggestionLevel;
  reason: string;
};
```

- [ ] **Step 2: 编写极简 AI 建议 prompt**

```ts
export function makeProjectSuggestionPrompt(input: ProjectAISuggestionInput): string {
  return [
    "你是项目推进助手，只能给建议，不能替用户做最终决定。",
    "请判断这个项目当前更像消费、转化中、生产，还是必须人工判断。",
    `标题: ${input.title}`,
    `链接: ${input.url}`,
    `来源: ${input.source}`,
    `备注: ${input.note || "无"}`,
    "输出 JSON: { suggestion, reason }",
  ].join("\n");
}
```

- [ ] **Step 3: 暴露新的 AI 建议接口**

```ts
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\api\project-ai-suggestion\route.ts
import { NextResponse } from "next/server";
import { callDeepSeekJson } from "@/lib/deepseek";
import { makeProjectSuggestionPrompt } from "@/lib/project-ai";

export async function POST(request: Request) {
  const body = await request.json();
  const prompt = makeProjectSuggestionPrompt(body);
  const result = await callDeepSeekJson(prompt, {
    suggestion: "建议人工判断",
    reason: "暂时无法可靠判断，请人工确认。",
  });
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 4: 在技术文档中删除“AI 自动长报告”主路径**

替换为：

```md
- AI 现在只做项目状态建议。
- 人工标签始终是最终状态来源。
- 原 analyze-link / deliverability-report 流程不再作为主入口。
```

- [ ] **Step 5: 运行检查**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/project-ai.ts app/api/project-ai-suggestion lib/deepseek.ts 技术架构.md
git commit -m "feat: reduce ai capability to project status suggestion"
```

## Task 4: 建立浏览器插件 MVP

**Files:**
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\manifest.json`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.html`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.css`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.js`
- Create: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\background.js`

- [ ] **Step 1: 创建 Manifest V3 配置**

```json
{
  "manifest_version": 3,
  "name": "AI Work Judge",
  "version": "0.1.0",
  "action": {
    "default_title": "AI Work Judge",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "permissions": ["tabs", "storage"],
  "host_permissions": ["http://localhost:3000/*", "https://*/*", "http://*/*"]
}
```

- [ ] **Step 2: 创建 Popup 结构**

```html
<!-- d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="./popup.css" />
  </head>
  <body>
    <main class="popup">
      <header class="popup-head">
        <strong>AI Work Judge</strong>
        <span>项目标记</span>
      </header>
      <section id="project-meta"></section>
      <section id="ai-suggestion"></section>
      <div id="status-buttons"></div>
      <textarea id="note" placeholder="写一句现在为什么打这个标签"></textarea>
      <button id="save">保存标签</button>
    </main>
    <script src="./popup.js"></script>
  </body>
</html>
```

- [ ] **Step 3: 读取当前 tab 并请求 AI 建议**

```js
// d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension\popup.js
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function getSuggestion(tab) {
  const response = await fetch("http://localhost:3000/api/project-ai-suggestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: tab.title || "Untitled",
      url: tab.url || "",
      source: detectSource(tab.url || ""),
      note: "",
    }),
  });
  return response.json();
}
```

- [ ] **Step 4: 保存人工最终标签**

```js
async function saveProject(payload) {
  const response = await fetch("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}
```

- [ ] **Step 5: 手工验证插件**

Run:

```bash
npm run build
```

Then:

1. 打开 Chrome `chrome://extensions`
2. 启用开发者模式
3. 选择 `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\extension`
4. 打开任意网页
5. 点击插件
6. 验证标题、链接、AI 建议、状态按钮和保存按钮都可用

Expected:

- Popup 正常打开
- 能获取当前页面标题和 URL
- 能看到 AI 建议
- 点 `保存` 后项目被写入后端

- [ ] **Step 6: Commit**

```bash
git add extension
git commit -m "feat: add browser plugin popup for project tagging"
```

## Task 5: 把 Web 页收缩成极简总后台

**Files:**
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\page.tsx`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\globals.css`
- Modify: `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\app\layout.tsx`

- [ ] **Step 1: 删除首页“提交入口即主流程”的心智**

将首页核心结构收缩为：

```tsx
<main className="dashboard-shell">
  <header className="dashboard-head">
    <h1>AI Work Judge</h1>
    <p>项目推进清单</p>
  </header>

  <section className="dashboard-kpis">
    <StatCard label="全部项目" value={projects.length} />
    <StatCard label="消费" value={consumptionCount} />
    <StatCard label="转化中" value={convertingCount} />
    <StatCard label="生产" value={productionCount} />
  </section>

  <ProjectFilterBar />
  <ProjectTable />
</main>
```

- [ ] **Step 2: 项目列表只保留关键字段**

```tsx
type ProjectListItemProps = {
  title: string;
  currentStatus: ProjectStatus;
  updatedAt: string;
  lastNote: string;
};
```

显示列：

- 项目名
- 当前状态
- 最近更新
- 最近备注
- 快速标记入口

- [ ] **Step 3: 删除旧的大审计 UI 依赖**

从 `app/page.tsx` 移除或停用：

- `Inspecting`
- `QuestionScreen`
- `VerdictReport`
- `Weekly Review` 大图表主路径
- `New Audit` 首页主入口

保留方式：

```ts
// 保留旧 API 文件，但不再从首页主流程调用
```

- [ ] **Step 4: 运行检查**

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: 手工验证**

Run: `npm run dev`

Expected:

- 首页只显示项目状态总览与清单
- 不再像复杂工作台
- 能明显看出“哪些项目还在消费态”

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/globals.css app/layout.tsx
git commit -m "refactor: simplify web app into project status dashboard"
```

## Self-Review

### Spec coverage

- 浏览器插件：已覆盖 Task 4
- 人工主判 + AI 建议：已覆盖 Task 3 和 Task 4
- 后端记录项目状态：已覆盖 Task 2
- Web 端只做极简总后台：已覆盖 Task 5
- 产品方向文档化：已覆盖 Task 1

### Placeholder scan

- 没有使用 `TBD`
- 没有使用“后续再实现”作为任务步骤
- 每个任务都给了明确文件路径和命令

### Type consistency

- 统一使用 `ProjectStatus`
- 统一使用 `ProjectRecord / ProjectTagRecord`
- 统一使用 `AISuggestionLevel`

## Execution Handoff

Plan complete and saved to `d:\OB仓库\知识系统\个人\项目\AI-Work-Judge\docs\superpowers\plans\2026-06-06-ai-work-judge-plugin-pivot.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
