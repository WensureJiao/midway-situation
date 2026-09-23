"use client";

import type { ChartSpec, SituationViewSpec, TaskFocus } from "@/lib/types";
import {
  inferCampaignPhase,
  intentEvidenceItems,
} from "@/lib/vmmpCompare";
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartTypeLabel } from "@/lib/chartTypes";

const INTENT_PHASES = ["集结", "搜索", "接触"] as const;

const USN = "#c45c4a";
const IJN = "#3b82a8";

/** 威胁等级分 → 色（与威胁排序面板一致） */
const LEVEL_SCORE_COLORS: Record<number, string> = {
  4: "#9f1239", // 紧急 · 深红，与「高」拉开
  3: "#e07a3a", // 高 · 橙红
  2: "#d4a017", // 中 · 金
  1: "#5b8c5a", // 低 · 绿
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

/** 条长/点位用等级分时，用颜色区分档位 */
function isThreatLevelScoreChart(chart: ChartSpec): boolean {
  if (
    chart.id === "grammar-hbar" ||
    chart.id === "grammar-hbar-red" ||
    chart.id === "grammar-hbar-blue"
  ) {
    return true;
  }
  return /威胁排序|等级分/.test(
    `${chart.title ?? ""} ${chart.description ?? ""}`,
  );
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

function seriesColor(
  chart: ChartSpec,
  name: string,
  side: string | undefined,
  index: number,
  value?: number,
): string {
  if (
    isThreatLevelScoreChart(chart) &&
    typeof value === "number" &&
    value >= 1 &&
    value <= 4
  ) {
    return levelScoreColor(Math.round(value));
  }
  if (name === "紧急") return levelScoreColor(4);
  if (name === "高" || name === "高（发现链）") return levelScoreColor(3);
  if (name === "中" || name === "中至低") return levelScoreColor(2);
  if (name === "低") return levelScoreColor(1);
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
  if (side === "USN" || name === "USN" || /^美/.test(name) || /红方|红看/.test(name))
    return USN;
  if (side === "IJN" || name === "IJN" || /^日/.test(name) || /蓝方|蓝看/.test(name))
    return IJN;
  return TYPE_PALETTE[index % TYPE_PALETTE.length];
}

const PHASE_CODE_LABEL: Record<number, string> = {
  1: "集结",
  2: "搜索",
  3: "接触",
};

function isPhaseCodeChart(chart: ChartSpec): boolean {
  return (
    chart.id === "grammar-area" || /意图阶段/.test(chart.title ?? "")
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

function ChartCard({ chart }: { chart: ChartSpec }) {
  const series = chart.series ?? [];
  const data = series.map((s, i) => ({
    ...s,
    fill: seriesColor(chart, s.name, s.side, i, s.value),
  }));
  const showLevelLegend = isThreatLevelScoreChart(chart);
  const isPhaseChart = isPhaseCodeChart(chart);
  const showDetailTip =
    chart.id === "cmp-intent-evidence" ||
    chart.id === "grammar-evidence-pie" ||
    chart.id === "cmp-threat-levels" ||
    chart.id === "grammar-bar" ||
    chart.title.includes("证据") ||
    series.some((s) => Boolean(s.detail));
  const type = chart.type;
  const isHBar = type === "hbar";
  const isPie = type === "pie";
  const isLineLike = type === "line" || type === "multi_line" || type === "area";
  const chartHeight = isHBar ? Math.max(220, 36 + data.length * 28) : 200;
  const stroke = "#5b8c5a";

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
  const yDomain = isPhaseChart ? ([1, 3] as [number, number]) : lineYDomain(lineValues);

  return (
    <div className="flex h-full flex-col rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--ink)]">
            {chart.title}
          </h3>
          {chart.description ? (
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
              {chart.description}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 pt-0.5 text-[10px] text-[var(--muted)]">
          {chartTypeLabel(type)}
        </span>
      </div>
      {showLevelLegend ? (
        <div className="mb-2 flex h-4 flex-wrap gap-2 text-[10px] text-[var(--muted)]">
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
        <div className="mb-2 flex h-4 flex-wrap gap-3 text-[10px] text-[var(--muted)]">
          <span>1 = 集结</span>
          <span>2 = 搜索</span>
          <span>3 = 接触</span>
        </div>
      ) : null}
      <div className="min-h-0 overflow-hidden" style={{ height: chartHeight }}>
        {isPie ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={0}
                outerRadius={58}
                paddingAngle={2}
                label={({ value }) => `${value}`}
                labelLine={{ strokeWidth: 1 }}
              >
                {data.map((s, i) => (
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
                  const title = `${row.name ?? ""}：${row.value ?? 0}`;
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
              <Legend wrapperStyle={{ fontSize: 11 }} />
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
                  ticks={isPhaseChart ? [1, 2, 3] : undefined}
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
                  formatter={(value) => {
                    const n = Number(value);
                    if (isPhaseChart && PHASE_CODE_LABEL[n]) {
                      return [`${n}（${PHASE_CODE_LABEL[n]}）`, "阶段"];
                    }
                    return [String(value), "值"];
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
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout={isHBar ? "vertical" : "horizontal"}
              margin={
                isHBar
                  ? { top: 8, right: 24, left: 8, bottom: 8 }
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
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 10, fill: "#5c584f" }}
                  />
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
                label={{
                  position: isHBar ? "right" : "top",
                  fontSize: 11,
                  fill: "#3d3a34",
                }}
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
  紧急: "#9f1239",
  高: "#e07a3a",
  "高（发现链）": "#f0a060",
  中: "#d4a017",
  低: "#5b8c5a",
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

type PerspectiveKey = "红方" | "蓝方";

/** 红方=美（USN），蓝方=日（IJN）。「红方看…」即美方视角。 */
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
  const [perspective, setPerspective] = useState<PerspectiveKey>("红方");

  const filtered = useMemo(() => {
    return ratings.filter((r) => {
      const side = viewSideFromPerspective(r.perspective);
      // 界面：红方=美 USN，蓝方=日 IJN
      if (perspective === "红方") return side === "USN";
      if (perspective === "蓝方") return side === "IJN";
      return false;
    });
  }, [ratings, perspective]);

  const rows = useMemo(() => {
    return filtered
      .filter((r) => Boolean(r.target))
      .map((r, i) => ({
        id: `${r.target}-${i}`,
        target: r.target,
        level: r.level,
        score: levelScore(r.level),
        evidence: r.evidence,
        fill: threatColor(r.level),
      }))
      .sort(
        (a, b) =>
          b.score - a.score || a.target.localeCompare(b.target, "zh"),
      );
  }, [filtered]);

  const label =
    perspective === "红方"
      ? "威胁目标排序（红方/美视角）"
      : "威胁目标排序（蓝方/日视角）";

  return (
    <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)] sm:col-span-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">{label}</h3>
          <p className="text-xs text-[var(--muted)]">
            横轴为威胁强度（紧急&gt;高&gt;中&gt;低）；颜色表示等级
          </p>
        </div>
        <div className="flex overflow-hidden rounded-md text-[11px] ring-1 ring-[var(--line)]">
          {(["红方", "蓝方"] as PerspectiveKey[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`px-2.5 py-1 ${
                perspective === p
                  ? "bg-[var(--panel-3)] font-semibold"
                  : "bg-[var(--panel-2)]"
              }`}
              onClick={() => setPerspective(p)}
            >
              {p === "红方" ? "红方（美）" : "蓝方（日）"}
            </button>
          ))}
        </div>
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

function IntentFocusPanel({
  spec,
  packPhase,
}: {
  spec: SituationViewSpec;
  packPhase?: string;
}) {
  const phase = inferCampaignPhase(packPhase ?? "", spec);
  const axes = spec.map.axes ?? [];
  const evidence = intentEvidenceItems(spec);

  return (
    <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)] sm:col-span-2">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          意图研判焦点
        </h3>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
          战役阶段
        </div>
        <div className="flex overflow-hidden rounded-md text-xs ring-1 ring-[var(--line)]">
          {INTENT_PHASES.map((p) => {
            const active = p === phase;
            return (
              <div
                key={p}
                className={`flex-1 px-2 py-2 text-center ${
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
            {spec.phase_label || packPhase}
          </p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
            作战指向 / 轴线
          </div>
          {axes.length ? (
            <ul className="space-y-1.5 text-xs">
              {axes.map((ax) => (
                <li
                  key={ax.id || ax.label}
                  className="rounded-md bg-[var(--panel-2)] px-2 py-1.5"
                >
                  <span className="font-medium text-[var(--ink)]">
                    {ax.label}
                  </span>
                  {ax.side && (
                    <span className="ml-2 text-[10px] text-[var(--muted)]">
                      {ax.side}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md bg-[var(--panel-2)] px-2 py-3 text-xs text-[var(--muted)]">
              暂无轴线；请结合地图高亮与叙述判断方向
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium text-[var(--muted)]">
            证据 → 假设
          </div>
          {evidence.length ? (
            <ul className="max-h-[200px] space-y-1.5 overflow-auto text-xs">
              {evidence.map((item, i) => (
                <li
                  key={`${item.kind}-${i}`}
                  className="rounded-md bg-[var(--panel-2)] px-2 py-1.5"
                >
                  <span className="mr-1.5 text-[10px] font-semibold text-[var(--muted)]">
                    {item.kind}
                  </span>
                  <span className="text-[var(--ink)]">{item.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md bg-[var(--panel-2)] px-2 py-3 text-xs text-[var(--muted)]">
              暂无结构化证据
            </div>
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
  grammarHint = false,
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
  /** 对比页脚注：指向图种库 */
  grammarHint?: boolean;
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
      {grammarHint ? (
        <p className="sm:col-span-2 text-[10px] text-[var(--muted)]">
          图种说明见{" "}
          <a href="/charts" className="underline hover:text-[var(--ink)]">
            图种库
          </a>
        </p>
      ) : null}
    </div>
  );
}
