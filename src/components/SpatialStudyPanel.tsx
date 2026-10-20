"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChartCard } from "@/components/SituationCharts";
import { ChartSelectionLegend } from "@/components/ChartSelectionLegend";
import { SkeletonDiffBar } from "@/components/SkeletonDiffBar";
import { VmmpReasoningTrace } from "@/components/VmmpReasoningTrace";
import {
  buildTaskCompareCharts,
  pickStudySlotCharts,
} from "@/lib/compareCharts";
import { chartTypeLabel } from "@/lib/chartTypes";
import { isResidentChartId } from "@/lib/vmmpChartSelect";
import {
  CAMPAIGN_BEAT_CODE,
  inferCampaignBeat,
  intentEvidenceItems,
  type CampaignBeat,
} from "@/lib/vmmpCompare";
import type {
  CompactUnit,
  MapAxis,
  SituationViewSpec,
  ThreatZone,
  SlicePack,
  TaskFocus,
} from "@/lib/types";
import { drawnRadiusNm } from "@/lib/utils";
import { expandBundledShipTarget } from "@/lib/splitShipTargets";
import { levelColor } from "@/lib/zoneLevel";
import { Check, Crosshair, MapPin } from "lucide-react";

const PHASE_BEATS: CampaignBeat[] = [
  "集结",
  "搜索",
  "危机",
  "残局",
  "终局",
];


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

function firstSentence(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const m = t.match(/^(.+?[。！？.!?])/);
  const s = (m?.[1] ?? t).trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function IntentPick({
  item,
  active,
  onPick,
}: {
  item: PriorityItem;
  active: boolean;
  onPick: () => void;
}) {
  const tone = /紧急|高|中|低/.test(item.level)
    ? levelTone(item.level)
    : item.axis?.side === "USN"
      ? "#dc2626"
      : item.axis?.side === "IJN"
        ? "#2563eb"
        : "#64748b";
  return (
    <button
      type="button"
      onClick={onPick}
      className={`flex w-full items-start gap-2 rounded-md bg-[var(--panel)] px-2.5 py-1.5 text-left ring-1 ${
        active ? "" : "ring-[var(--line)] hover:ring-[var(--accent)]"
      }`}
      style={active ? { boxShadow: `0 0 0 2px ${tone}` } : undefined}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-[var(--ink)]">
            {item.title}
          </span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              /紧急|高|中|低/.test(item.level)
                ? levelBadgeClass(item.level)
                : "bg-[var(--panel-2)] text-[var(--muted)] ring-1 ring-[var(--line)]"
            }`}
          >
            {/紧急|高|中|低/.test(item.level) ? item.level : "指向"}
          </span>
        </span>
        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--muted)]">
          {item.subtitle}
        </span>
      </span>
    </button>
  );
}

function SlotHead({
  en,
  zh,
  title,
}: {
  en: string;
  zh: string;
  title: string;
}) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {en} <span className="opacity-50">/</span> {zh}
      </div>
      <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
    </div>
  );
}

type PriorityItem = {
  id: string;
  rank: number;
  title: string;
  subtitle: string;
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
        subtitle: firstSentence(t.evidence || "", 48) || "威胁排序条目",
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

  axes.slice(0, 2).forEach((a, i) => {
    items.push({
      id: `axis-${a.id || i}`,
      rank: items.length + 1,
      title: a.label || "作战指向",
      subtitle:
        a.side === "USN"
          ? "美方视角 · 我方这一拍往哪打"
          : a.side === "IJN"
            ? "美方看到的日方指向"
            : "作战指向",
      level: "指向",
      locateQuery: a.label || highlights[0] || "",
      axis: a,
    });
  });

  zones.slice(0, 2).forEach((z) => {
    items.push({
      id: `z-${z.id}`,
      rank: items.length + 1,
      title: z.label,
      subtitle: "活动区",
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
      subtitle: "支撑这条意图的单位，不按威胁高低排序",
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
          ? names.join("、")
          : names[0] || top?.title || "待研判",
      body:
        firstSentence(tied[0]?.evidence || spec.narrative || "", 120) ||
        "暂无核心威胁判断",
      locateQuery: names[0] || top?.locateQuery || "",
      locateQueries: names,
      hint:
        names.length > 1
          ? `最高档「${topLevel}」共 ${names.length} 个，等级相同，一并作为核心对象`
          : "当前最高优先威胁对象",
      axis: undefined as MapAxis | undefined,
    };
  }
  const beat = inferCampaignBeat("", spec);
  const usnAxis = (spec.map.axes ?? []).find((a) => a.side === "USN");
  const axis = usnAxis || (spec.map.axes ?? [])[0];
  return {
    title: axis?.label || top?.title || `${beat}阶段`,
    body:
      firstSentence(spec.narrative || "", 120) ||
      `美方观察下，这一拍更接近「${beat}」。`,
    locateQuery: axis?.label || top?.locateQuery || "",
    locateQueries: [] as string[],
    hint: `美方视角 · 我方主作战指向 · 更接近「${beat}」`,
    axis,
  };
}

function buildEvidenceWhy(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
): { title: string; detail: string }[] {
  if (taskFocus === "threat") {
    const rows = usnThreatRows(spec).slice(0, 3);
    if (rows.length) {
      return rows.map((r) => ({
        title: r.target,
        detail: firstSentence(r.evidence || "", 90) || `等级：${r.level}`,
      }));
    }
    return (spec.map.threat_zones ?? []).slice(0, 3).map((z) => ({
      title: z.label,
      detail: `${z.level}区${z.radius_nm != null ? ` · 约 ${drawnRadiusNm(z.radius_nm)} nm` : ""}`,
    }));
  }

  const items = intentEvidenceItems(spec).filter(
    (i) => i.kind !== "叙述" && i.kind !== "叙述依据",
  );
  if (items.length) {
    return items.slice(0, 4).map((i) => ({
      title: i.kind,
      detail: i.text,
    }));
  }
  const beat = inferCampaignBeat("", spec);
  return [
    {
      title: "阶段",
      detail: `当前节拍：${beat}${spec.phase_label ? ` · ${spec.phase_label}` : ""}`,
    },
  ];
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
  showSkeletonDiff = false,
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
  /** 对比页：展示相对本地骨架的圈/轴变更 */
  showSkeletonDiff?: boolean;
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
  /** 底栏按左侧图表自然高度对齐（取两图中较矮的一栏） */
  const distColRef = useRef<HTMLDivElement>(null);
  const rankColRef = useRef<HTMLDivElement>(null);
  const [bottomRowH, setBottomRowH] = useState<number | null>(null);

  const priorities = useMemo(
    () => buildPriorityItems(spec, taskFocus),
    [spec, taskFocus],
  );
  const core = useMemo(
    () => buildCoreJudgment(spec, taskFocus, priorities),
    [spec, taskFocus, priorities],
  );
  const evidence = useMemo(
    () => buildEvidenceWhy(spec, taskFocus),
    [spec, taskFocus],
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

  const taskCharts = useMemo(
    () =>
      buildTaskCompareCharts(spec, taskFocus, pack.phase_label, {
        rich: richCharts,
        pack,
      }),
    [spec, taskFocus, pack, richCharts],
  );
  const slots = useMemo(
    () => pickStudySlotCharts(taskCharts, taskFocus),
    [taskCharts, taskFocus],
  );

  const chartTypeSummary = useMemo(() => {
    const types = [...new Set(taskCharts.map((c) => c.type))];
    return types.map((t) => chartTypeLabel(t));
  }, [taskCharts]);

  /** 本侧从扩展池自由选出的图（张数不固定） */
  const extensionCharts = useMemo(
    () =>
      taskCharts.filter(
        (c) => c.id && !isResidentChartId(taskFocus, c.id),
      ),
    [taskCharts, taskFocus],
  );

  const phaseBeat = useMemo(
    () => inferCampaignBeat(pack.phase_label ?? "", spec),
    [pack.phase_label, spec],
  );
  const reasonSide: "A" | "B" | null =
    badge === "A" || badge === "B" ? badge : null;

  useLayoutEffect(() => {
    const a = distColRef.current;
    const b = rankColRef.current;
    if (!a || !b) {
      setBottomRowH(null);
      return;
    }
    const naturalH = (el: HTMLDivElement) => {
      const prev = el.style.height;
      el.style.height = "auto";
      const h = Math.round(el.getBoundingClientRect().height);
      el.style.height = prev;
      return h;
    };
    const measure = () => {
      const ha = naturalH(a);
      const hb = naturalH(b);
      if (ha <= 0 || hb <= 0) return;
      const next = Math.min(ha, hb);
      setBottomRowH((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(a);
    ro.observe(b);
    return () => ro.disconnect();
  }, [taskFocus, slots.distribution, slots.ranking, spec.time_slice]);

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

  const frameTitle =
    taskFocus === "intent"
      ? {
          en: "INTENT VERIFICATION",
          zh: "意图验证",
          sub: "意图指向空间态势",
        }
      : {
          en: "SPATIAL VERIFICATION",
          zh: "空间验证",
          sub: "态势图",
        };

  return (
    <section className="flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg bg-[var(--panel)] ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5">
        <div className="min-w-0">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {frameTitle.en} <span className="opacity-50">/</span>{" "}
              {frameTitle.zh}
            </div>
            <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 font-display text-lg tracking-wide text-[var(--ink)]">
              <span className="shrink-0">
                {label || frameTitle.sub}
                {badge ? (
                  <span className="ml-2 rounded bg-[var(--panel-3)] px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-normal text-[var(--muted)]">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 truncate font-sans text-xs font-normal tracking-normal text-[var(--muted)]">
                {spec.time_slice}
                {(pack.phase_label || spec.phase_label) && (
                  <>
                    <span className="mx-1">·</span>
                    {pack.phase_label || spec.phase_label}
                  </>
                )}
                {spec.phase_label &&
                  pack.phase_label &&
                  spec.phase_label !== pack.phase_label && (
                    <>
                      <span className="mx-1">·</span>
                      {spec.phase_label}
                    </>
                  )}
                <span className="mx-1">·</span>
                美方单视角
              </span>
            </h2>
          </div>
        </div>
      </div>

      {showSkeletonDiff ? (
        <SkeletonDiffBar
          pack={pack}
          spec={spec}
          sideLabel={label || (badge ? `${badge}` : undefined)}
        />
      ) : null}

      {/* 上：地图 + 右侧 PRIORITY / CORE（与本地主界面同构） */}
      <div className="grid border-b border-[var(--line)] lg:grid-cols-[minmax(0,1fr)_minmax(300px,38%)]">
        <div className="map-shell relative min-h-[380px] h-[min(62vh,680px)] overflow-hidden border-b border-[var(--line)] lg:border-b-0 lg:border-r">
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

        <aside className="flex max-h-[min(62vh,680px)] flex-col divide-y divide-[var(--line)] bg-[var(--panel-2)]/35">
          <div
            className={`flex min-h-0 flex-1 flex-col p-3 ${taskFocus === "intent" ? "order-2" : ""}`}
          >
            {taskFocus === "intent" ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-auto">
                <section>
                  <SlotHead
                    en="ENEMY AIM"
                    zh="日方指向"
                    title="我方看到的对方指向"
                  />
                  <p className="mb-1.5 text-[10px] leading-snug text-[var(--muted)]">
                    对方往哪打。这是美方的观察，不是我方主指向。
                  </p>
                  <div className="space-y-1.5">
                    {priorities.filter((p) => p.axis?.side === "IJN").length ? (
                      priorities
                        .filter((p) => p.axis?.side === "IJN")
                        .map((p) => (
                          <IntentPick
                            key={p.id}
                            item={p}
                            active={focusKey === p.id}
                            onPick={() =>
                              locate(p.locateQuery, {
                                color: "#2563eb",
                                key: p.id,
                                axis: p.axis,
                              })
                            }
                          />
                        ))
                    ) : (
                      <p className="text-[11px] text-[var(--muted)]">暂无日方指向</p>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <>
            <SlotHead
              en="PRIORITY"
              zh="优先度"
              title="关键目标排序"
            />
            <p className="mb-1.5 text-[10px] text-[var(--muted)]">
              点击条目可在地图中高亮定位
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto px-0.5 py-0.5">
              {priorities.length ? (
                priorities.map((p) => {
                  const tone = /紧急|高|中|低/.test(p.level)
                    ? levelTone(p.level)
                    : p.axis?.side === "USN"
                      ? "#dc2626"
                      : p.axis?.side === "IJN"
                        ? "#2563eb"
                        : "#9ca3af";
                  const active = focusKey === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        locate(p.locateQuery, {
                          color: tone,
                          key: p.id,
                          axis: p.axis,
                        })
                      }
                      className={`flex w-full items-start gap-2 rounded-md bg-[var(--panel)] px-2.5 py-1.5 text-left ring-1 transition ${
                        active ? "" : "ring-[var(--line)] hover:ring-[var(--accent)]"
                      }`}
                      style={
                        active
                          ? { boxShadow: `0 0 0 2px ${tone}` }
                          : undefined
                      }
                    >
                      <span
                        className="mt-0.5 w-6 shrink-0 text-left text-[11px] font-semibold tabular-nums leading-none"
                        style={{ color: tone }}
                      >
                        {String(p.rank).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-[var(--ink)]">
                            {p.title}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${levelBadgeClass(p.level)}`}
                          >
                            {/紧急|高|中|低|指向|实体/.test(p.level) ? p.level : "关注"}
                          </span>
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[10px] leading-snug text-[var(--muted)]">
                          {p.subtitle}
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="py-4 text-xs text-[var(--muted)]">
                  暂无美方视角威胁条目
                </p>
              )}
            </div>
              </>
            )}
          </div>

          <div className={`shrink-0 p-3 ${taskFocus === "intent" ? "order-1" : ""}`}>
            <SlotHead
              en={taskFocus === "intent" ? "CLAIM" : "CORE NODE"}
              zh={taskFocus === "intent" ? "意图结论" : "核心对象"}
              title={taskFocus === "intent" ? "主作战指向" : "当前核心判断"}
            />
            <div
              className="rounded-md bg-[var(--panel)] px-3 py-2.5 ring-1 ring-[var(--line)]"
              style={
                focusKey === "core"
                  ? { boxShadow: `0 0 0 2px ${coreColor}` }
                  : undefined
              }
            >
              <div className="flex items-start gap-2">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: coreColor }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--ink)]">
                    {(core.locateQueries?.length ?? 0) > 1
                      ? `${core.locateQueries.length} 个${/紧急/.test(core.hint) ? "紧急" : "同级"}目标`
                      : core.title}
                  </div>
                  {(core.locateQueries?.length ?? 0) > 1 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {core.locateQueries.map((name) => {
                        const placed = Boolean(resolveMapFocus(name, pack, spec));
                        return (
                          <span
                            key={name}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-[var(--line)] ${
                              placed
                                ? "bg-[var(--panel-2)] text-[var(--ink)]"
                                : "bg-[var(--panel)] text-[var(--muted)] line-through"
                            }`}
                            title={placed ? "可在地图上定位" : "这一拍没有对应舰体坐标"}
                          >
                            {name}
                            {placed ? "" : " · 无舰体"}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                    {core.body}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {core.hint}
                  </p>
                </div>
              </div>
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
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
                style={{ background: coreColor }}
              >
                <Crosshair className="h-3.5 w-3.5" />
                {taskFocus === "intent"
                  ? "定位这条指向"
                  : (core.locateQueries?.length ?? 0) > 1
                    ? `定位这 ${
                        core.locateQueries.filter((name) =>
                          resolveMapFocus(name, pack, spec),
                        ).length
                      } 个`
                    : "在地图中定位"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* 威胁：分布 → 排序 → 依据（无战役节拍）
          意图：分布 → 证据构成 → 依据 → 战役节拍
          整行高度取左侧两图中较矮一栏，依据/阶段超出可滚动 */}
      <div
        className={`grid items-start gap-0 border-b border-[var(--line)] sm:grid-cols-2 ${
          taskFocus === "intent" ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        <div
          ref={distColRef}
          className="flex min-h-0 min-w-0 flex-col border-b border-[var(--line)] p-3 sm:border-r lg:border-b-0"
          style={bottomRowH ? { height: bottomRowH } : undefined}
        >
          <SlotHead
            en="DISTRIBUTION"
            zh="分布"
            title="敌我位置与登陆海域关系"
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            {slots.distribution ? (
              <div className="min-w-0 max-w-full">
                <ChartCard chart={slots.distribution} compact hideChromeTitle />
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">暂无分布图</p>
            )}
          </div>
        </div>

        <div
          ref={rankColRef}
          className="flex min-h-0 min-w-0 flex-col border-b border-[var(--line)] p-3 lg:border-b-0 lg:border-r"
          style={bottomRowH ? { height: bottomRowH } : undefined}
        >
          <SlotHead
            en={taskFocus === "intent" ? "EVIDENCE MIX" : "RANKING"}
            zh={taskFocus === "intent" ? "构成" : "排序"}
            title={
              taskFocus === "intent"
                ? "证据构成（方向 / 实体 / 活动区）"
                : "威胁优先级排序"
            }
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            {slots.ranking ? (
              <div className="min-w-0 max-w-full">
                <ChartCard chart={slots.ranking} compact hideChromeTitle />
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">暂无排序图</p>
            )}
          </div>
        </div>

        <div
          className="flex min-h-0 min-w-0 flex-col border-b border-[var(--line)] p-3 sm:border-r lg:border-b-0"
          style={bottomRowH ? { height: bottomRowH } : undefined}
        >
          <SlotHead
            en={taskFocus === "intent" ? "BASIS" : "EVIDENCE"}
            zh={taskFocus === "intent" ? "依据" : "判断依据"}
            title={taskFocus === "intent" ? "支撑这条意图的证据" : "为什么重要"}
          />
          {/* 左右留白，避免活动区按钮 ring / 选中描边被 overflow 裁切 */}
          <div className="-mx-0.5 min-h-0 min-w-0 flex-1 overflow-auto px-1.5">
            {taskFocus === "intent" ? (
              <div className="space-y-3">
                <p className="text-[10px] leading-snug text-[var(--muted)]">
                  活动区和关键实体都是依据：说明上面的指向凭什么成立。点一下可在地图上定位。
                </p>
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-[var(--ink)]">
                    活动区
                  </div>
                  <p className="mb-1.5 text-[10px] leading-snug text-[var(--muted)]">
                    这一拍盯住的海域。紧急 / 高 / 中 / 低是圈有多急，不是给舰排名。
                  </p>
                  <div className="space-y-1.5">
                    {priorities.filter((p) => p.id.startsWith("z-")).length ? (
                      priorities
                        .filter((p) => p.id.startsWith("z-"))
                        .map((p) => (
                          <IntentPick
                            key={p.id}
                            item={p}
                            active={focusKey === p.id}
                            onPick={() =>
                              locate(p.locateQuery, {
                                color: levelTone(p.level),
                                key: p.id,
                                zone: p.zone,
                              })
                            }
                          />
                        ))
                    ) : (
                      <p className="text-[11px] text-[var(--muted)]">
                        暂无活动区
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold text-[var(--ink)]">
                    关键实体
                  </div>
                  <p className="mb-1.5 text-[10px] leading-snug text-[var(--muted)]">
                    图上带「实体」名牌的单位。用来说明判断靠谁成立，不按谁更危险排序。
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {priorities.filter((p) => p.id.startsWith("hl-")).length ? (
                      priorities
                        .filter((p) => p.id.startsWith("hl-"))
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() =>
                              locate(p.locateQuery, {
                                color: "#334155",
                                key: p.id,
                              })
                            }
                            className={`rounded-md bg-[var(--panel)] px-2 py-1 text-left text-[11px] ring-1 ${
                              focusKey === p.id
                                ? "ring-[#334155]"
                                : "ring-[var(--line)] hover:ring-[#64748b]"
                            }`}
                          >
                            <span className="mr-1 text-[10px] font-semibold text-[#64748b]">
                              实体
                            </span>
                            <span className="font-medium text-[var(--ink)]">
                              {p.title
                                .replace(/^IJN\s+/i, "")
                                .replace(/^USS\s+/i, "")}
                            </span>
                          </button>
                        ))
                    ) : (
                      <p className="text-[11px] text-[var(--muted)]">
                        暂无关键实体
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {evidence.map((e, i) => (
                  <li
                    key={`${e.title}-${i}`}
                    className="flex items-start gap-2 text-[11px] leading-snug"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0">
                      <span className="font-medium text-[var(--ink)]">
                        {e.title}
                      </span>
                      <span className="mt-0.5 block break-words text-[var(--muted)]">
                        {e.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {threatReason?.trim() && !reasonSide ? (
              <details className="mt-3 rounded-md bg-[var(--panel-2)] px-2 py-1.5 ring-1 ring-[var(--line)]">
                <summary className="cursor-pointer text-[10px] font-medium text-[var(--muted)]">
                  展开完整推理路径
                </summary>
                <div className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-[var(--muted)]">
                  {threatReason.trim()}
                </div>
              </details>
            ) : null}
          </div>
        </div>

        {taskFocus === "intent" ? (
          <div
            className="flex min-h-0 min-w-0 flex-col p-3"
            style={bottomRowH ? { height: bottomRowH } : undefined}
          >
            <SlotHead
              en="PHASE"
              zh="阶段"
              title="战役节拍（集结→终局）"
            />
            <div className="min-h-0 min-w-0 flex-1 overflow-auto">
              <div className="mt-1 flex flex-wrap gap-1">
                {PHASE_BEATS.map((b) => {
                  const on = b === phaseBeat;
                  return (
                    <span
                      key={b}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium tabular-nums ${
                        on
                          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                          : "bg-[var(--panel-2)] text-[var(--muted)] ring-1 ring-[var(--line)]"
                      }`}
                    >
                      {CAMPAIGN_BEAT_CODE[b]} {b}
                    </span>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted)]">
                当前更接近「{phaseBeat}」
                {(pack.phase_label || spec.phase_label) && (
                  <> · {pack.phase_label || spec.phase_label}</>
                )}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
                节拍回答这一片处在集结、搜索、危机、残局还是终局。
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {reasonSide ? (
        <ChartSelectionLegend taskFocus={taskFocus} activeSide={reasonSide} />
      ) : null}

      {extensionCharts.length > 0 ? (
        <div className="border-t border-[var(--line)] px-3 py-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">
                {reasonSide === "B" ? "B" : reasonSide === "A" ? "A" : "本侧"} ·
                所选扩展图
              </h3>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                本侧自由选中的扩展图（张数不固定）；切 A/B
                对比谁的选图更贴任务问句
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {extensionCharts.map((c) => (
                <span
                  key={c.id}
                  className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--ink)] ring-1 ring-[var(--accent)]/40"
                >
                  {chartTypeLabel(c.type)}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {extensionCharts.map((c) => (
              <div
                key={c.id}
                className="min-w-0 rounded-md bg-[var(--panel-2)]/40 p-2 ring-1 ring-[var(--line)]"
              >
                <ChartCard chart={c} compact showWhyType />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {reasonSide ? (
        <div className="border-t border-[var(--line)] px-3 py-2.5">
          <VmmpReasoningTrace
            reasoningThreat={threatReason}
            reasoningIntent={intentReason}
            side={reasonSide}
            observerLabel="美方"
            lockedFocus={taskFocus}
          />
          {richCharts ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[var(--muted)]">本侧图种：</span>
              {chartTypeSummary.length ? (
                chartTypeSummary.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-[var(--panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--ink)] ring-1 ring-[var(--line)]"
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-[var(--muted)]">暂无</span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

    </section>
  );
}
