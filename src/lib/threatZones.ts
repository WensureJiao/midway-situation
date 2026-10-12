import {
  centroid,
  findByNameHint,
  findUnit,
  isAirborne,
} from "./summarize";
import type {
  CompactUnit,
  SlicePack,
  SituationViewSpec,
  ThreatLevel,
  ThreatZone,
} from "./types";

/** 本地骨架允许的 zone id（LLM 只能对这些做升降级） */
export const ZONE_SKELETON_IDS = [
  "nagumo",
  "midway",
  "tf16",
  "tf17",
  "air-contact",
] as const;

export type ZoneSkeletonId = (typeof ZONE_SKELETON_IDS)[number];

export type ZoneOverride = {
  id: string;
  level: string;
  label?: string;
  /** 升为紧急时建议填写；无几何依据时必填否则回退 */
  evidence?: string;
};

const LEVEL_SET = new Set<string>(["紧急", "高", "中", "低", "无/不适用"]);

function carriers(units: CompactUnit[]): CompactUnit[] {
  return units.filter(
    (u) => u.unit_type === "Ship" && u.unit_class.includes("航空母舰"),
  );
}

/** 把自由文本收成标准等级；无法识别则返回 null */
export function normalizeZoneLevel(raw: string | undefined): ThreatLevel | null {
  if (!raw) return null;
  const s = raw.trim();
  if (LEVEL_SET.has(s)) return s as ThreatLevel;
  if (/紧急/.test(s)) return "紧急";
  if (/高/.test(s)) return "高";
  if (/中/.test(s)) return "中";
  if (/低/.test(s)) return "低";
  if (/无|不适用/.test(s)) return "无/不适用";
  return null;
}

function isCrisisPhase(phaseLabel: string): boolean {
  return /危机|换弹|残局|交火|接触|突击窗口/.test(phaseLabel);
}

function ratingsHasUrgent(
  ratings: SituationViewSpec["threat_ratings"] | undefined,
): boolean {
  return (ratings ?? []).some((r) => /紧急/.test(r.level ?? ""));
}

/** 本地确定性关注圈骨架（位置/半径/默认等级） */
export function buildThreatZoneSkeleton(pack: SlicePack): ThreatZone[] {
  const midway =
    findByNameHint(pack, "中途岛主跑道") ||
    findUnit(pack, (u) => u.unit_type === "Facility");
  const enterprise = findByNameHint(pack, "Enterprise");
  const yorktown = findByNameHint(pack, "Yorktown");
  const ijnCarriers = carriers(pack.sides.IJN.units);
  const ijnCenter =
    centroid(ijnCarriers) ||
    centroid(pack.sides.IJN.units.filter((u) => u.unit_type === "Ship"));

  const zones: ThreatZone[] = [];

  if (ijnCenter) {
    const damaged = ijnCarriers.some((u) => u.damaged);
    zones.push({
      id: "nagumo",
      center: ijnCenter,
      radius_nm: damaged ? 25 : 45,
      level: damaged ? "紧急" : "高",
      label: damaged ? "南云损管群" : "南云机动部队",
      side: "IJN",
    });
  }
  if (midway) {
    zones.push({
      id: "midway",
      center: [midway.latitude, midway.longitude],
      radius_nm: 30,
      level: "高",
      label: "中途岛岸基",
      side: "USN",
    });
  }
  if (enterprise) {
    zones.push({
      id: "tf16",
      center: [enterprise.latitude, enterprise.longitude],
      radius_nm: 35,
      level: "高",
      label: "TF16",
      side: "USN",
    });
  } else if (yorktown) {
    zones.push({
      id: "tf17",
      center: [yorktown.latitude, yorktown.longitude],
      radius_nm: 30,
      level: "高",
      label: "TF17",
      side: "USN",
    });
  }

  const air = [...pack.sides.USN.units, ...pack.sides.IJN.units].filter(
    isAirborne,
  );
  const airC = centroid(air);
  if (airC && air.length >= 5) {
    zones.push({
      id: "air-contact",
      center: airC,
      radius_nm: 50,
      level: "紧急",
      label: `在空接触带（${air.length}）`,
    });
  }

  return zones;
}

/** 从 LLM 完整 zones 里猜 overrides（兼容未按新字段输出的旧回复） */
export function inferZoneOverridesFromLlmZones(
  zones: ThreatZone[] | undefined,
): ZoneOverride[] {
  const out: ZoneOverride[] = [];
  for (const z of zones ?? []) {
    const id = String(z.id ?? "");
    const label = String(z.label ?? "");
    let mapped: string | null = null;
    if (ZONE_SKELETON_IDS.includes(id as ZoneSkeletonId)) mapped = id;
    else if (/南云|nagumo|损管/i.test(`${id} ${label}`)) mapped = "nagumo";
    else if (/中途岛|midway/i.test(`${id} ${label}`)) mapped = "midway";
    else if (/tf\s*16|enterprise|企业/i.test(`${id} ${label}`)) mapped = "tf16";
    else if (/tf\s*17|yorktown|约克/i.test(`${id} ${label}`)) mapped = "tf17";
    else if (/在空|接触|air/i.test(`${id} ${label}`)) mapped = "air-contact";
    if (!mapped) continue;
    out.push({
      id: mapped,
      level: String(z.level ?? ""),
      label: z.label,
    });
  }
  return out;
}

function packGeometryHints(pack: SlicePack) {
  const ijnCarriers = carriers(pack.sides.IJN.units);
  const damaged = ijnCarriers.some((u) => u.damaged);
  const airCount = [...pack.sides.USN.units, ...pack.sides.IJN.units].filter(
    isAirborne,
  ).length;
  return { damaged, airCount };
}

/**
 * 升为「紧急」是否放行：几何依据 / 阶段 / 参考 ratings + evidence。
 * 中途岛与 TF 升紧急更严，必须有 evidence。
 */
function allowUrgentUpgrade(
  id: string,
  base: ThreatZone,
  override: ZoneOverride,
  ctx: {
    pack: SlicePack;
    phaseLabel: string;
    ratingsHasUrgent: boolean;
  },
): boolean {
  if (base.level === "紧急") return true;
  const { damaged, airCount } = packGeometryHints(ctx.pack);
  const hasEvidence = Boolean(override.evidence?.trim());

  if (id === "nagumo") {
    if (damaged) return true;
    if (isCrisisPhase(ctx.phaseLabel)) return true;
    if (ctx.ratingsHasUrgent && hasEvidence) return true;
    return false;
  }
  if (id === "air-contact") {
    if (airCount >= 5) return true;
    if (airCount >= 3 && hasEvidence) return true;
    return false;
  }
  // midway / tf*：默认不升紧急，除非有 evidence 且参考含紧急
  if (id === "midway" || id === "tf16" || id === "tf17") {
    return ctx.ratingsHasUrgent && hasEvidence;
  }
  return false;
}

const URGENT_PRIORITY: Record<string, number> = {
  nagumo: 0,
  "air-contact": 1,
  midway: 2,
  tf16: 3,
  tf17: 4,
};

/**
 * 以本地骨架为准合并 LLM 升降级：保留 center/radius，白名单 id，紧急区最多 2 条。
 */
export function applyZoneOverrides(
  skeleton: ThreatZone[],
  overrides: ZoneOverride[] | undefined,
  opts: {
    pack: SlicePack;
    phaseLabel?: string;
    ratings?: SituationViewSpec["threat_ratings"];
    maxUrgent?: number;
  },
): ThreatZone[] {
  const maxUrgent = opts.maxUrgent ?? 2;
  const phaseLabel = opts.phaseLabel ?? opts.pack.phase_label ?? "";
  const urgentInRatings = ratingsHasUrgent(opts.ratings);
  const byId = new Map(skeleton.map((z) => [z.id, { ...z }]));

  const overrideMap = new Map<string, ZoneOverride>();
  for (const o of overrides ?? []) {
    if (!ZONE_SKELETON_IDS.includes(o.id as ZoneSkeletonId)) continue;
    if (!byId.has(o.id)) continue;
    overrideMap.set(o.id, o);
  }

  for (const [id, o] of overrideMap) {
    const base = byId.get(id)!;
    const nextLevel = normalizeZoneLevel(o.level);
    if (!nextLevel || nextLevel === "无/不适用") continue;

    if (nextLevel === "紧急" && base.level !== "紧急") {
      if (
        !allowUrgentUpgrade(id, base, o, {
          pack: opts.pack,
          phaseLabel,
          ratingsHasUrgent: urgentInRatings,
        })
      ) {
        continue; // 回退本地等级
      }
    }

    base.level = nextLevel;
    if (o.label?.trim()) {
      // 保留骨架语义前缀感，但允许 LLM 细化标签
      base.label = o.label.trim().slice(0, 40);
    }
    byId.set(id, base);
  }

  // 紧急区配额：超出则按优先级降回「高」（骨架本就是紧急的优先保留）
  const ordered = [...byId.values()].sort(
    (a, b) =>
      (URGENT_PRIORITY[a.id] ?? 9) - (URGENT_PRIORITY[b.id] ?? 9),
  );
  let urgentLeft = maxUrgent;
  for (const z of ordered) {
    if (z.level !== "紧急") continue;
    if (urgentLeft > 0) {
      urgentLeft -= 1;
      continue;
    }
    const sk = skeleton.find((s) => s.id === z.id);
    z.level = sk && sk.level !== "紧急" ? sk.level : "高";
  }

  // 保持骨架顺序
  return skeleton.map((s) => byId.get(s.id) ?? s);
}

/** 从 LLM spec 抽取 overrides（优先 zone_overrides 字段） */
export function collectZoneOverrides(
  llmSpec: SituationViewSpec & { zone_overrides?: ZoneOverride[] },
): ZoneOverride[] {
  if (Array.isArray(llmSpec.zone_overrides) && llmSpec.zone_overrides.length) {
    return llmSpec.zone_overrides;
  }
  return inferZoneOverridesFromLlmZones(llmSpec.map?.threat_zones);
}

/** LLM 路径：骨架 + overrides → 最终 threat_zones */
export function mergeLlmThreatZones(
  pack: SlicePack,
  llmSpec: SituationViewSpec & { zone_overrides?: ZoneOverride[] },
  ratings?: SituationViewSpec["threat_ratings"],
): ThreatZone[] {
  const skeleton = buildThreatZoneSkeleton(pack);
  return applyZoneOverrides(skeleton, collectZoneOverrides(llmSpec), {
    pack,
    phaseLabel: llmSpec.phase_label || pack.phase_label,
    ratings: ratings ?? llmSpec.threat_ratings,
  });
}
