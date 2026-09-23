import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SituationViewSpec } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nmToMeters(nm: number): number {
  return nm * 1852;
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
  return {
    ...raw,
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
        if (rawType === "scatter" || rawType === "stacked_bar") return null;
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
    threat_ratings: raw.threat_ratings ?? [],
  };
}
