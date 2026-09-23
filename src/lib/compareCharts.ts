import type { ChartSpec, SituationViewSpec, TaskFocus } from "./types";
import { intentEvidenceItems } from "./vmmpCompare";

export { CHART_TYPE_CATALOG, chartTypeLabel } from "./chartTypes";

function normalizeCompareLevel(
  level: string,
): "紧急" | "高" | "中" | "低" | null {
  if (/紧急/.test(level)) return "紧急";
  if (/高/.test(level)) return "高";
  if (/中/.test(level)) return "中";
  if (/低/.test(level)) return "低";
  return null;
}

function perspectiveBucket(
  perspective: string,
): "红方看蓝方" | "蓝方看红方" | null {
  if (/红方看蓝方|美方看日方/.test(perspective)) return "红方看蓝方";
  if (/蓝方看红方|日方看美方/.test(perspective)) return "蓝方看红方";
  if (/红方看|美方看/.test(perspective)) return "红方看蓝方";
  if (/蓝方看|日方看/.test(perspective)) return "蓝方看红方";
  return null;
}

function countByKey(keys: string[], values: string[]): ChartSpec["series"] {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<
    string,
    number
  >;
  for (const v of values) {
    if (v in counts) counts[v] += 1;
  }
  return keys.map((name) => ({ name, value: counts[name] ?? 0 }));
}

/** 威胁等级分布：计数 + 悬停明细（目标 / 视角 / 证据） */
function threatLevelDistributionSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  const keys = ["紧急", "高", "中", "低"] as const;
  return keys.map((name) => {
    const items = (ratings ?? []).filter(
      (r) => normalizeCompareLevel(String(r.level)) === name,
    );
    const detail = items.length
      ? items
          .map((r, i) => {
            const bucket = perspectiveBucket(r.perspective ?? "");
            const view =
              bucket === "红方看蓝方"
                ? "红看蓝"
                : bucket === "蓝方看红方"
                  ? "蓝看红"
                  : (r.perspective || "视角未标");
            const ev = r.evidence?.trim();
            return `${i + 1}. [${view}] ${r.target}${ev ? ` — ${ev}` : ""}`;
          })
          .join("\n")
      : "暂无该等级目标";
    return { name, value: items.length, detail };
  });
}

/** 双视角威胁条目：计数 + 悬停明细 */
function threatPerspectiveSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  const keys = [
    {
      name: "红看蓝",
      match: (p: string) => perspectiveBucket(p) === "红方看蓝方",
    },
    {
      name: "蓝看红",
      match: (p: string) => perspectiveBucket(p) === "蓝方看红方",
    },
  ] as const;
  return keys.map(({ name, match }) => {
    const items = (ratings ?? []).filter((r) => match(r.perspective ?? ""));
    const detail = items.length
      ? items
          .map((r, i) => {
            const lv = normalizeCompareLevel(String(r.level)) ?? r.level;
            const ev = r.evidence?.trim();
            return `${i + 1}. [${lv}] ${r.target}${ev ? ` — ${ev}` : ""}`;
          })
          .join("\n")
      : "暂无该视角条目";
    return { name, value: items.length, detail };
  });
}

/** 证据构成：计数 + 悬停明细 */
function evidenceCompositionSeries(
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const items = intentEvidenceItems(spec).filter(
    (i) => i.kind !== "叙述" && i.kind !== "叙述依据",
  );
  const keys = ["方向", "关键实体", "活动区"] as const;
  return keys.map((name) => {
    const texts = items.filter((i) => i.kind === name).map((i) => i.text);
    return {
      name,
      value: texts.length,
      detail: texts.length
        ? texts.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "暂无此类证据",
    };
  });
}

/** 作战指向：按方计数 + 悬停列出轴线标签与起终点 */
function intentAxesSeries(
  axes: NonNullable<SituationViewSpec["map"]>["axes"],
): ChartSpec["series"] {
  const fmt = (p: [number, number]) => {
    const [lat, lon] = p;
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
  };
  const buckets = [
    {
      name: "美方",
      side: "USN" as const,
      match: (s?: string) => s === "USN",
    },
    {
      name: "日方",
      side: "IJN" as const,
      match: (s?: string) => s === "IJN",
    },
  ] as const;

  return buckets.map(({ name, side, match }) => {
    const items = (axes ?? []).filter((a) => match(a.side));
    const detail = items.length
      ? items
          .map((a, i) => {
            const route =
              a.from && a.to ? `\n   ${fmt(a.from)} → ${fmt(a.to)}` : "";
            return `${i + 1}. ${a.label || a.id || "未命名轴线"}${route}`;
          })
          .join("\n")
      : "暂无该方作战轴线";
    return { name, value: items.length, side, detail };
  });
}

/**
 * 对比页认知图槽：左右同构。
 * 威胁：等级柱、视角分组柱、地图编码饼图
 * 意图：指向分组柱、证据饼图（阶段用分段条）
 */
export function buildTaskCompareCharts(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
): ChartSpec[] {
  const map = spec.map ?? {
    highlight_names: [],
    axes: [],
    threat_zones: [],
  };
  const axes = map.axes ?? [];

  if (taskFocus === "intent") {
    return [
      {
        id: "cmp-intent-axes",
        type: "grouped_bar",
        title: "作战指向",
        description: "各方地图轴线条数；悬停可看轴线名称与起终点",
        series: intentAxesSeries(axes),
      },
      {
        id: "cmp-intent-evidence",
        type: "pie",
        title: "证据构成",
        series: evidenceCompositionSeries(spec),
      },
    ];
  }

  const ratings = spec.threat_ratings ?? [];

  const mapEncoding = [
    { name: "高亮", value: (map.highlight_names ?? []).length },
    { name: "轴线", value: axes.length },
    { name: "关注圈", value: (map.threat_zones ?? []).length },
  ];

  return [
    {
      id: "cmp-threat-levels",
      type: "bar",
      title: "威胁等级分布",
      series: threatLevelDistributionSeries(ratings),
    },
    {
      id: "cmp-threat-perspectives",
      type: "grouped_bar",
      title: "双视角威胁条目",
      description:
        "红看蓝＝美方列出的日方目标数；蓝看红＝日方列出的美方目标数（只计条数，不是威胁高低）",
      series: threatPerspectiveSeries(ratings),
    },
    {
      id: "cmp-threat-map-encoding",
      type: "pie",
      title: "地图编码",
      series: mapEncoding,
    },
  ];
}
