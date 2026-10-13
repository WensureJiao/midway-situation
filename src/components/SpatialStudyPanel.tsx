"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ChartCard } from "@/components/SituationCharts";
import { SkeletonDiffBar } from "@/components/SkeletonDiffBar";
import { VmmpReasoningTrace } from "@/components/VmmpReasoningTrace";
import {
  buildTaskCompareCharts,
  pickStudySlotCharts,
} from "@/lib/compareCharts";
import { chartTypeLabel } from "@/lib/chartTypes";
import {
  CAMPAIGN_BEAT_CODE,
  inferCampaignBeat,
  intentEvidenceItems,
  type CampaignBeat,
} from "@/lib/vmmpCompare";
import type {
  CompactUnit,
  SituationViewSpec,
  SlicePack,
  TaskFocus,
} from "@/lib/types";
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
  if (/紧急/.test(level)) return "#9f1239";
  if (/高/.test(level)) return "#e07a3a";
  if (/中/.test(level)) return "#d4a017";
  if (/低/.test(level)) return "#5b8c5a";
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
    .map((r, i) => ({
      id: `${r.target}-${i}`,
      target: r.target,
      level: r.level,
      evidence: r.evidence,
      pct: levelPct(r.level),
      tone: levelTone(r.level),
    }))
    .sort((a, b) => b.pct - a.pct);
}

function firstSentence(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const m = t.match(/^(.+?[。！？.!?])/);
  const s = (m?.[1] ?? t).trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
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
};

function buildPriorityItems(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
): PriorityItem[] {
  if (taskFocus === "threat") {
    return usnThreatRows(spec)
      .slice(0, 5)
      .map((t, i) => ({
        id: t.id,
        rank: i + 1,
        title: t.target,
        subtitle: firstSentence(t.evidence || "", 48) || "威胁排序条目",
        level: t.level,
        locateQuery: t.target,
      }));
  }

  const axes = spec.map.axes ?? [];
  const highlights = spec.map.highlight_names ?? [];
  const zones = spec.map.threat_zones ?? [];
  const items: PriorityItem[] = [];

  axes.slice(0, 2).forEach((a, i) => {
    items.push({
      id: `axis-${a.id || i}`,
      rank: items.length + 1,
      title: a.label || "作战指向",
      subtitle: a.side === "IJN" ? "日方指向" : a.side === "USN" ? "美方指向" : "作战指向",
      level: i === 0 ? "高" : "中",
      locateQuery: a.label || highlights[0] || "",
    });
  });

  highlights.slice(0, 3).forEach((name) => {
    if (items.length >= 5) return;
    if (items.some((x) => x.title === name)) return;
    items.push({
      id: `hl-${name}`,
      rank: items.length + 1,
      title: name,
      subtitle: "关键实体 · 支撑意图假设",
      level: items.length < 2 ? "高" : "中",
      locateQuery: name,
    });
  });

  zones.slice(0, 2).forEach((z) => {
    if (items.length >= 5) return;
    items.push({
      id: `z-${z.id}`,
      rank: items.length + 1,
      title: z.label,
      subtitle: `活动区 · ${z.level}`,
      level: String(z.level),
      locateQuery: z.label,
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
    const topThreat = usnThreatRows(spec)[0];
    return {
      title: top?.title || topThreat?.target || "待研判",
      body:
        firstSentence(topThreat?.evidence || spec.narrative || "", 120) ||
        "暂无核心威胁判断",
      locateQuery: top?.locateQuery || topThreat?.target || "",
      hint: "当前最高优先威胁对象",
    };
  }
  const beat = inferCampaignBeat("", spec);
  const axis = (spec.map.axes ?? [])[0];
  return {
    title: top?.title || axis?.label || `${beat}阶段`,
    body:
      firstSentence(spec.narrative || "", 120) ||
      `当前更接近「${beat}」节拍；指向与关键实体见右侧排序。`,
    locateQuery: top?.locateQuery || axis?.label || "",
    hint: "当前核心意图判断",
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
      detail: `关注区 · ${z.level}${z.radius_nm != null ? ` · 约 ${z.radius_nm} nm` : ""}`,
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

  const CORE_FOCUS_COLOR = "#9f1239";

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

  const phaseBeat = useMemo(
    () => inferCampaignBeat(pack.phase_label ?? "", spec),
    [pack.phase_label, spec],
  );
  const reasonSide: "A" | "B" | null =
    badge === "A" || badge === "B" ? badge : null;

  const locate = (
    query: string,
    opts?: { color?: string; key?: string },
  ) => {
    const pos = resolveMapFocus(query, pack, spec);
    if (!pos) return;
    setFocusCenter(pos);
    setFocusLabel(query.trim() || "目标位置");
    setFocusColor(opts?.color || "#dc2626");
    setFocusKey(opts?.key ?? null);
    setFocusTick((n) => n + 1);
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
          />
        </div>

        <aside className="flex max-h-[min(62vh,680px)] flex-col divide-y divide-[var(--line)] bg-[var(--panel-2)]/35">
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <SlotHead
              en="PRIORITY"
              zh="优先度"
              title={
                taskFocus === "intent" ? "关键指向与实体排序" : "关键目标排序"
              }
            />
            <p className="mb-1.5 text-[10px] text-[var(--muted)]">
              点击条目可在地图中高亮定位
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto px-0.5 py-0.5">
              {priorities.length ? (
                priorities.map((p) => {
                  const tone = levelTone(p.level);
                  const active = focusKey === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        locate(p.locateQuery, { color: tone, key: p.id })
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
                            {/紧急|高|中|低/.test(p.level) ? p.level : "关注"}
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
                  {taskFocus === "intent"
                    ? "暂无指向/关键实体条目"
                    : "暂无美方视角威胁条目"}
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0 p-3">
            <SlotHead en="CORE NODE" zh="核心对象" title="当前核心判断" />
            <div
              className="rounded-md bg-[var(--panel)] px-3 py-2.5 ring-1 ring-[var(--line)]"
              style={
                focusKey === "core"
                  ? { boxShadow: `0 0 0 2px ${CORE_FOCUS_COLOR}` }
                  : undefined
              }
            >
              <div className="flex items-start gap-2">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: CORE_FOCUS_COLOR }}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--ink)]">
                    {core.title}
                  </div>
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
                    color: CORE_FOCUS_COLOR,
                    key: "core",
                  })
                }
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
                style={{ background: CORE_FOCUS_COLOR }}
              >
                <Crosshair className="h-3.5 w-3.5" />
                在地图中定位
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* 下：分布 → 排序 → 证据 → 阶段（本地四栏 + 右侧） */}
      <div className="grid gap-0 border-b border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0 border-b border-[var(--line)] p-3 sm:border-r lg:border-b-0">
          <SlotHead
            en="DISTRIBUTION"
            zh="分布"
            title="敌我位置与登陆海域关系"
          />
          {slots.distribution ? (
            <div className="min-w-0 max-w-full">
              <ChartCard chart={slots.distribution} compact hideChromeTitle />
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">暂无分布图</p>
          )}
        </div>

        <div className="min-w-0 border-b border-[var(--line)] p-3 lg:border-b-0 lg:border-r">
          <SlotHead
            en="RANKING"
            zh="排序"
            title={
              taskFocus === "intent" ? "意图证据强度排序" : "威胁优先级排序"
            }
          />
          {slots.ranking ? (
            <div className="min-w-0 max-w-full">
              <ChartCard chart={slots.ranking} compact hideChromeTitle />
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">暂无排序图</p>
          )}
        </div>

        <div className="min-w-0 border-b border-[var(--line)] p-3 sm:border-r lg:border-b-0">
          <SlotHead en="EVIDENCE" zh="判断依据" title="为什么重要" />
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

        <div className="min-w-0 p-3">
          <SlotHead
            en="PHASE"
            zh="阶段"
            title="战役节拍（集结→终局）"
          />
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
        </div>
      </div>

      {reasonSide ? (
        <div className="border-t border-[var(--line)] px-3 py-2.5">
          <VmmpReasoningTrace
            reasoningThreat={threatReason}
            reasoningIntent={intentReason}
            side={reasonSide}
            observerLabel="美方"
          />
          {richCharts ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-[var(--muted)]">扩展图种：</span>
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
