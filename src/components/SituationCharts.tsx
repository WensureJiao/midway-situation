"use client";

import type { ChartSpec, SituationViewSpec, TaskFocus } from "@/lib/types";
import {
  inferCampaignBeat,
  intentEvidenceItems,
  type CampaignBeat,
} from "@/lib/vmmpCompare";
import { expandBundledShipTarget } from "@/lib/splitShipTargets";
import { levelColor } from "@/lib/zoneLevel";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  LabelList,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { SankeyFlow } from "@/components/SankeyFlow";
import { WindRose, type RoseArrow, type RoseWedge } from "@/components/WindRose";
import { chartTypeLabel } from "@/lib/chartTypes";
import {
  HUNT_RANGE_BANDS,
  concludeForceRose,
  concludeIntentAxes,
  huntRangeBand,
} from "@/lib/compareCharts";

const INTENT_BEATS: CampaignBeat[] = [
  "集结",
  "搜索",
  "危机",
  "残局",
  "终局",
];

const USN = "#c45c4a";
const IJN = "#3b82a8";

/** 兵力方位玫瑰：读法 + 看图结论 */
function ForceRoseHelp({
  compact,
  series,
}: {
  compact?: boolean;
  series: ChartSpec["series"];
}) {
  const conclusion = concludeForceRose(series);
  return (
    <div
      className={`flex flex-col gap-0.5 leading-snug text-[var(--muted)] ${
        compact ? "text-[9px]" : "text-[10px]"
      }`}
    >
      <div className="flex flex-wrap gap-2.5">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: USN }}
          />
          <span className="font-medium text-[var(--ink)]">美方</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: IJN }}
          />
          <span className="font-medium text-[var(--ink)]">日方</span>
        </span>
      </div>
      {compact ? null : (
        <>
          <p>读法：轮廓突起=该侧兵力所在扇区；两边同向鼓起=对峙/接触扇区。</p>
          <p className="font-medium text-[var(--ink)]">{conclusion}</p>
        </>
      )}
    </div>
  );
}

/** 作战指向：读法 + 各轴海里 + 看图结论 */
function AxisAimHelp({
  compact,
  series,
  asRadar,
}: {
  compact?: boolean;
  series: ChartSpec["series"];
  asRadar?: boolean;
}) {
  const conclusion = concludeIntentAxes(series, asRadar);
  const rows = [...(series ?? [])].filter(
    (s) =>
      s.name &&
      !/（无/.test(s.name) &&
      (Number(s.value) || Number(s.y) || 0) > 0,
  );
  return (
    <div
      className={`flex flex-col gap-0.5 leading-snug text-[var(--muted)] ${
        compact ? "text-[9px]" : "text-[10px]"
      }`}
    >
      <div className="flex flex-wrap gap-2.5">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: USN }}
          />
          <span className="font-medium text-[var(--ink)]">美方轴</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: IJN }}
          />
          <span className="font-medium text-[var(--ink)]">日方轴</span>
        </span>
        <span>· 对照地图虚线</span>
      </div>
      {compact || !rows.length ? null : (
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
          {rows.map((s, i) => (
            <span key={`${s.name}-${i}`} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: s.side === "IJN" ? IJN : USN }}
              />
              <span className="text-[var(--ink)]">{s.name}</span>
              {Math.round(Number(s.value) || Number(s.y) || 0)} nm
              {s.x != null ? ` · ${Math.round(Number(s.x))}°` : ""}
            </span>
          ))}
        </div>
      )}
      {compact ? null : (
        <>
          <p>
            {asRadar
              ? "读法：轮廓突起=该侧作战指向所在扇区（十六方位）；瓣越长=轴越远（nm）。近角轴落在相邻瓣，不会并成一条。"
              : "读法：横轴=方位°，纵轴=轴长 nm；点越靠上这条指向越长。"}
          </p>
          <p className="font-medium text-[var(--ink)]">{conclusion}</p>
        </>
      )}
    </div>
  );
}

/** 威胁等级分 → 色（与 zoneLevel 一致） */
const LEVEL_SCORE_COLORS: Record<number, string> = {
  4: levelColor("紧急"),
  3: levelColor("高"),
  2: levelColor("中"),
  1: levelColor("低"),
};

const LEVEL_SCORE_LEGEND = [
  { score: 4, label: "紧急" },
  { score: 3, label: "高" },
  { score: 2, label: "中" },
  { score: 1, label: "低" },
] as const;

function levelScoreColor(score: number): string {
  return LEVEL_SCORE_COLORS[score] ?? "#9ca3af";
}

/** 条长表示等级分（1–4）的图，如威胁排序横条 */
function isThreatLevelScoreChart(chart: ChartSpec): boolean {
  if (
    chart.id === "grammar-hbar" ||
    chart.id === "grammar-hbar-red" ||
    chart.id === "grammar-hbar-blue" ||
    chart.id === "cmp-threat-rank"
  ) {
    return true;
  }
  return /威胁排序|等级分/.test(
    `${chart.title ?? ""} ${chart.description ?? ""}`,
  );
}

/** 横轴为紧急/高/中/低类目、纵轴为条数的分布柱 */
function isThreatLevelDistributionChart(chart: ChartSpec): boolean {
  return (
    chart.id === "cmp-threat-levels" ||
    chart.id === "grammar-bar" ||
    /威胁等级分布/.test(chart.title ?? "")
  );
}

function threatLevelNameColor(name: string): string | null {
  if (name === "紧急") return levelScoreColor(4);
  if (name === "高" || name === "高（发现链）") return levelScoreColor(3);
  if (name === "中" || name === "中至低") return levelScoreColor(2);
  if (name === "低") return levelScoreColor(1);
  return null;
}

const TYPE_PALETTE = [
  "#c45c4a",
  "#3b82a8",
  "#d4a017",
  "#5b8c5a",
  "#7c6bb0",
  "#c47a3a",
  "#2a9d8f",
  "#e76f51",
  "#457b9d",
  "#bc6c25",
  "#9b2226",
  "#0077b6",
  "#6a994e",
  "#9c6644",
  "#8338ec",
];

function isCompositionChart(chart: ChartSpec): boolean {
  if (chart.type === "pie") return true;
  return /机型|构成|就绪构成|舰载机|证据/.test(chart.title);
}

function isSideAggregateName(name: string): boolean {
  return (
    /^(USN|IJN|美|日)([·・]|$)/.test(name) || name === "USN" || name === "IJN"
  );
}

/** 仅落点类图把「中途岛」画成金锚；轴名里带「中途岛」不算岛 */
function isIslandAnchorPoint(
  chartId: string | undefined,
  s: { side?: string; group?: string; name?: string },
): boolean {
  if (
    chartId !== "cmp-force-landing" &&
    chartId !== "cmp-air-profile" &&
    chartId !== "cmp-evidence-focus" &&
    chartId !== "cmp-zone-footprint" &&
    chartId !== "cmp-force-range"
  ) {
    return false;
  }
  return (
    s.side === "both" ||
    s.group === "登陆海域" ||
    s.name === "中途岛" ||
    /登陆海域|^Midway$/i.test(String(s.name ?? ""))
  );
}

function seriesColor(
  chart: ChartSpec,
  name: string,
  side: string | undefined,
  index: number,
  value?: number,
  group?: string,
): string {
  // 类目名优先：分布柱的 value 是计数，不能当等级分
  const byName = threatLevelNameColor(name);
  if (byName) return byName;

  if (chart.id === "cmp-zone-radius") {
    const byLv = threatLevelNameColor(String(group ?? ""));
    if (byLv) return byLv;
  }

  if (chart.id === "cmp-hunt-range") {
    const byLabel = HUNT_RANGE_BANDS.find((b) => b.shortLabel === name);
    if (byLabel) return byLabel.color;
    if (typeof value === "number" && value > 8) {
      return huntRangeBand(value).color;
    }
  }

  if (
    isThreatLevelScoreChart(chart) &&
    typeof value === "number" &&
    value >= 1 &&
    value <= 4
  ) {
    return levelScoreColor(Math.round(value));
  }
  if (isCompositionChart(chart) && !isSideAggregateName(name)) {
    return TYPE_PALETTE[index % TYPE_PALETTE.length];
  }
  if (
    name === "美·就绪" ||
    (name.includes("就绪") &&
      !name.includes("未") &&
      isSideAggregateName(name))
  ) {
    return "#2a9d8f";
  }
  if (name.includes("未就绪")) return "#9ca3af";
  if (
    chart.id !== "cmp-intent-axes" &&
    (side === "both" ||
      name === "中途岛" ||
      /登陆海域|Midway/i.test(name))
  ) {
    // 金黄，与美方红、日方蓝明显区分；作战指向轴名可含「中途岛」，仍按敌我着色
    return "#ca8a04";
  }
  if (side === "USN" || name === "USN" || /^美/.test(name) || /红方|红看/.test(name))
    return USN;
  if (side === "IJN" || name === "IJN" || /^日/.test(name) || /蓝方|蓝看/.test(name))
    return IJN;
  return TYPE_PALETTE[index % TYPE_PALETTE.length];
}

const PHASE_CODE_LABEL: Record<number, string> = {
  1: "集结",
  2: "搜索",
  3: "危机",
  4: "残局",
  5: "终局",
};

function isPhaseCodeChart(chart: ChartSpec): boolean {
  return (
    chart.id === "grammar-area" ||
    /意图阶段|战役阶段|阶段编码|阶段过程/.test(chart.title ?? "")
  );
}

/** 折线/面积纵轴：数值几乎不变时收紧范围，避免贴顶看不出起伏 */
function lineYDomain(values: number[]): [number, number] {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return [0, 1];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const relative = span / Math.max(Math.abs(max), 1);
  if (span === 0 || relative < 0.25) {
    const pad = Math.max(2, Math.ceil(span * 0.8) || 2);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }
  return [0, Math.max(1, Math.ceil(max * 1.08))];
}

const CARD_QUESTION: Record<string, string> = {
  "cmp-threat-rank": "谁最急？",
  "cmp-force-landing": "敌我落在哪？",
  "cmp-force-range": "距岛多远？",
  "cmp-force-bearing": "方位如何分布？",
  "cmp-zone-radius": "圈有多大？",
  "cmp-zone-footprint": "圈心落在哪？",
  "cmp-intent-axes": "指向朝哪？",
  "cmp-hunt-range": "间隔多远？",
  "cmp-aim-link": "谁在对准谁？",
  "cmp-air-profile": "在空多高？",
  "cmp-alt-bands": "高度落在哪？",
  "cmp-highlight-range": "高亮离岛多远？",
  "cmp-heading": "航向对准轴了吗？",
  "cmp-urgent-near": "谁紧急又离岛近？",
  "cmp-threat-evidence": "依据足不足？",
};

export function chartQuestion(chart: ChartSpec): string {
  if (CARD_QUESTION[chart.id]) return CARD_QUESTION[chart.id];
  const t = chart.title.replace(/^问：/, "").trim();
  return t.length > 12 ? `${t.slice(0, 11)}…` : t;
}

function peakRow(
  series: ChartSpec["series"],
  pred?: (s: NonNullable<ChartSpec["series"]>[number]) => boolean,
) {
  const rows = (series ?? []).filter(
    (s) => (!pred || pred(s)) && Number(s.value || s.y) > 0,
  );
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) =>
      Number(b.value || b.y || 0) - Number(a.value || a.y || 0) ||
      a.name.localeCompare(b.name),
  )[0];
}

function shortName(name: string, max = 8): string {
  const n = name.replace(/（[^）]*）/g, "").replace(/^IJN\s+/i, "").replace(/^USS\s+/i, "").trim();
  return n.length > max ? `${n.slice(0, max)}…` : n;
}

function padDomain(values: number[], include = 0): [number, number] {
  const xs = values.filter((n) => Number.isFinite(n));
  xs.push(include);
  if (!xs.length) return [-1, 1];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const pad = Math.max(4, (max - min) * 0.12);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

const GEO_SCATTER_IDS = new Set([
  "cmp-force-landing",
  "cmp-zone-footprint",
  "cmp-air-profile",
  "cmp-evidence-focus",
]);

const RANGE_LOW_IDS = new Set([
  "cmp-force-range",
  "cmp-hunt-range",
  "cmp-highlight-range",
  "cmp-heading",
]);

const FORCE_ROSE_SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** AdaptiveVA 式一句 Finding：只说图上读出的结论 */
export function chartInsight(chart: ChartSpec): string {
  const s = chart.series ?? [];
  if (chart.id === "cmp-threat-rank") {
    const top = peakRow(s);
    if (!top) return "暂无排序";
    const tied = s.filter((r) => r.value === top.value);
    return tied.length > 1
      ? `${tied.slice(0, 3).map((r) => shortName(r.name, 6)).join("、")} 同档最高`
      : `${shortName(top.name)} 最高`;
  }
  if (chart.id === "cmp-force-bearing") {
    const us = peakRow(s, (r) => r.side === "USN");
    const ij = peakRow(s, (r) => r.side === "IJN");
    if (us && ij && us.name === ij.name) return `美日主峰同在 ${us.name}`;
    if (us && ij) return `美 ${us.name} · 日 ${ij.name}`;
    if (us) return `美方主在 ${us.name}`;
    if (ij) return `日方主在 ${ij.name}`;
    return "暂无方位取样";
  }
  if (chart.id === "cmp-intent-axes") {
    const us = peakRow(s, (r) => r.side === "USN");
    const ij = peakRow(s, (r) => r.side === "IJN");
    const fmt = (r: NonNullable<ReturnType<typeof peakRow>>) =>
      `${shortName(r.name, 12)} ${Math.round(Number(r.value || r.y || 0))}nm`;
    if (us && ij) return `美 ${fmt(us)} · 日 ${fmt(ij)}`;
    if (us) return `美方 ${fmt(us)}`;
    if (ij) return `日方 ${fmt(ij)}`;
    return "未画作战指向";
  }
  if (chart.id === "cmp-force-landing" || chart.id === "cmp-zone-footprint") {
    const us = s.filter((r) => r.side === "USN" && !/中途岛|island/i.test(r.name)).length;
    const ij = s.filter((r) => r.side === "IJN").length;
    return `美 ${us} · 日 ${ij} 个落点`;
  }
  if (chart.id === "cmp-force-range") {
    if (chart.type === "area" || chart.type === "multi_line") {
      const names = [...new Set(s.map((r) => r.name))];
      const last = names[names.length - 1];
      if (!last) return "暂无铺开";
      const us = s.find((r) => r.name === last && r.side !== "IJN");
      const ij = s.find((r) => r.name === last && r.side === "IJN");
      return `美 ${Number(us?.value || 0)} · 日 ${Number(ij?.value || 0)} 艘进入 ${last}`;
    }
    if (chart.type === "scatter") {
      const nearOf = (side: "USN" | "IJN") =>
        [...s]
          .filter(
            (r) =>
              r.side === side &&
              Number(r.value || r.x) > 0 &&
              !/中途岛|island/i.test(r.name),
          )
          .sort(
            (a, b) =>
              Number(a.value || a.x || 0) - Number(b.value || b.x || 0),
          )[0];
      const us = nearOf("USN");
      const ij = nearOf("IJN");
      const fmt = (r: NonNullable<typeof us>) =>
        `${shortName(r.name)} ${Math.round(Number(r.value || r.x))}nm`;
      if (us && ij) return `美近 ${fmt(us)} · 日近 ${fmt(ij)}`;
      if (us) return `美近 ${fmt(us)}`;
      if (ij) return `日近 ${fmt(ij)}`;
      return "暂无距离";
    }
    const near = [...s]
      .filter((r) => Number(r.value || r.y) > 0 && !/中途岛|island/i.test(r.name))
      .sort((a, b) => Number(a.value || a.y || 0) - Number(b.value || b.y || 0))[0];
    return near
      ? `${shortName(near.name)} 最近 ${Math.round(Number(near.value || near.y))}nm`
      : "暂无距离";
  }
  if (chart.id === "cmp-highlight-range") {
    const near = [...s]
      .filter((r) => Number(r.value || r.y) > 0 && !/中途岛|island/i.test(r.name))
      .sort((a, b) => Number(a.value || a.y || 0) - Number(b.value || b.y || 0))[0];
    return near
      ? `${shortName(near.name)} 最近 ${Math.round(Number(near.value || near.y))}nm`
      : "暂无距离";
  }
  if (chart.id === "cmp-zone-radius") {
    const top = peakRow(s);
    return top
      ? `${shortName(top.name)} 最大 ${Math.round(Number(top.value))}nm`
      : "暂无活动圈";
  }
  if (chart.id === "cmp-hunt-range") {
    const near = [...s]
      .filter((r) => Number(r.value) > 0)
      .sort((a, b) => Number(a.value) - Number(b.value))[0];
    return near
      ? `${shortName(near.name, 10)} ${Math.round(Number(near.value))}nm`
      : "暂无间隔";
  }
  if (chart.id === "cmp-aim-link") {
    const rows = [...s].filter(
      (r) => Number(r.value) > 0 && r.name && !/（无/.test(r.name),
    );
    const fmt = (r: (typeof rows)[number]) =>
      `${shortName(r.name, 6)}→${shortName(String(r.group ?? ""), 6)}`;
    const us = rows.filter((r) => r.side === "USN");
    const ij = rows.filter((r) => r.side === "IJN");
    if (us[0] && ij[0]) return `美 ${fmt(us[0])} · 日 ${fmt(ij[0])}`;
    if (us[0]) return `美方 ${fmt(us[0])}`;
    if (ij[0]) return `日方 ${fmt(ij[0])}`;
    return "未画对准关系";
  }
  if (chart.id === "cmp-heading") {
    if (chart.type === "hbar") {
      const near = [...s]
        .filter((r) => r.name && !/（无/.test(r.name))
        .sort((a, b) => Number(a.value) - Number(b.value))[0];
      if (!near) return "无航向与轴可对";
      const off = Math.round(Number(near.value) || 0);
      return off <= 22
        ? `${shortName(near.name, 10)} 对准（偏 ${off}°）`
        : `${shortName(near.name, 10)} 偏 ${off}°`;
    }
    const axes = s.filter((r) => r.group === "作战轴" && Number(r.x) >= 0);
    const fmt = (side: "USN" | "IJN") => {
      const ax = axes.find((r) => r.side === side);
      const peak = peakRow(
        s,
        (r) =>
          r.side === side &&
          r.group !== "作战轴" &&
          !/（无/.test(r.name),
      );
      if (!ax || !peak) return null;
      const deg: Record<string, number> = {
        N: 0,
        NE: 45,
        E: 90,
        SE: 135,
        S: 180,
        SW: 225,
        W: 270,
        NW: 315,
      };
      const hdg = deg[peak.name];
      if (hdg == null) return `${peak.name}`;
      let d = Math.abs(hdg - Number(ax.x));
      d = d > 180 ? 360 - d : d;
      const off = Math.round(d);
      const tag = side === "USN" ? "美" : "日";
      return off <= 22
        ? `${tag}对准 ${shortName(ax.name, 8)}`
        : `${tag}偏 ${off}°`;
    };
    const us = fmt("USN");
    const ij = fmt("IJN");
    if (us && ij) return `${us} · ${ij}`;
    if (us) return us;
    if (ij) return ij;
    return "无航向与轴可对";
  }
  if (chart.id === "cmp-urgent-near") {
    if (chart.type === "scatter") {
      const hit = [...s]
        .filter(
          (r) =>
            Number(r.y) >= 3 &&
            Number(r.x) > 0 &&
            !/（无/.test(r.name),
        )
        .sort(
          (a, b) =>
            Number(a.x) - Number(b.x) || Number(b.y) - Number(a.y),
        )[0];
      return hit
        ? `${shortName(hit.name)} ${Math.round(Number(hit.x))}nm / ${hit.group ?? "高"}`
        : "没有紧急且近的目标";
    }
    const top = peakRow(s);
    return top
      ? `${shortName(top.name)} 等级高且更近`
      : "暂无对照";
  }
  if (chart.id === "cmp-threat-evidence") {
    if (chart.type === "scatter") {
      const weak = [...s]
        .filter((r) => Number(r.y) >= 3 && Number(r.x) <= 1 && !/（无/.test(r.name))
        .sort((a, b) => Number(b.y) - Number(a.y))[0];
      const strong = [...s]
        .filter((r) => Number(r.y) >= 3 && Number(r.x) >= 3 && !/（无/.test(r.name))
        .sort((a, b) => Number(b.x) - Number(a.x))[0];
      if (weak) return `${shortName(weak.name)} 定级高但依据虚`;
      if (strong) return `${shortName(strong.name)} 有据`;
    }
    const top = peakRow(s);
    return top
      ? `${shortName(top.name)} 充分度 ${Math.round(Number(top.value))} /4`
      : "暂无证据条";
  }
  if (chart.id === "cmp-air-profile" || chart.id === "cmp-alt-bands") {
    const us = peakRow(s, (r) => r.side === "USN" || r.group === "美方");
    const ij = peakRow(s, (r) => r.side === "IJN" || r.group === "日方");
    if (chart.id === "cmp-air-profile") {
      const hi = [...s]
        .filter((r) => Number(r.y) > 0 && !/中途岛|island/i.test(r.name))
        .sort((a, b) => Number(b.y) - Number(a.y))[0];
      return hi
        ? `最高 ${shortName(hi.name)} ${Number(hi.y).toFixed(1)}km`
        : "暂无在空剖面";
    }
    if (us || ij) {
      return `主带 ${shortName((us ?? ij)!.name)}`;
    }
  }
  const top = peakRow(s);
  return top ? `${shortName(top.name)} 突出` : "";
}

export function ChartCard({
  chart,
  compact = false,
  hideChromeTitle = false,
  showWhyType = false,
  fill = false,
  plotOnly = false,
  onSelectName,
}: {
  chart: ChartSpec;
  /** 嵌入研判排版时用更矮的图 */
  compact?: boolean;
  /** 外层已有标题时隐藏卡片标题/选图说明，避免重复并减少溢出 */
  hideChromeTitle?: boolean;
  /** compact 时仍显示选图理由（范式选图对照） */
  showWhyType?: boolean;
  /** 绘图区随父级拉高，用于左右对照同高 */
  fill?: boolean;
  /** 只留绘图区，问句/结论由外层问句卡提供 */
  plotOnly?: boolean;
  /** 点条/点/扇区时回传系列名，供地图定位 */
  onSelectName?: (name: string) => void;
}) {
  const series = chart.series ?? [];
  const data = series.map((s, i) => ({
    ...s,
    fill: seriesColor(chart, s.name, s.side, i, s.value, s.group),
  }));
  const peakValue = Math.max(0, ...data.map((d) => Number(d.value) || 0));
  const emphasizeLow = RANGE_LOW_IDS.has(chart.id);
  const lowValue = Math.min(
    ...data.map((d) => Number(d.value) || 0).filter((v) => v > 0),
    Number.POSITIVE_INFINITY,
  );
  const isEmphasizedValue = (v: number) => {
    const n = Number(v) || 0;
    if (emphasizeLow) {
      return Number.isFinite(lowValue) && n > 0 && n <= lowValue * 1.02;
    }
    return peakValue > 0 && n >= peakValue * 0.98;
  };
  const forceWedges: RoseWedge[] | null =
    chart.type === "radar" &&
    (chart.id === "cmp-force-bearing" || chart.id === "cmp-heading")
      ? FORCE_ROSE_SECTORS.map((name) => ({
          name,
          us: Number(
            data.find((d) => d.name === name && d.side === "USN")?.value,
          ) || 0,
          ij: Number(
            data.find((d) => d.name === name && d.side === "IJN")?.value,
          ) || 0,
        }))
      : null;
  const intentArrows: RoseArrow[] | null =
    chart.type === "radar" &&
    (chart.id === "cmp-intent-axes" || chart.id === "cmp-heading")
      ? data
          .filter((s) => {
            if (!s.name || /（无/.test(s.name)) return false;
            if (chart.id === "cmp-heading") return s.group === "作战轴";
            return (Number(s.value) || Number(s.y) || 0) > 0;
          })
          .map((s) => ({
            name: s.name,
            bearingDeg: Number(s.x) || 0,
            nm: Number(s.value) || Number(s.y) || 0,
            side: s.side === "IJN" ? "IJN" : "USN",
          }))
      : null;
  const showLevelLegend =
    isThreatLevelScoreChart(chart) || isThreatLevelDistributionChart(chart);
  const isPhaseChart = isPhaseCodeChart(chart);
  const showDetailTip =
    chart.id === "cmp-intent-evidence" ||
    chart.id === "grammar-evidence-pie" ||
    chart.id === "cmp-threat-levels" ||
    chart.id === "grammar-bar" ||
    chart.id === "cmp-threat-map-encoding" ||
    chart.id === "grammar-map-encoding" ||
    chart.id === "cmp-intent-axes" ||
    chart.id === "grammar-axes" ||
    chart.title.includes("证据") ||
    series.some((s) => Boolean(s.detail));
  const type = chart.type;
  const isHBar = type === "hbar";
  const isGroupedBar = type === "grouped_bar";
  const isPie = type === "pie";
  const isScatter = type === "scatter";
  const isRangeStrip = isScatter && chart.id === "cmp-force-range";
  const isRadar = type === "radar";
  const isHeat = type === "heatmap";
  const isSankey = type === "sankey";
  const isLineLike = type === "line" || type === "multi_line" || type === "area";
  const groupedKeys = isGroupedBar
    ? Array.from(
        new Set(
          data
            .map((s) => s.group ?? s.side)
            .filter((k): k is string => Boolean(k)),
        ),
      )
    : [];
  const groupedData =
    isGroupedBar && groupedKeys.length >= 2
      ? Array.from(new Set(data.map((s) => s.name))).map((name) => {
          const row: Record<string, string | number> = { name };
          for (const k of groupedKeys) {
            row[k] =
              data.find((s) => s.name === name && (s.group ?? s.side) === k)
                ?.value ?? 0;
          }
          return row;
        })
      : null;
  const chartHeight = isHBar
    ? Math.max(compact ? 140 : 220, 28 + data.length * (compact ? 22 : 28))
    : isPie || isRadar || chart.id === "cmp-force-bearing"
      ? // 底栏证据饼图与左侧散点对齐；扩展行饼图/雷达仍用较高框
        compact
          ? hideChromeTitle && isPie
            ? 132
            : 240
          : 300
      : isHeat
        ? Math.max(compact ? 120 : 160, 28 + new Set(data.map((d) => d.group)).size * 22)
        : isSankey
          ? compact
            ? 160
            : 200
          : isGroupedBar
            ? compact
              ? 160
              : 200
            : compact
              ? 132
              : 200;
  const stroke = "#5b8c5a";
  const scatterData = data.map((s, i) => ({
    ...s,
    x: typeof s.x === "number" ? s.x : i + 1,
    y: typeof s.y === "number" ? s.y : s.value,
  }));
  const stripXMax = Math.max(
    40,
    ...scatterData.map((s) => Number(s.x) || 0),
  );
  const heatRows = Array.from(
    new Set(data.map((d) => String(d.group ?? "行"))),
  );
  const heatCols = Array.from(new Set(data.map((d) => String(d.name))));
  const heatMax = Math.max(1, ...data.map((d) => Number(d.value) || 0));

  const multiLineKeys = Array.from(
    new Set(
      data
        .map((s) => s.group ?? s.side)
        .filter((s): s is string => Boolean(s)),
    ),
  );
  const multiLineData =
    (type === "multi_line" || type === "area") && multiLineKeys.length >= 2
      ? (() => {
          const names = Array.from(new Set(data.map((s) => s.name)));
          return names.map((name) => {
            const row: Record<string, string | number> = { name };
            for (const k of multiLineKeys) {
              row[k] =
                data.find(
                  (s) => s.name === name && (s.group ?? s.side) === k,
                )?.value ?? 0;
            }
            return row;
          });
        })()
      : null;

  const seriesStroke = (k: string) =>
    k === "紧急"
      ? levelScoreColor(4)
      : k === "高"
        ? levelScoreColor(3)
        : k === "中"
          ? levelScoreColor(2)
          : k === "低"
            ? levelScoreColor(1)
            : k === "蓝看红" || k === "IJN" || k === "日方"
              ? IJN
              : USN;

  const lineValues =
    multiLineData != null
      ? multiLineData.flatMap((row) =>
          multiLineKeys.map((k) => Number(row[k]) || 0),
        )
      : data.map((s) => s.value);
  const yDomain = isPhaseChart
    ? ([1, 5] as [number, number])
    : lineYDomain(lineValues);

  const pickName = (raw: unknown) => {
    if (!onSelectName) return;
    const rec = raw as {
      name?: string;
      payload?: { name?: string };
    } | null;
    const name = rec?.name || rec?.payload?.name;
    if (name) onSelectName(String(name));
  };

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col">
      {!plotOnly ? (
        <>
      {!hideChromeTitle ? (
        <div
          className={`flex min-w-0 items-start justify-between gap-2 ${compact ? "mb-0.5" : "mb-2"}`}
        >
          <div className="min-w-0">
            <h3
              className={`truncate font-semibold text-[var(--ink)] ${
                compact ? "text-xs" : "text-sm"
              }`}
            >
              {chart.title.replace(/^问：/, "")}
            </h3>
            {!compact && chart.description ? (
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                {chart.description}
              </p>
            ) : null}
            {(!compact || showWhyType) && chart.why_type ? (
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                选图：{chart.why_type}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 pt-0.5 text-[10px] text-[var(--muted)]">
            {chartTypeLabel(type)}
          </span>
        </div>
      ) : (
        <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            {chart.id === "cmp-force-landing" ||
            chart.id === "cmp-air-profile" ||
            chart.id === "cmp-evidence-focus" ||
            chart.id === "cmp-zone-footprint" ? (
              <div className="flex h-4 flex-wrap gap-2.5 text-[10px] text-[var(--muted)]">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: USN }}
                  />
                  美方
                </span>
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: IJN }}
                  />
                  日方
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#ca8a04]" />
                  中途岛
                </span>
                {chart.id === "cmp-evidence-focus" ? (
                  <span className="text-[var(--muted)]">· 仅高亮/圈心</span>
                ) : null}
                {chart.id === "cmp-air-profile" ? (
                  <span className="text-[var(--muted)]">· 纵轴=高度 km</span>
                ) : null}
                {chart.id === "cmp-zone-footprint" ? (
                  <span className="text-[var(--muted)]">· 点大≈半径</span>
                ) : null}
              </div>
            ) : chart.id === "cmp-force-bearing" ? (
              <ForceRoseHelp compact series={series} />
            ) : chart.id === "cmp-intent-axes" ? (
              <AxisAimHelp
                compact
                series={series}
                asRadar={type === "radar"}
              />
            ) : chart.id === "cmp-hunt-range" ? (
              <div className="flex flex-col gap-0.5 text-[9px] leading-snug text-[var(--muted)]">
                {HUNT_RANGE_BANDS.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-start gap-1.5"
                  >
                    <span
                      className="mt-0.5 inline-block h-2 w-2.5 shrink-0 rounded-sm"
                      style={{ background: b.color }}
                    />
                    <span>
                      <span className="font-medium text-[var(--ink)]">
                        {b.shortLabel} {b.rangeLabel}
                      </span>
                      {" · "}
                      {b.meaning}
                    </span>
                  </span>
                ))}
              </div>
            ) : showLevelLegend ? (
              <div className="flex h-4 flex-wrap gap-2 text-[10px] text-[var(--muted)]">
                {LEVEL_SCORE_LEGEND.map((L) => (
                  <span key={L.score} className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2.5 rounded-sm"
                      style={{ background: levelScoreColor(L.score) }}
                    />
                    {L.label}
                  </span>
                ))}
              </div>
            ) : null}
            {showWhyType && chart.why_type ? (
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                选图：{chart.why_type}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 text-[10px] text-[var(--muted)]">
            {chartTypeLabel(type)}
          </span>
        </div>
      )}
      {chart.id === "cmp-force-bearing" && !hideChromeTitle ? (
        <div className="mb-1.5">
          <ForceRoseHelp compact={compact} series={series} />
        </div>
      ) : chart.id === "cmp-intent-axes" && !hideChromeTitle ? (
        <div className="mb-1.5">
          <AxisAimHelp
            compact={compact}
            series={series}
            asRadar={type === "radar"}
          />
        </div>
      ) : chart.id === "cmp-hunt-range" && !hideChromeTitle ? (
        <div
          className={`mb-1.5 flex gap-0.5 text-[9px] leading-snug text-[var(--muted)] ${
            compact ? "flex-wrap gap-2" : "flex-col"
          }`}
        >
          {HUNT_RANGE_BANDS.map((b) => (
            <span
              key={b.id}
              className={`inline-flex gap-1.5 ${
                compact ? "items-center" : "items-start"
              }`}
            >
              <span
                className={`${compact ? "" : "mt-0.5 "}inline-block h-2 w-2.5 shrink-0 rounded-sm`}
                style={{ background: b.color }}
              />
              {compact ? (
                <span className="font-medium text-[var(--ink)]">
                  {b.shortLabel}
                </span>
              ) : (
                <span>
                  <span className="font-medium text-[var(--ink)]">
                    {b.shortLabel} {b.rangeLabel}
                  </span>
                  {" · "}
                  {b.meaning}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : showLevelLegend && !hideChromeTitle ? (
        <div className="mb-1.5 flex h-4 flex-wrap gap-2 text-[10px] text-[var(--muted)]">
          {LEVEL_SCORE_LEGEND.map((L) => (
            <span key={L.score} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-2 w-2.5 rounded-sm"
                style={{ background: levelScoreColor(L.score) }}
              />
              {L.label}
            </span>
          ))}
        </div>
      ) : isPhaseChart ? (
        <div className="mb-1.5 flex h-4 flex-wrap gap-3 text-[10px] text-[var(--muted)]">
          <span>1 集结</span>
          <span>2 搜索</span>
          <span>3 危机</span>
          <span>4 残局</span>
          <span>5 终局</span>
        </div>
      ) : chart.id === "cmp-force-landing" && !hideChromeTitle ? (
        <div className="mb-1.5 flex h-4 flex-wrap gap-2.5 text-[10px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: USN }}
            />
            美方
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: IJN }}
            />
            日方
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-[#ca8a04]" />
            中途岛
          </span>
        </div>
      ) : null}
        </>
      ) : null}
      {/* 棕色框只包住绘图区，标题文字在框外；饼图留出图例空间，避免裁切 */}
      <div
        className={`min-h-0 w-full min-w-0 ${
          plotOnly ? "rounded-sm bg-transparent" : "rounded-lg border border-[var(--line)] bg-[var(--panel-2)]"
        } ${
          isPie && !(compact && hideChromeTitle)
            ? "overflow-visible"
            : "overflow-hidden"
        } ${compact ? "p-0.5" : "p-2"} ${fill ? "min-h-0 flex-1" : ""}`}
        style={fill ? { minHeight: 0, height: "100%" } : { height: chartHeight }}
      >
        {isPie ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart
              margin={
                compact && hideChromeTitle
                  ? { top: 2, right: 4, bottom: 2, left: 4 }
                  : { top: 8, right: 8, bottom: 8, left: 8 }
              }
            >
              <Pie
                data={
                  data.some((d) => Number(d.value) > 0)
                    ? data.filter((d) => Number(d.value) > 0)
                    : data
                }
                dataKey="value"
                nameKey="name"
                innerRadius={compact ? (hideChromeTitle ? "30%" : "32%") : "36%"}
                outerRadius={compact ? (hideChromeTitle ? "58%" : "62%") : "68%"}
                paddingAngle={3}
                cx="50%"
                cy={compact && hideChromeTitle ? "40%" : "46%"}
                label={({ value }) => (Number(value) > 0 ? String(value) : "")}
                labelLine={false}
                cursor={onSelectName ? "pointer" : undefined}
                onClick={pickName}
              >
                {(data.some((d) => Number(d.value) > 0)
                  ? data.filter((d) => Number(d.value) > 0)
                  : data
                ).map((s, i) => (
                  <Cell key={`${s.name}-${i}`} fill={s.fill} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as {
                    name?: string;
                    value?: number;
                    detail?: string;
                  };
                  const title = `${row.name ?? ""}: ${row.value ?? 0}`;
                  if (!showDetailTip || !row.detail) {
                    return (
                      <div className="rounded-md bg-[var(--panel)] px-2 py-1.5 text-xs shadow ring-1 ring-[var(--line)]">
                        {title}
                      </div>
                    );
                  }
                  return (
                    <div className="max-w-xs rounded-md bg-[var(--panel)] px-2.5 py-2 text-xs shadow-md ring-1 ring-[var(--line)]">
                      <div className="mb-1 font-semibold text-[var(--ink)]">
                        {title}
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed text-[var(--muted)]">
                        {row.detail}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="bottom"
                align="center"
                iconType="circle"
                iconSize={compact && hideChromeTitle ? 7 : 8}
                wrapperStyle={{
                  fontSize: compact && hideChromeTitle ? 10 : 11,
                  lineHeight: compact && hideChromeTitle ? "14px" : "16px",
                  paddingTop: 0,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : isLineLike ? (
          <ResponsiveContainer width="100%" height="100%">
            {type === "area" ? (
              <AreaChart
                data={multiLineData ?? data}
                margin={{
                  top: compact ? 4 : 16,
                  right: 8,
                  left: 0,
                  bottom: compact ? 0 : 8,
                }}
              >
                <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: compact ? 9 : 10, fill: "#5c584f" }}
                  interval={0}
                />
                <YAxis
                  domain={yDomain}
                  ticks={isPhaseChart ? [1, 2, 3, 4, 5] : undefined}
                  tickFormatter={
                    isPhaseChart
                      ? (v) => PHASE_CODE_LABEL[Number(v)] ?? String(v)
                      : undefined
                  }
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                  width={isPhaseChart ? 40 : 28}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as {
                      name?: string;
                      value?: number;
                      detail?: string;
                    };
                    const bits = payload
                      .map((p) => `${p.name ?? ""} ${p.value ?? ""}`)
                      .join(" · ");
                    const n = Number(row.value);
                    const title = isPhaseChart
                      ? `${row.name ?? ""}：${n}（${PHASE_CODE_LABEL[n] ?? n}）`
                      : `${row.name ?? ""}：${bits || row.value || ""}`;
                    return (
                      <div className="max-w-xs rounded-md bg-[var(--panel)] px-2.5 py-2 text-xs shadow-md ring-1 ring-[var(--line)]">
                        <div className="font-semibold text-[var(--ink)]">
                          {title}
                        </div>
                        {row.detail ? (
                          <div className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                            {row.detail}
                          </div>
                        ) : null}
                      </div>
                    );
                  }}
                />
                {multiLineData ? (
                  multiLineKeys.map((k) => {
                    const color = seriesStroke(k);
                    return (
                      <Area
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={k}
                        stroke={color}
                        fill={`${color}44`}
                        strokeWidth={2}
                      />
                    );
                  })
                ) : (
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={stroke}
                    fill={`${stroke}33`}
                    strokeWidth={2}
                  />
                )}
              </AreaChart>
            ) : multiLineData ? (
              <LineChart
                data={multiLineData}
                margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                  interval={0}
                />
                <YAxis
                  domain={yDomain}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                  width={32}
                />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {multiLineKeys.map((k) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={seriesStroke(k)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            ) : (
              <LineChart
                data={data}
                margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                  interval={0}
                />
                <YAxis
                  domain={yDomain}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                  width={32}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={stroke}
                  strokeWidth={2}
                  dot={{ r: 4, fill: stroke }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        ) : isScatter ? (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{
                top: chart.id === "cmp-intent-axes" ? 14 : 8,
                right:
                  chart.id === "cmp-intent-axes" ? 64 : compact ? 6 : 10,
                bottom:
                  chart.id === "cmp-force-landing" ||
                  chart.id === "cmp-air-profile" ||
                  chart.id === "cmp-evidence-focus" ||
                  chart.id === "cmp-zone-footprint"
                    ? compact
                      ? 14
                      : 18
                    : isRangeStrip
                      ? compact
                        ? 10
                        : 14
                    : 8,
                left: compact ? 0 : 2,
              }}
            >
              <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                  horizontal={!isRangeStrip}
                />
              <XAxis
                type="number"
                dataKey="x"
                name={
                  chart.id === "cmp-highlight-range" ||
                  chart.id === "cmp-intent-axes"
                    ? "方位 °"
                    : chart.id === "cmp-threat-evidence"
                      ? "充分度"
                      : chart.id === "cmp-urgent-near"
                        ? "距岛 nm"
                      : isRangeStrip
                        ? "距岛 nm"
                      : chart.id === "cmp-force-landing" ||
                          chart.id === "cmp-air-profile" ||
                          chart.id === "cmp-evidence-focus" ||
                          chart.id === "cmp-zone-footprint"
                        ? "东向 nm"
                        : "X"
                }
                tick={{ fontSize: compact ? 8 : 9, fill: "#5c584f" }}
                allowDecimals
                domain={
                  chart.id === "cmp-highlight-range" ||
                  chart.id === "cmp-intent-axes"
                    ? ([0, 360] as [number, number])
                    : chart.id === "cmp-threat-evidence"
                      ? ([0, 4] as [number, number])
                      : chart.id === "cmp-urgent-near"
                        ? ([0, Math.ceil(stripXMax * 1.08)] as [number, number])
                      : isRangeStrip
                        ? ([0, Math.ceil(stripXMax * 1.08)] as [number, number])
                      : GEO_SCATTER_IDS.has(chart.id)
                        ? padDomain(scatterData.map((s) => Number(s.x) || 0))
                        : undefined
                }
                label={
                  compact
                    ? undefined
                    : chart.id === "cmp-highlight-range" ||
                        chart.id === "cmp-intent-axes"
                      ? {
                          value: "方位 °",
                          position: "insideBottom",
                          offset: -4,
                          style: { fontSize: 9, fill: "#5c584f" },
                        }
                      : chart.id === "cmp-threat-evidence"
                        ? {
                            value: "充分度 →",
                            position: "insideBottom",
                            offset: -4,
                            style: { fontSize: 9, fill: "#5c584f" },
                          }
                        : chart.id === "cmp-force-landing" ||
                            chart.id === "cmp-air-profile" ||
                            chart.id === "cmp-evidence-focus" ||
                            chart.id === "cmp-zone-footprint"
                          ? {
                              value: "东 → (nm)",
                              position: "insideBottom",
                              offset: -4,
                              style: { fontSize: 9, fill: "#5c584f" },
                            }
                          : undefined
                }
              />
              <YAxis
                type="number"
                dataKey="y"
                name={
                  chart.id === "cmp-highlight-range"
                    ? "距岛 nm"
                    : chart.id === "cmp-intent-axes"
                      ? "长度 nm"
                    : chart.id === "cmp-threat-evidence"
                      ? "等级"
                      : isRangeStrip
                        ? ""
                      : chart.id === "cmp-air-profile"
                        ? "高度 km"
                        : chart.id === "cmp-force-landing" ||
                            chart.id === "cmp-evidence-focus" ||
                            chart.id === "cmp-zone-footprint"
                          ? "北向 nm"
                          : "Y"
                }
                tick={
                  isRangeStrip
                    ? false
                    : { fontSize: compact ? 8 : 9, fill: "#5c584f" }
                }
                axisLine={!isRangeStrip}
                tickLine={!isRangeStrip}
                width={
                  isRangeStrip
                    ? 8
                    : chart.id === "cmp-force-landing" ||
                        chart.id === "cmp-air-profile" ||
                        chart.id === "cmp-evidence-focus" ||
                        chart.id === "cmp-zone-footprint"
                    ? compact
                      ? 28
                      : 42
                    : 36
                }
                allowDecimals
                domain={
                  chart.id === "cmp-threat-evidence" ||
                  chart.id === "cmp-urgent-near"
                    ? ([0.5, 4.5] as [number, number])
                    : isRangeStrip
                      ? ([-1.2, 1.2] as [number, number])
                    : chart.id === "cmp-intent-axes"
                      ? ([
                          0,
                          Math.max(
                            80,
                            Math.ceil(
                              Math.max(
                                ...scatterData.map((s) => Number(s.y) || 0),
                                0,
                              ) / 20,
                            ) *
                              20 +
                              40,
                          ),
                        ] as [number, number])
                    : GEO_SCATTER_IDS.has(chart.id)
                      ? padDomain(scatterData.map((s) => Number(s.y) || 0))
                      : undefined
                }
                ticks={
                  chart.id === "cmp-threat-evidence" ||
                  chart.id === "cmp-urgent-near"
                    ? [1, 2, 3, 4]
                    : isRangeStrip
                      ? []
                    : undefined
                }
                tickFormatter={
                  chart.id === "cmp-threat-evidence" ||
                  chart.id === "cmp-urgent-near"
                    ? (v: number) =>
                        ({ 1: "低", 2: "中", 3: "高", 4: "紧急" }[
                          Math.round(v)
                        ] ?? String(v))
                    : undefined
                }
                label={
                  !compact && chart.id === "cmp-highlight-range"
                    ? {
                        value: "距岛 nm",
                        angle: -90,
                        position: "insideLeft",
                        style: { fontSize: 9, fill: "#5c584f" },
                      }
                    : !compact && chart.id === "cmp-intent-axes"
                      ? {
                          value: "长度 nm",
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 9, fill: "#5c584f" },
                        }
                    : !compact && chart.id === "cmp-threat-evidence"
                      ? {
                          value: "等级",
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 9, fill: "#5c584f" },
                        }
                      : !compact &&
                          (chart.id === "cmp-force-landing" ||
                            chart.id === "cmp-evidence-focus" ||
                            chart.id === "cmp-zone-footprint")
                        ? {
                            value: "北 →",
                            angle: -90,
                            position: "insideLeft",
                            style: { fontSize: 9, fill: "#5c584f" },
                          }
                        : !compact && chart.id === "cmp-air-profile"
                          ? {
                              value: "高度 km",
                              angle: -90,
                              position: "insideLeft",
                              style: { fontSize: 9, fill: "#5c584f" },
                            }
                          : undefined
                }
              />
              <ZAxis
                type="number"
                dataKey={
                  chart.id === "cmp-zone-footprint" ? "value" : "z"
                }
                range={
                  chart.id === "cmp-zone-footprint"
                    ? [16, 48]
                    : isRangeStrip
                      ? [10, 22]
                    : chart.id === "cmp-urgent-near"
                      ? [8, 14]
                    : chart.id === "cmp-force-landing" ||
                        chart.id === "cmp-air-profile" ||
                        chart.id === "cmp-evidence-focus"
                      ? [12, 36]
                      : [40, 120]
                }
              />
              {GEO_SCATTER_IDS.has(chart.id) ? (
                <>
                  <ReferenceLine x={0} stroke="#ca8a04" strokeDasharray="4 4" />
                  <ReferenceLine y={0} stroke="#ca8a04" strokeDasharray="4 4" />
                </>
              ) : isRangeStrip ? (
                <ReferenceLine y={0} stroke="#d6d3ce" strokeDasharray="3 3" />
              ) : chart.id === "cmp-urgent-near" ? (
                <ReferenceLine y={3} stroke="#ea580c" strokeDasharray="3 3" />
              ) : null}
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as {
                    name?: string;
                    x?: number;
                    y?: number;
                    detail?: string;
                  };
                  return (
                    <div className="max-w-xs rounded-md bg-[var(--panel)] px-2.5 py-2 text-xs shadow-md ring-1 ring-[var(--line)]">
                      <div className="font-semibold text-[var(--ink)]">
                        {row.name}
                        {chart.id === "cmp-force-landing"
                          ? ` · 东 ${row.x} / 北 ${row.y} nm`
                          : chart.id === "cmp-air-profile"
                            ? ` · 东 ${row.x} nm / 高 ${row.y} km`
                            : chart.id === "cmp-highlight-range"
                              ? ` · 方位 ${row.x}° / 距岛 ${row.y} nm`
                              : chart.id === "cmp-intent-axes"
                                ? ` · 方位 ${row.x}° / 长 ${row.y} nm`
                              : isRangeStrip
                                ? ` · 距岛 ${row.x} nm`
                              : chart.id === "cmp-threat-evidence"
                                ? ` · 充分度 ${row.x}/4 · 等级 ${row.y}`
                              : chart.id === "cmp-urgent-near"
                                ? ` · 距岛 ${row.x} nm · 等级 ${row.y}`
                                : `（${row.x}, ${row.y}）`}
                      </div>
                      {row.detail ? (
                        <div className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                          {row.detail}
                        </div>
                      ) : null}
                    </div>
                  );
                }}
              />
              <Scatter
                data={scatterData.map((s) => {
                  const isIslandAnchor = isIslandAnchorPoint(chart.id, s);
                  return {
                    ...s,
                    z: isIslandAnchor
                      ? chart.id === "cmp-air-profile"
                        ? 5
                        : 3.2
                      : isRangeStrip
                        ? 0.7
                      : chart.id === "cmp-urgent-near"
                        ? 0.28
                      : chart.id === "cmp-force-landing" ||
                          chart.id === "cmp-air-profile" ||
                          chart.id === "cmp-evidence-focus"
                        ? 1
                        : 3,
                  };
                })}
                fill={USN}
                cursor={onSelectName ? "pointer" : undefined}
                onClick={pickName}
                shape={(props) => {
                  const {
                    cx = 0,
                    cy = 0,
                    fill,
                    payload,
                  } = props as {
                    cx?: number;
                    cy?: number;
                    fill?: string;
                    payload?: {
                      side?: string;
                      group?: string;
                      name?: string;
                      z?: number;
                      value?: number;
                    };
                  };
                  const isIslandAnchor = isIslandAnchorPoint(
                    chart.id,
                    payload ?? {},
                  );
                  if (isIslandAnchor) {
                    const r = chart.id === "cmp-air-profile" ? 8 : 6;
                    return (
                      <g>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 2}
                          fill="none"
                          stroke="#ca8a04"
                          strokeWidth={1.5}
                          strokeOpacity={0.55}
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill="#ca8a04"
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                        <circle cx={cx} cy={cy} r={2} fill="#fff" />
                        <text
                          x={cx}
                          y={cy + r + 10}
                          textAnchor="middle"
                          fontSize={8}
                          fontWeight={700}
                          fill="#ca8a04"
                        >
                          岛
                        </text>
                      </g>
                    );
                  }
                  const r =
                    chart.id === "cmp-urgent-near"
                      ? compact
                        ? 3
                        : 3.5
                      : Math.max(3, Math.sqrt(Number(payload?.z ?? 1) * 18));
                  const nearest =
                    isRangeStrip &&
                    isEmphasizedValue(Number(payload?.value ?? 0));
                  return (
                    <g>
                      {nearest ? (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 3}
                          fill="none"
                          stroke={fill ?? USN}
                          strokeWidth={1.4}
                          strokeOpacity={0.55}
                        />
                      ) : null}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={fill ?? USN}
                        stroke="#fff"
                        strokeWidth={0.8}
                        strokeOpacity={0.7}
                      />
                    </g>
                  );
                }}
              >
                {scatterData.map((s, i) => (
                  <Cell key={`${s.name}-${i}`} fill={s.fill} />
                ))}
                {chart.id === "cmp-intent-axes" ? (
                  <LabelList
                    dataKey="name"
                    position="right"
                    offset={8}
                    content={({ x, y, width, height, value }) => {
                      const label = String(value ?? "");
                      if (!label || /（无/.test(label)) return null;
                      const px = Number(x) || 0;
                      const py = Number(y) || 0;
                      const w = Number(width) || 8;
                      const h = Number(height) || 8;
                      return (
                        <text
                          x={px + w / 2 + 8}
                          y={py + h / 2}
                          textAnchor="start"
                          dominantBaseline="middle"
                          fill="#3d3a34"
                          stroke="#f3f0ea"
                          strokeWidth={3}
                          paintOrder="stroke"
                          fontSize={8}
                          style={{ paintOrder: "stroke fill" }}
                        >
                          {label}
                        </text>
                      );
                    }}
                  />
                ) : chart.id === "cmp-urgent-near" ? (
                  <LabelList
                    dataKey="name"
                    position="top"
                    offset={4}
                    content={({ x, y, value, index }) => {
                      const idx = Number(index) || 0;
                      const row = scatterData[idx];
                      if (!row || Number(row.y) < 3) return null;
                      const yLvl = Math.round(Number(row.y));
                      const peers = scatterData.filter(
                        (s) =>
                          Number(s.y) >= 3 &&
                          Math.round(Number(s.y)) === yLvl,
                      );
                      const pos = scatterData
                        .map((s, i) => ({ s, i }))
                        .filter(
                          ({ s }) =>
                            Number(s.y) >= 3 &&
                            Math.round(Number(s.y)) === yLvl,
                        )
                        .findIndex(({ i }) => i === idx);
                      const below = peers.length > 1 && pos % 2 === 1;
                      const label = String(value ?? "")
                        .replace(/^(USS|IJN)\s+/i, "")
                        .slice(0, 6);
                      return (
                        <text
                          x={x}
                          y={Number(y) + (below ? 12 : -6)}
                          textAnchor="middle"
                          fill="#3d3a34"
                          fontSize={8}
                        >
                          {label}
                        </text>
                      );
                    }}
                  />
                ) : null}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : isRadar ? (
          forceWedges || intentArrows ? (
            <WindRose
              compact={compact}
              wedges={forceWedges ?? undefined}
              arrows={intentArrows ?? undefined}
              onSelectSector={onSelectName}
              onSelectArrow={onSelectName}
            />
          ) : (
          <ResponsiveContainer width="100%" height="100%">
              <RadarChart
                data={data}
                margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
              >
                <PolarGrid stroke="#d6d3ce" />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                />
                <PolarRadiusAxis
                  tick={{ fontSize: 9, fill: "#5c584f" }}
                  allowDecimals={false}
                />
                <Radar
                  dataKey="value"
                  stroke={USN}
                  fill={`${USN}55`}
                  strokeWidth={1.5}
                />
                <Tooltip />
              </RadarChart>
          </ResponsiveContainer>
          )
        ) : isHeat ? (
          <div className="flex h-full flex-col gap-1 overflow-auto px-0.5">
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `56px repeat(${Math.max(heatCols.length, 1)}, minmax(0,1fr))`,
              }}
            >
              <div />
              {heatCols.map((c) => (
                <div
                  key={c}
                  className="truncate text-center text-[9px] text-[var(--muted)]"
                >
                  {c}
                </div>
              ))}
              {heatRows.map((row) => (
                <div key={row} className="contents">
                  <div className="truncate pr-1 text-[9px] leading-5 text-[var(--muted)]">
                    {row}
                  </div>
                  {heatCols.map((col) => {
                    const cell = data.find(
                      (d) =>
                        String(d.group ?? "行") === row &&
                        String(d.name) === col,
                    );
                    const v = Number(cell?.value) || 0;
                    const alpha = v <= 0 ? 0.06 : 0.18 + (0.7 * v) / heatMax;
                    return (
                      <div
                        key={`${row}-${col}`}
                        title={
                          cell?.detail
                            ? `${row} · ${col}\n${cell.detail}`
                            : `${row} · ${col}：${v}`
                        }
                        className="h-5 rounded-sm ring-1 ring-black/5"
                        style={{
                          background: /日|IJN/i.test(row)
                            ? `rgba(59,130,168,${alpha})`
                            : `rgba(196,92,74,${alpha})`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : isSankey ? (
          <SankeyFlow
            links={data}
            compact={compact}
            onSelectName={onSelectName}
          />
        ) : isGroupedBar && groupedData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={groupedData}
              margin={{
                top: compact ? 4 : 12,
                right: 8,
                left: 0,
                bottom: compact ? 2 : 28,
              }}
            >
              <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                />
              <XAxis
                dataKey="name"
                tick={{ fontSize: compact ? 8 : 10, fill: "#5c584f" }}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: compact ? 8 : 10, fill: "#5c584f" }}
                width={compact ? 22 : 28}
              />
              <Tooltip />
              {compact ? null : (
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                iconSize={8}
              />
              )}
              {groupedKeys.map((k) => (
                <Bar
                  key={k}
                  dataKey={k}
                  fill={
                    k === "日方" || k === "IJN"
                      ? IJN
                      : k === "美方" || k === "USN"
                        ? USN
                        : stroke
                  }
                  radius={[3, 3, 0, 0]}
                  cursor={onSelectName ? "pointer" : undefined}
                  onClick={pickName}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout={isHBar ? "vertical" : "horizontal"}
              margin={
                isHBar
                  ? {
                      top: 8,
                      right:
                        chart.id === "cmp-force-range" ||
                        chart.id === "cmp-zone-radius" ||
                        chart.id === "cmp-highlight-range"
                          ? compact
                            ? 52
                            : 56
                          : compact
                            ? 28
                            : 24,
                      left:
                        chart.id === "cmp-hunt-range" ||
                        chart.id === "cmp-highlight-range" ||
                        chart.id === "cmp-force-range"
                          ? 8
                          : 4,
                      bottom: 8,
                    }
                  : { top: 16, right: 8, left: 0, bottom: 28 }
              }
            >
              <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                />
              {isHBar ? (
                <>
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#5c584f" }}
                    domain={
                      chart.id === "cmp-force-range" ||
                      chart.id === "cmp-zone-radius" ||
                      chart.id === "cmp-highlight-range"
                        ? [0, "auto"]
                        : undefined
                    }
                    unit={
                      chart.id === "cmp-hunt-range" ||
                      chart.id === "cmp-force-range" ||
                      chart.id === "cmp-zone-radius" ||
                      chart.id === "cmp-highlight-range"
                        ? " nm"
                        : undefined
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={compact ? 64 : 120}
                    tick={{ fontSize: compact ? 8 : 10, fill: "#5c584f" }}
                    tickFormatter={(v: string) => shortName(String(v), compact ? 7 : 12)}
                    interval={0}
                  />
                  {chart.id === "cmp-hunt-range" ||
                  chart.id === "cmp-force-range" ? (
                    <>
                      <ReferenceLine
                        x={50}
                        stroke="#c45c4a"
                        strokeDasharray="4 3"
                        strokeOpacity={0.55}
                        label={
                          compact
                            ? undefined
                            : {
                                value: "50 nm",
                                position: "insideTopLeft",
                                fontSize: 9,
                                fill: "#c45c4a",
                              }
                        }
                      />
                      <ReferenceLine
                        x={120}
                        stroke="#64748b"
                        strokeDasharray="4 3"
                        strokeOpacity={0.55}
                        label={
                          compact
                            ? undefined
                            : {
                                value: "120 nm",
                                position: "insideTopLeft",
                                fontSize: 9,
                                fill: "#64748b",
                              }
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#5c584f" }}
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#5c584f" }}
                    width={28}
                  />
                </>
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as {
                    name?: string;
                    value?: number;
                    detail?: string;
                  };
                  const title = `${row.name ?? ""}：${row.value ?? 0}`;
                  if (!showDetailTip || !row.detail) {
                    return (
                      <div className="rounded-md bg-[var(--panel)] px-2 py-1.5 text-xs shadow ring-1 ring-[var(--line)]">
                        {title}
                      </div>
                    );
                  }
                  return (
                    <div className="max-w-sm rounded-md bg-[var(--panel)] px-2.5 py-2 text-xs shadow-md ring-1 ring-[var(--line)]">
                      <div className="mb-1 font-semibold text-[var(--ink)]">
                        {title}
                      </div>
                      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[var(--muted)]">
                        {row.detail}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                radius={isHBar ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                cursor={onSelectName ? "pointer" : undefined}
                onClick={pickName}
                label={
                  chart.id === "cmp-hunt-range"
                    ? {
                        position: "right",
                        fontSize: compact ? 9 : 10,
                        fill: "#3d3a34",
                        formatter: (v: number) => {
                          if (compact && !isEmphasizedValue(v)) return "";
                          const band = huntRangeBand(Number(v) || 0);
                          return compact
                            ? `${Math.round(Number(v) || 0)}`
                            : `${Math.round(Number(v) || 0)}·${band.shortLabel}`;
                        },
                      }
                    : chart.id === "cmp-force-range" ||
                        chart.id === "cmp-zone-radius" ||
                        chart.id === "cmp-highlight-range"
                      ? {
                          position: "right",
                          fontSize: compact ? 9 : 10,
                          fill: "#3d3a34",
                          formatter: (v: number) =>
                            compact && !isEmphasizedValue(v)
                              ? ""
                              : `${Math.round(Number(v) || 0)} nm`,
                        }
                      : {
                          position: isHBar ? "right" : "top",
                          fontSize: compact ? 9 : 11,
                          fill: "#3d3a34",
                          formatter: (v: number) =>
                            compact && !isEmphasizedValue(v)
                              ? ""
                              : String(Math.round(Number(v) || 0)),
                        }
                }
              >
                {data.map((s, i) => (
                  <Cell
                    key={`${s.name}-${i}`}
                    fill={s.fill}
                    fillOpacity={
                      isEmphasizedValue(Number(s.value) || 0)
                        ? 1
                        : compact
                          ? 0.5
                          : 0.78
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const FIXED_IDS = [
  "ships",
  "airborne",
  "usn-embarked-class",
  "ijn-embarked-class",
] as const;

function isHiddenChart(chart: ChartSpec, hideFixed: boolean): boolean {
  if (hideFixed && (FIXED_IDS as readonly string[]).includes(chart.id)) {
    return true;
  }
  if (chart.id === "threat-priority") return true;
  return /优先级排序|威胁目标优先级|证据强度归一化|舰载机就绪总数/.test(
    chart.title ?? "",
  );
}

const THREAT_COLORS: Record<string, string> = {
  紧急: levelColor("紧急"),
  高: levelColor("高"),
  "高（发现链）": levelColor("高"),
  中: levelColor("中"),
  低: levelColor("低"),
  "无/不适用": "#9ca3af",
  无: "#9ca3af",
};

const LEVEL_SCORE: Record<string, number> = {
  紧急: 4,
  高: 3,
  "高（发现链）": 3,
  中: 2,
  低: 1,
  "无/不适用": 0,
  无: 0,
};

function threatColor(level: string): string {
  if (THREAT_COLORS[level]) return THREAT_COLORS[level];
  for (const [k, v] of Object.entries(THREAT_COLORS)) {
    if (level.includes(k)) return v;
  }
  return "#6b7280";
}

function levelScore(level: string): number {
  if (LEVEL_SCORE[level] != null) return LEVEL_SCORE[level];
  for (const [k, v] of Object.entries(LEVEL_SCORE)) {
    if (level.includes(k)) return v;
  }
  return 1;
}

/** 红方=美（USN）。固定美方观察视角，避免早期切片并排日方视角造成“上帝视角”。 */
function viewSideFromPerspective(p: string): "USN" | "IJN" | "其他" {
  if (/美方|USN/.test(p)) return "USN";
  if (/日方|IJN/.test(p)) return "IJN";
  if (/红方看/.test(p)) return "USN";
  if (/蓝方看/.test(p)) return "IJN";
  if (/蓝|美/.test(p) && !/红|日/.test(p)) return "USN";
  if (/红|日/.test(p) && !/蓝|美/.test(p)) return "IJN";
  return "其他";
}

function ThreatLevelChart({
  ratings,
}: {
  ratings: SituationViewSpec["threat_ratings"];
}) {
  const filtered = useMemo(() => {
    return ratings.filter(
      (r) => viewSideFromPerspective(r.perspective) === "USN",
    );
  }, [ratings]);

  const rows = useMemo(() => {
    return filtered
      .filter((r) => Boolean(r.target))
      .flatMap((r, i) =>
        expandBundledShipTarget(r.target).map((target, j) => ({
          id: `${target}-${i}-${j}`,
          target,
          level: r.level,
          score: levelScore(r.level),
          evidence: r.evidence,
          fill: threatColor(r.level),
        })),
      )
      .sort(
        (a, b) =>
          b.score - a.score || a.target.localeCompare(b.target, "zh"),
      );
  }, [filtered]);

  return (
    <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)] sm:col-span-2">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          威胁目标排序（美方视角）
        </h3>
        <p className="text-xs text-[var(--muted)]">
          固定观察者为美方，只列日方目标；早期切片日方未必已发现美航母，故不并排日方视角。
        </p>
      </div>

      <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-[var(--muted)]">
        {[
          ["紧急", THREAT_COLORS.紧急],
          ["高", THREAT_COLORS.高],
          ["中", THREAT_COLORS.中],
          ["低", THREAT_COLORS.低],
        ].map(([name, color]) => (
          <span key={name} className="inline-flex items-center gap-1">
            <i
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: color }}
            />
            {name}
          </span>
        ))}
      </div>

      {rows.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="h-[min(280px,40vh)]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={rows}
                margin={{ left: 8, right: 12, top: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray={compact ? "2 4" : "3 3"}
                  stroke="#d6d3ce"
                  strokeOpacity={compact ? 0.35 : 0.75}
                />
                <XAxis
                  type="number"
                  domain={[0, 4]}
                  ticks={[0, 1, 2, 3, 4]}
                  tickFormatter={(v) =>
                    (
                      {
                        0: "无",
                        1: "低",
                        2: "中",
                        3: "高",
                        4: "紧急",
                      } as Record<number, string>
                    )[v] ?? String(v)
                  }
                  tick={{ fontSize: 10, fill: "#5c584f" }}
                />
                <YAxis
                  type="category"
                  dataKey="target"
                  width={110}
                  tick={{ fontSize: 10, fill: "#3d3a34" }}
                />
                <Tooltip
                  formatter={(value, _n, item) => {
                    const row = item?.payload as {
                      level?: string;
                      evidence?: string;
                    };
                    return [
                      `${row?.level ?? value}${row?.evidence ? ` — ${row.evidence}` : ""}`,
                      "威胁",
                    ];
                  }}
                />
                <Bar dataKey="score" radius={[0, 3, 3, 0]} barSize={14}>
                  {rows.map((r) => (
                    <Cell key={r.id} fill={r.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-[280px] space-y-1.5 overflow-auto text-xs">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className="flex items-start gap-2 rounded-md bg-[var(--panel-2)] px-2 py-1.5"
              >
                <span className="w-4 shrink-0 font-semibold text-[var(--muted)]">
                  {i + 1}
                </span>
                <span
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: r.fill }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--ink)]">
                    {r.target}
                    <span
                      className="ml-2 text-[10px] font-semibold"
                      style={{ color: r.fill }}
                    >
                      {r.level}
                    </span>
                  </div>
                  {r.evidence && (
                    <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                      {r.evidence}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center text-xs text-[var(--muted)]">
          当前视角暂无威胁等级数据
        </div>
      )}
    </div>
  );
}

export function IntentFocusPanel({
  spec,
  packPhase,
  compact = false,
}: {
  spec: SituationViewSpec;
  packPhase?: string;
  /** 嵌入对比页右栏时收紧边距 */
  compact?: boolean;
}) {
  const beat = inferCampaignBeat(packPhase ?? "", spec);
  const axes = spec.map.axes ?? [];
  const evidence = intentEvidenceItems(spec);

  return (
    <div
      className={`rounded-lg bg-[var(--panel)] ring-1 ring-[var(--line)] ${
        compact ? "p-2" : "p-3 sm:col-span-2"
      }`}
    >
      <div className="mb-2">
        <h3
          className={`font-semibold text-[var(--ink)] ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          意图研判焦点
        </h3>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          战役阶段
        </div>
        <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
          {INTENT_BEATS.map((p) => {
            const active = p === beat;
            return (
              <div
                key={p}
                className={`flex-1 px-1.5 py-2 text-center sm:px-2 ${
                  active
                    ? "bg-[var(--panel-3)] font-semibold text-[var(--ink)]"
                    : "bg-[var(--panel-2)] text-[var(--muted)]"
                }`}
              >
                {p}
                {active ? " · 当前" : ""}
              </div>
            );
          })}
        </div>
        {(spec.phase_label || packPhase) && (
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            本片：{spec.phase_label || packPhase}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
            作战指向
          </div>
          {axes.length ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] text-[var(--muted)]">
                  <th className="pb-1 font-medium">标签</th>
                  <th className="pb-1 font-medium">所属</th>
                </tr>
              </thead>
              <tbody>
                {axes.map((ax) => (
                  <tr
                    key={ax.id || ax.label}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="py-1.5 pr-2 text-[var(--ink)]">{ax.label}</td>
                    <td className="py-1.5 text-[var(--muted)]">
                      {ax.side ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              暂无作战指向；请结合地图高亮与叙述判断方向
            </p>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
            证据摘要
          </div>
          {evidence.length ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] text-[var(--muted)]">
                  <th className="pb-1 font-medium">类型</th>
                  <th className="pb-1 font-medium">内容</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item, i) => (
                  <tr
                    key={`${item.kind}-${i}`}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="py-1.5 pr-2 align-top text-[var(--muted)]">
                      {item.kind}
                    </td>
                    <td className="py-1.5 text-[var(--ink)]">{item.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-[var(--muted)]">暂无结构化证据</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SituationCharts({
  charts = [],
  threatRatings = [],
  taskFocus = "threat",
  spec,
  packPhase,
  showFixedCharts = true,
  showFocusPanels = true,
}: {
  charts?: ChartSpec[];
  threatRatings?: SituationViewSpec["threat_ratings"];
  /** 威胁：威胁等级图；意图：阶段/方向/证据面板 */
  taskFocus?: TaskFocus;
  /** 意图面板需要 map / phase / narrative */
  spec?: SituationViewSpec;
  packPhase?: string;
  /** 主生成台展示四张兵力统计图；对比页关闭 */
  showFixedCharts?: boolean;
  /** 是否展示威胁排序 / 意图焦点面板 */
  showFocusPanels?: boolean;
}) {
  const list = (charts ?? []).filter((c) => !isHiddenChart(c, !showFixedCharts));

  const showThreat = showFocusPanels && taskFocus !== "intent";
  const showIntent =
    showFocusPanels && taskFocus === "intent" && Boolean(spec);
  const hasFocusPanel =
    (showThreat && (threatRatings?.length ?? 0) > 0) || showIntent;

  if (!list.length && !hasFocusPanel) {
    return (
      <div className="p-4 text-sm text-[var(--muted)]">暂无图表数据</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((chart) => (
        <div
          key={chart.id || chart.title}
          className={
            chart.type === "hbar" ? "sm:col-span-2" : "h-full min-h-0"
          }
        >
          <ChartCard chart={chart} />
        </div>
      ))}
      {showThreat ? (
        <ThreatLevelChart ratings={threatRatings ?? []} />
      ) : showIntent && spec ? (
        <IntentFocusPanel spec={spec} packPhase={packPhase} />
      ) : null}
    </div>
  );
}
