import type {
  ChartSpec,
  CompactUnit,
  SituationViewSpec,
  SlicePack,
  TaskFocus,
} from "./types";
import {
  CAMPAIGN_BEAT_CODE,
  inferCampaignBeat,
  intentEvidenceItems,
  type CampaignBeat,
} from "./vmmpCompare";
import { selectChartSlotIds } from "./vmmpChartSelect";

const INTENT_BEATS: CampaignBeat[] = [
  "集结",
  "搜索",
  "危机",
  "残局",
  "终局",
];

function intentPhaseSeries(
  spec: SituationViewSpec,
  packPhase?: string,
): ChartSpec["series"] {
  const beat = inferCampaignBeat(packPhase ?? "", spec);
  return INTENT_BEATS.map((name) => ({
    name,
    value: name === beat ? CAMPAIGN_BEAT_CODE[name] : 0,
    detail:
      name === beat
        ? `当前阶段 · ${spec.phase_label?.trim() || name}`
        : `${name}（非当前）`,
  }));
}

/** 主栏 PHASE：五拍柱状（当前拍高亮） */
export function buildPhaseBeatChart(
  spec: SituationViewSpec,
  packPhase?: string,
): ChartSpec {
  return {
    id: "cmp-intent-phase",
    type: "bar",
    title: "战役阶段",
    description: "五拍节拍；当前阶段柱高为节拍编码",
    series: intentPhaseSeries(spec, packPhase),
  };
}

/** 主栏 AXIS：美/日指向条数分组柱 */
export function buildAxesCountChart(spec: SituationViewSpec): ChartSpec {
  return {
    id: "cmp-intent-axes",
    type: "grouped_bar",
    title: "作战指向",
    description: "各方作战指向条数；悬停可看名称与起终点",
    series: intentAxesSeries(spec.map?.axes),
  };
}

export { CHART_TYPE_CATALOG, chartTypeLabel } from "./chartTypes";

function perspectiveBucket(
  perspective: string,
): "红方看蓝方" | "蓝方看红方" | null {
  if (/红方看蓝方|美方看日方/.test(perspective)) return "红方看蓝方";
  if (/蓝方看红方|日方看美方/.test(perspective)) return "蓝方看红方";
  if (/红方看|美方看/.test(perspective)) return "红方看蓝方";
  if (/蓝方看|日方看/.test(perspective)) return "蓝方看红方";
  return null;
}

/** 证据构成：计数 + 悬停明细 */
function evidenceCompositionSeries(
  spec: SituationViewSpec,
): ChartSpec["series"] {
  const items = intentEvidenceItems(spec).filter(
    (i) => i.kind !== "叙述" && i.kind !== "叙述依据",
  );
  const keys = ["方向", "关键实体", "活动区"] as const;
  return keys.map((name) => {
    const texts = items.filter((i) => i.kind === name).map((i) => i.text);
    return {
      name,
      value: texts.length,
      detail: texts.length
        ? texts.map((t, i) => `${i + 1}. ${t}`).join("\n")
        : "暂无此类证据",
    };
  });
}

/** 作战指向：按方计数 + 悬停列出轴线标签与起终点 */
function intentAxesSeries(
  axes: NonNullable<SituationViewSpec["map"]>["axes"],
): ChartSpec["series"] {
  const fmt = (p: [number, number]) => {
    const [lat, lon] = p;
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(2)}°${ns} ${Math.abs(lon).toFixed(2)}°${ew}`;
  };
  const buckets = [
    {
      name: "美方",
      side: "USN" as const,
      match: (s?: string) => s === "USN",
    },
    {
      name: "日方",
      side: "IJN" as const,
      match: (s?: string) => s === "IJN",
    },
  ] as const;

  return buckets.map(({ name, side, match }) => {
    const items = (axes ?? []).filter((a) => match(a.side));
    const detail = items.length
      ? items
          .map((a, i) => {
            const route =
              a.from && a.to ? `\n   ${fmt(a.from)} → ${fmt(a.to)}` : "";
            return `${i + 1}. ${a.label || a.id || "未命名指向"}${route}`;
          })
          .join("\n")
      : "暂无该方作战指向";
    return { name, value: items.length, side, detail };
  });
}

function levelScoreValue(level: string): number {
  if (/紧急/.test(level)) return 4;
  if (/高/.test(level)) return 3;
  if (/中/.test(level)) return 2;
  if (/低/.test(level)) return 1;
  return 1;
}

function threatRankSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  return [...(ratings ?? [])]
    .filter((r) => Boolean(r.target))
    .map((r) => ({
      name: r.target,
      value: levelScoreValue(r.level),
      detail: `${r.level}${r.evidence ? ` — ${r.evidence}` : ""}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

/** 中途岛（登陆/目标海域）锚点 */
function findLandingAnchor(pack: SlicePack): {
  lat: number;
  lon: number;
  label: string;
} {
  const units = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ];
  const midway =
    units.find((u) => /中途岛主跑道/.test(u.name)) ||
    units.find(
      (u) =>
        u.unit_type === "Facility" &&
        /中途岛|Midway/i.test(`${u.name} ${u.group ?? ""}`),
    );
  if (midway) {
    return {
      lat: midway.latitude,
      lon: midway.longitude,
      label: "中途岛",
    };
  }
  return { lat: 28.207, lon: -177.382, label: "中途岛" };
}

/** 相对锚点：东向 / 北向海里 */
function nmOffsetFrom(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): { eastNm: number; northNm: number; rangeNm: number } {
  const northNm = (lat - originLat) * 60;
  const eastNm =
    (lon - originLon) * 60 * Math.cos((originLat * Math.PI) / 180);
  const rangeNm = Math.hypot(eastNm, northNm);
  return {
    eastNm: Math.round(eastNm * 10) / 10,
    northNm: Math.round(northNm * 10) / 10,
    rangeNm: Math.round(rangeNm * 10) / 10,
  };
}

function unitRankForScatter(u: CompactUnit): number {
  if (/航空母舰/.test(u.unit_class ?? "")) return 0;
  if (/战列/.test(u.unit_class ?? "")) return 1;
  if (/巡洋/.test(u.unit_class ?? "")) return 2;
  if (/驱逐/.test(u.unit_class ?? "")) return 3;
  if (u.unit_type === "Ship") return 4;
  return 9;
}

type ForceGeoPoint = {
  unit: CompactUnit;
  side: "USN" | "IJN";
  eastNm: number;
  northNm: number;
  rangeNm: number;
  bearingDeg: number;
};

/** 0=正北，顺时针 */
function bearingFromOffset(eastNm: number, northNm: number): number {
  const deg = (Math.atan2(eastNm, northNm) * 180) / Math.PI;
  return (deg + 360) % 360;
}

const BEARING_SECTORS = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
] as const;

function bearingSector(bearingDeg: number): (typeof BEARING_SECTORS)[number] {
  const idx = Math.round(bearingDeg / 45) % 8;
  return BEARING_SECTORS[idx];
}

function pickForceShips(pack: SlicePack, limit = 28): CompactUnit[] {
  const ships = [
    ...(pack.sides.USN?.units ?? []),
    ...(pack.sides.IJN?.units ?? []),
  ]
    .filter((u) => u.unit_type === "Ship")
    .sort((a, b) => unitRankForScatter(a) - unitRankForScatter(b));

  const picked: CompactUnit[] = [];
  const bySide = { USN: 0, IJN: 0 };
  for (const u of ships) {
    const side = u.side === "IJN" ? "IJN" : "USN";
    const cap = unitRankForScatter(u) <= 1 ? 8 : 10;
    if (bySide[side] >= cap) continue;
    picked.push(u);
    bySide[side] += 1;
    if (picked.length >= limit) break;
  }
  return picked;
}

function forceGeoPoints(pack: SlicePack): {
  anchor: ReturnType<typeof findLandingAnchor>;
  points: ForceGeoPoint[];
} {
  const anchor = findLandingAnchor(pack);
  const points = pickForceShips(pack).map((u) => {
    const side = u.side === "IJN" ? ("IJN" as const) : ("USN" as const);
    const { eastNm, northNm, rangeNm } = nmOffsetFrom(
      u.latitude,
      u.longitude,
      anchor.lat,
      anchor.lon,
    );
    return {
      unit: u,
      side,
      eastNm,
      northNm,
      rangeNm,
      bearingDeg: bearingFromOffset(eastNm, northNm),
    };
  });
  return { anchor, points };
}

/**
 * 敌我位置相对登陆海域（中途岛）的空间散点。
 * 原点=中途岛；x=东向海里，y=北向海里。
 */
export function forceLandingScatterSeries(
  pack: SlicePack,
): ChartSpec["series"] {
  const { anchor, points: geos } = forceGeoPoints(pack);
  const points: ChartSpec["series"] = [
    {
      name: anchor.label,
      value: 0,
      x: 0,
      y: 0,
      side: "both",
      group: "登陆海域",
      detail: `登陆/目标海域锚点 · ${anchor.label}\n(${anchor.lat.toFixed(2)}°N, ${Math.abs(anchor.lon).toFixed(2)}°W)`,
    },
  ];

  for (const g of geos) {
    points.push({
      name: g.unit.name,
      value: g.rangeNm,
      x: g.eastNm,
      y: g.northNm,
      side: g.side,
      group: g.side === "USN" ? "美方" : "日方",
      detail: `${g.side === "USN" ? "美方" : "日方"} · ${g.unit.unit_class}\n相对${anchor.label}：东 ${g.eastNm} nm / 北 ${g.northNm} nm\n距离约 ${g.rangeNm} nm · 方位 ${Math.round(g.bearingDeg)}°`,
    });
  }
  return points;
}

/** 距中途岛海里：近→远条形（优先展示更贴近登陆海域的单位） */
export function forceRangeBarSeries(pack: SlicePack): ChartSpec["series"] {
  const { anchor, points } = forceGeoPoints(pack);
  return [...points]
    .filter((g) => g.rangeNm > 0.5)
    .sort((a, b) => a.rangeNm - b.rangeNm)
    .slice(0, 12)
    .map((g) => {
      const short = g.unit.name.replace(/^(USS|IJN)\s+/i, "");
      return {
        name: short.length > 12 ? `${short.slice(0, 11)}…` : short,
        value: g.rangeNm,
        side: g.side,
        detail: `${g.side === "USN" ? "美方" : "日方"} · ${g.unit.name}\n距${anchor.label}约 ${g.rangeNm} nm · 方位 ${Math.round(g.bearingDeg)}°`,
      };
    });
}

/** 相对中途岛的八方位兵力计数（美/日分列，供双序列雷达） */
export function forceBearingRoseSeries(pack: SlicePack): ChartSpec["series"] {
  const { points } = forceGeoPoints(pack);
  const counts: Record<string, { USN: number; IJN: number; names: string[] }> =
    Object.fromEntries(
      BEARING_SECTORS.map((s) => [s, { USN: 0, IJN: 0, names: [] as string[] }]),
    );

  for (const g of points) {
    if (g.rangeNm < 0.5) continue;
    const sec = bearingSector(g.bearingDeg);
    counts[sec][g.side] += 1;
    counts[sec].names.push(
      `${g.side === "USN" ? "美" : "日"}·${g.unit.name.replace(/^(USS|IJN)\s+/i, "")}`,
    );
  }

  return BEARING_SECTORS.flatMap((sec) => {
    const c = counts[sec];
    const detail = c.names.length
      ? c.names.map((n, i) => `${i + 1}. ${n}`).join("\n")
      : "该方位暂无取样舰艇";
    return [
      {
        name: sec,
        value: c.USN,
        side: "USN" as const,
        group: "美方",
        detail: `美方 · ${sec}\n${detail}`,
      },
      {
        name: sec,
        value: c.IJN,
        side: "IJN" as const,
        group: "日方",
        detail: `日方 · ${sec}\n${detail}`,
      },
    ];
  });
}

function buildSpatialRelationCharts(pack?: SlicePack): ChartSpec[] {
  if (!pack) return [];
  const landing = forceLandingScatterSeries(pack);
  if (landing.length < 2) return [];

  const bearing = forceBearingRoseSeries(pack);

  return [
    {
      id: "cmp-force-landing",
      type: "scatter",
      title: "敌我位置与登陆海域关系",
      description: "原点=中途岛；横轴东向海里，纵轴北向海里；红美蓝日",
      why_type: "空间散点直接对照敌我相对登陆海域的几何关系",
      series: landing,
    },
    {
      id: "cmp-force-bearing",
      type: "radar",
      title: "相对中途岛方位分布",
      description: "八方位兵力计数；美/日双轮廓对照集中方向",
      why_type: "方位玫瑰看敌我相对目标的方向集中度（意图指向）",
      series: bearing,
    },
  ];
}

/** 证据充分度 0–4：有无证据 + 信息量，比「字数散点」更易读 */
function evidenceStrengthScore(evidence?: string): number {
  const t = (evidence ?? "").trim();
  if (!t) return 0;
  if (t.length < 24) return 1;
  if (t.length < 60) return 2;
  if (t.length < 120) return 3;
  return 4;
}

function threatEvidenceSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  return [...(ratings ?? [])]
    .filter((r) => Boolean(r.target))
    .map((r) => {
      const score = evidenceStrengthScore(r.evidence);
      return {
        name: r.target,
        value: score,
        detail: r.evidence?.trim()
          ? `充分度 ${score}/4 — ${r.evidence.trim()}`
          : `充分度 0/4 — 暂无证据（${r.level}）`,
      };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "zh"))
    .slice(0, 8);
}

function threatHeatSeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  const levels = ["紧急", "高", "中", "低"] as const;
  const rows = [...(ratings ?? [])]
    .filter((r) => Boolean(r.target))
    .slice(0, 6);
  if (!rows.length) {
    return levels.map((lv) => ({
      name: lv,
      group: "（无目标）",
      value: 0,
    }));
  }
  return rows.flatMap((r) => {
    const score = levelScoreValue(r.level);
    return levels.map((lv) => ({
      name: lv,
      group: r.target,
      value: levelScoreValue(lv) === score ? score : 0,
      detail: levelScoreValue(lv) === score ? r.evidence || r.level : "",
    }));
  });
}

function normalizeThreatLevel(level: string): "紧急" | "高" | "中" | "低" {
  if (/紧急/.test(level)) return "紧急";
  if (/高/.test(level)) return "高";
  if (/中/.test(level)) return "中";
  return "低";
}

/** 桑基：充分度档 → 威胁等级 */
function threatSankeySeries(
  ratings: SituationViewSpec["threat_ratings"],
): ChartSpec["series"] {
  const bag = new Map<string, number>();
  for (const r of ratings ?? []) {
    if (!r.target) continue;
    const src = `充分度${evidenceStrengthScore(r.evidence)}`;
    const tgt = normalizeThreatLevel(r.level);
    const key = `${src}→${tgt}`;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  if (!bag.size) {
    return [{ name: "充分度0", group: "低", value: 0, detail: "暂无流向" }];
  }
  return [...bag.entries()].map(([key, value]) => {
    const [name, group] = key.split("→");
    return {
      name,
      group,
      value,
      detail: `${name} → ${group}：${value} 条目标`,
    };
  });
}

/** 桑基：证据类型 → 权重档 */
function intentSankeySeries(
  items: { kind: string; text: string }[],
): ChartSpec["series"] {
  const weightLabel = (kind: string) =>
    kind === "方向" ? "高权重" : kind === "关键实体" ? "中权重" : "低权重";
  const bag = new Map<string, number>();
  for (const i of items) {
    const src = i.kind;
    const tgt = weightLabel(i.kind);
    const key = `${src}→${tgt}`;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  if (!bag.size) {
    return [{ name: "方向", group: "高权重", value: 0, detail: "暂无流向" }];
  }
  return [...bag.entries()].map(([key, value]) => {
    const [name, group] = key.split("→");
    return {
      name,
      group,
      value,
      detail: `${name} → ${group}：${value} 条`,
    };
  });
}

export type CompareChartOptions = {
  /**
   * true=有范式：按 VMMP M/T 拓扑选图；
   * false=无范式：只保留 baseline 图槽。
   */
  rich?: boolean;
  /** 有切片兵力坐标时，可生成「敌我×登陆海域」空间散点 */
  pack?: SlicePack;
};

function applyVmmpChartSelection(
  charts: ChartSpec[],
  taskFocus: TaskFocus,
  rich: boolean,
): ChartSpec[] {
  const { ids, whyById } = selectChartSlotIds(taskFocus, rich);
  return charts
    .filter((c) => c.id && ids.has(c.id))
    .map((c) => ({
      ...c,
      why_type: whyById.get(c.id) || c.why_type,
    }));
}

/**
 * 单切片任务认知图槽：先生成候选图，再按 VMMP M/T（有范式）或基线（无范式）筛选。
 */
export function buildTaskCompareCharts(
  spec: SituationViewSpec,
  taskFocus: TaskFocus,
  packPhase?: string,
  options?: CompareChartOptions,
): ChartSpec[] {
  const rich = options?.rich !== false;
  const spatialCharts = buildSpatialRelationCharts(options?.pack);

  if (taskFocus === "intent") {
    const evidence = evidenceCompositionSeries(spec);
    const candidates: ChartSpec[] = [
      {
        id: "cmp-intent-evidence",
        type: "pie",
        title: "证据构成",
        description: "方向 / 关键实体 / 活动区占比（对照意图结论）",
        why_type: "M：Associative+Relate → Connection ⇒ pie",
        series: evidence,
      },
      {
        id: "cmp-intent-evidence-radar",
        type: "radar",
        title: "证据维度轮廓",
        description: "三维度相对强弱（对照意图结论）",
        why_type: "M：Comparative+Compare → Alignment ⇒ radar",
        series: evidence,
      },
    ];
    return applyVmmpChartSelection(candidates, "intent", rich);
  }

  const ratings = (spec.threat_ratings ?? []).filter(
    (r) => perspectiveBucket(r.perspective ?? "") === "红方看蓝方",
  );
  const levelCounts = (["紧急", "高", "中", "低"] as const).map((lv) => ({
    name: lv,
    value: ratings.filter((r) => normalizeThreatLevel(r.level) === lv).length,
    detail: lv,
  }));
  const candidates: ChartSpec[] = [
    ...spatialCharts,
    {
      id: "cmp-threat-rank",
      type: "hbar",
      title: "威胁目标排序",
      description: "条长=等级分（1–4）；悬停看证据",
      series: threatRankSeries(ratings),
    },
    {
      id: "cmp-threat-level-bar",
      type: "bar",
      title: "威胁等级分布",
      description: "紧急/高/中/低条数",
      series: levelCounts,
    },
  ];
  return applyVmmpChartSelection(candidates, "threat", rich);
}

/**
 * 空间研判界面底部三槽：分布 → 排序；其余进补充区。
 * 对齐「先看空间分布，再看优先级排序，证据栏单独用文字」的设计路径。
 */
export function pickStudySlotCharts(
  charts: ChartSpec[],
  taskFocus: TaskFocus,
): {
  distribution?: ChartSpec;
  ranking?: ChartSpec;
  /** 距岛距离 + 方位玫瑰，与散点并列试看 */
  spatialExtras: ChartSpec[];
  extras: ChartSpec[];
} {
  const byId = (id: string) => charts.find((c) => c.id === id);
  const used = new Set<string>();

  let distribution: ChartSpec | undefined;
  let ranking: ChartSpec | undefined;

  if (taskFocus === "threat") {
    distribution =
      byId("cmp-force-landing") ||
      charts.find((c) => c.type === "scatter" || c.type === "bar");
    ranking =
      byId("cmp-threat-rank") ||
      charts.find(
        (c) => c.type === "hbar" && c.id !== distribution?.id,
      );
  } else {
    distribution =
      byId("cmp-force-landing") ||
      byId("cmp-intent-phase") ||
      charts.find((c) => c.type === "scatter" || c.type === "bar");
    ranking =
      byId("cmp-intent-rank") ||
      byId("cmp-intent-evidence") ||
      charts.find(
        (c) =>
          (c.type === "hbar" || c.type === "pie") &&
          c.id !== distribution?.id,
      ) ||
      charts.find((c) => c.id !== distribution?.id);
  }

  const spatialExtras = [byId("cmp-force-bearing")].filter(
    (c): c is ChartSpec => Boolean(c),
  );

  if (distribution?.id) used.add(distribution.id);
  if (ranking?.id) used.add(ranking.id);
  for (const c of spatialExtras) used.add(c.id);

  const extras = charts.filter((c) => c.id && !used.has(c.id));
  return { distribution, ranking, spatialExtras, extras };
}

/** 地图编码：高亮 / 作战指向 / 关注区 + 悬停明细 */
export function mapEncodingSeries(
  map: NonNullable<SituationViewSpec["map"]>,
): ChartSpec["series"] {
  const highlights = map.highlight_names ?? [];
  const axes = map.axes ?? [];
  const zones = map.threat_zones ?? [];
  return [
    {
      name: "高亮",
      value: highlights.length,
      detail: highlights.length
        ? highlights.map((n, i) => `${i + 1}. ${n}`).join("\n")
        : "暂无高亮单位",
    },
    {
      name: "指向",
      value: axes.length,
      detail: axes.length
        ? axes
            .map(
              (a, i) =>
                `${i + 1}. ${a.label || a.id || "未命名"}（${a.side === "USN" ? "美" : a.side === "IJN" ? "日" : a.side ?? "?"}）`,
            )
            .join("\n")
        : "暂无作战指向",
    },
    {
      name: "关注区",
      value: zones.length,
      detail: zones.length
        ? zones
            .map(
              (z, i) =>
                `${i + 1}. [${z.level}] ${z.label}${z.radius_nm != null ? ` · ${z.radius_nm}nm` : ""}`,
            )
            .join("\n")
        : "暂无关注区",
    },
  ];
}
