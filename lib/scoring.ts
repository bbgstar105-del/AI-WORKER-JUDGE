import type { ArtifactScan, JudgeContext, LocalJudge, ScoreBreakdown, Verdict } from "./types";

export const weights: ScoreBreakdown = {
  delivery: 25,
  feedback: 20,
  reusable: 20,
  efficiency: 15,
  judgment: 10,
  next: 10,
};

export function hasClearNextAction(text: string): boolean {
  const actionWords = ["发布", "提交", "发给", "反馈", "整理", "补", "删", "验证", "部署", "录", "改", "测试", "写", "上线"];
  return text.length >= 12 && actionWords.some((word) => text.includes(word));
}

export function mentionsQuality(text: string): boolean {
  return /验证|测试|反馈|复盘|架构|规则|验收|用户|发布|交付|TODO|待办/i.test(text || "");
}

export function classify(total: number): Verdict {
  if (total >= 80) return "真实生产";
  if (total >= 50) return "潜在生产";
  if (total >= 20) return "学习消费";
  return "自嗨/生产模拟器";
}

export function scoreArtifact(scan: ArtifactScan, context: JudgeContext): { total: number; breakdown: ScoreBreakdown } {
  const deliveryBase = Math.min(
    22,
    (scan.hasEntry ? 10 : 0) + (scan.hasDocs ? 5 : 0) + (scan.hasCode ? 4 : 0) + (scan.hasStyle && scan.hasScript ? 3 : 0),
  );
  const reusableBase = Math.min(
    weights.reusable,
    (scan.hasReusableStructure ? 10 : 0) + (scan.hasDocs ? 6 : 0) + (scan.hasCode ? 5 : 0) + (scan.hasStyle && scan.hasScript ? 5 : 0),
  );
  const judgmentBase = Math.min(5, scan.hasDocs ? 3 : 0) + (mentionsQuality(scan.textHints) ? 2 : 0);
  const nextScore = hasClearNextAction(context.next) ? weights.next : Math.min(6, Math.floor(context.next.length / 8));

  const breakdown: ScoreBreakdown = {
    delivery: context.delivered ? weights.delivery : deliveryBase,
    feedback: context.feedback ? weights.feedback : 0,
    reusable: reusableBase,
    efficiency: context.efficient ? weights.efficiency : 0,
    judgment: Math.min(weights.judgment, judgmentBase + (context.judged ? 5 : 0)),
    next: nextScore,
  };

  return {
    breakdown,
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  };
}

export function buildReasons(scan: ArtifactScan, context: JudgeContext, breakdown: ScoreBreakdown): string[] {
  const reasons: string[] = [];

  reasons.push(
    scan.hasEntry
      ? "作品证据：检测到入口文件，说明它不只是聊天记录或零散想法。"
      : "作品风险：没有检测到入口文件，用户或评委很难直接运行或查看。",
  );
  reasons.push(
    scan.hasDocs
      ? "说明证据：检测到文档/规则文件，降低了别人理解作品的成本。"
      : "说明缺口：缺少 README、策划书或架构说明，交付时解释成本偏高。",
  );
  reasons.push(
    breakdown.reusable >= 14
      ? "复用证据：项目结构或文档沉淀较完整，后续可以继续迭代。"
      : "复用不足：当前还需要沉淀模板、组件、脚本或清晰文档。",
  );
  reasons.push(
    context.feedback
      ? "反馈证据：作品已经接受过真实用户或他人的外部校准。"
      : "反馈缺口：文件系统无法证明有人用过，仍需要外部反馈。",
  );
  reasons.push(
    breakdown.next >= 8
      ? "推进清晰：下一步有具体场景，不只是继续优化。"
      : "推进模糊：下一步需要从“继续完善”压缩成一个可验证动作。",
  );

  return reasons;
}

export function buildNextAction(scan: ArtifactScan, context: JudgeContext, total: number): string {
  if (!scan.hasDocs) return "先补一个 README：用 6 行说明它解决什么、怎么打开、核心功能、当前限制和下一步。";
  if (!scan.hasEntry) return "先做一个最小入口：index.html、启动命令或演示链接，让别人能在 30 秒内看到作品。";
  if (!context.delivered) return "不要继续内部打磨。先录屏或发链接给 3 个目标用户，确认他们是否看得懂、愿不愿意用。";
  if (!context.feedback) return "下一步只做收反馈：问 3 个人一个问题，‘你会在哪一步放弃使用它？’";
  if (!context.judged) return "回到作品里挑 3 个问题：哪里空泛、哪里不可执行、哪里不符合你的验收标准。";
  if (total >= 80) return "保留这个版本作为可交付基线，下一步只做一个小版本迭代，并记录反馈变化。";
  return "把下一步压缩成一个可验收动作：发布、部署、补文档、收反馈或删除无效功能。";
}

export function makeLocalJudge(scan: ArtifactScan, context: JudgeContext): LocalJudge {
  const { total, breakdown } = scoreArtifact(scan, context);
  return {
    total,
    breakdown,
    verdict: classify(total),
    reasons: buildReasons(scan, context, breakdown),
    nextAction: buildNextAction(scan, context, total),
  };
}

export function applyScoreAdjustment(localScore: number, adjustment: number): number {
  const safeAdjustment = Number.isFinite(adjustment) ? Math.max(-10, Math.min(10, Math.round(adjustment))) : 0;
  return Math.max(0, Math.min(100, localScore + safeAdjustment));
}

