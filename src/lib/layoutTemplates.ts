/**
 * 布局模板库：只规定地图 / 右栏 / 图带的空间关系。
 * 不决定图种（vmmpChartSelect）、不生成高亮轴圈（fillSlots）。
 *
 * map_dominant：三区固定总览
 * space_first：全屏地图 + 浮动抽屉
 * chart_dominant：证据优先（问句卡并读，地图辅助）
 */
import type { TaskFocus } from "./types";

export const LAYOUT_TEMPLATE_IDS = [
  "space_first",
  "map_dominant",
  "map_balanced",
  "chart_dominant",
] as const;

export type LayoutTemplateId = (typeof LAYOUT_TEMPLATE_IDS)[number];

/** 第二阶段再实现：地图+关系图并列；地图+时间轴。 */
export const FUTURE_LAYOUT_IDS = [
  "relation_direction",
  "time_evolution",
] as const;

export type FutureLayoutId = (typeof FUTURE_LAYOUT_IDS)[number];

export type ChartBand = "bottom" | "sidebar-bottom" | "overlay";
export type ChartFlow = "row" | "wrap";
export type LayoutChrome = "split" | "overlay" | "evidence";

export interface LayoutTemplate {
  id: LayoutTemplateId;
  letter: "A" | "B" | "C";
  labelZh: string;
  shortLabel: string;
  hint: string;
  chrome: LayoutChrome;
  /** 外层：标题 / 主区 / 底区 */
  shellRows: string;
  /** 主区：地图 | 右栏（及并重时的图带） */
  mapRailCols: string;
  chartBand: ChartBand;
  chartFlow: ChartFlow;
  wrapCols: number;
  footer: "none" | "narrative";
}

export const LAYOUT_TEMPLATES: Record<LayoutTemplateId, LayoutTemplate> = {
  space_first: {
    id: "space_first",
    letter: "A",
    labelZh: "空间优先",
    shortLabel: "空间",
    hint: "全屏地图为画布，分析与证据按需抽屉",
    chrome: "overlay",
    shellRows: "grid-rows-[minmax(0,1fr)]",
    mapRailCols: "grid-cols-[minmax(0,1fr)]",
    chartBand: "overlay",
    chartFlow: "row",
    wrapCols: 5,
    footer: "none",
  },
  map_dominant: {
    id: "map_dominant",
    letter: "B",
    labelZh: "信息总览",
    shortLabel: "总览",
    hint: "地图、语义分析、证据卡同时固定展示",
    chrome: "split",
    shellRows: "grid-rows-[auto_minmax(0,1fr)_minmax(168px,28%)]",
    mapRailCols: "grid-cols-[minmax(0,1fr)_minmax(168px,210px)]",
    chartBand: "bottom",
    chartFlow: "row",
    wrapCols: 5,
    footer: "none",
  },
  map_balanced: {
    id: "map_balanced",
    letter: "B",
    labelZh: "地图与分析并重",
    shortLabel: "B 并重",
    hint: "左地图，右栏+图卡竖叠，底栏结论",
    chrome: "split",
    shellRows: "grid-rows-[auto_minmax(0,1fr)_minmax(52px,11%)]",
    mapRailCols: "grid-cols-[minmax(0,1.15fr)_minmax(260px,38%)]",
    chartBand: "sidebar-bottom",
    chartFlow: "wrap",
    wrapCols: 2,
    footer: "narrative",
  },
  chart_dominant: {
    id: "chart_dominant",
    letter: "C",
    labelZh: "证据优先",
    shortLabel: "证据",
    hint: "图表铺满主画布，地图按需从侧栏打开",
    chrome: "evidence",
    shellRows: "grid-rows-[auto_auto_minmax(0,1fr)]",
    mapRailCols: "grid-cols-[minmax(0,1fr)]",
    chartBand: "overlay",
    chartFlow: "wrap",
    wrapCols: 2,
    footer: "none",
  },
};

export function isLayoutTemplateId(value: unknown): value is LayoutTemplateId {
  return (
    typeof value === "string" &&
    (LAYOUT_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

/** 默认：三区固定总览（原来的壳）。空间优先需在顶栏切换。 */
export function defaultLayoutId(_taskFocus: TaskFocus): LayoutTemplateId {
  return "map_dominant";
}

/** 顶栏三种工作模式：总览 / 空间 / 证据。 */
export const SWITCHABLE_LAYOUTS: LayoutTemplateId[] = [
  "map_dominant",
  "space_first",
  "chart_dominant",
];

/** 顶栏三种工作模式才允许被推荐 / 手选。 */
export function isSwitchableLayout(value: unknown): value is LayoutTemplateId {
  return (
    typeof value === "string" &&
    (SWITCHABLE_LAYOUTS as readonly string[]).includes(value)
  );
}

/** 证据优先：1 张单列，2～4 张双列，5 张起三列，缩小单卡以便同屏看全。 */
export function evidenceGridCols(count: number): 1 | 2 | 3 {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}

/**
 * 非法 / 预留 D·E → 任务默认。不做连续宽高，只认白名单 id。
 */
export function resolveLayoutId(
  raw: unknown,
  taskFocus: TaskFocus,
): LayoutTemplateId {
  if (isLayoutTemplateId(raw)) return raw;
  return defaultLayoutId(taskFocus);
}

export function layoutTemplate(
  id: LayoutTemplateId | string | undefined,
  taskFocus: TaskFocus,
): LayoutTemplate {
  return LAYOUT_TEMPLATES[resolveLayoutId(id, taskFocus)];
}
