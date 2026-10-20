"use client";

import { chartTypeLabel } from "@/lib/chartTypes";
import {
  extensionPickIds,
  slotSelectionMatrix,
} from "@/lib/vmmpChartSelect";
import type { TaskFocus } from "@/lib/types";

type Props = {
  taskFocus: TaskFocus;
  activeSide?: "A" | "B" | null;
};

/**
 * 选图对照：只列扩展池（常驻 A/B 相同，不展示）。
 */
export function ChartSelectionLegend({ taskFocus, activeSide }: Props) {
  const rows = slotSelectionMatrix(taskFocus).filter(
    (r) => r.layer === "扩展池",
  );
  const aNames = extensionPickIds(taskFocus, false)
    .map((id) => rows.find((r) => r.slot.id === id)?.slot.shortLabel ?? id)
    .join("、");
  const bNames = extensionPickIds(taskFocus, true)
    .map((id) => rows.find((r) => r.slot.id === id)?.slot.shortLabel ?? id)
    .join("、");

  return (
    <div className="border-t border-[var(--line)] px-3 py-3">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">选图对照</h3>
      </div>

      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <div
          className={`rounded-md px-2.5 py-2 ring-1 ${
            activeSide === "A"
              ? "bg-[var(--accent)]/12 ring-[var(--accent)]/50"
              : "bg-[var(--panel-2)] ring-[var(--line)]"
          }`}
        >
          <div className="text-[10px] font-semibold text-[var(--ink)]">
            A · 无 VMMP → 选了{" "}
            {extensionPickIds(taskFocus, false).length} 张
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
            {aNames || "（未选扩展）"}
          </p>
        </div>
        <div
          className={`rounded-md px-2.5 py-2 ring-1 ${
            activeSide === "B"
              ? "bg-[var(--accent)]/12 ring-[var(--accent)]/50"
              : "bg-[var(--panel-2)] ring-[var(--line)]"
          }`}
        >
          <div className="text-[10px] font-semibold text-[var(--ink)]">
            B · 有 VMMP → 选了{" "}
            {extensionPickIds(taskFocus, true).length} 张
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
            {bNames || "（未选扩展）"}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md ring-1 ring-[var(--line)]">
        <table className="w-full min-w-[480px] border-collapse text-left text-[10px]">
          <thead>
            <tr className="bg-[var(--panel-2)] text-[var(--muted)]">
              <th className="px-2 py-1.5 font-medium">扩展图槽</th>
              <th className="px-2 py-1.5 font-medium">图种</th>
              <th className="px-2 py-1.5 font-medium">任务问句</th>
              <th
                className={`px-2 py-1.5 text-center font-medium ${
                  activeSide === "A"
                    ? "bg-[var(--accent)]/20 text-[var(--ink)]"
                    : ""
                }`}
              >
                A
              </th>
              <th
                className={`px-2 py-1.5 text-center font-medium ${
                  activeSide === "B"
                    ? "bg-[var(--accent)]/20 text-[var(--ink)]"
                    : ""
                }`}
              >
                B
              </th>
              <th className="px-2 py-1.5 font-medium">备注</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ slot, aOn, bOn, note }) => {
              const diverge = aOn !== bOn;
              const isRose =
                slot.id === "cmp-force-bearing" ||
                slot.id === "cmp-axis-geometry";
              return (
                <tr
                  key={slot.id}
                  className={`border-t border-[var(--line)] ${
                    diverge ? "bg-[var(--accent)]/8" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 align-top font-medium text-[var(--ink)]">
                    {slot.shortLabel}
                  </td>
                  <td className="px-2 py-1.5 align-top text-[var(--muted)]">
                    {isRose ? "玫瑰图" : chartTypeLabel(slot.type)}
                  </td>
                  <td className="px-2 py-1.5 align-top text-[var(--ink)]">
                    {slot.question}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center align-top ${
                      activeSide === "A" ? "bg-[var(--accent)]/10" : ""
                    }`}
                  >
                    {aOn ? (
                      <span className="font-semibold text-emerald-700">选</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-center align-top ${
                      activeSide === "B" ? "bg-[var(--accent)]/10" : ""
                    }`}
                  >
                    {bOn ? (
                      <span className="font-semibold text-emerald-700">选</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 align-top text-[var(--muted)]">
                    {note ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
