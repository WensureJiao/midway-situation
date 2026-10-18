/** 排序里写成「赤城/加贺/苍龙」的舰名捆，拆成各自一条。概念词（如水侦/发现链）不拆。 */

const SHIP_NAMES = [
  "赤城",
  "加贺",
  "苍龙",
  "飞龙",
  "利根",
  "筑摩",
  "Akagi",
  "Kaga",
  "Soryu",
  "Hiryu",
  "Tone",
  "Chikuma",
];

export function expandBundledShipTarget(target: string): string[] {
  const trimmed = target.trim();
  const noteMatch = trimmed.match(/^(.*?)(（[^）]*）)\s*$/);
  const note = noteMatch?.[2] ?? "";
  const body = (noteMatch?.[1] ?? trimmed).trim();
  const parts = body.split(/[/／]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return [trimmed];

  const parsed = parts.map((part) => {
    const ship = SHIP_NAMES.find(
      (name) =>
        part.startsWith(name) ||
        part.toLowerCase().startsWith(name.toLowerCase()),
    );
    if (!ship) return null;
    return { ship, rest: part.slice(ship.length).trim() };
  });
  if (parsed.some((p) => !p)) return [trimmed];

  const rests = parsed.map((p) => p!.rest);
  const shared = [...new Set(rests.filter(Boolean))];
  const suffix = shared.length === 1 ? shared[0] : "";
  return parsed.map((p) => `${p!.ship}${p!.rest || suffix}${note}`);
}
