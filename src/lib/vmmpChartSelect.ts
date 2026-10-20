/**
 * 对比页选图：常驻 A/B 共用；扩展由是否注入 VMMP 决定。
 *
 * - A（无 VMMP）：启发式「见空间就收」——优先散点类扩展，不看 M。
 * - B（有 VMMP）：只开放与 M 规则激活拓扑相交的扩展槽，再按
 *   「补尚未覆盖的 M 拓扑 + 图种相对常驻要新」贪心至多 3 张。
 *   选图好坏归因于 VMMP 的 M→T，而不是写死 A/B 名单。
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
    id: "cmp-axis-geometry",
    topologies: ["Alignment", "Connection"],
    type: "radar",
    shortLabel: "指向方位玫瑰",
    question: "轴线起终点落在哪些方位扇区？",
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

const MAX_EXTENSIONS = 3;

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

const WHY_A = "无 VMMP：启发式见空间就收（偏散点）";

export function catalogSlots(focus: TaskFocus): ChartSlotDef[] {
  return focus === "intent" ? INTENT_CHART_SLOTS : THREAT_CHART_SLOTS;
}

function extensionSlots(focus: TaskFocus): ChartSlotDef[] {
  return catalogSlots(focus).filter((s) => !s.resident);
}

function residentSlots(focus: TaskFocus): ChartSlotDef[] {
  return catalogSlots(focus).filter((s) => s.resident);
}

/**
 * A：无 VMMP — 不读 M。
 * 见空间就收：散点优先，再条/柱补数量；玫瑰（需 Alignment 比较）排最后，
 * 避免无范式偶发「碰巧」选到与 B 相同的比较图种。
 */
function pickExtensionsWithoutVmmp(focus: TaskFocus): string[] {
  const ext = extensionSlots(focus);
  const scatters = ext.filter((s) => s.type === "scatter");
  const bars = ext.filter(
    (s) =>
      s.type === "hbar" || s.type === "grouped_bar" || s.type === "bar",
  );
  const roses = ext.filter((s) => s.type === "radar");
  const rest = ext.filter(
    (s) =>
      s.type !== "scatter" &&
      s.type !== "radar" &&
      s.type !== "hbar" &&
      s.type !== "grouped_bar" &&
      s.type !== "bar",
  );
  return [...scatters, ...bars, ...rest, ...roses]
    .slice(0, MAX_EXTENSIONS)
    .map((s) => s.id);
}

/**
 * B：有 VMMP — 候选必须与 M 激活拓扑相交；
 * 贪心：优先补「尚未被常驻/已选覆盖」的 M 拓扑，并偏好相对常驻更新的图种。
 */
function pickExtensionsWithVmmp(focus: TaskFocus): string[] {
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

  const scoreOf = (slot: ChartSlotDef): number => {
    const mHits = slot.topologies.filter((t) => mSet.has(t));
    const novel = mHits.filter((t) => !covered.has(t));
    const typeNewVsResident = residentTypes.has(slot.type) ? 0 : 40;
    const typeNewVsSelected = selectedTypes.has(slot.type) ? 0 : 25;
    const stackCost = TYPE_STACK_COST[slot.type] ?? 10;
    return (
      novel.length * 100 +
      typeNewVsResident +
      typeNewVsSelected +
      mHits.length * 15 -
      stackCost
    );
  };

  while (selected.length < MAX_EXTENSIONS) {
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
    // 必须仍被 M 证明（mHits≥1 已在候选）；分数过低说明只是重复常驻
    if (!best || bestScore < 30) break;
    selected.push(best);
    selectedTypes.add(best.type);
    for (const t of best.topologies) covered.add(t);
  }

  return selected.map((s) => s.id);
}

/**
 * 扩展选图入口。
 * rich=true → 走 VMMP M→T；rich=false → 无范式启发式。
 */
export function extensionPickIds(
  focus: TaskFocus,
  rich: boolean,
): readonly string[] {
  return rich
    ? pickExtensionsWithVmmp(focus)
    : pickExtensionsWithoutVmmp(focus);
}

export function slotSelectionMatrix(focus: TaskFocus): {
  slot: ChartSlotDef;
  aOn: boolean;
  bOn: boolean;
  layer: "常驻" | "扩展池";
  note?: string;
}[] {
  const aPick = new Set(extensionPickIds(focus, false));
  const bPick = new Set(extensionPickIds(focus, true));
  return catalogSlots(focus).map((slot) => {
    if (slot.resident) {
      return { slot, aOn: true, bOn: true, layer: "常驻" as const };
    }
    const aOn = aPick.has(slot.id);
    const bOn = bPick.has(slot.id);
    let note: string | undefined;
    if (aOn && !bOn) note = "A 启发式";
    else if (bOn && !aOn) note = "B·M 激活";
    else if (aOn && bOn) note = "双方都选";
    else note = "M 未命中 / 未入选";
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
): { ids: Set<string>; whyById: Map<string, string> } {
  const slots = catalogSlots(focus);
  const tops = topologiesFromVmmp(focus);
  const topSet = new Set(tops.map((t) => t.topology));
  const whyByTop = new Map(tops.map((t) => [t.topology, t.why]));
  const extPick = new Set(extensionPickIds(focus, rich));

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
    if (rich) {
      const hit = slot.topologies.find((t) => topSet.has(t));
      whyById.set(
        slot.id,
        hit
          ? `VMMP · ${whyByTop.get(hit)} ⇒ ${slot.type}`
          : `VMMP · M 命中 ⇒ ${slot.type}`,
      );
    } else {
      whyById.set(slot.id, `A 选 · ${WHY_A} ⇒ ${slot.type}`);
    }
  }
  return { ids, whyById };
}
