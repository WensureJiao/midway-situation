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
import { chartTypeLabel } from "@/lib/chartTypes";
import {
  HUNT_RANGE_BANDS,
  concludeForceRose,
  concludeIntentAxes,
  huntRangeBand,
  intentAxesRoseRadarData,
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
        <span>· 相对中途岛八方位舰艇计数</span>
      </div>
      <p>读法：轮廓突起=该侧兵力所在扇区；两边同向鼓起=对峙/接触扇区。</p>
      <p className="font-medium text-[var(--ink)]">{conclusion}</p>
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
      {rows.length ? (
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
      ) : null}
      <p>
        {asRadar
          ? "读法：轮廓突起=该侧作战指向所在扇区；瓣越长=轴越远（nm）。"
          : "读法：横轴=方位°，纵轴=轴长 nm；点越靠上这条指向越长。"}
      </p>
      <p className="font-medium text-[var(--ink)]">{conclusion}</p>
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
    chartId !== "cmp-zone-footprint"
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
    chart.id === "cmp-intent-phase" ||
    chart.id === "cmp-intent-phase-line" ||
    chart.id === "cmp-intent-phase-area" ||
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

export function ChartCard({
  chart,
  compact = false,
  hideChromeTitle = false,
  showWhyType = false,
  fill = false,
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
}) {
  const series = chart.series ?? [];
  const data = series.map((s, i) => ({
    ...s,
    fill: seriesColor(chart, s.name, s.side, i, s.value, s.group),
  }));
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
    type === "multi_line" && multiLineKeys.length >= 2
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

  const lineValues =
    multiLineData != null
      ? multiLineData.flatMap((row) =>
          multiLineKeys.map((k) => Number(row[k]) || 0),
        )
      : data.map((s) => s.value);
  const yDomain = isPhaseChart
    ? ([1, 5] as [number, number])
    : lineYDomain(lineValues);

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col">
      {!hideChromeTitle ? (
        <div
          className={`flex min-w-0 items-start justify-between gap-2 ${compact ? "mb-1.5" : "mb-2"}`}
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
          <ForceRoseHelp series={series} />
        </div>
      ) : chart.id === "cmp-intent-axes" && !hideChromeTitle ? (
        <div className="mb-1.5">
          <AxisAimHelp series={series} asRadar={type === "radar"} />
        </div>
      ) : chart.id === "cmp-hunt-range" && !hideChromeTitle ? (
        <div className="mb-1.5 flex flex-col gap-0.5 text-[9px] leading-snug text-[var(--muted)]">
          {HUNT_RANGE_BANDS.map((b) => (
            <span key={b.id} className="inline-flex items-start gap-1.5">
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
      {/* 棕色框只包住绘图区，标题文字在框外；饼图留出图例空间，避免裁切 */}
      <div
        className={`min-h-0 w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] ${
          isPie && !(compact && hideChromeTitle)
            ? "overflow-visible"
            : "overflow-hidden"
        } ${compact ? "p-1.5" : "p-2"} ${fill ? "flex-1" : ""}`}
        style={fill ? { minHeight: chartHeight } : { height: chartHeight }}
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
                data={data}
                margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#5c584f" }}
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
                  width={isPhaseChart ? 40 : 32}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as {
                      name?: string;
                      value?: number;
                      detail?: string;
                    };
                    const n = Number(row.value);
                    const title = isPhaseChart
                      ? `${row.name ?? ""}：${n}（${PHASE_CODE_LABEL[n] ?? n}）`
                      : `${row.name ?? ""}：${row.value ?? ""}`;
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
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={stroke}
                  fill={`${stroke}33`}
                  strokeWidth={2}
                />
              </AreaChart>
            ) : multiLineData ? (
              <LineChart
                data={multiLineData}
                margin={{ top: 16, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
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
                    stroke={
                      k === "紧急"
                        ? levelScoreColor(4)
                        : k === "高"
                          ? levelScoreColor(3)
                          : k === "中"
                            ? levelScoreColor(2)
                            : k === "低"
                              ? levelScoreColor(1)
                              : k === "蓝看红" || k === "IJN"
                                ? IJN
                                : USN
                    }
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
                <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
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
                top: chart.id === "cmp-intent-axes" ? 16 : 8,
                right: compact ? 6 : 10,
                bottom:
                  chart.id === "cmp-force-landing" ||
                  chart.id === "cmp-air-profile" ||
                  chart.id === "cmp-evidence-focus" ||
                  chart.id === "cmp-zone-footprint"
                    ? compact
                      ? 14
                      : 18
                    : 8,
                left: compact ? 0 : 2,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
              <XAxis
                type="number"
                dataKey="x"
                name={
                  chart.id === "cmp-highlight-range" ||
                  chart.id === "cmp-intent-axes"
                    ? "方位 °"
                    : chart.id === "cmp-threat-evidence"
                      ? "充分度"
                      : chart.id === "cmp-force-landing" ||
                          chart.id === "cmp-air-profile" ||
                          chart.id === "cmp-evidence-focus" ||
                          chart.id === "cmp-zone-footprint"
                        ? "东向 nm"
                        : "X"
                }
                tick={{ fontSize: 9, fill: "#5c584f" }}
                allowDecimals
                domain={
                  chart.id === "cmp-highlight-range" ||
                  chart.id === "cmp-intent-axes"
                    ? ([0, 360] as [number, number])
                    : chart.id === "cmp-threat-evidence"
                      ? ([0, 4] as [number, number])
                      : undefined
                }
                label={
                  chart.id === "cmp-highlight-range" ||
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
                      : chart.id === "cmp-air-profile"
                        ? "高度 km"
                        : chart.id === "cmp-force-landing" ||
                            chart.id === "cmp-evidence-focus" ||
                            chart.id === "cmp-zone-footprint"
                          ? "北向 nm"
                          : "Y"
                }
                tick={{ fontSize: 9, fill: "#5c584f" }}
                width={
                  chart.id === "cmp-force-landing" ||
                  chart.id === "cmp-air-profile" ||
                  chart.id === "cmp-evidence-focus" ||
                  chart.id === "cmp-zone-footprint"
                    ? compact
                      ? 34
                      : 42
                    : 36
                }
                allowDecimals
                domain={
                  chart.id === "cmp-threat-evidence"
                    ? ([0.5, 4.5] as [number, number])
                    : undefined
                }
                ticks={
                  chart.id === "cmp-threat-evidence"
                    ? [1, 2, 3, 4]
                    : undefined
                }
                tickFormatter={
                  chart.id === "cmp-threat-evidence"
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
                    : chart.id === "cmp-force-landing" ||
                        chart.id === "cmp-air-profile" ||
                        chart.id === "cmp-evidence-focus"
                      ? [12, 36]
                      : [40, 120]
                }
              />
              {chart.id === "cmp-force-landing" ||
              chart.id === "cmp-air-profile" ||
              chart.id === "cmp-evidence-focus" ? (
                <>
                  <ReferenceLine x={0} stroke="#ca8a04" strokeDasharray="4 4" />
                  <ReferenceLine y={0} stroke="#ca8a04" strokeDasharray="4 4" />
                </>
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
                              : chart.id === "cmp-threat-evidence"
                                ? ` · 充分度 ${row.x}/4 · 等级 ${row.y}`
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
                      : chart.id === "cmp-force-landing" ||
                          chart.id === "cmp-air-profile" ||
                          chart.id === "cmp-evidence-focus"
                        ? 1
                        : 3,
                  };
                })}
                fill={USN}
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
                      </g>
                    );
                  }
                  const r = Math.max(3, Math.sqrt(Number(payload?.z ?? 1) * 18));
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={fill ?? USN}
                      stroke="#fff"
                      strokeWidth={0.8}
                      strokeOpacity={0.7}
                    />
                  );
                }}
              >
                {scatterData.map((s, i) => (
                  <Cell key={`${s.name}-${i}`} fill={s.fill} />
                ))}
                {chart.id === "cmp-intent-axes" ? (
                  <LabelList
                    dataKey="name"
                    position="top"
                    offset={8}
                    style={{ fontSize: 9, fill: "#3d3a34" }}
                  />
                ) : null}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : isRadar ? (
          <ResponsiveContainer width="100%" height="100%">
            {chart.id === "cmp-force-bearing" ||
            chart.id === "cmp-intent-axes" ? (
              <RadarChart
                data={
                  chart.id === "cmp-intent-axes"
                    ? intentAxesRoseRadarData(series)
                    : Array.from(new Set(data.map((d) => d.name))).map(
                        (name) => {
                          const us = data.find(
                            (d) => d.name === name && d.side === "USN",
                          );
                          const ij = data.find(
                            (d) => d.name === name && d.side === "IJN",
                          );
                          return {
                            name,
                            美方: Number(us?.value) || 0,
                            日方: Number(ij?.value) || 0,
                            detail: [us?.detail, ij?.detail]
                              .filter(Boolean)
                              .join("\n\n"),
                          };
                        },
                      )
                }
                margin={{
                  top: compact ? 8 : 12,
                  right: compact ? 16 : 28,
                  bottom: compact ? 16 : 20,
                  left: compact ? 16 : 28,
                }}
                outerRadius={compact ? "72%" : "78%"}
              >
                <PolarGrid stroke="#d6d3ce" />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{ fontSize: compact ? 9 : 10, fill: "#5c584f" }}
                />
                <PolarRadiusAxis
                  tick={{ fontSize: 9, fill: "#5c584f" }}
                  allowDecimals={false}
                  unit={chart.id === "cmp-intent-axes" ? " nm" : undefined}
                />
                <Radar
                  name="美方"
                  dataKey="美方"
                  stroke={USN}
                  fill={`${USN}44`}
                  strokeWidth={1.5}
                />
                <Radar
                  name="日方"
                  dataKey="日方"
                  stroke={IJN}
                  fill={`${IJN}44`}
                  strokeWidth={1.5}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, color: "#5c584f" }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    chart.id === "cmp-intent-axes"
                      ? `${Math.round(Number(value) || 0)} nm`
                      : value,
                    name,
                  ]}
                />
              </RadarChart>
            ) : (
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
            )}
          </ResponsiveContainer>
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
                          background: `rgba(196,92,74,${alpha})`,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : isSankey ? (
          <SankeyFlow links={data} compact={compact} />
        ) : isGroupedBar && groupedData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={groupedData}
              margin={{ top: 12, right: 8, left: 0, bottom: 28 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
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
              <Tooltip />
              <Legend
                wrapperStyle={{ fontSize: 10 }}
                iconSize={8}
              />
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
                        chart.id === "cmp-zone-radius"
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
              <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
              {isHBar ? (
                <>
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "#5c584f" }}
                    domain={
                      chart.id === "cmp-force-range" ||
                      chart.id === "cmp-zone-radius"
                        ? [0, "auto"]
                        : undefined
                    }
                    unit={
                      chart.id === "cmp-hunt-range" ||
                      chart.id === "cmp-force-range" ||
                      chart.id === "cmp-zone-radius"
                        ? " nm"
                        : undefined
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={
                      chart.id === "cmp-hunt-range" ||
                      chart.id === "cmp-highlight-range" ||
                      chart.id === "cmp-threat-rank" ||
                      chart.id === "cmp-force-range"
                        ? compact
                          ? 108
                          : 128
                        : compact
                          ? 72
                          : 88
                    }
                    tick={{ fontSize: compact ? 9 : 10, fill: "#5c584f" }}
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
                        label={{
                          value: "50 nm",
                          position: "insideTopLeft",
                          fontSize: 9,
                          fill: "#c45c4a",
                        }}
                      />
                      <ReferenceLine
                        x={120}
                        stroke="#64748b"
                        strokeDasharray="4 3"
                        strokeOpacity={0.55}
                        label={{
                          value: "120 nm",
                          position: "insideTopLeft",
                          fontSize: 9,
                          fill: "#64748b",
                        }}
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
                label={
                  chart.id === "cmp-hunt-range"
                    ? {
                        position: "right",
                        fontSize: 10,
                        fill: "#3d3a34",
                        formatter: (v: number) => {
                          const band = huntRangeBand(Number(v) || 0);
                          return `${Math.round(Number(v) || 0)}·${band.shortLabel}`;
                        },
                      }
                    : chart.id === "cmp-force-range" ||
                        chart.id === "cmp-zone-radius"
                      ? {
                          position: "right",
                          fontSize: 10,
                          fill: "#3d3a34",
                          formatter: (v: number) =>
                            `${Math.round(Number(v) || 0)} nm`,
                        }
                      : {
                          position: isHBar ? "right" : "top",
                          fontSize: 11,
                          fill: "#3d3a34",
                        }
                }
              >
                {data.map((s, i) => (
                  <Cell key={`${s.name}-${i}`} fill={s.fill} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
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
