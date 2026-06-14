import type { ProjectStatus } from "@/lib/types";

export const projectStatusOrder: ProjectStatus[] = ["消费", "转化中", "生产", "暂停"];

export function isProductionLike(status: ProjectStatus): boolean {
  return status === "生产";
}

export function isNeedsAttention(status: ProjectStatus): boolean {
  return status === "消费" || status === "转化中";
}

export function statusLabel(status: ProjectStatus): string {
  return status;
}
