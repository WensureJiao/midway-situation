"use client";

import { useMemo } from "react";
import { diffMapAgainstSkeleton } from "@/lib/mapSkeletonDiff";
import type { SlicePack, SituationViewSpec } from "@/lib/types";

function chipClass(kind: string): string {
  if (kind === "hidden" || kind === "removed") {
    return "bg-[#fce8e8] text-[#9f1239] ring-[#f0c4c4]";
  }
  if (kind === "level" || kind === "relabeled" || kind === "added") {
    return "bg-[#e8f1fc] text-[#1e4a8c] ring-[#c4d4f0]";
  }
  if (kind === "label") {
    return "bg-[#f5f0e6] text-[#6b5420] ring-[#e0d4b8]";
  }
  return "bg-[var(--panel-2)] text-[var(--muted)] ring-[var(--line)]";
}

/** 对比页：相对本地骨架的圈/轴变更条 */
export function SkeletonDiffBar({
  pack,
  spec,
  sideLabel,
}: {
  pack: SlicePack;
  spec: SituationViewSpec;
  sideLabel?: string;
}) {
  const diff = useMemo(
    () => diffMapAgainstSkeleton(pack, spec),
    [pack, spec],
  );

  const zoneChips = diff.zones.filter((z) => z.kind !== "same");
  const axisChips = diff.axes.filter((a) => a.kind !== "kept");

  return (
    <div className="border-b border-[var(--line)] bg-[var(--panel-2)]/40 px-3 py-2">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          相对参考骨架
        </span>
        {sideLabel ? (
          <span className="text-[10px] text-[var(--muted)]">{sideLabel}</span>
        ) : null}
        <span className="text-[10px] text-[var(--muted)]">
          对照本地参考圈/默认双轴；有差异说明模型按任务重画了圈或轴（非钉死骨架）
        </span>
      </div>
      {!diff.hasChanges ? (
        <p className="text-[11px] text-[var(--muted)]">
          与参考骨架相同（可能交了空 zones 而回退骨架，或自绘结果碰巧一致）
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {zoneChips.map((z) => (
            <span
              key={`z-${z.id}-${z.kind}`}
              className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ${chipClass(z.kind)}`}
              title={`骨架：${z.skeletonLabel} · ${z.skeletonLevel}`}
            >
              圈 · {z.text}
            </span>
          ))}
          {axisChips.map((a, i) => (
            <span
              key={`a-${a.kind}-${a.text}-${i}`}
              className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ${chipClass(a.kind)}`}
            >
              轴 · {a.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
