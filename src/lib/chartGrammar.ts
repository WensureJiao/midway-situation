import type { ChartSpec, SituationViewSpec, SlicePack } from "./types";
import { buildTaskCompareCharts, mapEncodingSeries } from "./compareCharts";
import { inferCampaignBeat, CAMPAIGN_BEAT_CODE } from "./vmmpCompare";

const THREAT_LEVEL_KEYS = ["紧急", "高", "中", "低"] as const;
type ThreatLevelKey = (typeof THREAT_LEVEL_KEYS)[number];

function isRedPerspective(perspective: string): boolean {
  return /红方看蓝方|美方看日方|红方看|美方看/.test(perspective);
}

function isBluePerspective(perspective: string): boolean {
  return /蓝方看红方|日方看美方|蓝方看|日方看/.test(perspective);
}

function countThreatLevels(
  ratings: { perspective?: string; level: string }[],
  matchPerspective: (p: string) => boolean,
): Record<ThreatLevelKey, number> {
  const counts: Record<ThreatLevelKey, number> = {
    紧急: 0,
    高: 0,
    中: 0,
    低: 0,
  };
  for (const r of ratings) {
    if (!matchPerspective(r.perspective ?? "")) continue;
    const lv = String(r.level);
    if (/紧急/.test(lv)) counts.紧急 += 1;
    else if (/高/.test(lv)) counts.高 += 1;
    else if (/中/.test(lv)) counts.中 += 1;
    else if (/低/.test(lv)) counts.低 += 1;
  }
  return counts;
}

function cleanClassKey(key: string): string {
  return key.replace(/\|ready_min=\d+/g, "");
}

/** 同机型、不同 ready_min 合并为一条 */
function aggregateReadyByClass(
  rows: { key: string; count: number }[],
  side: "USN" | "IJN",
): { name: string; value: number; side: "USN" | "IJN" }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const name = cleanClassKey(row.key);
    map.set(name, (map.get(name) ?? 0) + row.count);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value, side }));
}

export type AbSide = "A" | "B";

export type SliceGrammarInput = {
  id: string;
  pack: SlicePack;
  threatA: SituationViewSpec;
  threatB: SituationViewSpec;
  intentA: SituationViewSpec;
  intentB: SituationViewSpec;
};

export type ChartGrammarGroups = {
  /** 仅当前选中时间片 */
  sliceCharts: ChartSpec[];
  /** T1→T193 · 随 A/B 的认知走势 */
  timelineCharts: ChartSpec[];
  /** T1→T193 · 兵力基线（pack 事实，与 A/B 无关） */
  forceTimelineCharts: ChartSpec[];
};

function pickSpecs(bundle: SliceGrammarInput, side: AbSide) {
  return side === "A"
    ? { threatSpec: bundle.threatA, intentSpec: bundle.intentA }
    : { threatSpec: bundle.threatB, intentSpec: bundle.intentB };
}

function orderedTimeline(timeline: SliceGrammarInput[]) {
  return [...timeline].sort(
    (a, b) => (a.pack.meta?.order ?? 0) - (b.pack.meta?.order ?? 0),
  );
}

/** 当前时间片：兵力 + 该侧威胁/意图认知图 */
export function buildSliceGrammarCharts(
  current: SliceGrammarInput,
  side: AbSide = "B",
): ChartSpec[] {
  const { pack } = current;
  const { threatSpec, intentSpec } = pickSpecs(current, side);
  const us = pack.sides.USN.summary;
  const ij = pack.sides.IJN.summary;

  const threatSlots = buildTaskCompareCharts(threatSpec, "threat");
  const intentSlots = buildTaskCompareCharts(intentSpec, "intent");

  const levelBar = threatSlots.find((c) => c.id === "cmp-threat-levels");
  const perspectiveBar = threatSlots.find(
    (c) => c.id === "cmp-threat-perspectives",
  );
  const axesBar = intentSlots.find((c) => c.id === "cmp-intent-axes");
  const evidencePie = intentSlots.find(
    (c) => c.id === "cmp-intent-evidence",
  );
  const intentMap = intentSpec.map ?? {
    highlight_names: [],
    axes: [],
    threat_zones: [],
  };

  const usReady = us.embarked_by_class_and_ready ?? [];
  const ijReady = ij.embarked_by_class_and_ready ?? [];
  const usReadySeries = usReady.length
    ? aggregateReadyByClass(usReady, "USN")
    : [{ name: "暂无就绪机型", value: 0, side: "USN" as const }];
  const ijReadySeries = ijReady.length
    ? aggregateReadyByClass(ijReady, "IJN")
    : [{ name: "暂无就绪机型", value: 0, side: "IJN" as const }];

  return [
    {
      id: "grammar-bar",
      type: "bar",
      title: "威胁等级分布",
      series: levelBar?.series ?? [],
    },
    {
      id: "grammar-grouped",
      type: "grouped_bar",
      title: "双视角威胁条目",
      description:
        perspectiveBar?.description ??
        "红看蓝＝美方列出的日方目标数；蓝看红＝日方列出的美方目标数（只计条数，不是威胁高低）",
      series: perspectiveBar?.series ?? [],
    },
    {
      id: "grammar-axes",
      type: "grouped_bar",
      title: "作战指向",
      description:
        axesBar?.description ??
        "各方地图轴线条数；悬停可看轴线名称与起终点",
      series: axesBar?.series ?? [],
    },
    {
      id: "grammar-map-encoding",
      type: "pie",
      title: "地图编码",
      description: "意图图：高亮单位 / 轴线 / 关注圈；悬停可看明细",
      series: mapEncodingSeries(intentMap),
    },
    {
      id: "grammar-pie-usn",
      type: "pie",
      title: "红方舰载机（就绪）",
      series: usReadySeries,
    },
    {
      id: "grammar-pie-ijn",
      type: "pie",
      title: "蓝方舰载机（就绪）",
      series: ijReadySeries,
    },
    {
      id: "grammar-evidence-pie",
      type: "pie",
      title: "意图证据构成",
      series: evidencePie?.series ?? [],
    },
  ];
}

/** 跨切片：随 A/B 的威胁/意图认知走势 */
export function buildTimelineGrammarCharts(
  timeline: SliceGrammarInput[],
  side: AbSide = "B",
): ChartSpec[] {
  const ordered = orderedTimeline(timeline);

  const phaseArea = ordered.map((s) => {
    const { intentSpec: is } = pickSpecs(s, side);
    const beat = inferCampaignBeat(is.phase_label ?? s.pack.phase_label, is);
    return {
      name: s.id,
      value: CAMPAIGN_BEAT_CODE[beat],
      detail: `${beat} · ${is.phase_label || s.pack.phase_label || "未标注"}`,
    };
  });

  const highThreatBySide = ordered.flatMap((s) => {
    const { threatSpec } = pickSpecs(s, side);
    const ratings = threatSpec.threat_ratings ?? [];
    const redN = ratings.filter(
      (r) =>
        isRedPerspective(r.perspective ?? "") &&
        /紧急|高/.test(String(r.level)),
    ).length;
    const blueN = ratings.filter(
      (r) =>
        isBluePerspective(r.perspective ?? "") &&
        /紧急|高/.test(String(r.level)),
    ).length;
    return [
      {
        name: s.id,
        value: redN,
        group: "红看蓝",
        side: "USN" as const,
      },
      {
        name: s.id,
        value: blueN,
        group: "蓝看红",
        side: "IJN" as const,
      },
    ];
  });

  const threatLevelRed = ordered.flatMap((s) => {
    const { threatSpec } = pickSpecs(s, side);
    const counts = countThreatLevels(
      threatSpec.threat_ratings ?? [],
      isRedPerspective,
    );
    return THREAT_LEVEL_KEYS.map((k) => ({
      name: s.id,
      value: counts[k],
      group: k,
      side: "USN" as const,
    }));
  });

  const threatLevelBlue = ordered.flatMap((s) => {
    const { threatSpec } = pickSpecs(s, side);
    const counts = countThreatLevels(
      threatSpec.threat_ratings ?? [],
      isBluePerspective,
    );
    return THREAT_LEVEL_KEYS.map((k) => ({
      name: s.id,
      value: counts[k],
      group: k,
      side: "IJN" as const,
    }));
  });

  return [
    {
      id: "grammar-threat-high",
      type: "multi_line",
      title: "高威胁目标数",
      description: "紧急+高：红看蓝 / 蓝看红（随所选 A/B）",
      series: highThreatBySide,
    },
    {
      id: "grammar-threat-levels-red",
      type: "multi_line",
      title: "红看蓝 · 威胁等级",
      description: "美方视角下紧急/高/中/低条数",
      series: threatLevelRed,
    },
    {
      id: "grammar-threat-levels-blue",
      type: "multi_line",
      title: "蓝看红 · 威胁等级",
      description: "日方视角下紧急/高/中/低条数",
      series: threatLevelBlue,
    },
    {
      id: "grammar-area",
      type: "area",
      title: "意图阶段",
      description:
        "纵轴：1=集结 · 2=搜索 · 3=危机 · 4=残局 · 5=终局（按切片标签；A/B 文案通常同构）",
      series: phaseArea,
    },
  ];
}

/** 跨切片：兵力基线（与 A/B 无关） */
export function buildForceTimelineCharts(
  timeline: SliceGrammarInput[],
): ChartSpec[] {
  const ordered = orderedTimeline(timeline);

  const airborneLine = ordered.map((s) => ({
    name: s.id,
    value:
      (s.pack.sides.USN.summary.airborne_aircraft_count ?? 0) +
      (s.pack.sides.IJN.summary.airborne_aircraft_count ?? 0),
  }));

  const multiLine = ordered.flatMap((s) => [
    {
      name: s.id,
      value: s.pack.sides.USN.summary.airborne_aircraft_count ?? 0,
      side: "USN" as const,
      group: "USN",
    },
    {
      name: s.id,
      value: s.pack.sides.IJN.summary.airborne_aircraft_count ?? 0,
      side: "IJN" as const,
      group: "IJN",
    },
  ]);

  const shipLine = ordered.map((s) => ({
    name: s.id,
    value:
      (s.pack.sides.USN.summary.ship_count ?? 0) +
      (s.pack.sides.IJN.summary.ship_count ?? 0),
  }));

  return [
    {
      id: "grammar-line",
      type: "line",
      title: "在空飞机总数",
      description: "兵力事实，切 A/B 不变",
      series: airborneLine,
    },
    {
      id: "grammar-multi-line",
      type: "multi_line",
      title: "美/日在空数",
      description: "兵力事实，切 A/B 不变",
      series: multiLine,
    },
    {
      id: "grammar-ships-line",
      type: "line",
      title: "水面舰艇总数",
      description: "兵力事实，切 A/B 不变",
      series: shipLine,
    },
  ];
}

export function buildChartGrammarFromReal(
  current: SliceGrammarInput,
  timeline: SliceGrammarInput[],
  side: AbSide = "B",
): ChartGrammarGroups {
  return {
    sliceCharts: buildSliceGrammarCharts(current, side),
    timelineCharts: buildTimelineGrammarCharts(timeline, side),
    forceTimelineCharts: buildForceTimelineCharts(timeline),
  };
}
