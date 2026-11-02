"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartCard,
  chartInsight,
  chartQuestion,
} from "@/components/SituationCharts";
import { VmmpReasoningTrace } from "@/components/VmmpReasoningTrace";
import { buildTaskCompareCharts } from "@/lib/compareCharts";
import { chartOrderCaption } from "@/lib/vmmpChartSelect";
import { inferCampaignBeat } from "@/lib/vmmpCompare";
import type {
  ChartSpec,
  CompactUnit,
  MapAxis,
  SituationViewSpec,
  ThreatZone,
  SlicePack,
  TaskFocus,
} from "@/lib/types";
import { expandBundledShipTarget } from "@/lib/splitShipTargets";
import { levelColor } from "@/lib/zoneLevel";
import { Crosshair, MapPin, X } from "lucide-react";

function unitCentroid(units: CompactUnit[]): [number, number] | null {
  if (!units.length) return null;
  const lat = units.reduce((s, u) => s + u.latitude, 0) / units.length;
  const lon = units.reduce((s, u) => s + u.longitude, 0) / units.length;
  return [lat, lon];
}

/** 中文舰名对到快照里的英文舰体。单舰只取这一艘，避免四艘都落到同一活动区中心。 */
const NAMED_HULLS: { mention: RegExp; unit: RegExp }[] = [
  { mention: /赤城|akagi/i, unit: /akagi/i },
  { mention: /加贺|kaga/i, unit: /kaga/i },
  { mention: /苍龙|soryu/i, unit: /soryu/i },
  { mention: /飞龙|hiryu/i, unit: /hiryu/i },
  { mention: /利根|tone/i, unit: /tone/i },
  { mention: /筑摩|chikuma/i, unit: /chikuma/i },
  { mention: /企业|enterprise/i, unit: /enterprise/i },
  { mention: /约克城|yorktown/i, unit: /yorktown/i },
  { mention: /大黄蜂|hornet/i, unit: /hornet/i },
];

function hullsNamedIn(query: string, units: CompactUnit[]): CompactUnit[] {
  const hits = NAMED_HULLS.filter((s) => s.mention.test(query));
  const found: CompactUnit[] = [];
  for (const hit of hits) {
    const matches = units.filter((u) => hit.unit.test(u.name));
    const hull =
      matches.find((u) => u.unit_type === "Ship") ??
      matches.find((u) => u.unit_type !== "Aircraft");
    if (hull && !found.some((u) => u.name === hull.name)) found.push(hull);
  }
  return found;
}

/**
 * 把威胁条目/指向/区名解析成地图坐标。
 * 研判用的是「南云四航母」这类标签，地图上是 IJN Akagi 等舰名，需做别名与区匹配。
 */
function resolveMapFocus(
  query: string,
  pack: SlicePack,
  spec: SituationViewSpec,
): [number, number] | null {
  const q = query.trim();
  if (!q) return null;
  const qLower = q.toLowerCase();
  const parts = q.split(/[/、,，\s]+/).filter((p) => p.length >= 2);
  const all = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ];
  const zones = spec.map?.threat_zones ?? [];
  const axes = spec.map?.axes ?? [];
  const highlights = spec.map?.highlight_names ?? [];
  const mentioned = NAMED_HULLS.filter((s) => s.mention.test(q));
  const hulls = hullsNamedIn(q, all);
  if (mentioned.length === 1) {
    if (!hulls[0]) return null;
    return [hulls[0].latitude, hulls[0].longitude];
  }
  if (mentioned.length > 1 && hulls.length) {
    return unitCentroid(hulls);
  }

  const byName = all.find((u) => {
    const n = u.name.toLowerCase();
    return (
      n.includes(qLower) ||
      qLower.includes(n) ||
      parts.some((p) => n.includes(p.toLowerCase()))
    );
  });
  if (byName) return [byName.latitude, byName.longitude];

  for (const h of highlights) {
    if (
      h.toLowerCase().includes(qLower) ||
      qLower.includes(h.toLowerCase()) ||
      parts.some((p) => h.toLowerCase().includes(p.toLowerCase()))
    ) {
      const u = all.find((x) => x.name === h);
      if (u) return [u.latitude, u.longitude];
    }
  }

  const zone = zones.find(
    (z) =>
      z.label.includes(q) ||
      q.includes(z.label) ||
      parts.some((p) => z.label.includes(p)),
  );
  if (zone?.center) return zone.center;

  const axis = axes.find(
    (a) =>
      (a.label || "").includes(q) ||
      q.includes(a.label || "") ||
      parts.some((p) => (a.label || "").includes(p)),
  );
  if (axis?.to) return axis.to;

  if (/南云|四航母|机动部队|赤城|加贺|苍龙|飞龙|akagi|kaga|soryu|hiryu/i.test(q)) {
    const z = zones.find((z) => /南云|机动|航母|集结/.test(z.label));
    if (z?.center) return z.center;
    const cvs = all.filter(
      (u) => u.side === "IJN" && /航空母舰/.test(u.unit_class ?? ""),
    );
    const c = unitCentroid(cvs);
    if (c) return c;
  }

  if (/利根|筑摩|水侦|tone|chikuma/i.test(q)) {
    const z = zones.find((z) => /利根|筑摩|水侦/.test(z.label));
    if (z?.center) return z.center;
    const ships = all.filter((u) =>
      /Tone|Chikuma|利根|筑摩/i.test(u.name),
    );
    const c = unitCentroid(ships);
    if (c) return c;
  }

  if (/中途岛|midway/i.test(q)) {
    const mid = all.find((u) => /中途岛|Midway/i.test(`${u.name} ${u.group ?? ""}`));
    if (mid) return [mid.latitude, mid.longitude];
  }

  if (/零式|战斗机|战备|发现链|突击/i.test(q)) {
    const z = zones.find((z) => /南云|机动|集结/.test(z.label));
    if (z?.center) return z.center;
  }

  if (/企业|约克城|大黄蜂|enterprise|yorktown|hornet|tf16|tf17/i.test(q)) {
    const cvs = all.filter(
      (u) => u.side === "USN" && /航空母舰/.test(u.unit_class ?? ""),
    );
    const c = unitCentroid(cvs);
    if (c) return c;
  }

  if (zones[0]?.center) return zones[0].center;
  if (highlights[0]) {
    const u = all.find((x) => x.name === highlights[0]);
    if (u) return [u.latitude, u.longitude];
  }
  if (spec.map?.center) return spec.map.center;
  return null;
}

const SituationMap = dynamic(
  () => import("@/components/SituationMap").then((m) => m.SituationMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
        地图加载中…
      </div>
    ),
  },
);

function levelPct(level: string): number {
  if (/紧急/.test(level)) return 95;
  if (/高/.test(level)) return 75;
  if (/中/.test(level)) return 45;
  if (/低/.test(level)) return 20;
  return 30;
}

function levelTone(level: string): string {
  if (/紧急|高|中|低/.test(level)) return levelColor(level);
  return "#9ca3af";
}

function levelBadgeClass(level: string): string {
  if (/紧急/.test(level)) return "badge-critical";
  if (/高/.test(level)) return "badge-high";
  if (/中/.test(level)) return "badge-mid";
  if (/低/.test(level)) return "badge-low";
  return "badge-mid";
}

function usnThreatRows(spec: SituationViewSpec) {
  return (spec.threat_ratings ?? [])
    .filter((r) => /红方看|美方看|USN/.test(r.perspective ?? ""))
    .filter((r) => Boolean(r.target))
    .flatMap((r, i) =>
      expandBundledShipTarget(r.target).map((target, j) => ({
        id: `${target}-${i}-${j}`,
        target,
        level: r.level,
        evidence: r.evidence,
        pct: levelPct(r.level),
        tone: levelTone(r.level),
      })),
    )
    .sort((a, b) => b.pct - a.pct);
}

function locatorTone(item: PriorityItem): string {
  if (/紧急|高|中|低/.test(item.level)) return levelTone(item.level);
  if (item.axis?.side === "USN") return "#dc2626";
  if (item.axis?.side === "IJN") return "#2563eb";
  return "#64748b";
}

function LocatorRow({
  item,
  active,
  onPick,
}: {
  item: PriorityItem;
  active: boolean;
  onPick: () => void;
}) {
  const tone = locatorTone(item);
  const badge = /紧急|高|中|低/.test(item.level)
    ? item.level
    : item.axis
      ? "指向"
      : item.zone
        ? "活动区"
        : "实体";
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-center gap-1.5 rounded bg-[var(--panel)] px-1.5 py-1 text-left ring-1 ${
        active ? "" : "ring-[var(--line)] hover:ring-[var(--accent)]"
      }`}
      style={active ? { boxShadow: `0 0 0 2px ${tone}` } : undefined}
    >
      <span
        className="w-5 shrink-0 text-left text-[11px] font-semibold tabular-nums leading-none"
        style={{ color: tone }}
      >
        {String(item.rank).padStart(2, "0")}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--ink)]">
        {item.title.replace(/^IJN\s+/i, "").replace(/^USS\s+/i, "")}
      </span>
      <span
        className={`shrink-0 rounded px-1 py-px text-[10px] font-semibold ${
          /紧急|高|中|低/.test(item.level)
            ? levelBadgeClass(item.level)
            : "bg-[var(--panel-2)] text-[var(--muted)] ring-1 ring-[var(--line)]"
        }`}
      >
        {badge}
      </span>
    </button>
  );
}

function SideChartCard({
  chart,
  active,
  onSelectName,
}: {
  chart: ChartSpec;
  active?: boolean;
  onSelectName?: (name: string) => void;
}) {
  const question = chartQuestion(chart);
  const insight = chartInsight(chart);
  const sideLegend =
    chart.id === "cmp-force-landing" ||
    chart.id === "cmp-force-bearing" ||
    chart.id === "cmp-intent-axes" ||
    chart.id === "cmp-air-profile" ||
    chart.id === "cmp-zone-footprint" ||
    chart.id === "cmp-alt-bands" ||
    chart.id === "cmp-force-range" ||
    chart.id === "cmp-highlight-range" ||
    chart.id === "cmp-aim-link" ||
    chart.id === "cmp-heading" ||
    chart.id === "cmp-urgent-near";
  const levelLegend =
    chart.id === "cmp-threat-rank" || chart.id === "cmp-threat-evidence";
  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md bg-[var(--panel)] px-1.5 py-1 ring-1 ${
        active ? "ring-[var(--accent)]" : "ring-[var(--line)]"
      }`}
    >
      <div className="mb-0.5 flex shrink-0 min-w-0 items-center gap-1">
        <span className="shrink-0 rounded bg-[var(--panel-3)] px-1 py-px text-[9px] font-semibold tracking-wide text-[var(--muted)]">
          Q
        </span>
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-[var(--ink)]">
          {question}
        </h3>
        {sideLegend ? (
          <span className="flex shrink-0 items-center gap-1 text-[9px] text-[var(--muted)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#c45c4a" }} />
            美
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#3b82a8" }} />
            日
          </span>
        ) : null}
        {levelLegend ? (
          <span className="flex shrink-0 items-center gap-0.5 text-[9px] text-[var(--muted)]">
            <span className="inline-block h-1.5 w-2 rounded-sm bg-[#9f1239]" />
            <span className="inline-block h-1.5 w-2 rounded-sm bg-[#ea580c]" />
            <span className="inline-block h-1.5 w-2 rounded-sm bg-[#f59e0b]" />
          </span>
        ) : null}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ChartCard
          chart={chart}
          compact
          fill
          plotOnly
          onSelectName={onSelectName}
        />
      </div>
      {insight ? (
        <p className="mt-0.5 shrink-0 truncate border-t border-[var(--line)] pt-0.5 text-[10px] leading-tight text-[var(--ink)]">
          <span className="mr-1 font-semibold text-[var(--accent)]">结论</span>
          {insight}
        </p>
      ) : null}
    </div>
  );
}

function SlotHead({
  en,
  zh,
  title,
  compact,
}: {
  en: string;
  zh: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-0.5" : "mb-2"}>
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"
      >
        {en} <span className="opacity-50">/</span> {zh}
      </div>
      {title ? (
        <h3
          className={`line-clamp-2 font-semibold text-[var(--ink)] ${
            compact ? "text-xs leading-tight" : "text-sm"
          }`}
        >
          {title}
        </h3>
      ) : null}
    </div>
  );
}

type PriorityItem = {
  id: string;
  rank: number;
  title: string;
  level: string;
  locateQuery: string;
  /** 点这条时高亮整段轴线，而不是终点一个钉 */
  axis?: MapAxis;
  /** 点活动区时高亮整圈，而不是圆心一个钉 */
  zone?: ThreatZone;
};

function buildPriorityItems(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
): PriorityItem[] {
  if (taskFocus === "threat") {
    return usnThreatRows(spec)
      .slice(0, 8)
      .map((t, i) => ({
        id: t.id,
        rank: i + 1,
        title: t.target,
        level: t.level,
        locateQuery: t.target,
      }));
  }

  const axes = [...(spec.map.axes ?? [])].sort((a, b) => {
    const rank = (side?: string) => (side === "USN" ? 0 : side === "IJN" ? 1 : 2);
    return rank(a.side) - rank(b.side);
  });
  const highlights = spec.map.highlight_names ?? [];
  const zones = [...(spec.map.threat_zones ?? [])].sort(
    (a, b) => levelPct(String(b.level ?? "")) - levelPct(String(a.level ?? "")),
  );
  const items: PriorityItem[] = [];

  axes.forEach((a, i) => {
    if (a.side === "USN") return;
    items.push({
      id: `axis-${a.id || i}`,
      rank: items.length + 1,
      title: a.label || "作战指向",
      level: "指向",
      locateQuery: a.label || highlights[0] || "",
      axis: a,
    });
  });

  zones.slice(0, 3).forEach((z) => {
    items.push({
      id: `z-${z.id}`,
      rank: items.length + 1,
      title: z.label,
      level: String(z.level || "中"),
      locateQuery: z.label,
      zone: z,
    });
  });

  highlights.slice(0, 4).forEach((name) => {
    if (items.some((x) => x.title === name)) return;
    items.push({
      id: `hl-${name}`,
      rank: items.length + 1,
      title: name,
      level: "实体",
      locateQuery: name,
    });
  });

  return items;
}

function buildCoreJudgment(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
  priorities: PriorityItem[],
) {
  const top = priorities[0];
  if (taskFocus === "threat") {
    const rows = usnThreatRows(spec);
    const topLevel = rows[0]?.level ?? "";
    const tied = topLevel
      ? rows.filter((r) => r.level === topLevel)
      : [];
    const names = tied.map((r) => r.target);
    return {
      title:
        names.length > 1
          ? `${names[0]} 等 ${names.length} 个`
          : names[0] || top?.title || "待研判",
      locateQuery: names[0] || top?.locateQuery || "",
      locateQueries: names,
      axis: undefined as MapAxis | undefined,
    };
  }
  const beat = inferCampaignBeat("", spec);
  const usnAxis = (spec.map.axes ?? []).find((a) => a.side === "USN");
  const axis = usnAxis || (spec.map.axes ?? [])[0];
  return {
    title: axis?.label || top?.title || `${beat}阶段`,
    locateQuery: axis?.label || top?.locateQuery || "",
    locateQueries: [] as string[],
    axis,
  };
}

export function SpatialStudyPanel({
  pack,
  spec,
  taskFocus = "threat",
  label,
  badge,
  reasoning,
  reasoningThreat,
  reasoningIntent,
  richCharts = true,
  mapKey,
}: {
  pack: SlicePack;
  spec: SituationViewSpec;
  taskFocus?: TaskFocus;
  label?: string;
  badge?: string;
  /** @deprecated 请用 reasoningThreat；保留兼容本地展开 */
  reasoning?: string;
  reasoningThreat?: string;
  reasoningIntent?: string;
  richCharts?: boolean;
  mapKey?: string;
}) {
  const threatReason = reasoningThreat ?? reasoning;
  const intentReason = reasoningIntent;
  const [focusCenter, setFocusCenter] = useState<[number, number] | null>(
    null,
  );
  const [focusLabel, setFocusLabel] = useState("");
  const [focusColor, setFocusColor] = useState("#dc2626");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [focusAxis, setFocusAxis] = useState<MapAxis | null>(null);
  const [focusPoints, setFocusPoints] = useState<
    { at: [number, number]; label: string; unitName?: string }[]
  >([]);
  const [focusZone, setFocusZone] = useState<ThreatZone | null>(null);

  const priorities = useMemo(
    () => buildPriorityItems(spec, taskFocus),
    [spec, taskFocus],
  );
  const core = useMemo(
    () => buildCoreJudgment(spec, taskFocus, priorities),
    [spec, taskFocus, priorities],
  );
  const coreItem = core.axis
    ? priorities.find(
        (p) =>
          (core.axis?.id && p.axis?.id === core.axis.id) ||
          p.title === core.axis?.label,
      )
    : priorities[0];
  const coreLevel = /紧急|高|中|低/.test(coreItem?.level ?? "")
    ? coreItem!.level
    : taskFocus === "intent"
      ? ""
      : "紧急";
  const coreColor = coreLevel
    ? levelTone(coreLevel)
    : core.axis?.side === "USN"
      ? "#dc2626"
      : "#2563eb";

  const chartsA = useMemo(
    () =>
      buildTaskCompareCharts(spec, taskFocus, pack.phase_label, {
        rich: false,
        pack,
      }),
    [spec, taskFocus, pack],
  );
  const chartsB = useMemo(
    () =>
      buildTaskCompareCharts(spec, taskFocus, pack.phase_label, {
        rich: true,
        pack,
      }),
    [spec, taskFocus, pack],
  );
  const reasonSide: "A" | "B" | null =
    badge === "A" || badge === "B" ? badge : null;
  const viewSide: "A" | "B" = reasonSide ?? (richCharts ? "B" : "A");
  const sideCharts = viewSide === "B" ? chartsB : chartsA;
  const mainCharts = sideCharts.filter((c) => c.band !== "extend");
  const extendCharts = sideCharts.filter((c) => c.band === "extend");
  const displayMain = mainCharts.length ? mainCharts : sideCharts;
  const rowCharts = mainCharts.length
    ? [...mainCharts, ...extendCharts]
    : sideCharts;
  const chartCols = Math.max(displayMain.length, 1);
  const [activeChartId, setActiveChartId] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const traceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTraceOpen(false);
  }, [reasonSide, taskFocus, threatReason, intentReason]);

  useEffect(() => {
    if (!traceOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTraceOpen(false);
    };
    const onPtr = (e: PointerEvent) => {
      if (traceRef.current?.contains(e.target as Node)) return;
      setTraceOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPtr);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPtr);
    };
  }, [traceOpen]);

  const locate = (
    query: string,
    opts?: {
      color?: string;
      key?: string;
      axis?: MapAxis;
      queries?: string[];
      zone?: ThreatZone;
    },
  ) => {
    if (opts?.zone?.center && opts.zone.radius_nm) {
      setFocusPoints([]);
      setFocusAxis(null);
      setFocusCenter(null);
      setFocusZone(opts.zone);
      setFocusLabel(opts.zone.label || query.trim() || "活动区");
      setFocusColor(opts.color || levelTone(String(opts.zone.level || "")));
      setFocusKey(opts.key ?? null);
      setFocusTick((n) => n + 1);
      return;
    }
    if (opts?.axis?.from && opts.axis.to) {
      setFocusPoints([]);
      setFocusZone(null);
      setFocusAxis(opts.axis);
      setFocusCenter(null);
      setFocusLabel(opts.axis.label || query.trim() || "作战指向");
      setFocusColor(
        opts.color || (opts.axis.side === "IJN" ? "#1d4ed8" : "#dc2626"),
      );
      setFocusKey(opts.key ?? null);
      setFocusTick((n) => n + 1);
      return;
    }
    const queries = (opts?.queries?.length ? opts.queries : [query]).filter(
      Boolean,
    );
    const units = [
      ...(pack.sides.USN?.units ?? []),
      ...(pack.sides.IJN?.units ?? []),
    ];
    const points = queries
      .map((q) => {
        const at = resolveMapFocus(q, pack, spec);
        if (!at) return null;
        const hull = hullsNamedIn(q, units)[0];
        const short = q.replace(/（[^）]*）/g, "").trim() || q;
        return { at, label: short, unitName: hull?.name };
      })
      .filter(
        (p): p is { at: [number, number]; label: string; unitName?: string } =>
          Boolean(p),
      );
    if (!points.length) return;
    setFocusZone(null);
    setFocusAxis(null);
    setFocusColor(opts?.color || "#dc2626");
    setFocusKey(opts?.key ?? null);
    setFocusTick((n) => n + 1);
    if (points.length > 1) {
      setFocusPoints(points);
      setFocusCenter(null);
      setFocusLabel(points.map((p) => p.label).join("、"));
      return;
    }
    setFocusPoints([]);
    setFocusCenter(points[0].at);
    setFocusLabel(points[0].label);
  };

  const locateFromName = (name: string, chartId?: string) => {
    if (chartId) setActiveChartId(chartId);
    const hit =
      priorities.find(
        (p) =>
          p.title === name ||
          p.locateQuery === name ||
          p.title.includes(name) ||
          name.includes(p.title),
      ) ?? null;
    const zone =
      hit?.zone ??
      spec.map.threat_zones?.find(
        (z) => z.label.includes(name) || name.includes(z.label),
      );
    const axis =
      hit?.axis ??
      spec.map.axes?.find(
        (a) =>
          (a.label || "").includes(name) || name.includes(a.label || ""),
      );
    locate(hit?.locateQuery || name, {
      color: hit ? locatorTone(hit) : undefined,
      key: hit?.id ?? `chart-${name}`,
      axis,
      zone,
    });
  };

  const pickLocator = (p: PriorityItem) => {
    setActiveChartId(null);
    locate(p.locateQuery, {
      color: locatorTone(p),
      key: p.id,
      axis: p.axis,
      zone: p.zone,
    });
  };

  const frameTitle =
    taskFocus === "intent"
      ? { en: "INTENT", zh: "意图", sub: "意图指向" }
      : { en: "SITUATION", zh: "态势", sub: "态势图" };

  return (
    <section className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-lg bg-[var(--panel)] ring-1 ring-[var(--line)]">
      <div className="grid h-full min-h-full shrink-0 grid-rows-[auto_minmax(0,1fr)_minmax(228px,40%)]">
      <div className="relative z-[1100] flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-[var(--line)] px-3 py-1">
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {frameTitle.en} <span className="opacity-50">/</span> {frameTitle.zh}
        </span>
        <h2 className="min-w-0 truncate font-display text-sm tracking-wide text-[var(--ink)]">
          {label || frameTitle.sub}
          {badge ? (
            <span className="ml-1.5 rounded bg-[var(--panel-3)] px-1.5 py-px align-middle font-sans text-[9px] font-semibold uppercase tracking-normal text-[var(--muted)]">
              {badge}
            </span>
          ) : null}
        </h2>
        <span className="min-w-0 truncate font-sans text-[11px] font-normal text-[var(--muted)]">
          {spec.time_slice}
          {(pack.phase_label || spec.phase_label) && (
            <>
              <span className="mx-1">·</span>
              {pack.phase_label || spec.phase_label}
            </>
          )}
        </span>
        {reasonSide && (threatReason?.trim() || intentReason?.trim()) ? (
          <div ref={traceRef} className="relative ml-auto shrink-0">
            <button
              type="button"
              className={`cursor-pointer text-[11px] font-medium ${
                traceOpen ? "text-[var(--ink)]" : "text-[var(--muted)]"
              }`}
              aria-expanded={traceOpen}
              onClick={() => setTraceOpen((o) => !o)}
            >
              {traceOpen ? "收起推理" : "推理路径"}
            </button>
            {traceOpen ? (
              <div className="fixed right-3 top-12 z-[2000] max-h-[calc(100dvh-4rem)] w-[min(44rem,calc(100vw-1.5rem))] overflow-y-auto rounded-md bg-[var(--panel)] p-2 shadow-xl ring-1 ring-[var(--line)]">
                <div className="mb-1 flex items-center justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-[var(--muted)] hover:bg-[var(--panel-3)] hover:text-[var(--ink)]"
                    onClick={() => setTraceOpen(false)}
                  >
                    <X className="h-3 w-3" />
                    收起
                  </button>
                </div>
                <VmmpReasoningTrace
                  reasoningThreat={threatReason}
                  reasoningIntent={intentReason}
                  side={reasonSide}
                  observerLabel="美方"
                  lockedFocus={taskFocus}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(168px,210px)] overflow-hidden border-b border-[var(--line)]">
        <div className="map-shell relative min-h-0 overflow-hidden border-r border-[var(--line)]">
          <SituationMap
            key={mapKey || `${spec.time_slice}-${taskFocus}`}
            pack={pack}
            spec={spec}
            focusCenter={focusCenter}
            focusLabel={focusLabel}
            focusColor={focusColor}
            focusTick={focusTick}
            focusAxis={focusAxis}
            focusZone={focusZone}
            focusPoints={focusPoints}
            markEntities={taskFocus === "intent"}
          />
        </div>

        <aside className="flex min-h-0 flex-col divide-y divide-[var(--line)] bg-[var(--panel-2)]/35">
          <div className="shrink-0 p-1.5">
            <SlotHead
              compact
              en={taskFocus === "intent" ? "CLAIM" : "CORE"}
              zh={taskFocus === "intent" ? "主指向" : "核心"}
              title={core.title}
            />
            <button
              type="button"
              disabled={!core.locateQuery}
              onClick={() =>
                locate(core.locateQuery, {
                  color: coreColor,
                  key: "core",
                  axis: core.axis,
                  queries:
                    (core.locateQueries?.length ?? 0) > 1
                      ? core.locateQueries
                      : undefined,
                })
              }
              className="inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
              style={{
                background: coreColor,
                boxShadow:
                  focusKey === "core" ? `0 0 0 2px ${coreColor}` : undefined,
              }}
            >
              <Crosshair className="h-3 w-3" />
              <MapPin className="h-3 w-3" />
              定位
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-1.5">
            <SlotHead
              compact
              en={taskFocus === "intent" ? "TRACKS" : "PRIORITY"}
              zh={taskFocus === "intent" ? "依据" : "排序"}
            />
            <div className="min-h-0 flex-1 space-y-1 overflow-auto p-0.5">
              {priorities.length ? (
                priorities.map((p) => (
                  <LocatorRow
                    key={p.id}
                    item={p}
                    active={focusKey === p.id}
                    onPick={() => pickLocator(p)}
                  />
                ))
              ) : (
                <p className="py-2 text-[10px] text-[var(--muted)]">暂无条目</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden px-2 pb-1 pt-1">
        {sideCharts.length ? (
          <>
            <div className="chart-h-scroll min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
              <div
                className="grid h-full min-h-0 min-w-full gap-1.5"
                style={{
                  width: `${(rowCharts.length / chartCols) * 100}%`,
                  gridTemplateColumns: `repeat(${rowCharts.length}, minmax(0, 1fr))`,
                }}
              >
                {rowCharts.map((chart) => (
                  <SideChartCard
                    key={chart.id}
                    chart={chart}
                    active={activeChartId === chart.id}
                    onSelectName={(name) => locateFromName(name, chart.id)}
                  />
                ))}
              </div>
            </div>
            <p className="mt-0.5 shrink-0 px-0.5 text-[9px] leading-tight text-[var(--muted)]">
              {chartOrderCaption(
                taskFocus,
                viewSide === "B",
                extendCharts.length > 0,
              )}
            </p>
          </>
        ) : (
          <p className="flex h-full items-center justify-center text-[11px] text-[var(--muted)]">
            本拍暂无统计图
          </p>
        )}
      </div>
      </div>
    </section>
  );
}
