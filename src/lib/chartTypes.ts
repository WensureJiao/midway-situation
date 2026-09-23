import type { ChartSpec, ChartType } from "./types";

type CatalogEntry = {
  type: ChartType;
  label: string;
  use: string;
};

/** 统计图白名单（与主台 / 对比页 / 图种库实际出图一致） */
export const CHART_TYPE_CATALOG: readonly CatalogEntry[] = [
  {
    type: "bar",
    label: "柱状图",
    use: "威胁等级分布；水面舰/在空计数",
  },
  {
    type: "grouped_bar",
    label: "分组柱状",
    use: "两视角目标数；美/日作战轴线数",
  },
  {
    type: "hbar",
    label: "条形图",
    use: "红看蓝 / 蓝看红威胁排序",
  },
  {
    type: "line",
    label: "折线图",
    use: "跨切片在空总数、舰数走势",
  },
  {
    type: "multi_line",
    label: "多序列折线",
    use: "跨切片美/日在空对比",
  },
  {
    type: "area",
    label: "面积图",
    use: "跨切片意图阶段编码",
  },
  {
    type: "pie",
    label: "饼图",
    use: "证据构成、地图编码；红/蓝机型构成",
  },
] as const;

export type CatalogChartType = (typeof CHART_TYPE_CATALOG)[number]["type"];

export function chartTypeLabel(type: ChartSpec["type"]): string {
  return CHART_TYPE_CATALOG.find((c) => c.type === type)?.label ?? type;
}
