import type { ChartSpec, SituationViewSpec, TaskFocus } from "./types";
import { intentEvidenceItems } from "./vmmpCompare";

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

/**
 * 对比页任务固定图槽：结构固定，数值来自该侧 spec 的 ratings / map，
 * 便于 A/B 左右同构对比。
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
  const highlights = map.highlight_names ?? [];
  const axes = map.axes ?? [];
  const zones = map.threat_zones ?? [];

  if (taskFocus === "intent") {
    const axisSides = axes.map((a) =>
      a.side === "IJN" ? "IJN" : a.side === "USN" ? "USN" : "其他",
    );
    const zoneLevels = zones
      .map((z) => normalizeCompareLevel(String(z.level)))
      .filter((x): x is "紧急" | "高" | "中" | "低" => x != null);
    const evidenceKinds = intentEvidenceItems(spec).map((i) => i.kind);

    return [
      {
        id: "cmp-intent-axes",
        type: "bar",
        title: "作战指向（按方）",
        description: "由 map.axes 统计",
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
        id: "cmp-intent-zones",
        type: "bar",
        title: "关注区等级",
        description: "由 map.threat_zones 统计",
        series: countByKey(["紧急", "高", "中", "低"], zoneLevels),
      },
      {
        id: "cmp-intent-evidence",
        type: "pie",
        title: "证据片段构成",
        description: "由轴线/高亮/圈/叙述抽取",
        series: countByKey(
          ["方向", "关键实体", "活动区", "叙述依据"],
          evidenceKinds,
        ),
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

  return [
    {
      id: "cmp-threat-levels",
      type: "bar",
      title: "威胁等级分布",
      description: "由 threat_ratings 统计",
      series: countByKey(["紧急", "高", "中", "低"], levels),
    },
    {
      id: "cmp-threat-perspectives",
      type: "bar",
      title: "视角下目标数",
      description: "各视角列出的目标条数",
      series: countByKey(["红方看蓝方", "蓝方看红方"], perspectives),
    },
    {
      id: "cmp-map-encoding",
      type: "bar",
      title: "地图编码量",
      description: "高亮 / 轴线 / 圈",
      series: [
        { name: "高亮", value: highlights.length },
        { name: "轴线", value: axes.length },
        { name: "圈", value: zones.length },
      ],
    },
  ];
}
