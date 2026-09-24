import type { SituationViewSpec, TaskFocus } from "./types";

export const THREAT_E_CRITERIA = [
  { id: "SpatialFit", label: "空间关系是否清楚" },
  { id: "ComparisonFit", label: "多目标能否比较" },
  { id: "AggregationFit", label: "多因素是否聚合" },
  { id: "HierarchyFit", label: "威胁等级层次" },
  { id: "ScreeningFit", label: "关键目标能否筛出" },
  { id: "RankingFit", label: "优先级是否清晰" },
  { id: "UncertaintyFit", label: "不确定性表达" },
  { id: "ConsistencyFit", label: "跨视图一致性" },
] as const;

export const INTENT_E_CRITERIA = [
  { id: "SpatialFit", label: "位置/方向是否清楚" },
  { id: "TemporalFit", label: "时间过程是否连续" },
  { id: "RelationFit", label: "关系是否说清" },
  { id: "ComparisonFit", label: "模式能否比较" },
  { id: "EvidenceFit", label: "证据与结论是否对上" },
  { id: "SequenceFit", label: "认知顺序是否合理" },
  { id: "UncertaintyFit", label: "不确定性表达" },
  { id: "ConsistencyFit", label: "跨视图一致性" },
] as const;

export type ECriterionId =
  | (typeof THREAT_E_CRITERIA)[number]["id"]
  | (typeof INTENT_E_CRITERIA)[number]["id"];

const LEVEL_ORDER: Record<string, number> = {
  紧急: 0,
  高: 1,
  "高（发现链）": 1,
  中: 2,
  "中至低": 3,
  低: 4,
  "无/不适用": 5,
};

export function levelSortKey(level: string): number {
  if (LEVEL_ORDER[level] != null) return LEVEL_ORDER[level];
  if (level.includes("紧急")) return 0;
  if (level.includes("高")) return 1;
  if (level.includes("中")) return 2;
  if (level.includes("低")) return 4;
  return 3;
}

export function sortedThreatRatings(spec: SituationViewSpec) {
  return [...(spec.threat_ratings ?? [])].sort(
    (a, b) => levelSortKey(a.level) - levelSortKey(b.level),
  );
}

export function quizForFocus(focus: TaskFocus, sliceId: string): string {
  if (focus === "threat") {
    return `【小题·威胁】在 ${sliceId}，从红方（美）视角，当前最高优先级威胁目标前三是谁？先看图再作答（可写在纸上/笔记）。`;
  }
  return `【小题·意图】在 ${sliceId}，南云主要作战指向哪里？当前更接近哪一阶段（集结/搜索/危机/残局/终局）？有无佯动分兵迹象？`;
}

/**
 * 五拍战役节拍：对齐 T1→T193 切片设计。
 * inferCampaignPhase 保留为三档兼容别名（危机/残局/终局 → 接触）。
 */
export function inferCampaignPhase(
  packPhase: string,
  spec: SituationViewSpec,
): "集结" | "搜索" | "接触" {
  const beat = inferCampaignBeat(packPhase, spec);
  if (beat === "集结") return "集结";
  if (beat === "搜索") return "搜索";
  return "接触";
}

/** 五拍战役节拍：对齐 T1→T193 切片设计，避免后半段全挤成「接触」 */
export type CampaignBeat = "集结" | "搜索" | "危机" | "残局" | "终局";

export const CAMPAIGN_BEAT_CODE: Record<CampaignBeat, number> = {
  集结: 1,
  搜索: 2,
  危机: 3,
  残局: 4,
  终局: 5,
};

export const CAMPAIGN_BEAT_LABEL: Record<number, string> = {
  1: "集结",
  2: "搜索",
  3: "危机",
  4: "残局",
  5: "终局",
};

/**
 * 按切片 phase_label 推断节拍。
 * 注意：当前 A/B 的 phase_label 文案基本同构，节拍图通常不随范式变化。
 */
export function inferCampaignBeat(
  packPhase: string,
  spec: SituationViewSpec,
): CampaignBeat {
  const label = `${packPhase} ${spec.phase_label ?? ""}`.trim();

  if (/终局|终结|战果/.test(label)) return "终局";
  if (/残局|猎杀/.test(label)) return "残局";
  if (/机库危机|危机|交战|接触窗|突击/.test(label)) return "危机";
  if (/搜索|侦察|广域/.test(label)) return "搜索";
  if (/集结|初始|展开|机动部队/.test(label)) return "集结";

  const narrative = String(spec.narrative ?? "")
    .replace(/尚未接触|未接触|非接触|无直接交火|无交火/g, " ")
    .replace(/打击重心|打击窗口|准备打击|有效打击/g, " ");
  const text = `${label} ${narrative}`;
  if (/终局|终结/.test(text)) return "终局";
  if (/残局|猎杀/.test(text)) return "残局";
  if (/交火|弹幕|机库/.test(text)) return "危机";
  if (/搜索|侦察|水侦|PBY/.test(text)) return "搜索";
  return "集结";
}

export type SpecDiff = {
  highlightOnlyA: string[];
  highlightOnlyB: string[];
  axesA: string[];
  axesB: string[];
  zonesA: string[];
  zonesB: string[];
  ratingOrderA: string[];
  ratingOrderB: string[];
  summaryLines: string[];
};

function setDiff(a: string[], b: string[]) {
  const sb = new Set(b);
  const sa = new Set(a);
  return {
    onlyA: a.filter((x) => !sb.has(x)),
    onlyB: b.filter((x) => !sa.has(x)),
  };
}

export function diffSpecs(
  a: SituationViewSpec,
  b: SituationViewSpec,
  focus: TaskFocus = "threat",
): SpecDiff {
  const ha = a.map.highlight_names ?? [];
  const hb = b.map.highlight_names ?? [];
  const { onlyA: highlightOnlyA, onlyB: highlightOnlyB } = setDiff(ha, hb);

  const axesA = (a.map.axes ?? []).map((x) => x.label);
  const axesB = (b.map.axes ?? []).map((x) => x.label);
  const zonesA = (a.map.threat_zones ?? []).map(
    (z) => `${z.label}(${z.level})`,
  );
  const zonesB = (b.map.threat_zones ?? []).map(
    (z) => `${z.label}(${z.level})`,
  );
  const ratingOrderA = sortedThreatRatings(a).map(
    (r) => `${r.level}:${r.target}`,
  );
  const ratingOrderB = sortedThreatRatings(b).map(
    (r) => `${r.level}:${r.target}`,
  );

  const summaryLines: string[] = [];
  if (highlightOnlyA.length || highlightOnlyB.length) {
    summaryLines.push(
      `高亮差集：仅A有 [${highlightOnlyA.join("、") || "无"}]；仅B有 [${highlightOnlyB.join("、") || "无"}]`,
    );
  } else {
    summaryLines.push("高亮名单：A/B 相同");
  }
  if (axesA.join("|") !== axesB.join("|")) {
    summaryLines.push(
      `轴线/指向：A「${axesA.join("；") || "无"}」↔ B「${axesB.join("；") || "无"}」`,
    );
  } else {
    summaryLines.push(`轴线标签：相同（${axesA.join("；") || "无"}）`);
  }

  if (focus === "intent") {
    const beatA = inferCampaignBeat("", a);
    const beatB = inferCampaignBeat("", b);
    if (beatA !== beatB || a.phase_label !== b.phase_label) {
      summaryLines.push(
        `阶段：A「${beatA}/${a.phase_label}」↔ B「${beatB}/${b.phase_label}」`,
      );
    } else {
      summaryLines.push(`阶段判断：相同（${beatA}）`);
    }
    if (zonesA.join("|") !== zonesB.join("|")) {
      summaryLines.push(
        `活动区：A「${zonesA.join("；") || "无"}」↔ B「${zonesB.join("；") || "无"}」`,
      );
    }
  } else {
    if (zonesA.join("|") !== zonesB.join("|")) {
      summaryLines.push(
        `威胁圈：A「${zonesA.join("；") || "无"}」↔ B「${zonesB.join("；") || "无"}」`,
      );
    } else {
      summaryLines.push(`威胁圈：相同或近似（${zonesA.length} 个）`);
    }
    if (ratingOrderA.join("|") !== ratingOrderB.join("|")) {
      summaryLines.push(
        `威胁排序前部：A「${ratingOrderA.slice(0, 3).join(" → ")}」↔ B「${ratingOrderB.slice(0, 3).join(" → ")}」`,
      );
    } else {
      summaryLines.push("威胁等级列表顺序：A/B 相同或高度相似");
    }
  }

  if (a.title !== b.title) {
    summaryLines.push(`标题：A「${a.title}」↔ B「${b.title}」`);
  }

  return {
    highlightOnlyA,
    highlightOnlyB,
    axesA,
    axesB,
    zonesA,
    zonesB,
    ratingOrderA,
    ratingOrderB,
    summaryLines,
  };
}

export function intentEvidenceItems(spec: SituationViewSpec) {
  const items: { kind: string; text: string }[] = [];
  for (const ax of spec.map.axes ?? []) {
    items.push({ kind: "方向", text: ax.label });
  }
  for (const name of (spec.map.highlight_names ?? []).slice(0, 4)) {
    items.push({ kind: "关键实体", text: name });
  }
  for (const z of (spec.map.threat_zones ?? []).slice(0, 2)) {
    items.push({ kind: "活动区", text: `${z.label}（${z.level}）` });
  }
  // 叙述另作阅读材料挂在末尾，不计入「证据构成」图的种类占比
  // （几乎每侧都有 narrative，计入后恒为 1，对 A/B 无区分度）
  const mapItems = items.slice(0, 7);
  if (spec.narrative?.trim()) {
    mapItems.push({ kind: "叙述", text: spec.narrative.trim() });
  }
  return mapItems;
}

export function meanScores(scores: Record<string, number>): number | null {
  const vals = Object.values(scores).filter((n) => n >= 1 && n <= 5);
  if (!vals.length) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}
