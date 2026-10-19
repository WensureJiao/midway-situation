/** 活动圈四档分色，与威胁等级色一致：紧急 / 高 / 中 / 低。 */

export type ZoneLevelVisual = {
  key: "紧急" | "高" | "中" | "低";
  /** 图例与悬停用的区名 */
  label: string;
  color: string;
  fill: string;
  fillOpacity: number;
  weight: number;
  /** Leaflet dashArray */
  dashArray: string;
  /** 图例小圆边框样式 */
  legendBorderStyle: "solid" | "dashed" | "dotted";
};

const ZONE_LEVELS: ZoneLevelVisual[] = [
  {
    key: "紧急",
    label: "紧急区",
    color: "#9f1239",
    fill: "#e11d48",
    fillOpacity: 0.14,
    weight: 2.4,
    dashArray: "8 5",
    legendBorderStyle: "dashed",
  },
  {
    key: "高",
    label: "高",
    // 高饱和橙，一眼偏「橙」
    color: "#ea580c",
    fill: "#fb923c",
    fillOpacity: 0.14,
    weight: 2.1,
    dashArray: "12 6",
    legendBorderStyle: "dashed",
  },
  {
    key: "中",
    label: "中",
    // 黄绿：介于橙「高」与草绿「低」之间
    color: "#65a30d",
    fill: "#bef264",
    fillOpacity: 0.13,
    weight: 1.7,
    dashArray: "10 7",
    legendBorderStyle: "dashed",
  },
  {
    key: "低",
    label: "低",
    // 草绿：比「中」更深、更偏绿
    color: "#15803d",
    fill: "#86efac",
    fillOpacity: 0.08,
    weight: 1.4,
    dashArray: "14 9",
    legendBorderStyle: "dashed",
  },
];

export function zoneLevelVisual(level: string): ZoneLevelVisual {
  if (/紧急/.test(level)) return ZONE_LEVELS[0];
  if (/高/.test(level)) return ZONE_LEVELS[1];
  if (/低/.test(level)) return ZONE_LEVELS[3];
  return ZONE_LEVELS[2];
}

/** 等级描边色（地图 / 徽章 / 图表共用） */
export function levelColor(level: string): string {
  return zoneLevelVisual(level).color;
}

export function zoneLevelLegend(): ZoneLevelVisual[] {
  return ZONE_LEVELS;
}
