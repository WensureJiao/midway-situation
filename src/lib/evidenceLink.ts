/**
 * 把语义栏里的一项结论，对到已有 VMMP 问句卡。
 * 只做阅读组织：不改选图、不生成新图。
 */
import type { ChartSpec } from "./types";

export type EvidenceKind = "target" | "axis" | "zone" | "entity";

export type RankedEvidence = {
  featured: ChartSpec[];
  related: ChartSpec[];
  other: ChartSpec[];
  scores: Map<string, number>;
};

const ALIAS_GROUPS: string[][] = [
  ["赤城", "akagi"],
  ["加贺", "kaga"],
  ["苍龙", "soryu"],
  ["飞龙", "hiryu"],
  ["利根", "tone"],
  ["筑摩", "chikuma"],
  ["企业", "enterprise"],
  ["约克城", "yorktown"],
  ["大黄蜂", "hornet"],
  ["中途岛", "midway"],
  [
    "南云",
    "四航母",
    "机动部队",
    "赤城",
    "加贺",
    "苍龙",
    "飞龙",
    "akagi",
    "kaga",
    "soryu",
    "hiryu",
  ],
  ["tf16", "企业", "大黄蜂", "enterprise", "hornet"],
  ["tf17", "约克城", "yorktown"],
];

const TOPIC_BOOST: Record<string, Partial<Record<EvidenceKind, number>>> = {
  "cmp-threat-rank": { target: 6, entity: 2 },
  "cmp-urgent-near": { target: 6, entity: 2 },
  "cmp-threat-evidence": { target: 4 },
  "cmp-force-range": { target: 3, entity: 3 },
  "cmp-force-landing": { target: 3, entity: 3, zone: 2 },
  "cmp-force-bearing": { target: 2, axis: 2, entity: 2 },
  "cmp-highlight-range": { target: 3, entity: 3 },
  "cmp-hunt-range": { target: 2, entity: 2 },
  "cmp-heading": { axis: 4, target: 2, entity: 2 },
  "cmp-intent-axes": { axis: 7, entity: 2 },
  "cmp-aim-link": { axis: 7, entity: 2 },
  "cmp-zone-footprint": { zone: 7 },
  "cmp-zone-radius": { zone: 6 },
  "cmp-air-profile": { entity: 1 },
  "cmp-alt-bands": { entity: 1 },
};

function normalize(s: string): string {
  return s
    .replace(/（[^）]*）/g, "")
    .replace(/^IJN\s+/i, "")
    .replace(/^USS\s+/i, "")
    .replace(/[→\-–>➡/／、,，]/g, " ")
    .trim()
    .toLowerCase();
}

export function queryTokens(query: string): string[] {
  const raw = normalize(query);
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/\s+/).filter((p) => p.length >= 2)) {
    out.add(part);
  }
  out.add(raw);
  for (const group of ALIAS_GROUPS) {
    const hit = group.some((t) => {
      const n = t.toLowerCase();
      return raw.includes(n) || n.includes(raw);
    });
    if (hit) group.forEach((t) => out.add(t.toLowerCase()));
  }
  return [...out];
}

export function namesOverlap(a: string, b: string): boolean {
  const ta = queryTokens(a);
  const tb = queryTokens(b);
  if (!ta.length || !tb.length) return false;
  return ta.some((x) => tb.some((y) => x === y || (x.length >= 2 && y.includes(x)) || (y.length >= 2 && x.includes(y))));
}

function chartFamily(id: string): string {
  return id.replace(/-(radar|area|strip|scatter|line)$/, "");
}

function blobOf(chart: ChartSpec): string {
  const names = (chart.series ?? []).flatMap((s) => [
    s.name,
    s.group ?? "",
    s.detail ?? "",
  ]);
  return normalize([chart.title, chart.description ?? "", ...names].join(" "));
}

export function scoreChartForQuery(
  chart: ChartSpec,
  query: string,
  kind: EvidenceKind = "entity",
): number {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const blob = blobOf(chart);
  const seriesNames = (chart.series ?? []).map((s) =>
    normalize([s.name, s.group ?? ""].join(" ")),
  );
  let score = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (seriesNames.some((n) => n === t)) score += 8;
    else if (seriesNames.some((n) => n.includes(t))) score += 5;
    else if (blob.includes(t)) score += 2;
  }
  const boost = TOPIC_BOOST[chartFamily(chart.id)]?.[kind] ?? 0;
  return score + boost;
}

export function rankEvidence(
  charts: ChartSpec[],
  query: string,
  kind: EvidenceKind = "entity",
): RankedEvidence {
  const scores = new Map<string, number>();
  const ranked = charts
    .map((chart) => {
      const score = scoreChartForQuery(chart, query, kind);
      scores.set(chart.id, score);
      return { chart, score };
    })
    .sort((a, b) => b.score - a.score || a.chart.id.localeCompare(b.chart.id));

  const featured: ChartSpec[] = [];
  const related: ChartSpec[] = [];
  const other: ChartSpec[] = [];
  const top = ranked[0]?.score ?? 0;
  for (const row of ranked) {
    if (row.score <= 0) {
      other.push(row.chart);
      continue;
    }
    if (
      featured.length === 0 &&
      row.score >= Math.max(4, top * 0.7)
    ) {
      featured.push(row.chart);
      continue;
    }
    related.push(row.chart);
  }
  if (!featured.length && ranked[0] && ranked[0].score > 0) {
    featured.push(ranked[0].chart);
    const i = related.findIndex((c) => c.id === ranked[0].chart.id);
    if (i >= 0) related.splice(i, 1);
  }
  return { featured, related, other, scores };
}

export function evidenceKindOf(item?: {
  axis?: unknown;
  zone?: unknown;
  level?: string;
}): EvidenceKind {
  if (item?.axis) return "axis";
  if (item?.zone) return "zone";
  if (item && /紧急|高|中|低/.test(item.level ?? "")) return "target";
  return "entity";
}
