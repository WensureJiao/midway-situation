/** 活动圈四档分色，与威胁等级色一致：紧急 / 高 / 中 / 低。 */

export type ZoneLevelVisual = {
  key: "紧急" | "高" | "中" | "低";
  /** 图例与悬停用的区名 */
  label: string;
  color: string;
  fill: string;
  fillOpacity: number;
  weight: number;
};

const ZONE_LEVELS: ZoneLevelVisual[] = [
  {
    key: "紧急",
    label: "紧急区",
    color: "#9f1239",
    fill: "#e11d48",
    fillOpacity: 0.14,
    weight: 2.2,
  },
  {
    key: "高",
    label: "高",
    color: "#e07a3a",
    fill: "#f59e0b",
    fillOpacity: 0.1,
    weight: 1.9,
  },
  {
    key: "中",
    label: "中",
    color: "#d4a017",
    fill: "#eab308",
    fillOpacity: 0.08,
    weight: 1.6,
  },
  {
    key: "低",
    label: "低",
    color: "#5b8c5a",
    fill: "#86a886",
    fillOpacity: 0.07,
    weight: 1.4,
  },
];

export function zoneLevelVisual(level: string): ZoneLevelVisual {
  if (/紧急/.test(level)) return ZONE_LEVELS[0];
  if (/高/.test(level)) return ZONE_LEVELS[1];
  if (/低/.test(level)) return ZONE_LEVELS[3];
  return ZONE_LEVELS[2];
}

export function zoneLevelLegend(): ZoneLevelVisual[] {
  return ZONE_LEVELS;
}
