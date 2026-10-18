import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SituationViewSpec } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nmToMeters(nm: number): number {
  return nm * 1852;
}

/** 活动圈名义半径偏大，地图上收到约三分之二。 */
const ZONE_DRAW_SCALE = 0.65;

export function drawnRadiusNm(nm: number): number {
  if (!Number.isFinite(nm) || nm <= 0) return nm;
  return Math.max(6, Math.round(nm * ZONE_DRAW_SCALE));
}

/** 是否为美方（红方）观察视角条目 */
export function isUsnObserverPerspective(perspective?: string): boolean {
  const p = perspective ?? "";
  if (/蓝方看|日方看/i.test(p)) return false;
  return /红方看|美方看|USN/i.test(p);
}

/** 只保留美方观察下的威胁条目；丢掉日方视角结论 */
export function filterUsnObserverRatings(
  ratings: SituationViewSpec["threat_ratings"] | undefined,
): SituationViewSpec["threat_ratings"] {
  return (ratings ?? []).filter((r) =>
    isUsnObserverPerspective(r.perspective),
  );
}

/** LLM 常漏数组字段；渲染前补齐，避免 .map / .length 崩溃。 */
export function normalizeSituationSpec(
  raw: SituationViewSpec,
): SituationViewSpec {
  const map = raw.map ?? {
    center: [28.21, -177.38] as [number, number],
    zoom: 6,
    highlight_names: [],
    axes: [],
    threat_zones: [],
  };
  const { zone_overrides: _ignored, ...rest } = raw;
  void _ignored;
  return {
    ...rest,
    title: raw.title ?? "",
    phase_label: raw.phase_label ?? "",
    narrative: raw.narrative ?? "",
    map: {
      center: map.center ?? [28.21, -177.38],
      zoom: map.zoom ?? 6,
      highlight_names: map.highlight_names ?? [],
      axes: map.axes ?? [],
      threat_zones: map.threat_zones ?? [],
    },
    kpis: raw.kpis ?? [],
    charts: (raw.charts ?? [])
      .map((c) => {
        const rawType = c.type as string;
        if (rawType === "stacked_bar" || rawType === "sankey") return null;
        const type = rawType === "donut" ? ("pie" as const) : c.type;
        return {
          ...c,
          type,
          series: c.series ?? [],
        };
      })
      .filter((c): c is NonNullable<typeof c> => c != null),
    intent_findings: raw.intent_findings ?? [],
    threat_findings: raw.threat_findings ?? [],
    priorities: raw.priorities ?? [],
    threat_ratings: filterUsnObserverRatings(raw.threat_ratings),
  };
}
