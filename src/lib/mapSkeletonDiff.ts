import {
  centroid,
  findByNameHint,
  findUnit,
} from "./summarize";
import { buildThreatZoneSkeleton } from "./threatZones";
import type {
  CompactUnit,
  MapAxis,
  SlicePack,
  SituationViewSpec,
} from "./types";

function carriers(units: CompactUnit[]): CompactUnit[] {
  return units.filter(
    (u) => u.unit_type === "Ship" && u.unit_class.includes("航空母舰"),
  );
}

/** 本地默认作战指向（与 localGenerator 一致），用作对比参照。 */
export function buildDefaultMapAxes(pack: SlicePack): MapAxis[] {
  const midway =
    findByNameHint(pack, "中途岛主跑道") ||
    findUnit(pack, (u) => u.unit_type === "Facility");
  const ijnCarriers = carriers(pack.sides.IJN.units);
  const usCarriers = carriers(pack.sides.USN.units);
  const ijnCenter =
    centroid(ijnCarriers) ||
    centroid(pack.sides.IJN.units.filter((u) => u.unit_type === "Ship"));
  const usCenter =
    centroid(usCarriers) ||
    centroid(pack.sides.USN.units.filter((u) => u.unit_type === "Ship"));

  const axes: MapAxis[] = [];
  if (ijnCenter && midway) {
    axes.push({
      id: "ijn-to-midway",
      from: ijnCenter,
      to: [midway.latitude, midway.longitude],
      label: "南云→中途岛",
      side: "IJN",
    });
  }
  if (usCenter && ijnCenter) {
    axes.push({
      id: "usn-to-ijn",
      from: usCenter,
      to: ijnCenter,
      label: "美特混→南云",
      side: "USN",
    });
  }
  return axes;
}

export type ZoneSkeletonChange = {
  id: string;
  kind: "level" | "hidden" | "label" | "same";
  skeletonLevel: string;
  skeletonLabel: string;
  currentLevel?: string;
  currentLabel?: string;
  /** 短中文说明 */
  text: string;
};

export type AxisSkeletonChange = {
  kind: "kept" | "removed" | "added" | "relabeled";
  side?: string;
  text: string;
};

export type MapSkeletonDiff = {
  zones: ZoneSkeletonChange[];
  axes: AxisSkeletonChange[];
  /** 是否有任何非 same/kept 变更 */
  hasChanges: boolean;
  summaryLines: string[];
};

function approxSameEndpoint(
  a: [number, number] | undefined,
  b: [number, number] | undefined,
  tol = 0.35,
): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

/** 默认轴是否仍出现在结果里（按 side + 端点近似匹配）。 */
function findMatchingAxis(
  def: MapAxis,
  axes: MapAxis[],
): MapAxis | undefined {
  return axes.find(
    (a) =>
      a.side === def.side &&
      approxSameEndpoint(a.from, def.from) &&
      approxSameEndpoint(a.to, def.to),
  );
}

export function diffMapAgainstSkeleton(
  pack: SlicePack,
  spec: SituationViewSpec,
): MapSkeletonDiff {
  const skeleton = buildThreatZoneSkeleton(pack);
  const zones = spec.map?.threat_zones ?? [];
  const byId = new Map(zones.map((z) => [z.id, z]));

  const zoneChanges: ZoneSkeletonChange[] = skeleton.map((sk) => {
    const cur = byId.get(sk.id);
    if (!cur) {
      return {
        id: sk.id,
        kind: "hidden" as const,
        skeletonLevel: String(sk.level),
        skeletonLabel: sk.label,
        text: `隐藏「${sk.label}」(${sk.id})`,
      };
    }
    const levelSame = String(cur.level) === String(sk.level);
    const labelSame = (cur.label ?? "") === (sk.label ?? "");
    if (!levelSame) {
      return {
        id: sk.id,
        kind: "level" as const,
        skeletonLevel: String(sk.level),
        skeletonLabel: sk.label,
        currentLevel: String(cur.level),
        currentLabel: cur.label,
        text: `「${sk.label}」等级 ${sk.level}→${cur.level}`,
      };
    }
    if (!labelSame) {
      return {
        id: sk.id,
        kind: "label" as const,
        skeletonLevel: String(sk.level),
        skeletonLabel: sk.label,
        currentLevel: String(cur.level),
        currentLabel: cur.label,
        text: `「${sk.label}」标签→「${cur.label}」`,
      };
    }
    return {
      id: sk.id,
      kind: "same" as const,
      skeletonLevel: String(sk.level),
      skeletonLabel: sk.label,
      currentLevel: String(cur.level),
      currentLabel: cur.label,
      text: `「${sk.label}」与骨架相同`,
    };
  });

  // 结果里出现骨架没有的 id（理论上 merge 后不应有；仍标出）
  for (const z of zones) {
    if (skeleton.some((s) => s.id === z.id)) continue;
    zoneChanges.push({
      id: z.id,
      kind: "label",
      skeletonLevel: "—",
      skeletonLabel: "（非骨架）",
      currentLevel: String(z.level),
      currentLabel: z.label,
      text: `额外圈「${z.label}」(${z.id})`,
    });
  }

  const defaults = buildDefaultMapAxes(pack);
  const axes = spec.map?.axes ?? [];
  const matched = new Set<string>();
  const axisChanges: AxisSkeletonChange[] = [];

  for (const def of defaults) {
    const hit = findMatchingAxis(def, axes);
    if (!hit) {
      axisChanges.push({
        kind: "removed",
        side: def.side,
        text: `删轴「${def.label}」(${def.side})`,
      });
      continue;
    }
    matched.add(hit.id);
    if ((hit.label ?? "") !== (def.label ?? "")) {
      axisChanges.push({
        kind: "relabeled",
        side: def.side,
        text: `轴「${def.label}」→「${hit.label}」`,
      });
    } else {
      axisChanges.push({
        kind: "kept",
        side: def.side,
        text: `保留「${def.label}」`,
      });
    }
  }

  for (const a of axes) {
    if (matched.has(a.id)) continue;
    const asDefault = defaults.some(
      (d) =>
        d.side === a.side &&
        approxSameEndpoint(a.from, d.from) &&
        approxSameEndpoint(a.to, d.to),
    );
    if (asDefault) continue;
    axisChanges.push({
      kind: "added",
      side: a.side,
      text: `新增「${a.label || a.id}」(${a.side ?? "—"})`,
    });
  }

  const zoneDiffs = zoneChanges.filter((c) => c.kind !== "same");
  const axisDiffs = axisChanges.filter((c) => c.kind !== "kept");
  const summaryLines = [
    ...zoneDiffs.map((c) => c.text),
    ...axisDiffs.map((c) => c.text),
  ];

  return {
    zones: zoneChanges,
    axes: axisChanges,
    hasChanges: summaryLines.length > 0,
    summaryLines,
  };
}
