import type { ChartSpec, SituationViewSpec, SlicePack } from "./types";
import { buildTaskCompareCharts } from "./compareCharts";
import { inferCampaignPhase } from "./vmmpCompare";

function levelScore(level: string): number {
  if (/紧急/.test(level)) return 4;
  if (/高/.test(level)) return 3;
  if (/中/.test(level)) return 2;
  if (/低/.test(level)) return 1;
  return 0;
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
  /** T1→T193 跨切片 */
  timelineCharts: ChartSpec[];
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
  const evidencePie = intentSlots.find(
    (c) => c.id === "cmp-intent-evidence",
  );

  const usReady = us.embarked_by_class_and_ready ?? [];
  const ijReady = ij.embarked_by_class_and_ready ?? [];
  const usReadySeries = usReady.length
    ? aggregateReadyByClass(usReady, "USN")
    : [{ name: "暂无就绪机型", value: 0, side: "USN" as const }];
  const ijReadySeries = ijReady.length
    ? aggregateReadyByClass(ijReady, "IJN")
    : [{ name: "暂无就绪机型", value: 0, side: "IJN" as const }];

  const redView = (threatSpec.threat_ratings ?? [])
    .filter((r) =>
      /红方看蓝方|美方看日方|红方看|美方看/.test(r.perspective ?? ""),
    )
    .map((r) => ({
      name: r.target,
      value: levelScore(String(r.level)),
      side: "IJN" as const,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const blueView = (threatSpec.threat_ratings ?? [])
    .filter((r) =>
      /蓝方看红方|日方看美方|蓝方看|日方看/.test(r.perspective ?? ""),
    )
    .map((r) => ({
      name: r.target,
      value: levelScore(String(r.level)),
      side: "USN" as const,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

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
      title: "视角目标数",
      series: perspectiveBar?.series ?? [],
    },
    {
      id: "grammar-hbar-red",
      type: "hbar",
      title: "红看蓝 · 威胁排序",
      series: redView.length
        ? redView
        : [{ name: "暂无红看蓝条目", value: 0 }],
    },
    {
      id: "grammar-hbar-blue",
      type: "hbar",
      title: "蓝看红 · 威胁排序",
      series: blueView.length
        ? blueView
        : [{ name: "暂无蓝看红条目", value: 0 }],
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

/** 跨切片：T1→T193 走势（与上方「当前片」分开） */
export function buildTimelineGrammarCharts(
  timeline: SliceGrammarInput[],
  side: AbSide = "B",
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
    },
    {
      name: s.id,
      value: s.pack.sides.IJN.summary.airborne_aircraft_count ?? 0,
      side: "IJN" as const,
    },
  ]);

  const phaseArea = ordered.map((s) => {
    const { intentSpec: is } = pickSpecs(s, side);
    const phase = inferCampaignPhase(is.phase_label ?? s.pack.phase_label, is);
    return {
      name: s.id,
      value: phase === "接触" ? 3 : phase === "搜索" ? 2 : 1,
    };
  });

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
      series: airborneLine,
    },
    {
      id: "grammar-multi-line",
      type: "multi_line",
      title: "美/日在空数",
      series: multiLine,
    },
    {
      id: "grammar-area",
      type: "area",
      title: "意图阶段编码",
      series: phaseArea,
    },
    {
      id: "grammar-ships-line",
      type: "line",
      title: "水面舰艇总数",
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
  };
}
