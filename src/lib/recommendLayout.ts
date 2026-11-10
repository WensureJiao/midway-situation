/**
 * 工作模式推荐：规则先判，LLM 只在拿不准时从白名单投票。
 * 不生成排版，只返回 map_dominant / space_first / chart_dominant。
 */
import { LAYOUT_TEMPLATES, isSwitchableLayout } from "./layoutTemplates";
import type { LayoutTemplateId } from "./layoutTemplates";
import type { SituationViewSpec, TaskFocus } from "./types";

export type LayoutSource = "rule" | "llm" | "default";

export type LayoutChoice = {
  id: LayoutTemplateId;
  reason: string;
  source: LayoutSource;
};

function cueText(spec: SituationViewSpec): string {
  return [
    spec.title,
    spec.phase_label,
    spec.narrative,
    ...(spec.slots?.axes ?? []).map((a) => a.label ?? `${a.from}→${a.to}`),
    ...(spec.map?.axes ?? []).map((a) => a.label ?? ""),
    ...(spec.threat_ratings ?? []).map((r) => `${r.target} ${r.evidence}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function layoutHint(id: LayoutTemplateId): string {
  return LAYOUT_TEMPLATES[id].hint;
}

/** 规则基线。confident=false 时允许 LLM 投票。 */
export function layoutFromRules(
  taskFocus: TaskFocus,
  spec: SituationViewSpec,
): LayoutChoice & { confident: boolean } {
  const text = cueText(spec);
  const axisCount =
    spec.slots?.axes?.length || spec.map?.axes?.length || 0;
  const zoneCount =
    spec.slots?.zones?.length || spec.map?.threat_zones?.length || 0;
  const ratingCount = spec.threat_ratings?.length || 0;

  const spatialCue =
    /在哪|定位|队形|指向|朝哪|活动区|落点|方位|对准|空间/.test(text) ||
    axisCount >= 2 ||
    (taskFocus === "intent" && axisCount >= 1);
  const evidenceCue =
    /谁更|优先级|比较|是否支持|交叉|威胁更高|排序|并读/.test(text) ||
    (taskFocus === "threat" && ratingCount >= 4);

  if (spatialCue && !evidenceCue) {
    return {
      id: "space_first",
      reason: "当前问题以定位、指向和空间关系为主",
      source: "rule",
      confident: axisCount >= 1 || zoneCount >= 1,
    };
  }
  if (evidenceCue && !spatialCue) {
    return {
      id: "chart_dominant",
      reason: "当前问题以比较证据、验证结论为主",
      source: "rule",
      confident: ratingCount >= 3 || taskFocus === "threat",
    };
  }
  if (spatialCue && evidenceCue) {
    return {
      id: "map_dominant",
      reason: "空间与证据都需要，先用总览建立印象",
      source: "rule",
      confident: false,
    };
  }
  return {
    id: "map_dominant",
    reason: "先建立整体印象，再按需深入空间或证据",
    source: "rule",
    confident: true,
  };
}

export function resolveRecommendedLayout(
  taskFocus: TaskFocus,
  spec: SituationViewSpec,
): LayoutChoice {
  const rule = layoutFromRules(taskFocus, spec);
  const llmId = spec.slots?.layout ?? spec.layout_id;
  const llmReason = (spec.slots?.layout_reason ?? spec.layout_reason ?? "").trim();

  if (rule.confident) {
    return { id: rule.id, reason: rule.reason, source: "rule" };
  }
  if (isSwitchableLayout(llmId)) {
    return {
      id: llmId,
      reason: llmReason || layoutHint(llmId),
      source: "llm",
    };
  }
  return {
    id: rule.id,
    reason: rule.reason,
    source: "default",
  };
}

export function applyLayoutChoice(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
): SituationViewSpec {
  const choice = resolveRecommendedLayout(taskFocus, spec);
  return {
    ...spec,
    layout_id: choice.id,
    layout_reason: choice.reason,
    layout_source: choice.source,
  };
}

/** A/B 对照必须共用一种阅读方式；推荐不一致则回落总览。 */
export function layoutForComparePair(
  taskFocus: TaskFocus,
  a?: SituationViewSpec | null,
  b?: SituationViewSpec | null,
): LayoutChoice {
  const ca = a ? resolveRecommendedLayout(taskFocus, a) : null;
  const cb = b ? resolveRecommendedLayout(taskFocus, b) : null;
  if (ca && cb && ca.id !== cb.id) {
    return {
      id: "map_dominant",
      reason: "A/B 推荐不一致，用总览公平对照",
      source: "default",
    };
  }
  return (
    cb ??
    ca ?? {
      id: "map_dominant",
      reason: layoutHint("map_dominant"),
      source: "default",
    }
  );
}
