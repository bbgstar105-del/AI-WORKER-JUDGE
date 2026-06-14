# AGENTS.md - AI Work Judge

## 项目定位

AI Work Judge 是一个 Next.js 本地应用，用来判断一次 AI 作品/工作行为是否产生了可验证产出。它评价的是“这份作品证据”，不是评价用户本人。

## 目录结构

```text
AI-Work-Judge/
  AGENTS.md        # 项目规则
  策划书.md        # 产品目标、用户场景、MVP 边界
  技术架构.md      # 前端结构、评分逻辑、后续 API 路径
  app/             # Next.js 页面和 API routes
  lib/             # 评分、文件摘要、DeepSeek 请求封装
  demo/
    index.html    # 历史静态原型入口
    styles.css    # 视觉与响应式样式
    app.js        # 本地评分、分类、建议生成、案例填充
```

## 约束

- 当前应用接入 DeepSeek API，但不接数据库、不做登录。
- 不在代码里写入 API key、token 或私密配置。
- 只允许提交 `.env.example`，不允许提交 `.env.local`。
- 评分分类必须先由本地规则产生，不能完全依赖 AI 自由判断。
- 输出文案必须避免人格审判，只评价工作是否形成交付、反馈、复用资产、效率收益或下一步。
- 新增复杂功能前，先更新 `策划书.md` 或 `技术架构.md`。

## 命名规范

- 文档文件用中文命名。
- demo 代码文件用英文小写命名。
- CSS class 使用 kebab-case。
- JavaScript 变量和函数使用 camelCase。

## 验证方式

- 运行 `npm run dev`，打开本地 Next.js 页面。
- 访问 `/api/health/deepseek` 检查 DeepSeek 配置。
- 点击三个内置案例，确认分类分别稳定落在：
  - 自嗨/生产模拟器
  - 潜在生产
  - 真实生产
- 提交空表单时应出现补充提示。
- 缩小浏览器宽度时，输入区和结果区应上下排列且不溢出。
