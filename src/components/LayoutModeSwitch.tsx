"use client";

import {
  LAYOUT_TEMPLATES,
  SWITCHABLE_LAYOUTS,
  type LayoutTemplateId,
} from "@/lib/layoutTemplates";

export function LayoutModeSwitch({
  value,
  onChange,
  recommendedId,
  reason,
  pinned,
}: {
  value: LayoutTemplateId;
  onChange: (id: LayoutTemplateId) => void;
  recommendedId?: LayoutTemplateId;
  reason?: string;
  pinned?: boolean;
}) {
  const rec = recommendedId ?? value;
  return (
    <>
      <div className="flex overflow-hidden rounded text-[11px] ring-1 ring-[var(--line)]">
        {SWITCHABLE_LAYOUTS.map((id) => {
          const t = LAYOUT_TEMPLATES[id];
          return (
            <button
              key={id}
              type="button"
              title={t.hint}
              className={`px-2 py-0.5 ${
                value === id
                  ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]"
                  : "bg-[var(--panel-2)]"
              }`}
              onClick={() => onChange(id)}
            >
              {t.shortLabel}
            </button>
          );
        })}
      </div>
      {reason ? (
        <span
          className="max-w-[260px] truncate text-[10px] text-[var(--muted)]"
          title={reason}
        >
          {pinned
            ? "已手选"
            : `推荐 · ${LAYOUT_TEMPLATES[rec].shortLabel}`}
        </span>
      ) : null}
    </>
  );
}
