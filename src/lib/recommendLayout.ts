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
  /** 一行摘要，供顶栏展示 */
  reason: string;
  /** 悬停详述：依据、模式含义、阅读建议 */
  detail?: string;
  source: LayoutSource;
};

function sourceLabel(source: LayoutSource): string {
  if (source === "llm") return "模型建议";
  if (source === "rule") return "规则推荐";
  return "默认回落";
}

function buildDetail(
  id: LayoutTemplateId,
  reason: string,
  source: LayoutSource,
  facts: string[],
): string {
  const mode = LAYOUT_TEMPLATES[id];
  const lines = [
    `推荐模式：${mode.labelZh}（${mode.shortLabel}）`,
    `判定来源：${sourceLabel(source)}`,
    `选用理由：${reason}`,
  ];
  if (facts.length) lines.push(`依据：${facts.join("；")}`);
  lines.push(`阅读方式：${mode.hint}`);
  return lines.join("\n");
}

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
  const taskName = taskFocus === "intent" ? "意图研判" : "威胁分析";

  const spatialCue =
    /在哪|位于何处|定位|队形|指向|朝哪|活动区|落点|方位|对准|空间|距离|分布/.test(
      text,
    ) ||
    axisCount >= 2 ||
    (taskFocus === "intent" && axisCount >= 1);
  const evidenceCue =
    /谁更|优先级|比较|是否支持|交叉|威胁更高|威胁程度|排序|并读|证据充分/.test(
      text,
    ) || (taskFocus === "threat" && ratingCount >= 4);

  const facts = [
    `任务=${taskName}`,
    `作战轴 ${axisCount} 条`,
    `关注圈 ${zoneCount} 个`,
    `威胁评级 ${ratingCount} 条`,
    spatialCue ? "检出空间线索" : "空间线索弱",
    evidenceCue ? "检出证据/比较线索" : "证据比较线索弱",
  ];

  if (spatialCue && !evidenceCue) {
    const reason = "当前问题以定位、指向和空间关系为主";
    return {
      id: "space_first",
      reason,
      detail: buildDetail("space_first", reason, "rule", facts),
      source: "rule",
      confident: axisCount >= 1 || zoneCount >= 1,
    };
  }
  if (evidenceCue && !spatialCue) {
    const reason = "当前问题以比较证据、验证结论为主";
    return {
      id: "chart_dominant",
      reason,
      detail: buildDetail("chart_dominant", reason, "rule", facts),
      source: "rule",
      confident: ratingCount >= 3 || taskFocus === "threat",
    };
  }
  if (spatialCue && evidenceCue) {
    const reason = "空间与证据都需要，先用总览建立印象";
    return {
      id: "map_dominant",
      reason,
      detail: buildDetail("map_dominant", reason, "rule", facts),
      source: "rule",
      confident: false,
    };
  }
  const reason = "先建立整体印象，再按需深入空间或证据";
  return {
    id: "map_dominant",
    reason,
    detail: buildDetail("map_dominant", reason, "rule", facts),
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
    return {
      id: rule.id,
      reason: rule.reason,
      detail: rule.detail,
      source: "rule",
    };
  }
  if (isSwitchableLayout(llmId)) {
    const reason = llmReason || layoutHint(llmId);
    return {
      id: llmId,
      reason,
      detail: buildDetail(
        llmId,
        reason,
        "llm",
        [
          `规则初判=${LAYOUT_TEMPLATES[rule.id].labelZh}（置信不足，改采模型）`,
          llmReason ? `模型说明：${llmReason}` : "模型未另附说明，沿用模式释义",
        ],
      ),
      source: "llm",
    };
  }
  return {
    id: rule.id,
    reason: rule.reason,
    detail: buildDetail(
      rule.id,
      rule.reason,
      "default",
      ["规则未达高置信，且无可用的模型布局投票"],
    ),
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

/**
 * 对比页按当前侧各自推荐布局：A / B 不一致时互不影响，不强制统一成总览。
 */
export function layoutForCompareSide(
  taskFocus: TaskFocus,
  sideSpec?: SituationViewSpec | null,
): LayoutChoice {
  if (sideSpec) return resolveRecommendedLayout(taskFocus, sideSpec);
  const reason = layoutHint("map_dominant");
  return {
    id: "map_dominant",
    reason,
    detail: buildDetail("map_dominant", reason, "default", [
      "当前侧尚无可用态势结果",
    ]),
    source: "default",
  };
}

/** @deprecated 使用 layoutForCompareSide；保留别名以免旧引用报错 */
export function layoutForComparePair(
  taskFocus: TaskFocus,
  a?: SituationViewSpec | null,
  b?: SituationViewSpec | null,
): LayoutChoice {
  return layoutForCompareSide(taskFocus, b ?? a);
}
