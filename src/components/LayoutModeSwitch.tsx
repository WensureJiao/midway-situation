"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LAYOUT_TEMPLATES,
  SWITCHABLE_LAYOUTS,
  type LayoutTemplateId,
} from "@/lib/layoutTemplates";
import type { LayoutSource } from "@/lib/recommendLayout";

function sourceLabel(source?: LayoutSource): string {
  if (source === "llm") return "模型建议";
  if (source === "rule") return "规则推荐";
  if (source === "default") return "默认回落";
  return "推荐说明";
}

type TipPos = { top: number; left: number; width: number };

function PortalTip({
  open,
  anchor,
  width,
  children,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  width: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<TipPos | null>(null);

  useEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const maxLeft = window.innerWidth - width - 8;
      setPos({
        top: r.bottom + 8,
        left: Math.max(8, Math.min(r.left, maxLeft)),
        width,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchor, width]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[9999] rounded-lg bg-[var(--panel)] text-left shadow-xl ring-1 ring-[var(--line)]"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      role="tooltip"
    >
      {children}
    </div>,
    document.body,
  );
}

export function LayoutModeSwitch({
  value,
  onChange,
  recommendedId,
  reason,
  detail,
  source,
  pinned,
}: {
  value: LayoutTemplateId;
  onChange: (id: LayoutTemplateId) => void;
  recommendedId?: LayoutTemplateId;
  reason?: string;
  detail?: string;
  source?: LayoutSource;
  pinned?: boolean;
}) {
  const rec = recommendedId ?? value;
  const recMeta = LAYOUT_TEMPLATES[rec];
  const tipLines = (detail || reason || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const reasonRef = useRef<HTMLSpanElement>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [modeTip, setModeTip] = useState<{
    id: LayoutTemplateId;
    el: HTMLElement;
  } | null>(null);
  const tipId = useId();

  return (
    <div className="relative flex items-center gap-1.5">
      <div className="flex rounded text-[11px] ring-1 ring-[var(--line)]">
        {SWITCHABLE_LAYOUTS.map((id, i) => {
          const t = LAYOUT_TEMPLATES[id];
          const round =
            i === 0
              ? "rounded-l"
              : i === SWITCHABLE_LAYOUTS.length - 1
                ? "rounded-r"
                : "";
          return (
            <button
              key={id}
              type="button"
              className={`px-2 py-0.5 ${round} ${
                value === id
                  ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]"
                  : "bg-[var(--panel-2)]"
              }`}
              onClick={() => onChange(id)}
              onMouseEnter={(e) =>
                setModeTip({ id, el: e.currentTarget })
              }
              onMouseLeave={() => setModeTip(null)}
              onFocus={(e) => setModeTip({ id, el: e.currentTarget })}
              onBlur={() => setModeTip(null)}
              aria-describedby={modeTip?.id === id ? `${tipId}-mode` : undefined}
            >
              {t.shortLabel}
            </button>
          );
        })}
      </div>

      <PortalTip
        open={Boolean(modeTip)}
        anchor={modeTip?.el ?? null}
        width={208}
      >
        {modeTip ? (
          <div id={`${tipId}-mode`} className="px-2.5 py-2 text-[10px] leading-snug text-[var(--ink)]">
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
              {LAYOUT_TEMPLATES[modeTip.id].labelZh}
            </div>
            {LAYOUT_TEMPLATES[modeTip.id].hint}
          </div>
        ) : null}
      </PortalTip>

      {reason ? (
        <span
          ref={reasonRef}
          className="inline-flex max-w-[220px] cursor-default items-center"
          onMouseEnter={() => setReasonOpen(true)}
          onMouseLeave={() => setReasonOpen(false)}
          onFocus={() => setReasonOpen(true)}
          onBlur={() => setReasonOpen(false)}
          tabIndex={0}
          aria-describedby={reasonOpen ? `${tipId}-reason` : undefined}
        >
          <span className="truncate rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] ring-1 ring-transparent transition hover:bg-[var(--panel-2)] hover:ring-[var(--line)]">
            {pinned ? "已手选" : `推荐 · ${recMeta.shortLabel}`}
          </span>
        </span>
      ) : null}

      <PortalTip
        open={Boolean(reason) && reasonOpen}
        anchor={reasonRef.current}
        width={320}
      >
        <div id={`${tipId}-reason`} className="p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[var(--line)] pb-1.5">
            <span className="text-[11px] font-semibold text-[var(--ink)]">
              {pinned ? "当前为手选布局" : `推荐：${recMeta.labelZh}`}
            </span>
            <span className="rounded bg-[var(--panel-3)] px-1.5 py-px text-[9px] text-[var(--muted)]">
              {pinned ? "手选覆盖" : sourceLabel(source)}
            </span>
          </div>
          {pinned ? (
            <div className="text-[11px] leading-relaxed text-[var(--ink)]">
              你已手动指定工作模式，暂时不再跟随系统推荐。切换时间片、任务或
              A/B 侧后会重新按推荐更新。
              {reason ? (
                <p className="mt-1.5 text-[var(--muted)]">
                  原推荐摘要：{reason}
                </p>
              ) : null}
            </div>
          ) : tipLines.length ? (
            <div className="space-y-1.5 text-[11px] leading-relaxed text-[var(--ink)]">
              {tipLines.map((line) => {
                const split = line.match(/^([^：:]+)[：:](.*)$/);
                if (!split) {
                  return (
                    <p key={line}>{line}</p>
                  );
                }
                return (
                  <p key={line}>
                    <span className="font-medium text-[var(--accent)]">
                      {split[1]}
                    </span>
                    <span className="text-[var(--muted)]"> · </span>
                    <span>{split[2].trim()}</span>
                  </p>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--muted)]">
              暂无更详细的选用说明。
            </p>
          )}
        </div>
      </PortalTip>
    </div>
  );
}
