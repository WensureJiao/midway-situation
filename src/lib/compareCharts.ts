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
    const axisSides = axes.map((a) =>
      a.side === "IJN" ? "IJN" : a.side === "USN" ? "USN" : "其他",
    );

    return [
      {
        id: "cmp-intent-axes",
        type: "grouped_bar",
        title: "作战指向",
        series: [
          {
            name: "USN",
            value: axisSides.filter((s) => s === "USN").length,
            side: "USN",
          },
          {
            name: "IJN",
            value: axisSides.filter((s) => s === "IJN").length,
            side: "IJN",
          },
        ],
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
  const levels = ratings
    .map((r) => normalizeCompareLevel(String(r.level)))
    .filter((x): x is "紧急" | "高" | "中" | "低" => x != null);
  const perspectives = ratings
    .map((r) => perspectiveBucket(r.perspective ?? ""))
    .filter((x): x is "红方看蓝方" | "蓝方看红方" => x != null);

  const levelProfile = countByKey(["紧急", "高", "中", "低"], levels);
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
      series: levelProfile,
    },
    {
      id: "cmp-threat-perspectives",
      type: "grouped_bar",
      title: "视角目标数",
      series: countByKey(
        ["红看蓝", "蓝看红"],
        perspectives.map((p) => (p === "红方看蓝方" ? "红看蓝" : "蓝看红")),
      ),
    },
    {
      id: "cmp-threat-map-encoding",
      type: "pie",
      title: "地图编码",
      series: mapEncoding,
    },
  ];
}
