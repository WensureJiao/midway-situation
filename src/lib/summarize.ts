import type { AnalysisTask, CompactUnit, SlicePack } from "./types";

function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export function isAirborne(u: CompactUnit): boolean {
  if (u.unit_type !== "Aircraft") return false;
  if (u.status === "空中" || u.status.includes("起飞")) return true;
  return (u.altitude_m ?? 0) > 50;
}

function keyShips(units: CompactUnit[]): CompactUnit[] {
  const carriers = units.filter(
    (u) =>
      u.unit_type === "Ship" &&
      (u.unit_class.includes("航空母舰") ||
        /Akagi|Kaga|Soryu|Hiryu|Enterprise|Hornet|Yorktown|加贺|赤城|苍龙|飞龙/i.test(
          u.name,
        )),
  );
  const capital = units.filter(
    (u) =>
      u.unit_type === "Ship" &&
      (u.unit_class.includes("战列") ||
        u.unit_class.includes("巡洋") ||
        /Tone|Chikuma|Kirishima|Haruna|利根|筑摩|雾岛|榛名/i.test(u.name)),
  );
  const facilities = units.filter((u) => u.unit_type === "Facility");
  const seen = new Set<string>();
  const out: CompactUnit[] = [];
  for (const u of [...carriers, ...capital, ...facilities]) {
    if (seen.has(u.name)) continue;
    seen.add(u.name);
    out.push(u);
  }
  return out;
}

function shipLine(u: CompactUnit): string {
  const bits = [
    u.name,
    u.unit_class,
    u.status,
    fmtCoord(u.latitude, u.longitude),
    `${u.speed_kn} kn / ${u.heading_deg}°`,
  ];
  if (u.damaged) bits.push("damaged");
  if (u.embarked_aircraft_count != null) {
    bits.push(`舰载${u.embarked_aircraft_count}`);
    if (u.embarked_ready_count != null) {
      bits.push(`ready0=${u.embarked_ready_count}`);
    }
  }
  return `- ${bits.join("｜")}`;
}

function airborneSample(units: CompactUnit[], limit = 12): string {
  const air = units.filter(isAirborne);
  if (!air.length) return "（无在空飞机）";
  const lines = air.slice(0, limit).map(
    (u) =>
      `- ${u.name}｜${u.unit_class}｜${fmtCoord(u.latitude, u.longitude)}｜${u.altitude_m} m｜${u.heading_deg}°`,
  );
  if (air.length > limit) lines.push(`- …另有 ${air.length - limit} 架在空`);
  return lines.join("\n");
}

/** Compress pack into LLM-friendly text while keeping geometry. */
export function summarizePackForPrompt(pack: SlicePack): string {
  const usn = pack.sides.USN;
  const ijn = pack.sides.IJN;
  const sections: string[] = [];

  sections.push(`### 蓝方 USN 摘要
${JSON.stringify(usn.summary)}
关键平台:
${keyShips(usn.units).map(shipLine).join("\n")}
在空样本:
${airborneSample(usn.units)}`);

  sections.push(`### 红方 IJN 摘要
${JSON.stringify(ijn.summary)}
关键平台:
${keyShips(ijn.units).map(shipLine).join("\n")}
在空样本:
${airborneSample(ijn.units)}`);

  if (pack.intent.force_posture) {
    sections.push(
      `### 兵力态势摘要\n${JSON.stringify(pack.intent.force_posture)}`,
    );
  }

  return sections.join("\n\n");
}

export function selectTasks(
  pack: SlicePack,
  taskIds?: string[],
): AnalysisTask[] {
  const all = [...(pack.intent.tasks ?? []), ...(pack.threat.tasks ?? [])];
  if (!taskIds?.length) return all;
  const set = new Set(taskIds);
  return all.filter((t) => set.has(t.task_id));
}

export function centroid(units: CompactUnit[]): [number, number] | null {
  if (!units.length) return null;
  const lat = units.reduce((s, u) => s + u.latitude, 0) / units.length;
  const lon = units.reduce((s, u) => s + u.longitude, 0) / units.length;
  return [lat, lon];
}

export function findUnit(
  pack: SlicePack,
  predicate: (u: CompactUnit) => boolean,
): CompactUnit | undefined {
  return (
    pack.sides.USN.units.find(predicate) ||
    pack.sides.IJN.units.find(predicate)
  );
}

export function findByNameHint(
  pack: SlicePack,
  hint: string,
): CompactUnit | undefined {
  const re = new RegExp(hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return findUnit(pack, (u) => re.test(u.name));
}
