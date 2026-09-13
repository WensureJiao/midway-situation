"use client";

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
import type { ChartSpec } from "@/lib/types";

const USN = "#3b82a8";
const IJN = "#c45c4a";
const NEUTRAL = "#6b7280";

function colorFor(name: string, side?: string): string {
  if (side === "USN" || name.includes("美") || name === "USN") return USN;
  if (side === "IJN" || name.includes("日") || name === "IJN") return IJN;
  return NEUTRAL;
}

export function SituationCharts({ charts }: { charts: ChartSpec[] }) {
  if (!charts.length) {
    return (
      <div className="p-4 text-sm text-[var(--muted)]">暂无图表数据</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {charts.map((chart) => (
        <div
          key={chart.id}
          className="rounded-lg bg-[var(--panel)] p-3 ring-1 ring-[var(--line)]"
        >
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              {chart.title}
            </h3>
            {chart.description && (
              <p className="text-xs text-[var(--muted)]">{chart.description}</p>
            )}
          </div>
          <div className="h-44">
            {chart.type === "pie" ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chart.series}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={36}
                    outerRadius={64}
                    paddingAngle={2}
                  >
                    {chart.series.map((s, i) => (
                      <Cell key={i} fill={colorFor(s.name, s.side)} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d6d3ce" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#5c584f" }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#5c584f" }} width={28} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {chart.series.map((s, i) => (
                      <Cell key={i} fill={colorFor(s.name, s.side)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
