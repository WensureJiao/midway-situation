import type { ChartSpec, ChartType } from "./types";

type CatalogEntry = {
  type: ChartType;
  label: string;
  use: string;
};

/**
 * 可渲染图种目录（实现层能力，非 VMMP JSON 原文）。
 * 对比页实际选图由 vmmpChartSelect 按 M/T 拓扑筛选。
 */
export const CHART_TYPE_CATALOG: readonly CatalogEntry[] = [
  {
    type: "bar",
    label: "柱状图",
    use: "威胁等级计数；对齐/分组对比",
  },
  {
    type: "grouped_bar",
    label: "分组柱状",
    use: "多组并列计数",
  },
  {
    type: "hbar",
    label: "条形图",
    use: "排序 / 充分度 / 证据优先级（Ordering·Salience）",
  },
  {
    type: "line",
    label: "折线图",
    use: "连续过程 / 节拍编码（Continuity）",
  },
  {
    type: "multi_line",
    label: "多序列折线",
    use: "多序列走势对照",
  },
  {
    type: "area",
    label: "面积图",
    use: "过程量感（Continuity·Hierarchy）",
  },
  {
    type: "pie",
    label: "饼图",
    use: "构成占比（Grouping·Connection）",
  },
  {
    type: "scatter",
    label: "散点图",
    use: "空间位置或二维关系（Position·Uncertainty）",
  },
  {
    type: "radar",
    label: "雷达图",
    use: "多维轮廓 / 方位（Consistency·Alignment）",
  },
  {
    type: "heatmap",
    label: "热力图",
    use: "矩阵命中（Hierarchy）",
  },
] as const;

export type CatalogChartType = (typeof CHART_TYPE_CATALOG)[number]["type"];

export function chartTypeLabel(type: ChartSpec["type"]): string {
  return CHART_TYPE_CATALOG.find((c) => c.type === type)?.label ?? type;
}
