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
    // 浅橙：红橙谱上比「高」再淡一档
    color: "#f59e0b",
    fill: "#fcd34d",
    fillOpacity: 0.12,
    weight: 1.7,
    dashArray: "10 7",
    legendBorderStyle: "dashed",
  },
  {
    key: "低",
    label: "低",
    // 杏橙：同谱最淡，仍一眼属威胁色系
    color: "#d4a574",
    fill: "#f5e0c8",
    fillOpacity: 0.1,
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
