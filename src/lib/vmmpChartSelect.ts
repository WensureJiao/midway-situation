/**
 * 对比页选图：共用一座图种库，A / B 都从里面挑最适配的项。
 * 每项 = 一种可画的图（问句 + 图种），不预埋 A/B 各一张。
 */
import type { ChartType, TaskFocus } from "./types";
import vmmpI from "../../data/vmmp/VMMP_I_intent_assessment.json";
import vmmpW from "../../data/vmmp/VMMP_W_threat_analysis.json";

export type VisualTopology =
  | "Position"
  | "Continuity"
  | "Connection"
  | "Proximity"
  | "Alignment"
  | "Hierarchy"
  | "Salience"
  | "Ordering"
  | "Grouping"
  | "Consistency"
  | "Uncertainty";

type MRule = {
  relation?: string | string[];
  operation?: string | string[];
  cognitive_element?: string;
  visual_topology: string[];
};

function asList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function loadMRules(focus: TaskFocus): MRule[] {
  if (focus === "intent") {
    return (vmmpI as { VMMP_I: { M_I: { rules: MRule[] } } }).VMMP_I.M_I
      .rules;
  }
  return (vmmpW as { VMMP_W: { M_W: { rules: MRule[] } } }).VMMP_W.M_W.rules;
}

/** 任务 T 集合：B 选图不得越出本任务视觉拓扑字表 */
function taskTopologySet(focus: TaskFocus): Set<string> {
  if (focus === "intent") {
    return new Set(
      (vmmpI as { VMMP_I: { T_I: { topology: string[] } } }).VMMP_I.T_I
        .topology,
    );
  }
  return new Set(
    (vmmpW as { VMMP_W: { T_W: { topology: string[] } } }).VMMP_W.T_W
      .topology,
  );
}

export function topologiesFromVmmp(focus: TaskFocus): {
  topology: string;
  why: string;
}[] {
  const tSet = taskTopologySet(focus);
  const out: { topology: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const rule of loadMRules(focus)) {
    const rel =
      asList(rule.relation).join("/") || rule.cognitive_element || "?";
    const op = asList(rule.operation).join("/") || "?";
    for (const t of rule.visual_topology ?? []) {
      // M 偶发写出 T 外拓扑（如 W 的 Connection）：仍承认 M，但优先 T 内
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({
        topology: t,
        why: `M：${rel}+${op} → ${t}${tSet.has(t) ? "" : "（M 增补）"}`,
      });
    }
  }
  return out;
}

export type ChartSlotDef = {
  id: string;
  /** 同一问句的数据源 id；库里可有多种图种 */
  family: string;
  type: ChartType;
  topologies: VisualTopology[];
  primaryTopology: VisualTopology;
  resident?: boolean;
  question: string;
  shortLabel: string;
  mapRead: string;
  tasks: TaskFocus[];
  /** A（无范式）：LLM 会不会用这张图直接回答任务问句 */
  llmFit: Partial<Record<TaskFocus, number>>;
  /** 同一信息只入选一张 */
  topic: string;
};

function item(
  def: Omit<ChartSlotDef, "family"> & { family?: string },
): ChartSlotDef {
  return { ...def, family: def.family ?? def.id };
}

/**
 * 图种库：每项一种可画的图。A / B 都从这里选，同一问句可有多种图种。
 */
export const SHARED_CHART_SLOTS: ChartSlotDef[] = [
  item({
    id: "cmp-force-landing",
    type: "scatter",
    topologies: ["Position"],
    primaryTopology: "Position",
    tasks: ["intent", "threat"],
    shortLabel: "敌我落点",
    question: "敌我水面相对中途岛落在哪？",
    mapRead: "Locate：把 CombatEntity 落到相对岛的平面",
    llmFit: { intent: 0.72, threat: 0.92 },
    topic: "unit-xy",
  }),
  item({
    id: "cmp-intent-axes",
    type: "scatter",
    topologies: ["Connection", "Alignment", "Position"],
    primaryTopology: "Connection",
    tasks: ["intent"],
    shortLabel: "指向方位距",
    question: "图上作战指向朝哪、各多长？",
    mapRead: "散点铺各轴落点",
    llmFit: { intent: 0.95 },
    topic: "aim",
  }),
  item({
    id: "cmp-intent-axes-radar",
    family: "cmp-intent-axes",
    type: "radar",
    topologies: ["Connection", "Alignment", "Position"],
    primaryTopology: "Connection",
    tasks: ["intent"],
    shortLabel: "指向方位距",
    question: "图上作战指向朝哪、各多长？",
    mapRead: "玫瑰看各轴所在扇区；十六方位避免近角并瓣",
    llmFit: { intent: 0.22 },
    topic: "aim",
  }),
  item({
    id: "cmp-threat-rank",
    type: "hbar",
    topologies: ["Ordering", "Salience"],
    primaryTopology: "Ordering",
    tasks: ["threat"],
    shortLabel: "威胁排序",
    question: "谁最急、优先打谁？",
    mapRead: "Rank：与右侧 PRIORITY / 金色高亮对照",
    llmFit: { threat: 1 },
    topic: "rank",
  }),
  item({
    id: "cmp-zone-footprint",
    type: "scatter",
    topologies: ["Salience", "Position"],
    primaryTopology: "Salience",
    tasks: ["threat"],
    shortLabel: "活动区足迹",
    question: "关注圈圆心相对岛落在哪？",
    mapRead: "Filter：紧急/高圈圆心，对照圈色",
    llmFit: { threat: 0.52 },
    topic: "zone-xy",
  }),
  item({
    id: "cmp-zone-radius",
    type: "hbar",
    topologies: ["Hierarchy", "Salience"],
    primaryTopology: "Hierarchy",
    tasks: ["threat"],
    shortLabel: "圈半径",
    question: "各关注圈半径差多少海里？",
    mapRead: "Assess：用海里比出谁罩得更宽",
    llmFit: { threat: 0.58 },
    topic: "zone-size",
  }),
  item({
    id: "cmp-force-range",
    type: "hbar",
    topologies: ["Proximity", "Ordering"],
    primaryTopology: "Proximity",
    tasks: ["threat"],
    shortLabel: "距岛远近",
    question: "各舰距中途岛多远？",
    mapRead: "条长=海里，越短越近",
    llmFit: { threat: 0.88 },
    topic: "island-range",
  }),
  item({
    id: "cmp-force-bearing",
    type: "bar",
    topologies: ["Alignment", "Position"],
    primaryTopology: "Alignment",
    tasks: ["intent", "threat"],
    shortLabel: "方位分布",
    question: "相对岛，敌我方位扇区如何分布？",
    mapRead: "Compare：美/日八方位计数",
    llmFit: { intent: 0.84, threat: 0.74 },
    topic: "bearing",
  }),
  item({
    id: "cmp-force-bearing-radar",
    family: "cmp-force-bearing",
    type: "radar",
    topologies: ["Alignment", "Position"],
    primaryTopology: "Alignment",
    tasks: ["intent", "threat"],
    shortLabel: "方位分布",
    question: "相对岛，敌我方位扇区如何分布？",
    mapRead: "Compare：玫瑰看扇区轮廓",
    llmFit: { intent: 0.22, threat: 0.18 },
    topic: "bearing",
  }),
  item({
    id: "cmp-highlight-range",
    type: "scatter",
    topologies: ["Salience", "Position", "Proximity"],
    primaryTopology: "Salience",
    tasks: ["intent", "threat"],
    shortLabel: "高亮方位距",
    question: "高亮实体相对岛的方位×距离？",
    mapRead: "筛出实体离岛多远、偏哪一扇区",
    llmFit: { intent: 0.76, threat: 0.48 },
    topic: "highlight",
  }),
  item({
    id: "cmp-alt-bands",
    type: "grouped_bar",
    topologies: ["Grouping", "Hierarchy"],
    primaryTopology: "Grouping",
    tasks: ["threat"],
    shortLabel: "在空高度",
    question: "美/日在空兵力落在哪些高度带？",
    mapRead: "Aggregate：各高度带架次分组柱",
    llmFit: { threat: 0.42 },
    topic: "air",
  }),
  item({
    id: "cmp-alt-bands-line",
    family: "cmp-alt-bands",
    type: "multi_line",
    topologies: ["Grouping", "Hierarchy"],
    primaryTopology: "Grouping",
    tasks: ["threat"],
    shortLabel: "在空高度",
    question: "美/日在空兵力落在哪些高度带？",
    mapRead: "折线看高度层次",
    llmFit: { threat: 0.16 },
    topic: "air",
  }),
  item({
    id: "cmp-air-profile",
    type: "scatter",
    topologies: ["Position", "Proximity"],
    primaryTopology: "Position",
    tasks: ["intent"],
    shortLabel: "在空剖面",
    question: "在空飞机相对岛的东向×高度？",
    mapRead: "飞机东向×高度，对照岛与圈",
    llmFit: { intent: 0.8 },
    topic: "air",
  }),
  item({
    id: "cmp-hunt-range",
    type: "hbar",
    topologies: ["Proximity", "Connection", "Salience"],
    primaryTopology: "Proximity",
    tasks: ["intent", "threat"],
    shortLabel: "关联远近",
    question: "高亮之间/对岛间隔有多远？",
    mapRead: "Relate：条长=海里，高亮对岛/彼此",
    llmFit: { intent: 0.58, threat: 0.4 },
    topic: "pair-range",
  }),
];

export const INTENT_EXTENSION_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;
export const THREAT_EXTENSION_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;
export const INTENT_CHART_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;
export const THREAT_CHART_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;

const MIN_FITNESS = 38;
/** 一侧入选上限：留出第二档，但不把目录铺满 */
const MAX_PRIMARY = 5;
/** A：相对头名，问句贴合掉出这截距才降为未选 */
const KEEP_RATIO = 0.45;
/** B：覆盖某拓扑时，图种×数据过弱则跳过，不硬凑 */
const COVER_MIN = 0.28;

/** 无范式时 LLM 更常直接画出的图种 */
const INTUITIVE_TYPES: ChartType[] = [
  "scatter",
  "bar",
  "hbar",
  "grouped_bar",
];

const WHY_A = "无范式 · 直观回答问句";

/** 入选展示顺序：任务主问句在前，其余按 M 路径 */
const DISPLAY_TOPOLOGY: Record<TaskFocus, VisualTopology[]> = {
  threat: [
    "Ordering",
    "Position",
    "Alignment",
    "Grouping",
    "Salience",
    "Hierarchy",
    "Proximity",
    "Connection",
  ],
  intent: [
    "Connection",
    "Alignment",
    "Position",
    "Proximity",
    "Continuity",
    "Salience",
    "Hierarchy",
  ],
};

/** 该拓扑在库里更贴的图种，排在前面的更优先 */
function preferredTypes(topo: VisualTopology): ChartType[] {
  switch (topo) {
    case "Ordering":
      return ["hbar"];
    case "Hierarchy":
      return ["hbar", "bar"];
    case "Grouping":
      return ["heatmap", "grouped_bar"];
    case "Alignment":
      return ["radar", "bar"];
    case "Connection":
      return ["radar", "scatter"];
    case "Position":
      return ["scatter"];
    case "Salience":
      return ["scatter", "hbar", "bar"];
    case "Proximity":
      return ["hbar", "scatter", "bar"];
    case "Continuity":
      return ["multi_line", "line", "area"];
    default:
      return ["scatter"];
  }
}

function typeFitAgainst(
  type: ChartType,
  topo: VisualTopology,
  rich: boolean,
): number {
  if (!rich) return INTUITIVE_TYPES.includes(type) ? 1 : 0.32;
  const pref = preferredTypes(topo);
  const i = pref.indexOf(type);
  if (i === 0) return 1;
  if (i > 0) return 0.78;
  return 0.36;
}

function typeFit(slot: ChartSlotDef, rich: boolean): number {
  return typeFitAgainst(slot.type, slot.primaryTopology, rich);
}

function llmFitOf(slot: ChartSlotDef, focus: TaskFocus): number {
  return slot.llmFit[focus] ?? 0;
}

function servesTopology(slot: ChartSlotDef, top: string): boolean {
  return (
    slot.primaryTopology === top ||
    slot.topologies.includes(top as VisualTopology)
  );
}

function displayIndex(focus: TaskFocus, slot: ChartSlotDef): number {
  const i = DISPLAY_TOPOLOGY[focus].indexOf(slot.primaryTopology);
  return i < 0 ? 80 : i;
}

export type ExtPickOptions = {
  fitnessById?: ReadonlyMap<string, number> | Record<string, number>;
};

function fitnessOf(
  id: string,
  fitnessById?: ExtPickOptions["fitnessById"],
): number {
  if (!fitnessById) return 0;
  if (fitnessById instanceof Map) return fitnessById.get(id) ?? 0;
  return (fitnessById as Record<string, number>)[id] ?? 0;
}

function familyFitness(
  slot: ChartSlotDef,
  opts?: ExtPickOptions,
): number {
  return fitnessOf(slot.family, opts?.fitnessById);
}

export function catalogSlots(_focus?: TaskFocus): ChartSlotDef[] {
  return SHARED_CHART_SLOTS;
}

function pickableSlots(focus: TaskFocus): ChartSlotDef[] {
  return catalogSlots(focus);
}

function taskReadySlots(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): ChartSlotDef[] {
  return pickableSlots(focus)
    .filter((slot) => slot.tasks.includes(focus))
    .filter((slot) => familyFitness(slot, opts) >= MIN_FITNESS);
}

type RankedSide = {
  primary: ChartSlotDef[];
  spare: ChartSlotDef[];
};

function takeSlot(
  slot: ChartSlotDef,
  primary: ChartSlotDef[],
  usedFamily: Set<string>,
  usedTopic: Set<string>,
) {
  primary.push(slot);
  usedFamily.add(slot.family);
  usedTopic.add(slot.topic);
}

/** A：无 VMMP，按 LLM 会不会用这张图直接回答问句 */
function rankByLlm(
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  opts?: ExtPickOptions,
): RankedSide {
  const ranked = [...eligible]
    .map((slot) => {
      const fitness = familyFitness(slot, opts);
      const score = llmFitOf(slot, focus) * typeFit(slot, false);
      return { slot, score, fitness };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.fitness - a.fitness ||
        a.slot.id.localeCompare(b.slot.id),
    );
  if (!ranked.length) return { primary: [], spare: [] };
  const floor = ranked[0].score * KEEP_RATIO;
  const primary: ChartSlotDef[] = [];
  const spare: ChartSlotDef[] = [];
  const usedFamily = new Set<string>();
  const usedTopic = new Set<string>();
  for (const row of ranked) {
    if (
      primary.length < MAX_PRIMARY &&
      row.score >= floor &&
      !usedFamily.has(row.slot.family) &&
      !usedTopic.has(row.slot.topic)
    ) {
      takeSlot(row.slot, primary, usedFamily, usedTopic);
    } else {
      spare.push(row.slot);
    }
  }
  return { primary, spare };
}

function coverScore(
  slot: ChartSlotDef,
  top: VisualTopology,
  fitness: number,
): number {
  const primaryBonus = slot.primaryTopology === top ? 1 : 0.7;
  const tf = typeFitAgainst(slot.type, top, true);
  return primaryBonus * tf * (0.6 + 0.4 * (fitness / 100));
}

/** B：有 VMMP，按 M 激活的拓扑各盖一张最贴的图 */
function coverByM(
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  opts?: ExtPickOptions,
): RankedSide {
  const primary: ChartSlotDef[] = [];
  const usedFamily = new Set<string>();
  const usedTopic = new Set<string>();
  const usedTop = new Set<string>();
  const activated = new Set(topologiesFromVmmp(focus).map((t) => t.topology));
  const coverOrder: VisualTopology[] = [];
  for (const top of DISPLAY_TOPOLOGY[focus]) {
    if (activated.has(top) && !coverOrder.includes(top)) coverOrder.push(top);
  }
  for (const { topology } of topologiesFromVmmp(focus)) {
    const top = topology as VisualTopology;
    if (activated.has(top) && !coverOrder.includes(top)) coverOrder.push(top);
  }

  for (const top of coverOrder) {
    if (primary.length >= MAX_PRIMARY) break;
    if (usedTop.has(top)) continue;
    const cands = eligible.filter(
      (slot) =>
        servesTopology(slot, top) &&
        !usedFamily.has(slot.family) &&
        !usedTopic.has(slot.topic),
    );
    if (!cands.length) continue;
    const scored = cands
      .map((slot) => {
        const fitness = familyFitness(slot, opts);
        return { slot, score: coverScore(slot, top, fitness), fitness };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.fitness - a.fitness ||
          a.slot.id.localeCompare(b.slot.id),
      );
    const best = scored[0];
    if (!best || best.score < COVER_MIN) continue;
    takeSlot(best.slot, primary, usedFamily, usedTopic);
    usedTop.add(top);
  }

  primary.sort(
    (a, b) =>
      displayIndex(focus, a) - displayIndex(focus, b) ||
      a.id.localeCompare(b.id),
  );

  const spare = eligible.filter(
    (slot) => !primary.some((p) => p.id === slot.id),
  );
  return { primary, spare };
}

function rankPicks(
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): RankedSide {
  return rich
    ? coverByM(eligible, focus, opts)
    : rankByLlm(eligible, focus, opts);
}

function sideRanked(
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): RankedSide {
  return rankPicks(taskReadySlots(focus, opts), focus, rich, opts);
}

function pickWithoutVmmp(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): ChartSlotDef[] {
  return sideRanked(focus, false, opts).primary;
}

function pickWithVmmp(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): ChartSlotDef[] {
  return sideRanked(focus, true, opts).primary;
}

export function taskPickContrast(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): { onlyThis: string[]; onlyOther: string[]; other: TaskFocus } {
  const other: TaskFocus = focus === "intent" ? "threat" : "intent";
  const mine = new Set(pickWithVmmp(focus, opts).map((s) => s.family));
  const theirs = new Set(pickWithVmmp(other, opts).map((s) => s.family));
  return {
    other,
    onlyThis: catalogSlots()
      .filter((s) => mine.has(s.family) && !theirs.has(s.family))
      .map((s) => s.shortLabel)
      .filter((label, i, arr) => arr.indexOf(label) === i),
    onlyOther: catalogSlots()
      .filter((s) => theirs.has(s.family) && !mine.has(s.family))
      .map((s) => s.shortLabel)
      .filter((label, i, arr) => arr.indexOf(label) === i),
  };
}

export function slotTypeForSide(
  slot: ChartSlotDef,
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): ChartType {
  const picked = sideRanked(focus, rich, opts).primary.find(
    (s) => s.family === slot.family,
  );
  return picked?.type ?? slot.type;
}

export function extensionPickIds(
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): readonly string[] {
  return (rich ? pickWithVmmp(focus, opts) : pickWithoutVmmp(focus, opts)).map(
    (s) => s.family,
  );
}

export function slotSelectionMatrix(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): {
  slot: ChartSlotDef;
  aOn: boolean;
  bOn: boolean;
  aSpare: boolean;
  bSpare: boolean;
  aRank: number | null;
  bRank: number | null;
  aType: ChartType;
  bType: ChartType;
  upgraded: boolean;
  layer: "图种库";
  note?: string;
}[] {
  const hasFitness = Boolean(opts?.fitnessById);
  const aSide = hasFitness
    ? sideRanked(focus, false, opts)
    : { primary: [], spare: [] };
  const bSide = hasFitness
    ? sideRanked(focus, true, opts)
    : { primary: [], spare: [] };
  const aPick = new Set(aSide.primary.map((s) => s.id));
  const bPick = new Set(bSide.primary.map((s) => s.id));
  const aSpareSet = new Set(aSide.spare.map((s) => s.id));
  const bSpareSet = new Set(bSide.spare.map((s) => s.id));
  const aRankOf = (id: string) => {
    const i = aSide.primary.findIndex((s) => s.id === id);
    return i >= 0 ? i + 1 : null;
  };
  const bRankOf = (id: string) => {
    const i = bSide.primary.findIndex((s) => s.id === id);
    return i >= 0 ? i + 1 : null;
  };

  return catalogSlots(focus)
    .filter((slot) => slot.tasks.includes(focus))
    .map((slot) => {
      const aOn = aPick.has(slot.id);
      const bOn = bPick.has(slot.id);
      const aSpare = aSpareSet.has(slot.id);
      const bSpare = bSpareSet.has(slot.id);
      const aRank = aRankOf(slot.id);
      const bRank = bRankOf(slot.id);
      const aType = slot.type;
      const bType = slot.type;
      const upgraded = bOn && !INTUITIVE_TYPES.includes(slot.type);
      const fit = familyFitness(slot, opts);
      let note: string | undefined;
      if (!hasFitness) note = "待适切度";
      else if (aOn) note = `A · LLM直观#${aRank} · ${slot.type}`;
      else if (bOn) note = `B · M覆盖#${bRank} · ${slot.primaryTopology} · ${slot.type}`;
      else if (aSpare || bSpare) note = "图种库未选";
      else if (fit < MIN_FITNESS) note = `适切不足（${Math.round(fit)}）`;
      else note = "本侧未选";
      return {
        slot,
        aOn,
        bOn,
        aSpare,
        bSpare,
        aRank,
        bRank,
        aType,
        bType,
        upgraded,
        layer: "图种库" as const,
        note,
      };
    });
}

export function extensionChartIds(focus: TaskFocus): string[] {
  return [...new Set(pickableSlots(focus).map((s) => s.family))];
}

/** 默认展开：当前侧入选第一项（数据 id = family） */
export function defaultCompareSlotId(
  focus: TaskFocus,
  opts?: ExtPickOptions,
  side?: "A" | "B" | null,
): string | null {
  const rows = slotSelectionMatrix(focus, opts);
  const familyOf = (row: { slot: ChartSlotDef } | undefined) =>
    row?.slot.family ?? null;
  if (side === "A") {
    return (
      familyOf(rows.find((r) => r.aRank === 1)) ??
      familyOf(rows.find((r) => r.aOn))
    );
  }
  if (side === "B") {
    return (
      familyOf(rows.find((r) => r.bRank === 1)) ??
      familyOf(rows.find((r) => r.bOn))
    );
  }
  return (
    familyOf(rows.find((r) => r.bRank === 1)) ??
    familyOf(rows.find((r) => r.aRank === 1)) ??
    familyOf(rows.find((r) => r.aOn || r.bOn))
  );
}

export function selectChartSlotIds(
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): {
  ids: Set<string>;
  whyById: Map<string, string>;
  typeByFamily: Map<string, ChartType>;
} {
  const tops = topologiesFromVmmp(focus);
  const whyByTop = new Map(tops.map((t) => [t.topology, t.why]));
  const ranked = sideRanked(focus, rich, opts);
  const ids = new Set(ranked.primary.map((s) => s.family));
  const whyById = new Map<string, string>();
  const typeByFamily = new Map<string, ChartType>();

  ranked.primary.forEach((slot, index) => {
    const fit = familyFitness(slot, opts);
    const rankNote = `优先#${index + 1} · `;
    const fitNote = Number.isFinite(fit) ? ` · 适切${Math.round(fit)}` : "";
    typeByFamily.set(slot.family, slot.type);
    if (rich) {
      const why = whyByTop.get(slot.primaryTopology);
      whyById.set(
        slot.family,
        `${rankNote}M覆盖 · ${slot.type} · ${why ?? slot.primaryTopology}${fitNote}`,
      );
    } else {
      whyById.set(
        slot.family,
        `A · ${rankNote}${WHY_A} ⇒ ${slot.type}${fitNote}`,
      );
    }
  });

  return { ids, whyById, typeByFamily };
}
