import type { SituationViewSpec } from "@/lib/types";

function sideName(side?: string) {
  if (side === "IJN") return "蓝方（日）";
  if (side === "USN") return "红方（美）";
  return "";
}

function zoneColor(level: string, side?: string) {
  if (level === "紧急") return "#b45309";
  if (side === "IJN") return "#3b82a8";
  return "#c45c4a";
}

export function MapAnnotationLegend({ spec }: { spec: SituationViewSpec }) {
  const axes = spec.map?.axes ?? [];
  const zones = spec.map?.threat_zones ?? [];
  if (!axes.length && !zones.length) return null;

  return (
    <div className="grid gap-3 text-xs">
      <div>
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          轴线
        </div>
        {axes.length ? (
          <ul className="space-y-1">
            {axes.map((a) => (
              <li key={a.id || a.label} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-0 w-5 shrink-0 border-t-2 border-dashed"
                  style={{
                    borderColor: a.side === "IJN" ? "#3b82a8" : "#c45c4a",
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
          圈
        </div>
        {zones.length ? (
          <ul className="space-y-1">
            {zones.map((z) => (
              <li key={z.id || z.label} className="flex items-start gap-2">
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-dashed"
                  style={{
                    borderColor: zoneColor(String(z.level), z.side),
                    background: `${zoneColor(String(z.level), z.side)}22`,
                  }}
                />
                <span className="min-w-0">
                  <span className="text-[var(--ink)]">{z.label}</span>
                  <span className="ml-1.5 text-[10px] text-[var(--muted)]">
                    {z.level}
                    {sideName(z.side) ? ` · ${sideName(z.side)}` : ""}
                    {z.radius_nm != null ? ` · ~${z.radius_nm} 海里` : ""}
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
