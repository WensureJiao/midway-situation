/**
 * 对比页选图：常驻 A/B 共用；扩展由是否注入 VMMP + 本片数据适切度决定。
 *
 * - A（无 VMMP）：启发式偏散点；不看 M；张数更少（至多 2），适切度不够就不凑。
 * - B（有 VMMP）：候选须与 M 拓扑相交；再按「新颖拓扑 + 图种成本 + 本片适切度」
 *   贪心，至多 3 张，但不必凑满——弱图直接丢掉。
 * - 跨切片名单应随兵力/高亮/在空分布变化，而不是 A 永远一套、B 永远另一套。
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

export function topologiesFromVmmp(focus: TaskFocus): {
  topology: string;
  why: string;
}[] {
  const out: { topology: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const rule of loadMRules(focus)) {
    const rel =
      asList(rule.relation).join("/") || rule.cognitive_element || "?";
    const op = asList(rule.operation).join("/") || "?";
    for (const t of rule.visual_topology ?? []) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({
        topology: t,
        why: `M：${rel}+${op} → ${t}`,
      });
    }
  }
  return out;
}

export type ChartSlotDef = {
  id: string;
  topologies: VisualTopology[];
  resident?: boolean;
  type: ChartType;
  question: string;
  shortLabel: string;
};

/** 意图：常驻散点+饼；扩展候选池 */
export const INTENT_CHART_SLOTS: ChartSlotDef[] = [
  {
    id: "cmp-force-landing",
    topologies: ["Position"],
    resident: true,
    type: "scatter",
    shortLabel: "分布散点",
    question: "敌我水面相对中途岛落在哪？",
  },
  {
    id: "cmp-intent-evidence",
    topologies: ["Connection"],
    resident: true,
    type: "pie",
    shortLabel: "证据构成饼",
    question: "Direction / Entity / Zone 条目占比？",
  },
  {
    id: "cmp-force-bearing",
    topologies: ["Position", "Alignment"],
    type: "radar",
    shortLabel: "方位玫瑰",
    question: "相对岛，敌我方位扇区如何分布？",
  },
  {
    id: "cmp-alt-bands",
    topologies: ["Grouping", "Hierarchy"],
    type: "grouped_bar",
    shortLabel: "在空高度带",
    question: "美/日在空兵力落在哪些高度带？",
  },
  {
    id: "cmp-highlight-range",
    topologies: ["Proximity", "Salience"],
    type: "hbar",
    shortLabel: "高亮距岛阶梯",
    question: "高亮实体距中途岛各多少海里？",
  },
  {
    id: "cmp-evidence-focus",
    topologies: ["Position", "Salience"],
    type: "scatter",
    shortLabel: "证据聚焦散点",
    question: "高亮实体/圈心相对岛在哪？",
  },
];

/** 威胁：常驻排序+散点+等级柱；扩展候选池 */
export const THREAT_CHART_SLOTS: ChartSlotDef[] = [
  {
    id: "cmp-threat-rank",
    topologies: ["Ordering", "Salience"],
    resident: true,
    type: "hbar",
    shortLabel: "威胁排序",
    question: "谁最急、优先打谁？",
  },
  {
    id: "cmp-force-landing",
    topologies: ["Position"],
    resident: true,
    type: "scatter",
    shortLabel: "分布散点",
    question: "敌我水面相对中途岛落在哪？",
  },
  {
    id: "cmp-threat-level-bar",
    topologies: ["Alignment", "Hierarchy", "Grouping"],
    resident: true,
    type: "bar",
    shortLabel: "等级分布",
    question: "紧急/高/中/低是否拉开层次？",
  },
  {
    id: "cmp-force-bearing",
    topologies: ["Position", "Alignment"],
    type: "radar",
    shortLabel: "方位玫瑰",
    question: "相对岛，敌我方位扇区如何分布？",
  },
  {
    id: "cmp-alt-bands",
    topologies: ["Grouping", "Hierarchy"],
    type: "grouped_bar",
    shortLabel: "在空高度带",
    question: "美/日在空兵力落在哪些高度带？",
  },
  {
    id: "cmp-hunt-range",
    topologies: ["Proximity", "Alignment"],
    type: "hbar",
    shortLabel: "关联距离阶梯",
    question: "本片关联间隔各多少海里？（高亮优先；色分远近含义）",
  },
  {
    id: "cmp-air-profile",
    topologies: ["Position", "Proximity"],
    type: "scatter",
    shortLabel: "在空剖面",
    question: "在空飞机相对岛的东向×高度？",
  },
];

/** B 至多 3；A 至多 2——都不强行凑满 */
const MAX_EXTENSIONS_B = 3;
const MAX_EXTENSIONS_A = 2;

/** 本片适切度低于此值，直接不入选（哪怕拓扑命中） */
const MIN_FITNESS = 38;

/** 图种「堆叠成本」：无范式更爱散点；有范式时散点成本高，避免叠床架屋 */
const TYPE_STACK_COST: Partial<Record<ChartType, number>> = {
  scatter: 25,
  heatmap: 15,
  pie: 10,
  bar: 8,
  hbar: 6,
  grouped_bar: 4,
  radar: 0,
  line: 12,
  multi_line: 12,
  area: 12,
  sankey: 10,
};

/** 任务主链加分：对准方位/距离比较；剖面类扩展不加 */
const TASK_CHAIN_BONUS: Partial<Record<string, number>> = {
  "cmp-force-bearing": 28,
  "cmp-highlight-range": 18,
  "cmp-hunt-range": 18,
  "cmp-alt-bands": 6,
  "cmp-air-profile": -12,
  "cmp-evidence-focus": -8,
};

const WHY_A = "无 VMMP：启发式见空间就收（偏散点）";

export type ExtPickOptions = {
  /** 本片各扩展图数据适切度 0–100；缺省或未给出的 id 视为 0 */
  fitnessById?: ReadonlyMap<string, number> | Record<string, number>;
};

function fitnessOf(
  id: string,
  fitnessById?: ExtPickOptions["fitnessById"],
): number {
  if (!fitnessById) return 0;
  if (fitnessById instanceof Map) return fitnessById.get(id) ?? 0;
  return fitnessById[id] ?? 0;
}

export function catalogSlots(focus: TaskFocus): ChartSlotDef[] {
  return focus === "intent" ? INTENT_CHART_SLOTS : THREAT_CHART_SLOTS;
}

function extensionSlots(focus: TaskFocus): ChartSlotDef[] {
  return catalogSlots(focus).filter((s) => !s.resident);
}

function residentSlots(focus: TaskFocus): ChartSlotDef[] {
  return catalogSlots(focus).filter((s) => s.resident);
}

function heuristicRank(slot: ChartSlotDef): number {
  if (slot.type === "scatter") return 400;
  if (
    slot.type === "hbar" ||
    slot.type === "grouped_bar" ||
    slot.type === "bar"
  ) {
    return 200;
  }
  if (slot.type === "radar") return 0;
  return 100;
}

/**
 * A：无 VMMP — 不读 M。
 * 散点优先，但必须本片适切度够；至多 2 张，不凑满。
 */
function pickExtensionsWithoutVmmp(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): string[] {
  const ranked = extensionSlots(focus)
    .map((slot) => {
      const fit = fitnessOf(slot.id, opts?.fitnessById);
      if (fit < MIN_FITNESS) return null;
      return { slot, score: heuristicRank(slot) + fit };
    })
    .filter((x): x is { slot: ChartSlotDef; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score || a.slot.id.localeCompare(b.slot.id));

  const selected: string[] = [];
  let best = 0;
  for (const row of ranked) {
    if (selected.length >= MAX_EXTENSIONS_A) break;
    // 相对首张过弱则停，避免为凑数硬塞第二张
    if (selected.length && row.score < best * 0.62) break;
    if (!selected.length) best = row.score;
    selected.push(row.slot.id);
  }
  return selected;
}

/**
 * B：有 VMMP — 候选必须与 M 激活拓扑相交；
 * 贪心补新颖拓扑，但乘以本片适切度；弱图不入选，不必凑满 3。
 */
function pickExtensionsWithVmmp(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): string[] {
  const tops = topologiesFromVmmp(focus);
  const mSet = new Set(tops.map((t) => t.topology));
  if (!mSet.size) return [];

  const residents = residentSlots(focus);
  const covered = new Set<string>();
  const residentTypes = new Set<ChartType>();
  for (const s of residents) {
    residentTypes.add(s.type);
    for (const t of s.topologies) covered.add(t);
  }

  const candidates = extensionSlots(focus).filter((s) =>
    s.topologies.some((t) => mSet.has(t)),
  );

  const selected: ChartSlotDef[] = [];
  const selectedTypes = new Set<ChartType>();
  let firstScore = 0;

  const scoreOf = (slot: ChartSlotDef): number => {
    const fit = fitnessOf(slot.id, opts?.fitnessById);
    if (fit < MIN_FITNESS) return -Infinity;
    const mHits = slot.topologies.filter((t) => mSet.has(t));
    const novel = mHits.filter((t) => !covered.has(t));
    const typeNewVsResident = residentTypes.has(slot.type) ? 0 : 40;
    const typeNewVsSelected = selectedTypes.has(slot.type) ? 0 : 25;
    const stackCost = TYPE_STACK_COST[slot.type] ?? 10;
    const chain = TASK_CHAIN_BONUS[slot.id] ?? 0;
    // 适切度权重高：同拓扑下本片有内容的图胜出
    return (
      novel.length * 100 +
      typeNewVsResident +
      typeNewVsSelected +
      mHits.length * 15 -
      stackCost +
      chain +
      fit * 1.35
    );
  };

  while (selected.length < MAX_EXTENSIONS_B) {
    let best: ChartSlotDef | null = null;
    let bestScore = -Infinity;
    for (const slot of candidates) {
      if (selected.some((s) => s.id === slot.id)) continue;
      const sc = scoreOf(slot);
      if (sc > bestScore) {
        bestScore = sc;
        best = slot;
      }
    }
    if (!best || !Number.isFinite(bestScore) || bestScore < 55) break;
    // 第 2 张须仍接近主图；第 3 张门坎更高——避免为凑满三张硬塞高度带等辅图
    if (selected.length === 1 && bestScore < firstScore * 0.62) break;
    if (selected.length >= 2 && bestScore < firstScore * 0.78) break;
    if (!selected.length) firstScore = bestScore;
    selected.push(best);
    selectedTypes.add(best.type);
    for (const t of best.topologies) covered.add(t);
  }

  return selected.map((s) => s.id);
}

/**
 * 扩展选图入口。
 * rich=true → 走 VMMP M→T + 适切度；rich=false → 无范式启发式 + 适切度。
 * 不传 fitness 时扩展为空（避免再回到「跨片固定三张」）。
 */
export function extensionPickIds(
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): readonly string[] {
  return rich
    ? pickExtensionsWithVmmp(focus, opts)
    : pickExtensionsWithoutVmmp(focus, opts);
}

export function slotSelectionMatrix(
  focus: TaskFocus,
  opts?: ExtPickOptions,
): {
  slot: ChartSlotDef;
  aOn: boolean;
  bOn: boolean;
  layer: "常驻" | "扩展池";
  note?: string;
}[] {
  const hasFitness = Boolean(opts?.fitnessById);
  const aPick = new Set(
    hasFitness ? extensionPickIds(focus, false, opts) : [],
  );
  const bPick = new Set(hasFitness ? extensionPickIds(focus, true, opts) : []);
  const mSet = new Set(topologiesFromVmmp(focus).map((t) => t.topology));

  return catalogSlots(focus).map((slot) => {
    if (slot.resident) {
      return { slot, aOn: true, bOn: true, layer: "常驻" as const };
    }
    const mHit = slot.topologies.some((t) => mSet.has(t));
    const fit = fitnessOf(slot.id, opts?.fitnessById);
    if (!hasFitness) {
      return {
        slot,
        aOn: false,
        bOn: false,
        layer: "扩展池" as const,
        note: mHit
          ? "B 可考（待本片适切度）"
          : "B M 未命中；A 视适切度",
      };
    }
    const aOn = aPick.has(slot.id);
    const bOn = bPick.has(slot.id);
    let note: string | undefined;
    if (aOn && !bOn) note = `A 入选 · 适切 ${Math.round(fit)}`;
    else if (bOn && !aOn) note = `B 入选 · 适切 ${Math.round(fit)}`;
    else if (aOn && bOn) note = `双方 · 适切 ${Math.round(fit)}`;
    else if (fit < MIN_FITNESS) note = `适切不足（${Math.round(fit)}）`;
    else if (!mHit) note = "B M 未命中";
    else note = "未入选";
    return { slot, aOn, bOn, layer: "扩展池" as const, note };
  });
}

export function extensionChartIds(focus: TaskFocus): string[] {
  return extensionSlots(focus).map((s) => s.id);
}

export function isResidentChartId(focus: TaskFocus, id: string): boolean {
  return Boolean(catalogSlots(focus).find((s) => s.id === id)?.resident);
}

export function selectChartSlotIds(
  focus: TaskFocus,
  rich: boolean,
  opts?: ExtPickOptions,
): { ids: Set<string>; whyById: Map<string, string> } {
  const slots = catalogSlots(focus);
  const tops = topologiesFromVmmp(focus);
  const topSet = new Set(tops.map((t) => t.topology));
  const whyByTop = new Map(tops.map((t) => [t.topology, t.why]));
  const extPick = new Set(extensionPickIds(focus, rich, opts));

  const ids = new Set<string>();
  const whyById = new Map<string, string>();

  for (const slot of slots) {
    if (slot.resident) {
      ids.add(slot.id);
      if (rich) {
        const hit = slot.topologies.find((t) => topSet.has(t));
        whyById.set(
          slot.id,
          hit
            ? `常驻 · ${whyByTop.get(hit)} ⇒ ${slot.type}`
            : `常驻 · ${slot.type}`,
        );
      } else {
        whyById.set(slot.id, "常驻（A/B 共用）");
      }
      continue;
    }
    if (!extPick.has(slot.id)) continue;
    ids.add(slot.id);
    const fit = fitnessOf(slot.id, opts?.fitnessById);
    const fitNote = Number.isFinite(fit) ? ` · 适切${Math.round(fit)}` : "";
    if (rich) {
      const hit = slot.topologies.find((t) => topSet.has(t));
      whyById.set(
        slot.id,
        hit
          ? `VMMP · ${whyByTop.get(hit)} ⇒ ${slot.type}${fitNote}`
          : `VMMP · M 命中 ⇒ ${slot.type}${fitNote}`,
      );
    } else {
      whyById.set(slot.id, `A 选 · ${WHY_A} ⇒ ${slot.type}${fitNote}`);
    }
  }
  return { ids, whyById };
}
