import type { SituationViewSpec } from "@/lib/types";
import { drawnRadiusNm } from "@/lib/utils";
import { inferCampaignBeat } from "@/lib/vmmpCompare";
import { zoneLevelVisual } from "@/lib/zoneLevel";

function sideName(side?: string) {
  if (side === "IJN") return "蓝方（日）";
  if (side === "USN") return "红方（美）";
  return "";
}

export function MapAnnotationLegend({ spec }: { spec: SituationViewSpec }) {
  const axes = spec.map?.axes ?? [];
  const zones = spec.map?.threat_zones ?? [];
  const highlights = spec.map?.highlight_names ?? [];
  const beat = inferCampaignBeat("", spec);
  const phaseText = spec.phase_label?.trim() || "";
  if (!axes.length && !zones.length && !highlights.length && !phaseText) {
    return null;
  }

  return (
    <div className="grid gap-3 text-xs">
      <div>
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          符号
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--usn)] ring-1 ring-white" />
            美方
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--ijn)] ring-1 ring-white" />
            日方
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#e07a6a] ring-1 ring-white" />
            在空（美）
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#6eb0d0] ring-1 ring-white" />
            在空（日）
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#c4a35a] ring-1 ring-white" />
            岸基
          </span>
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          阶段
        </div>
        <p className="text-[var(--ink)]">
          <span className="font-semibold">{beat}</span>
          {phaseText ? (
            <span className="ml-1.5 text-[10px] text-[var(--muted)]">
              {phaseText}
            </span>
          ) : null}
        </p>
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          高亮单位
        </div>
        {highlights.length ? (
          <ul className="space-y-1">
            {highlights.map((name) => (
              <li key={name} className="flex items-start gap-2">
                <span className="mt-0.5 h-3 w-3 shrink-0 rotate-45 rounded-[2px] bg-[var(--usn)] ring-2 ring-[#d4af37]/70" />
                <span className="min-w-0 text-[var(--ink)]">{name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--muted)]">无</p>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          作战指向
        </div>
        {axes.length ? (
          <ul className="space-y-1">
            {axes.map((a) => (
              <li key={a.id || a.label} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-0 w-5 shrink-0 border-t-2 border-dashed"
                  style={{
                    borderColor: a.side === "IJN" ? "#2563eb" : "#dc2626",
                  }}
                />
                <span className="min-w-0">
                  <span className="text-[var(--ink)]">{a.label}</span>
                  {sideName(a.side) ? (
                    <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                      {sideName(a.side)}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--muted)]">无</p>
        )}
      </div>

      <div>
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          活动区
        </div>
        {zones.length ? (
          <ul className="space-y-1">
            {zones.map((z) => (
              <li key={z.id || z.label} className="flex items-start gap-2">
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-full border"
                  style={{
                    borderColor: zoneLevelVisual(String(z.level)).color,
                    borderStyle: zoneLevelVisual(String(z.level))
                      .legendBorderStyle,
                    background: `${zoneLevelVisual(String(z.level)).fill}33`,
                  }}
                />
                <span className="min-w-0">
                  <span className="text-[var(--ink)]">{z.label}</span>
                  <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                    {z.level}
                    {sideName(z.side) ? ` · ${sideName(z.side)}` : ""}
                    {z.radius_nm != null ? ` · ~${drawnRadiusNm(z.radius_nm)} 海里` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--muted)]">无</p>
        )}
      </div>
    </div>
  );
}
