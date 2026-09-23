export type SideId = "USN" | "IJN";

export type ThreatLevel = "紧急" | "高" | "中" | "低" | "无/不适用";

export interface CompactUnit {
  name: string;
  unit_type: string;
  unit_class: string;
  status: string;
  side: SideId | string;
  group: string | null;
  latitude: number;
  longitude: number;
  altitude_m: number;
  speed_kn: number;
  heading_deg: number;
  damaged?: boolean;
  embarked_aircraft_count?: number;
  embarked_by_class?: Record<string, number>;
  embarked_ready_count?: number;
  runway_class?: string;
  battery_count?: number;
}

export interface SideSummary {
  unit_count?: number;
  ship_count?: number;
  airborne_aircraft_count?: number;
  facility_count?: number;
  groups?: { name: string; count: number }[];
  airborne_by_class?: { unit_class: string; count: number }[];
  embarked_ready_count?: number;
  embarked_not_ready_count?: number;
  embarked_by_class_and_ready?: { key: string; count: number }[];
  ship_underway_count?: number;
  ship_stopped_count?: number;
  ship_drifting_damaged_count?: number;
  ship_damaged_count?: number;
  damaged_ship_names?: string[];
}

export interface AnalysisTask {
  task_id: string;
  category: string;
  capability: string;
  prompt: string;
  input_hints?: string[];
  evaluation_points?: string[];
  reference_answer?: Record<string, unknown>;
  usn_view_key_threats?: { target: string; reason: string }[];
  ijn_view_key_threats?: { target: string; reason: string }[];
  reference_ratings?: {
    perspective: string;
    target: string;
    level: string;
    evidence: string;
  }[];
  usn_priority_order?: { rank: number; target: string; action: string }[];
  ijn_priority_order?: { rank: number; target: string; action: string }[];
  rating_scale?: string[];
  do_not_overweight?: string[];
  tie_break_rule?: string;
}

export interface SlicePack {
  time_slice: string;
  scenario: string;
  phase_label: string;
  meta: { label: string; order: number };
  sides: {
    USN: { side_name?: string; summary: SideSummary; units: CompactUnit[] };
    IJN: { side_name?: string; summary: SideSummary; units: CompactUnit[] };
  };
  intent: {
    force_posture?: unknown;
    situation_brief?: string;
    tasks: AnalysisTask[];
  };
  threat: {
    opening_order_of_battle?: unknown;
    threat_context?: string;
    tasks: AnalysisTask[];
  };
}

export interface SliceIndexItem {
  id: string;
  label: string;
  phase_label: string;
  order: number;
  path: string;
}

export type ChartType =
  | "bar"
  | "grouped_bar"
  | "hbar"
  | "line"
  | "multi_line"
  | "area"
  | "pie";

export interface ChartSpec {
  id: string;
  /** 统计图类型，见 chartTypes.CHART_TYPE_CATALOG */
  type: ChartType;
  title: string;
  description?: string;
  series: {
    name: string;
    value: number;
    side?: SideId | "both";
    /** 多序列折线的序列名（如威胁等级）；缺省用 side */
    group?: string;
    /** 悬停提示用，如证据条目明细 */
    detail?: string;
  }[];
}

export interface MapAxis {
  id: string;
  from: [number, number];
  to: [number, number];
  label: string;
  side: SideId;
}

export interface ThreatZone {
  id: string;
  center: [number, number];
  radius_nm: number;
  level: ThreatLevel | string;
  label: string;
  side?: SideId;
}

export interface SituationViewSpec {
  generated_by: "local" | "llm";
  time_slice: string;
  title: string;
  phase_label: string;
  narrative: string;
  map: {
    center: [number, number];
    zoom: number;
    highlight_names: string[];
    axes: MapAxis[];
    threat_zones: ThreatZone[];
  };
  kpis: {
    id: string;
    label: string;
    value: string | number;
    tone: "usn" | "ijn" | "warn" | "neutral";
  }[];
  charts: ChartSpec[];
  intent_findings: {
    task_id: string;
    capability: string;
    bullets: string[];
  }[];
  threat_findings: {
    task_id: string;
    capability: string;
    bullets: string[];
  }[];
  priorities: {
    side: SideId;
    label: string;
    items: { rank: number; target: string; action: string }[];
  }[];
  threat_ratings: {
    perspective: string;
    target: string;
    level: string;
    evidence: string;
  }[];
}

/** VMMP A/B：off=对照；on=附带对应任务范式 JSON */
export type VmmpMode = "off" | "on";
/** 视觉对比时的任务焦点，决定注入哪份 VMMP、偏重地图编码 */
export type TaskFocus = "threat" | "intent";

export interface GenerateRequest {
  time_slice: string;
  mode: "local" | "llm";
  task_ids?: string[];
  model?: string;
  /** 是否注入 VMMP JSON（默认 off） */
  vmmp_mode?: VmmpMode;
  /** 威胁分析 / 意图研判（默认 threat） */
  task_focus?: TaskFocus;
  /**
   * 是否锁定为四张兵力统计图。
   * 默认 true（主生成台固定四张兵力图）；对比页传 false，改用任务固定图槽（由 ratings/map 推导）。
   */
  lock_charts?: boolean;
}

export interface GenerateResponse {
  ok: boolean;
  prompt: string;
  system_prompt: string;
  spec: SituationViewSpec;
  error?: string;
  used_fallback?: boolean;
}
