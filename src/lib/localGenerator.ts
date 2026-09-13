import {
  centroid,
  findByNameHint,
  findUnit,
  isAirborne,
  selectTasks,
  summarizePackForPrompt,
} from "./summarize";
import {
  SITUATION_SYSTEM_PROMPT,
  buildSituationUserPrompt,
} from "./prompts";
import type {
  AnalysisTask,
  ChartSpec,
  CompactUnit,
  SituationViewSpec,
  SlicePack,
} from "./types";

function carriers(units: CompactUnit[]): CompactUnit[] {
  return units.filter(
    (u) => u.unit_type === "Ship" && u.unit_class.includes("航空母舰"),
  );
}

function refBullets(task: AnalysisTask): string[] {
  if (task.reference_answer) {
    return Object.entries(task.reference_answer).map(
      ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
    );
  }
  if (task.usn_view_key_threats || task.ijn_view_key_threats) {
    const us = (task.usn_view_key_threats ?? []).map(
      (t) => `美方关注 ${t.target} — ${t.reason}`,
    );
    const ij = (task.ijn_view_key_threats ?? []).map(
      (t) => `日方关注 ${t.target} — ${t.reason}`,
    );
    return [...us, ...ij];
  }
  if (task.reference_ratings) {
    return task.reference_ratings.map(
      (r) => `${r.perspective}｜${r.target}｜${r.level} — ${r.evidence}`,
    );
  }
  if (task.usn_priority_order || task.ijn_priority_order) {
    const us = (task.usn_priority_order ?? []).map(
      (p) => `美#${p.rank} ${p.target}: ${p.action}`,
    );
    const ij = (task.ijn_priority_order ?? []).map(
      (p) => `日#${p.rank} ${p.target}: ${p.action}`,
    );
    return [...us, ...ij];
  }
  return task.evaluation_points ?? [task.prompt.slice(0, 120)];
}

function buildCharts(pack: SlicePack): ChartSpec[] {
  const us = pack.sides.USN.summary;
  const ij = pack.sides.IJN.summary;
  const charts: ChartSpec[] = [
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
  ];

  const airClasses = new Map<string, { usn: number; ijn: number }>();
  for (const row of us.airborne_by_class ?? []) {
    const cur = airClasses.get(row.unit_class) ?? { usn: 0, ijn: 0 };
    cur.usn = row.count;
    airClasses.set(row.unit_class, cur);
  }
  for (const row of ij.airborne_by_class ?? []) {
    const cur = airClasses.get(row.unit_class) ?? { usn: 0, ijn: 0 };
    cur.ijn = row.count;
    airClasses.set(row.unit_class, cur);
  }
  if (airClasses.size) {
    charts.push({
      id: "air-class",
      type: "stacked_bar",
      title: "在空机型构成",
      series: [...airClasses.entries()].flatMap(([name, v]) => [
        { name: `${name}·美`, value: v.usn, side: "USN" as const },
        { name: `${name}·日`, value: v.ijn, side: "IJN" as const },
      ]),
    });
  }

  charts.push({
    id: "ship-motion",
    type: "bar",
    title: "舰艇运动状态",
    series: [
      { name: "美·航行", value: us.ship_underway_count ?? 0, side: "USN" },
      { name: "美·停/泊", value: us.ship_stopped_count ?? 0, side: "USN" },
      { name: "日·航行", value: ij.ship_underway_count ?? 0, side: "IJN" },
      { name: "日·停/泊", value: ij.ship_stopped_count ?? 0, side: "IJN" },
      {
        name: "日·伤漂",
        value: ij.ship_drifting_damaged_count ?? 0,
        side: "IJN",
      },
      {
        name: "美·伤漂",
        value: us.ship_drifting_damaged_count ?? 0,
        side: "USN",
      },
    ],
  });

  const readyUs = us.embarked_ready_count ?? 0;
  const notUs = us.embarked_not_ready_count ?? 0;
  const readyIj = ij.embarked_ready_count ?? 0;
  const notIj = ij.embarked_not_ready_count ?? 0;
  if (readyUs + notUs + readyIj + notIj > 0) {
    charts.push({
      id: "ready",
      type: "stacked_bar",
      title: "舰载机就绪（ready_min=0）",
      series: [
        { name: "美·就绪", value: readyUs, side: "USN" },
        { name: "美·未就绪", value: notUs, side: "USN" },
        { name: "日·就绪", value: readyIj, side: "IJN" },
        { name: "日·未就绪", value: notIj, side: "IJN" },
      ],
    });
  }

  return charts;
}

function buildMap(pack: SlicePack): SituationViewSpec["map"] {
  const midway =
    findByNameHint(pack, "中途岛主跑道") ||
    findUnit(pack, (u) => u.unit_type === "Facility");
  const enterprise = findByNameHint(pack, "Enterprise");
  const yorktown = findByNameHint(pack, "Yorktown");
  const ijnCarriers = carriers(pack.sides.IJN.units);
  const usCarriers = carriers(pack.sides.USN.units);
  const ijnCenter =
    centroid(ijnCarriers) ||
    centroid(pack.sides.IJN.units.filter((u) => u.unit_type === "Ship"));
  const usCenter =
    centroid(usCarriers) ||
    centroid(pack.sides.USN.units.filter((u) => u.unit_type === "Ship"));

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

  const axes: SituationViewSpec["map"]["axes"] = [];
  if (ijnCenter && midway) {
    axes.push({
      id: "ijn-to-midway",
      from: ijnCenter,
      to: [midway.latitude, midway.longitude],
      label: "南云→中途岛",
      side: "IJN",
    });
  }
  if (usCenter && ijnCenter) {
    axes.push({
      id: "usn-to-ijn",
      from: usCenter,
      to: ijnCenter,
      label: "美特混→南云",
      side: "USN",
    });
  }

  const zones: SituationViewSpec["map"]["threat_zones"] = [];
  if (ijnCenter) {
    const damaged = ijnCarriers.some((u) => u.damaged);
    zones.push({
      id: "nagumo",
      center: ijnCenter,
      radius_nm: damaged ? 25 : 45,
      level: damaged ? "紧急" : "高",
      label: damaged ? "南云损管群" : "南云机动部队",
      side: "IJN",
    });
  }
  if (midway) {
    zones.push({
      id: "midway",
      center: [midway.latitude, midway.longitude],
      radius_nm: 30,
      level: "高",
      label: "中途岛岸基",
      side: "USN",
    });
  }
  if (enterprise) {
    zones.push({
      id: "tf16",
      center: [enterprise.latitude, enterprise.longitude],
      radius_nm: 35,
      level: "高",
      label: "TF16",
      side: "USN",
    });
  } else if (yorktown) {
    zones.push({
      id: "tf17",
      center: [yorktown.latitude, yorktown.longitude],
      radius_nm: 30,
      level: "高",
      label: "TF17",
      side: "USN",
    });
  }

  const air = [...pack.sides.USN.units, ...pack.sides.IJN.units].filter(
    isAirborne,
  );
  const airC = centroid(air);
  if (airC && air.length >= 5) {
    zones.push({
      id: "air-contact",
      center: airC,
      radius_nm: 50,
      level: "紧急",
      label: `在空接触带（${air.length}）`,
    });
  }

  return {
    center: mapCenter,
    zoom: 6,
    highlight_names: highlight,
    axes,
    threat_zones: zones,
  };
}

function buildKpis(pack: SlicePack): SituationViewSpec["kpis"] {
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

/** Deterministic local generator — same contract as LLM output. */
export function generateSituationLocal(
  pack: SlicePack,
  taskIds?: string[],
): SituationViewSpec {
  const tasks = selectTasks(pack, taskIds);
  const intentTasks = tasks.filter((t) => t.category === "意图研判");
  const threatTasks = tasks.filter((t) => t.category === "威胁分析");

  const priorityTask = threatTasks.find((t) => t.usn_priority_order);
  const ratingTask = threatTasks.find((t) => t.reference_ratings);

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
    charts: buildCharts(pack),
    intent_findings: intentTasks.map((t) => ({
      task_id: t.task_id,
      capability: t.capability,
      bullets: refBullets(t),
    })),
    threat_findings: threatTasks.map((t) => ({
      task_id: t.task_id,
      capability: t.capability,
      bullets: refBullets(t),
    })),
    priorities: priorityTask
      ? [
          {
            side: "USN" as const,
            label: "蓝方目标优先级",
            items: priorityTask.usn_priority_order ?? [],
          },
          {
            side: "IJN" as const,
            label: "红方目标优先级",
            items: priorityTask.ijn_priority_order ?? [],
          },
        ]
      : [],
    threat_ratings: ratingTask?.reference_ratings ?? [],
  };
}

export function buildPromptBundle(
  pack: SlicePack,
  taskIds?: string[],
): { system_prompt: string; prompt: string; tasks: AnalysisTask[] } {
  const tasks = selectTasks(pack, taskIds);
  const dataSummary = summarizePackForPrompt(pack);
  return {
    system_prompt: SITUATION_SYSTEM_PROMPT,
    prompt: buildSituationUserPrompt(pack, tasks, dataSummary),
    tasks,
  };
}
