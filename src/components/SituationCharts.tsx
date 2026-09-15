"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec, SituationViewSpec } from "@/lib/types";

const USN = "#3b82a8";
const IJN = "#c45c4a";

/** 足够长，保证「几个图例几个色」且相邻不重复 */
const TYPE_PALETTE = [
  "#3b82a8",
  "#c45c4a",
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

const THREAT_COLORS: Record<string, string> = {
  紧急: "#b45309",
  高: "#c45c4a",
  "高（发现链）": "#e07a6a",
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

function isCompositionChart(chart: ChartSpec): boolean {
  if (chart.type === "pie") return true;
  return /机型|构成|就绪构成|舰载机/.test(chart.title);
}

function isSideAggregateName(name: string): boolean {
  return /^(USN|IJN|美|日)([·・]|$)/.test(name) || name === "USN" || name === "IJN";
}

/** 每个系列一项一色；饼图/机型构成强制按序号取色，避免同 side 同色 */
function seriesColor(chart: ChartSpec, name: string, side: string | undefined, index: number): string {
  if (isCompositionChart(chart) && !isSideAggregateName(name)) {
    return TYPE_PALETTE[index % TYPE_PALETTE.length];
  }
  if (name === "美·就绪" || (name.includes("就绪") && !name.includes("未") && isSideAggregateName(name))) {
    return "#2a9d8f";
  }
  if (name.includes("未就绪")) return "#9ca3af";
  if (side === "USN" || name === "USN" || /^美/.test(name)) return USN;
  if (side === "IJN" || name === "IJN" || /^日/.test(name)) return IJN;
  return TYPE_PALETTE[index % TYPE_PALETTE.length];
}

function isThreatDistChart(chart: ChartSpec): boolean {
  return /威胁.*等级|等级.*分布|threat.*level/i.test(chart.title);
}

type PerspectiveKey = "蓝方" | "红方" | "全部";

function normalizePerspective(p: string): "蓝方" | "红方" | "其他" {
  if (/蓝方看|美方看|蓝方视角|USN/.test(p) && !/红方看|日方看/.test(p)) return "蓝方";
  if (/红方看|日方看|红方视角|IJN/.test(p) && !/蓝方看|美方看/.test(p)) return "红方";
  if (/蓝|美/.test(p) && !/红|日/.test(p)) return "蓝方";
  if (/红|日/.test(p) && !/蓝|美/.test(p)) return "红方";
  return "其他";
}

function ChartCard({ chart }: { chart: ChartSpec }) {
  const data = (chart.series ?? []).map((s, i) => ({
    ...s,
    fill: seriesColor(chart, s.name, s.side, i),
  }));

  return (
    <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{chart.title}</h3>
        {chart.description && (
          <p className="text-xs text-[var(--muted)]">{chart.description}</p>
        )}
      </div>
      <div className="h-52">
        {chart.type === "pie" ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={34}
                outerRadius={62}
                paddingAngle={2}
              >
                {data.map((s, i) => (
                  <Cell key={`${s.name}-${i}`} fill={s.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "#5c584f" }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={52}
              />
              <YAxis tick={{ fontSize: 10, fill: "#5c584f" }} width={28} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {data.map((s, i) => (
                  <Cell key={`${s.name}-${i}`} fill={s.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {/* 机型构成：图例色块再列一行，保证「几项几色」一目了然 */}
      {isCompositionChart(chart) && data.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--line)] pt-2">
          {data.map((s, i) => (
            <span
              key={`${s.name}-${i}`}
              className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink)]"
            >
              <i
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.fill }}
              />
              {s.name}
              <span className="text-[var(--muted)]">({s.value})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreatLevelChart({
  ratings,
}: {
  ratings: SituationViewSpec["threat_ratings"];
}) {
  const [perspective, setPerspective] = useState<PerspectiveKey>("蓝方");

  const filtered = useMemo(() => {
    if (perspective === "全部") return ratings;
    return ratings.filter((r) => {
      const n = normalizePerspective(r.perspective);
      if (perspective === "蓝方") return n === "蓝方";
      if (perspective === "红方") return n === "红方";
      return true;
    });
  }, [ratings, perspective]);

  /** 按目标列出等级分值，谁威胁高一目了然 */
  const rows = useMemo(() => {
    return filtered
      .filter((r) => Boolean(r.target))
      .map((r, i) => ({
        id: `${r.target}-${i}`,
        target: r.target,
        level: r.level,
        score: levelScore(r.level),
        evidence: r.evidence,
        perspective: r.perspective,
        fill: threatColor(r.level),
        label: `${r.target}`,
      }))
      .sort((a, b) => b.score - a.score || a.target.localeCompare(b.target, "zh"));
  }, [filtered]);

  const label =
    perspective === "蓝方"
      ? "威胁目标排序（蓝方视角）"
      : perspective === "红方"
        ? "威胁目标排序（红方视角）"
        : "威胁目标排序（全部）";

  return (
    <div className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)] sm:col-span-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">{label}</h3>
          <p className="text-xs text-[var(--muted)]">
            横轴为威胁强度（紧急&gt;高&gt;中&gt;低）；柱旁标注目标，颜色=等级
          </p>
        </div>
        <div className="flex overflow-hidden rounded-md text-[11px] ring-1 ring-[var(--line)]">
          {(["蓝方", "红方", "全部"] as PerspectiveKey[]).map((p) => (
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
              {p === "全部" ? "全部" : `${p}视角`}
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
                    ({ 0: "无", 1: "低", 2: "中", 3: "高", 4: "紧急" } as Record<
                      number,
                      string
                    >)[v] ?? String(v)
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

export function SituationCharts({
  charts = [],
  threatRatings = [],
}: {
  charts?: ChartSpec[];
  threatRatings?: SituationViewSpec["threat_ratings"];
}) {
  const regular = (charts ?? []).filter((c) => !isThreatDistChart(c));
  const showThreat =
    (threatRatings?.length ?? 0) > 0 || (charts ?? []).some(isThreatDistChart);

  if (!regular.length && !showThreat) {
    return (
      <div className="p-4 text-sm text-[var(--muted)]">暂无图表数据</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {regular.map((chart) => (
        <ChartCard key={chart.id || chart.title} chart={chart} />
      ))}
      {showThreat && (
        <ThreatLevelChart
          ratings={
            threatRatings.length
              ? threatRatings
              : charts
                  .filter(isThreatDistChart)
                  .flatMap((c) =>
                    c.series.map((s) => ({
                      perspective: /红|日/.test(c.title)
                        ? "红方看蓝方"
                        : "蓝方看红方",
                      target: s.name,
                      level: String(s.value),
                      evidence: "",
                    })),
                  )
          }
        />
      )}
    </div>
  );
}
