/**
 * 从 VMMP 的 M（认知—视觉映射）与 T（视觉拓扑）推导统计图选图。
 * 本地 / 无范式：只出「常驻」图种；有范式：常驻 + 精选扩展。
 *
 * 意图扩展只保留两类证据图（对齐 Comparative→Alignment 雷达、Associative→Connection 饼）：
 * - 证据构成 pie
 * - 证据维度轮廓 radar
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

/** 该任务 M 规则激活的视觉拓扑 + 简短依据 */
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
};

/** 意图扩展：证据构成（饼）+ 证据维度轮廓（雷达） */
export const INTENT_CHART_SLOTS: ChartSlotDef[] = [
  {
    id: "cmp-intent-evidence",
    topologies: ["Connection"],
    type: "pie",
  },
  {
    id: "cmp-intent-evidence-radar",
    topologies: ["Alignment", "Consistency"],
    type: "radar",
  },
];

/** 威胁常驻：排序/登陆散点/等级柱；方位雷达为扩展（仅 B） */
export const THREAT_CHART_SLOTS: ChartSlotDef[] = [
  {
    id: "cmp-threat-rank",
    topologies: ["Ordering", "Salience"],
    resident: true,
    type: "hbar",
  },
  {
    id: "cmp-force-landing",
    topologies: ["Position"],
    resident: true,
    type: "scatter",
  },
  {
    id: "cmp-force-bearing",
    topologies: ["Position", "Alignment"],
    type: "radar",
  },
  {
    id: "cmp-threat-level-bar",
    topologies: ["Alignment", "Hierarchy", "Grouping"],
    resident: true,
    type: "bar",
  },
];

export function isResidentChartId(focus: TaskFocus, id: string): boolean {
  const slots = focus === "intent" ? INTENT_CHART_SLOTS : THREAT_CHART_SLOTS;
  return Boolean(slots.find((s) => s.id === id)?.resident);
}

export function selectChartSlotIds(
  focus: TaskFocus,
  rich: boolean,
): { ids: Set<string>; whyById: Map<string, string> } {
  const slots = focus === "intent" ? INTENT_CHART_SLOTS : THREAT_CHART_SLOTS;
  const tops = topologiesFromVmmp(focus);
  const topSet = new Set(tops.map((t) => t.topology));
  const whyByTop = new Map(tops.map((t) => [t.topology, t.why]));

  const ids = new Set<string>();
  const whyById = new Map<string, string>();

  for (const slot of slots) {
    if (!rich) {
      if (slot.resident) {
        ids.add(slot.id);
        whyById.set(slot.id, "常驻图种（本地 / 无范式）");
      }
      continue;
    }
    if (slot.resident) {
      ids.add(slot.id);
      const hit = slot.topologies.find((t) => topSet.has(t));
      const mWhy = hit ? whyByTop.get(hit) : undefined;
      whyById.set(
        slot.id,
        mWhy
          ? `常驻 · ${mWhy} ⇒ ${slot.type}`
          : `常驻图种 · ${slot.type}`,
      );
      continue;
    }
    const hit = slot.topologies.find((t) => topSet.has(t));
    if (hit) {
      ids.add(slot.id);
      whyById.set(
        slot.id,
        `${whyByTop.get(hit) ?? hit} ⇒ ${slot.type}`,
      );
    }
  }
  return { ids, whyById };
}
