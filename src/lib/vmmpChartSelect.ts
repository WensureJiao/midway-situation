/**
 * 对比页选图：共用一座图种库，A / B 各自挑选，界面不混用、不并排。
 * A = 无范式，只留 LLM 最常直接回答问句的直观图。
 * B = 有 VMMP，按 M 激活拓扑覆盖；问句可与 A 相同，图种必须按拓扑优选且尽量不同。
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
  /** 只进下排相关扩展，不抢上排 5 张 */
  layer?: "extend";
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
    llmFit: { intent: 0.78, threat: 0.92 },
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
    tasks: [],
    shortLabel: "活动区足迹",
    question: "关注圈圆心相对岛落在哪？",
    mapRead: "Filter：紧急/高圈圆心，对照圈色",
    llmFit: { intent: 0, threat: 0.36 },
    topic: "zone-xy",
  }),
  item({
    id: "cmp-zone-radius",
    type: "hbar",
    topologies: ["Hierarchy", "Salience"],
    primaryTopology: "Hierarchy",
    // 地图已按真半径画圈；条图对意图几乎无增量，对威胁也只是再数一遍
    tasks: [],
    shortLabel: "圈半径",
    question: "各关注圈半径差多少海里？",
    mapRead: "Assess：用海里比出谁罩得更宽",
    llmFit: { intent: 0.12, threat: 0.18 },
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
    id: "cmp-force-range-area",
    family: "cmp-force-range",
    type: "area",
    topologies: ["Continuity", "Proximity"],
    primaryTopology: "Continuity",
    tasks: ["threat"],
    shortLabel: "距岛远近",
    question: "各舰距中途岛多远？",
    mapRead: "面积：距岛 X nm 内已有多少艘，看铺开过程",
    llmFit: { threat: 0.1 },
    topic: "island-range",
  }),
  item({
    id: "cmp-force-range-strip",
    family: "cmp-force-range",
    type: "scatter",
    topologies: ["Grouping", "Proximity"],
    primaryTopology: "Grouping",
    tasks: ["threat"],
    shortLabel: "距岛远近",
    question: "各舰距中途岛多远？",
    mapRead: "沿距岛海里铺开，一点一艘；颜色分美/日，0=中途岛",
    llmFit: { threat: 0.14 },
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
    type: "hbar",
    topologies: ["Salience", "Proximity"],
    primaryTopology: "Salience",
    tasks: ["intent", "threat"],
    shortLabel: "高亮距岛",
    question: "高亮实体离中途岛多远？",
    mapRead: "条长=海里，越短越近；只看图上高亮",
    llmFit: { intent: 0.42, threat: 0.46 },
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
    llmFit: { threat: 0.3 },
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
    llmFit: { intent: 0.82 },
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
    llmFit: { intent: 0.7, threat: 0.68 },
    topic: "pair-range",
  }),
  item({
    id: "cmp-aim-link",
    type: "sankey",
    topologies: ["Proximity", "Connection"],
    primaryTopology: "Proximity",
    tasks: ["intent"],
    shortLabel: "对准关系",
    question: "谁在对准谁？",
    mapRead: "Relate：左=发起，右=目标，带宽=指向长度",
    llmFit: { intent: 0.18 },
    topic: "pair-range",
  }),
  item({
    id: "cmp-heading",
    type: "hbar",
    layer: "extend",
    topologies: ["Alignment", "Consistency"],
    primaryTopology: "Alignment",
    tasks: ["intent"],
    shortLabel: "航向对轴",
    question: "航向对准作战轴了吗？",
    mapRead: "条短=舰首航向相对作战轴的偏角小",
    llmFit: { intent: 0.52 },
    topic: "heading",
  }),
  item({
    id: "cmp-heading-radar",
    family: "cmp-heading",
    type: "radar",
    layer: "extend",
    topologies: ["Alignment", "Consistency"],
    primaryTopology: "Alignment",
    tasks: ["intent"],
    shortLabel: "航向对轴",
    question: "航向对准作战轴了吗？",
    mapRead: "瓣=舰首航向，箭头=作战轴；重合=对准",
    llmFit: { intent: 0.16 },
    topic: "heading",
  }),
  item({
    id: "cmp-urgent-near",
    type: "hbar",
    layer: "extend",
    topologies: ["Salience", "Proximity"],
    primaryTopology: "Salience",
    tasks: ["threat"],
    shortLabel: "紧急且近",
    question: "谁紧急又离岛近？",
    mapRead: "Filter：把威胁等级和距岛合成一条，看谁又高又近",
    llmFit: { threat: 0.58 },
    topic: "urgent-near",
  }),
  item({
    id: "cmp-urgent-near-scatter",
    family: "cmp-urgent-near",
    type: "scatter",
    layer: "extend",
    topologies: ["Salience", "Proximity"],
    primaryTopology: "Salience",
    tasks: ["threat"],
    shortLabel: "紧急且近",
    question: "谁紧急又离岛近？",
    mapRead: "横轴距岛、纵轴等级；左上=紧急且近",
    llmFit: { threat: 0.22 },
    topic: "urgent-near",
  }),
  item({
    id: "cmp-threat-evidence",
    type: "hbar",
    layer: "extend",
    topologies: ["Uncertainty", "Salience"],
    primaryTopology: "Uncertainty",
    tasks: [],
    shortLabel: "依据足不足",
    question: "评级依据足不足？",
    mapRead: "Verify：条长=证据充分度 0–4",
    llmFit: { threat: 0 },
    topic: "evidence",
  }),
  item({
    id: "cmp-threat-evidence-scatter",
    family: "cmp-threat-evidence",
    type: "scatter",
    layer: "extend",
    topologies: ["Uncertainty", "Salience"],
    primaryTopology: "Uncertainty",
    tasks: [],
    shortLabel: "依据足不足",
    question: "评级依据足不足？",
    mapRead: "横轴充分度、纵轴等级；右上=定级且有据",
    llmFit: { threat: 0 },
    topic: "evidence",
  }),
];

export const INTENT_EXTENSION_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;
export const THREAT_EXTENSION_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;
export const INTENT_CHART_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;
export const THREAT_CHART_SLOTS: ChartSlotDef[] = SHARED_CHART_SLOTS;

const MIN_FITNESS = 28;
/** 上排主问：A / B 都铺满 5 张；A 走直观图，B 走 M 拓扑 */
const MAX_A = 5;
const MAX_B = 5;
/** 下排相关扩展：宁缺毋滥，不硬凑 */
const MAX_EXTEND = 4;
/** 上排没选中、但问句仍相关的槽，可进下排 */
const LEFTOVER_EXTEND = new Set([
  "cmp-air-profile",
  "cmp-alt-bands",
  "cmp-hunt-range",
  "cmp-force-range",
]);
/** A：相对头名，问句贴合掉出这截距才降为未选；随后仍补满 5 张 */
const KEEP_RATIO = 0.4;
/** B：覆盖某拓扑时，图种×数据过弱则跳过，不硬凑 */
const COVER_MIN = 0.22;

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
    "Alignment",
    "Grouping",
    "Hierarchy",
    "Salience",
    "Position",
    "Proximity",
    "Connection",
  ],
  intent: [
    "Connection",
    "Alignment",
    "Proximity",
    "Salience",
    "Hierarchy",
    "Position",
    "Continuity",
  ],
};

/** 该拓扑在库里更贴的图种，排在前面的更优先 */
function preferredTypes(topo: VisualTopology): ChartType[] {
  switch (topo) {
    case "Ordering":
      return ["hbar"];
    case "Hierarchy":
      return ["hbar", "bar", "grouped_bar"];
    case "Grouping":
      return ["scatter", "grouped_bar", "heatmap"];
    case "Alignment":
      return ["radar", "bar"];
    case "Connection":
      return ["radar", "scatter", "sankey"];
    case "Position":
      return ["scatter"];
    case "Salience":
      return ["hbar", "scatter", "bar"];
    case "Proximity":
      return ["sankey", "hbar", "scatter", "bar"];
    case "Continuity":
      return ["multi_line", "line", "area"];
    case "Uncertainty":
      return ["scatter", "hbar"];
    case "Consistency":
      return ["radar", "bar"];
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

const TOPO_ZH: Record<VisualTopology, string> = {
  Position: "落点",
  Continuity: "过程",
  Connection: "指向",
  Proximity: "关联",
  Alignment: "方位",
  Hierarchy: "层次",
  Salience: "显著",
  Ordering: "排序",
  Grouping: "分组",
  Consistency: "一致",
  Uncertainty: "不确定",
};

/** 对比页图卡底部：A / B 各自的左→右排列依据 */
export function chartOrderCaption(
  focus: TaskFocus,
  rich: boolean,
  hasExtend = false,
): string {
  if (!rich) {
    return hasExtend
      ? "左→右：问句贴合度，其后为相关扩展，可横滑"
      : "左→右：问句贴合度，高的在前";
  }
  const chain = DISPLAY_TOPOLOGY[focus]
    .slice(0, 5)
    .map((t) => TOPO_ZH[t])
    .join(" → ");
  return hasExtend
    ? `左→右：视觉拓扑覆盖（${chain}）；其后为相关扩展（补未覆盖拓扑），可横滑`
    : `左→右：视觉拓扑覆盖（${chain}）`;
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
  return Math.max(
    fitnessOf(slot.family, opts?.fitnessById),
    fitnessOf(slot.id, opts?.fitnessById),
  );
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
  secondary: ChartSlotDef[];
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
    .filter((slot) => !blockedForSide(slot, focus, false))
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
  if (!ranked.length) return { primary: [], secondary: [], spare: [] };
  const floor = ranked[0].score * KEEP_RATIO;
  const primary: ChartSlotDef[] = [];
  const spare: ChartSlotDef[] = [];
  const usedFamily = new Set<string>();
  const usedTopic = new Set<string>();
  for (const row of ranked) {
    if (
      primary.length < MAX_A &&
      row.score >= floor &&
      INTUITIVE_TYPES.includes(row.slot.type) &&
      !usedFamily.has(row.slot.family) &&
      !usedTopic.has(row.slot.topic)
    ) {
      takeSlot(row.slot, primary, usedFamily, usedTopic);
    } else {
      spare.push(row.slot);
    }
  }
  for (const row of ranked) {
    if (primary.length >= MAX_A) break;
    if (
      !INTUITIVE_TYPES.includes(row.slot.type) ||
      usedFamily.has(row.slot.family) ||
      usedTopic.has(row.slot.topic)
    ) {
      continue;
    }
    takeSlot(row.slot, primary, usedFamily, usedTopic);
  }
  return { primary, secondary: [], spare };
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

/** 同一问句：B 换图种加分；同图种则降权，但不禁止（Ordering 的 hbar 仍可保留） */
function typeAgainstA(
  slot: ChartSlotDef,
  aTypeByFamily: Map<string, ChartType>,
): number {
  const aType = aTypeByFamily.get(slot.family);
  if (!aType) return 1;
  if (aType === slot.type) return 0.62;
  return 1.28;
}

/** B：有 VMMP。问句可与 A 相同，图种按 M 拓扑优选，并尽量与 A 不同。 */
function coverByM(
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  opts?: ExtPickOptions,
  aPrimary: ChartSlotDef[] = [],
): RankedSide {
  const primary: ChartSlotDef[] = [];
  const usedFamily = new Set<string>();
  const usedTopic = new Set<string>();
  const usedTop = new Set<string>();
  const aTypeByFamily = new Map(aPrimary.map((s) => [s.family, s.type]));
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
    if (primary.length >= MAX_B) break;
    if (usedTop.has(top)) continue;
    const cands = eligible.filter(
      (slot) =>
        servesTopology(slot, top) &&
        !blockedForSide(slot, focus, true) &&
        !usedFamily.has(slot.family) &&
        !usedTopic.has(slot.topic),
    );
    if (!cands.length) continue;
    const scored = cands
      .map((slot) => {
        const fitness = familyFitness(slot, opts);
        const score =
          typeAgainstA(slot, aTypeByFamily) * coverScore(slot, top, fitness);
        return { slot, score, fitness };
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

  if (primary.length < MAX_B) {
    const rest = eligible
      .filter(
        (slot) =>
          !blockedForSide(slot, focus, true) &&
          !usedFamily.has(slot.family) &&
          !usedTopic.has(slot.topic),
      )
      .map((slot) => {
        const tf = typeFit(slot, true);
        const fit = familyFitness(slot, opts);
        return {
          slot,
          score:
            typeAgainstA(slot, aTypeByFamily) *
            tf *
            (0.6 + 0.4 * (fit / 100)),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.slot.id.localeCompare(b.slot.id),
      );
    for (const row of rest) {
      if (primary.length >= MAX_B) break;
      takeSlot(row.slot, primary, usedFamily, usedTopic);
    }
  }

  primary.sort(
    (a, b) =>
      displayIndex(focus, a) - displayIndex(focus, b) ||
      a.id.localeCompare(b.id),
  );

  const spare = eligible.filter(
    (slot) => !primary.some((p) => p.id === slot.id),
  );
  return { primary, secondary: [], spare };
}

function isExtendCandidate(slot: ChartSlotDef): boolean {
  return slot.layer === "extend" || LEFTOVER_EXTEND.has(slot.family);
}

/** A：高度带与落点重复；两侧都去掉圈心；B 威胁再去掉间隔 */
function blockedForSide(
  slot: ChartSlotDef,
  focus: TaskFocus,
  rich: boolean,
): boolean {
  if (slot.family === "cmp-zone-footprint") return true;
  if (!rich && slot.family === "cmp-alt-bands") return true;
  if (rich && focus === "threat" && slot.family === "cmp-hunt-range") {
    return true;
  }
  return false;
}

/** 下排：相关扩展。不重复上排 topic，不硬凑满。B 仍按 M 图种优选。 */
function pickExtend(
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  rich: boolean,
  primary: ChartSlotDef[],
  opts?: ExtPickOptions,
  aSlots: ChartSlotDef[] = [],
): ChartSlotDef[] {
  const usedFamily = new Set(primary.map((s) => s.family));
  const usedTopic = new Set(primary.map((s) => s.topic));
  const covered = new Set(primary.map((s) => s.primaryTopology));
  const aTypeByFamily = new Map(aSlots.map((s) => [s.family, s.type]));
  const cands = eligible.filter(
    (slot) =>
      isExtendCandidate(slot) &&
      !blockedForSide(slot, focus, rich) &&
      !usedFamily.has(slot.family) &&
      !usedTopic.has(slot.topic),
  );
  if (!cands.length) return [];

  const scored = cands
    .map((slot) => {
      const fitness = familyFitness(slot, opts);
      const uncovered = slot.topologies.some((t) => !covered.has(t)) ? 1.15 : 1;
      const tf = typeFit(slot, rich);
      const vsA = rich ? typeAgainstA(slot, aTypeByFamily) : 1;
      const llm = rich ? 1 : Math.max(0.35, llmFitOf(slot, focus));
      if (!rich && !INTUITIVE_TYPES.includes(slot.type)) {
        return { slot, score: 0, fitness };
      }
      const score =
        vsA * tf * llm * uncovered * (0.6 + 0.4 * (fitness / 100));
      return { slot, score, fitness };
    })
    .filter((row) => row.score >= COVER_MIN)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.fitness - a.fitness ||
        displayIndex(focus, a.slot) - displayIndex(focus, b.slot) ||
        a.slot.id.localeCompare(b.slot.id),
    );

  const out: ChartSlotDef[] = [];
  for (const row of scored) {
    if (out.length >= MAX_EXTEND) break;
    if (usedFamily.has(row.slot.family) || usedTopic.has(row.slot.topic)) {
      continue;
    }
    takeSlot(row.slot, out, usedFamily, usedTopic);
  }
  out.sort(
    (a, b) =>
      displayIndex(focus, a) - displayIndex(focus, b) ||
      a.id.localeCompare(b.id),
  );
  return out;
}

function withExtend(
  core: RankedSide,
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
  aSlots: ChartSlotDef[] = [],
): RankedSide {
  const secondary = pickExtend(
    eligible,
    focus,
    rich,
    core.primary,
    opts,
    aSlots,
  );
  const taken = new Set(
    [...core.primary, ...secondary].map((s) => s.id),
  );
  return {
    primary: core.primary,
    secondary,
    spare: eligible.filter((slot) => !taken.has(slot.id)),
  };
}

function rankPicks(
  eligible: ChartSlotDef[],
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): RankedSide {
  const main = eligible.filter((slot) => slot.layer !== "extend");
  const aCore = rankByLlm(main, focus, opts);
  const aFull = withExtend(aCore, eligible, focus, false, opts);
  if (!rich) return aFull;
  const bCore = coverByM(main, focus, opts, aFull.primary);
  return withExtend(bCore, eligible, focus, true, opts, flattenSide(aFull));
}

function sideRanked(
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): RankedSide {
  return rankPicks(taskReadySlots(focus, opts), focus, rich, opts);
}

function flattenSide(side: RankedSide): ChartSlotDef[] {
  return [...side.primary, ...side.secondary];
}

function pickWithoutVmmp(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): ChartSlotDef[] {
  return flattenSide(sideRanked(focus, false, opts));
}

function pickWithVmmp(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): ChartSlotDef[] {
  return flattenSide(sideRanked(focus, true, opts));
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
  const emptySide: RankedSide = { primary: [], secondary: [], spare: [] };
  const aSide = hasFitness ? sideRanked(focus, false, opts) : emptySide;
  const bSide = hasFitness ? sideRanked(focus, true, opts) : emptySide;
  const aFlat = flattenSide(aSide);
  const bFlat = flattenSide(bSide);
  const aPick = new Set(aFlat.map((s) => s.id));
  const bPick = new Set(bFlat.map((s) => s.id));
  const aSpareSet = new Set(aSide.spare.map((s) => s.id));
  const bSpareSet = new Set(bSide.spare.map((s) => s.id));
  const aRankOf = (id: string) => {
    const i = aFlat.findIndex((s) => s.id === id);
    return i >= 0 ? i + 1 : null;
  };
  const bRankOf = (id: string) => {
    const i = bFlat.findIndex((s) => s.id === id);
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
      else if (aOn) {
        const row = (aRank ?? 0) > MAX_A ? "下行" : "上行";
        note = `A · ${row}#${aRank} · ${slot.type}`;
      } else if (bOn) {
        const row = (bRank ?? 0) > MAX_B ? "下行" : "上行";
        note = `B · ${row}#${bRank} · ${slot.primaryTopology} · ${slot.type}`;
      }
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
  picks: ChartSlotDef[];
  secondary: ChartSlotDef[];
} {
  const tops = topologiesFromVmmp(focus);
  const whyByTop = new Map(tops.map((t) => [t.topology, t.why]));
  const ranked = sideRanked(focus, rich, opts);
  const picks = flattenSide(ranked);
  const ids = new Set(picks.map((s) => s.family));
  const whyById = new Map<string, string>();
  const typeByFamily = new Map<string, ChartType>();
  const primaryIds = new Set(ranked.primary.map((s) => s.id));

  picks.forEach((slot, index) => {
    const fit = familyFitness(slot, opts);
    const row = primaryIds.has(slot.id) ? "上行" : "下行";
    const rankNote = `${row}#${index + 1} · `;
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

  return { ids, whyById, typeByFamily, picks, secondary: ranked.secondary };
}
