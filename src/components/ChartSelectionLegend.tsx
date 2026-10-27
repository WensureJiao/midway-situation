"use client";

import { chartTypeLabel } from "@/lib/chartTypes";
import { slotSelectionMatrix } from "@/lib/vmmpChartSelect";
import type { ChartType, TaskFocus } from "@/lib/types";

type Props = {
  taskFocus: TaskFocus;
  activeSide?: "A" | "B" | null;
  fitnessById?: ReadonlyMap<string, number> | Record<string, number>;
  compact?: boolean;
  pickedId?: string | null;
  onPick?: (id: string) => void;
  expandAll?: boolean;
  onToggleExpand?: () => void;
};

function typeName(id: string, type: ChartType) {
  if (id === "cmp-force-bearing" && type === "radar") return "玫瑰";
  if (id === "cmp-intent-axes" && type === "radar") return "玫瑰";
  return chartTypeLabel(type);
}

/**
 * 当前侧选图：从图种库挑最适配的项；其余进未选。
 */
export function ChartSelectionLegend({
  taskFocus,
  activeSide,
  fitnessById,
  compact = false,
  pickedId = null,
  onPick,
  expandAll = false,
  onToggleExpand,
}: Props) {
  const opts = fitnessById ? { fitnessById } : undefined;
  const rows = slotSelectionMatrix(taskFocus, opts);
  const pickedRows = (
    activeSide === "A"
      ? rows.filter((r) => r.aOn)
      : activeSide === "B"
        ? rows.filter((r) => r.bOn)
        : rows.filter((r) => r.aOn || r.bOn)
  ).sort((a, b) => {
    const ra = activeSide === "B" ? (a.bRank ?? 99) : (a.aRank ?? a.bRank ?? 99);
    const rb = activeSide === "B" ? (b.bRank ?? 99) : (b.aRank ?? b.bRank ?? 99);
    return ra - rb;
  });
  const spareRows =
    activeSide === "A"
      ? rows.filter((r) => !r.aOn)
      : activeSide === "B"
        ? rows.filter((r) => !r.bOn)
        : rows.filter((r) => !r.aOn && !r.bOn);
  const taskName = taskFocus === "intent" ? "意图" : "威胁";

  const sideLabel = activeSide === "B" ? "B" : activeSide === "A" ? "A" : "选图";

  if (!compact) {
    return (
      <div className="border-t border-[var(--line)] px-3 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{sideLabel} 选图</h3>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            CHART PICK <span className="opacity-50">/</span> 图种库
          </div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {sideLabel} 选图
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onToggleExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className={`rounded-md px-2 py-1 text-[10px] font-medium ring-1 ${
                expandAll
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] ring-[var(--accent)]"
                  : "bg-[var(--panel)] text-[var(--ink)] ring-[var(--line)]"
              }`}
            >
              全部展开
            </button>
          ) : null}
          <span className="text-[10px] text-[var(--muted)]">
            {taskName}
            {activeSide === "B"
              ? " · 适配图种"
              : activeSide === "A"
                ? " · 直观图种"
                : ""}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md ring-1 ring-[var(--line)]">
        <div className="bg-[var(--panel)] px-2 py-1 text-[10px] font-medium text-[var(--muted)]">
          入选
        </div>
        {pickedRows.map((row) => {
          const picked = pickedId === row.slot.family;
          const type = row.slot.type;
          const rank =
            activeSide === "B" ? row.bRank : activeSide === "A" ? row.aRank : row.aRank ?? row.bRank;
          const chartId = row.slot.family;
          return (
            <button
              key={row.slot.id}
              type="button"
              className={`flex w-full items-baseline gap-2 border-t border-[var(--line)] px-2 py-1 text-left text-[11px] ${
                picked
                  ? "bg-[var(--accent)]/18"
                  : "bg-[var(--panel)] hover:bg-[var(--accent)]/10"
              }`}
              onClick={() =>
                onPick?.(chartId === pickedId ? "" : chartId)
              }
              title={row.note ?? row.slot.mapRead}
            >
              <span className="w-4 shrink-0 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                {rank ? String(rank).padStart(2, "0") : "—"}
              </span>
              <span className="font-semibold text-[var(--ink)]">
                {row.slot.shortLabel}
              </span>
              <span className="text-[var(--muted)]">
                {typeName(row.slot.family, type)}
                {activeSide === "B" && row.upgraded ? (
                  <span className="ml-1 text-[10px] text-emerald-700">↑</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {spareRows.length ? (
        <div className="mt-2 rounded-md bg-[var(--panel-2)] px-2 py-1.5 ring-1 ring-dashed ring-[var(--line)]">
          <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--muted)]">
            未选
          </div>
          <div className="flex flex-wrap gap-1">
            {spareRows.map((row) => (
              <span
                key={row.slot.id}
                className="rounded-sm border border-dashed border-[var(--line)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
                title={row.note ?? row.slot.mapRead}
              >
                {row.slot.shortLabel}
                <span className="ml-1 opacity-70">
                  {typeName(row.slot.family, row.slot.type)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
