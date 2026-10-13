import fs from "fs";
import path from "path";
import {
  centroid,
  findByNameHint,
  findUnit,
  selectTasks,
  summarizePackForPrompt,
} from "./summarize";
import {
  SITUATION_SYSTEM_PROMPT,
  buildSituationUserPrompt,
  type PromptVmmpOptions,
} from "./prompts";
import { buildDefaultMapAxes } from "./mapSkeletonDiff";
import { buildThreatZoneSkeleton } from "./threatZones";
import type {
  AnalysisTask,
  ChartSpec,
  CompactUnit,
  SituationViewSpec,
  SlicePack,
  TaskFocus,
  VmmpMode,
} from "./types";

function loadVmmpJson(taskFocus: TaskFocus): string {
  const file =
    taskFocus === "intent"
      ? "VMMP_I_intent_assessment.json"
      : "VMMP_W_threat_analysis.json";
  const full = path.join(process.cwd(), "data", "vmmp", file);
  return fs.readFileSync(full, "utf8");
}

function carriers(units: CompactUnit[]): CompactUnit[] {
  return units.filter(
    (u) => u.unit_type === "Ship" && u.unit_class.includes("航空母舰"),
  );
}

/** 去掉 ready_min 后缀后同机型合并计数 */
function aggregateEmbarkedByClass(
  rows: { key: string; count: number }[],
  side: "USN" | "IJN",
): { name: string; value: number; side: "USN" | "IJN" }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = row.key.replace(/\|ready_min=\d+/g, "");
    map.set(name, (map.get(name) ?? 0) + row.count);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value, side }));
}

/** 固定四张统计图（本地 / LLM 一致）。 */
export function buildFixedCharts(pack: SlicePack): ChartSpec[] {
  const us = pack.sides.USN.summary;
  const ij = pack.sides.IJN.summary;

  const usReadyClass = aggregateEmbarkedByClass(
    us.embarked_by_class_and_ready ?? [],
    "USN",
  );
  const ijReadyClass = aggregateEmbarkedByClass(
    ij.embarked_by_class_and_ready ?? [],
    "IJN",
  );

  return [
    {
      id: "ships",
      type: "bar",
      title: "水面舰艇数量",
      description: "不含岸基设施",
      series: [
        { name: "USN", value: us.ship_count ?? 0, side: "USN" },
        { name: "IJN", value: ij.ship_count ?? 0, side: "IJN" },
      ],
    },
    {
      id: "airborne",
      type: "bar",
      title: "在空飞机数量",
      series: [
        { name: "USN", value: us.airborne_aircraft_count ?? 0, side: "USN" },
        { name: "IJN", value: ij.airborne_aircraft_count ?? 0, side: "IJN" },
      ],
    },
    {
      id: "usn-embarked-class",
      type: "pie",
      title: "红方舰载机机型构成（就绪）",
      series: usReadyClass.length
        ? usReadyClass
        : [{ name: "暂无就绪机型", value: 0, side: "USN" }],
    },
    {
      id: "ijn-embarked-class",
      type: "pie",
      title: "蓝方舰载机机型构成（就绪）",
      series: ijReadyClass.length
        ? ijReadyClass
        : [{ name: "暂无就绪机型", value: 0, side: "IJN" }],
    },
  ];
}

/** @deprecated 使用 buildFixedCharts */
function buildCharts(pack: SlicePack): ChartSpec[] {
  return buildFixedCharts(pack);
}

function buildMap(pack: SlicePack): SituationViewSpec["map"] {
  const midway =
    findByNameHint(pack, "中途岛主跑道") ||
    findUnit(pack, (u) => u.unit_type === "Facility");
  const ijnCarriers = carriers(pack.sides.IJN.units);
  const usCarriers = carriers(pack.sides.USN.units);

  const allShips = [
    ...pack.sides.USN.units.filter((u) => u.unit_type === "Ship"),
    ...pack.sides.IJN.units.filter((u) => u.unit_type === "Ship"),
  ];
  const mapCenter =
    centroid(allShips) ||
    (midway
      ? ([midway.latitude, midway.longitude] as [number, number])
      : ([29, -178] as [number, number]));

  const highlight = [
    ...ijnCarriers.map((u) => u.name),
    ...usCarriers.map((u) => u.name),
    ...(midway ? [midway.name] : []),
  ];

  return {
    center: mapCenter,
    zoom: 6,
    highlight_names: highlight,
    axes: buildDefaultMapAxes(pack),
    threat_zones: buildThreatZoneSkeleton(pack),
  };
}

function buildKpis(pack: SlicePack): SituationViewSpec["kpis"] {
  return buildFixedKpis(pack);
}

/** 固定四项 KPI，本地 / LLM 一致，禁止自由发挥。 */
export function buildFixedKpis(pack: SlicePack): SituationViewSpec["kpis"] {
  const us = pack.sides.USN.summary;
  const ij = pack.sides.IJN.summary;
  return [
    {
      id: "us-cv",
      label: "美航母",
      value: carriers(pack.sides.USN.units).length,
      tone: "usn",
    },
    {
      id: "ijn-cv",
      label: "日航母舰体",
      value: carriers(pack.sides.IJN.units).length,
      tone: "ijn",
    },
    {
      id: "air",
      label: "在空飞机",
      value:
        (us.airborne_aircraft_count ?? 0) + (ij.airborne_aircraft_count ?? 0),
      tone: "warn",
    },
    {
      id: "dmg",
      label: "损伤舰艇",
      value: (us.ship_damaged_count ?? 0) + (ij.ship_damaged_count ?? 0),
      tone:
        (us.ship_damaged_count ?? 0) + (ij.ship_damaged_count ?? 0) > 0
          ? "warn"
          : "neutral",
    },
  ];
}

/** 从 pack 威胁任务中提取威胁等级（仅美方观察视角）。 */
export function buildThreatRatingsFromPack(
  pack: SlicePack,
): SituationViewSpec["threat_ratings"] {
  const tasks = pack.threat?.tasks ?? [];
  const ratingTask = tasks.find((t) => t.reference_ratings?.length);
  const rows = ratingTask?.reference_ratings ?? [];
  return rows.filter((r) => {
    const p = r.perspective ?? "";
    if (/蓝方看|日方看/i.test(p)) return false;
    return /红方看|美方看|USN/i.test(p);
  });
}

/** Deterministic local generator — map + KPIs + threat ratings（不含四张兵力统计图）. */
export function generateSituationLocal(
  pack: SlicePack,
  _taskIds?: string[],
): SituationViewSpec {
  const hasHiryuHull = pack.sides.IJN.units.some((u) =>
    /Hiryu|飞龙/i.test(u.name),
  );

  return {
    generated_by: "local",
    time_slice: pack.time_slice,
    title: `${pack.time_slice} · ${pack.meta.label}`,
    phase_label: pack.phase_label,
    narrative: [
      pack.intent.situation_brief ?? pack.phase_label,
      pack.threat.threat_context ?? "",
      hasHiryuHull
        ? "本切片日方飞龙舰体在场。"
        : "注意：本切片未见飞龙舰体导出，不得默认其已沉没。",
    ]
      .filter(Boolean)
      .join(" "),
    map: buildMap(pack),
    kpis: buildKpis(pack),
    charts: buildFixedCharts(pack),
    intent_findings: [],
    threat_findings: [],
    priorities: [],
    threat_ratings: buildThreatRatingsFromPack(pack),
  };
}

export function buildPromptBundle(
  pack: SlicePack,
  taskIds?: string[],
  options?: {
    vmmp_mode?: VmmpMode;
    task_focus?: TaskFocus;
    lock_charts?: boolean;
  },
): { system_prompt: string; prompt: string; tasks: AnalysisTask[] } {
  const tasks = selectTasks(pack, taskIds);
  const dataSummary = summarizePackForPrompt(pack);
  const vmmp_mode: VmmpMode = options?.vmmp_mode ?? "off";
  const task_focus: TaskFocus = options?.task_focus ?? "threat";
  const lock_charts = options?.lock_charts !== false;
  const promptOptions: PromptVmmpOptions = {
    vmmp_mode,
    task_focus,
    lock_charts,
    zone_skeleton: buildThreatZoneSkeleton(pack),
    vmmp_json:
      vmmp_mode === "on" ? loadVmmpJson(task_focus) : null,
  };
  return {
    system_prompt: SITUATION_SYSTEM_PROMPT,
    prompt: buildSituationUserPrompt(pack, tasks, dataSummary, promptOptions),
    tasks,
  };
}
