import fs from "fs";
import path from "path";
import { summarizePackForPrompt } from "./summarize";
import type { SlicePack, TaskFocus } from "./types";

export type ReasonSide = "A" | "B";

export function assertReasoningKey(
  slice: string,
  focus: string,
  side: string,
): { slice: string; focus: TaskFocus; side: ReasonSide } {
  if (!/^T\d+$/.test(slice)) throw new Error("时间片不合法");
  if (focus !== "threat" && focus !== "intent") throw new Error("任务不合法");
  if (side !== "A" && side !== "B") throw new Error("侧别不合法");
  return { slice, focus, side };
}

export function reasoningFilePath(
  slice: string,
  focus: TaskFocus,
  side: ReasonSide,
): string {
  return path.join(
    process.cwd(),
    "docs",
    "vmmp_reasoning",
    `${slice}-${focus}-${side}.md`,
  );
}

function loadVmmp(focus: TaskFocus): { json: string; pathLine: string } {
  const file =
    focus === "intent"
      ? "VMMP_I_intent_assessment.json"
      : "VMMP_W_threat_analysis.json";
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "vmmp", file),
    "utf8",
  );
  const parsed = JSON.parse(raw) as {
    VMMP_W?: { O_W?: { reasoning_path?: string[] } };
    VMMP_I?: { O_I?: { reasoning_path?: string[] } };
  };
  const pathLine =
    focus === "intent"
      ? (parsed.VMMP_I?.O_I?.reasoning_path ?? []).join(" → ")
      : (parsed.VMMP_W?.O_W?.reasoning_path ?? []).join(" → ");
  return { json: raw, pathLine };
}

const OBSERVER_RULE = `硬性视角（必须遵守）：
- 观察者固定为美方（红方 USN，含中途岛）。用「我方 / 美方」口吻写「此刻怎样看敌情」，不要旁白总览全场。
- 禁止出现日方视角结论：不要写「蓝方看红方」「日方认为/日方计划/日方将如何评估美方」；不要给日方做威胁排序或意图自述。
- 禁止上帝视角：不要并排给美日双方各写一套对称结论或开战潜力总排名；不要把美方航母/中途岛写进威胁优先级。
- 威胁任务：识别→…→排序的对象只能是日方目标；美方兵力只作己方态势背景。
- 意图任务：用美方可见证据推断「日方更像在做什么」；主语仍是美方观察者，不是日方参谋。`;

export function buildReasoningPrompt(
  pack: SlicePack,
  focus: TaskFocus,
  side: ReasonSide,
): string {
  const task =
    focus === "threat"
      ? "威胁分析（美方视角：筛选日方关键威胁、评等级、排优先级）。"
      : "意图研判（美方视角：日方是佯动还是真打、作战指向、行动阶段）。";
  const scenario = [
    `${pack.time_slice} ${pack.phase_label}`,
    `简报：${pack.intent.situation_brief ?? ""}`,
    `威胁语境：${pack.threat.threat_context ?? ""}`,
    summarizePackForPrompt(pack),
  ].join("\n");

  if (side === "A") {
    return `任务：${task}

${OBSERVER_RULE}

数据：
${scenario}

必须先写结论、再写过程（扩展图将对照结论来读）：
结论：一句话，直接给出美方此刻的判断结果（威胁任务写最高优先日方目标及等级；意图任务写佯动/真打、主方向或阶段判断）
过程：随后不超过 6 行，说明依据与态势图会突出什么。
不要使用 C/R/O/M/E、reasoning_path 或范式术语。不要表格。`;
  }

  const { json, pathLine } = loadVmmp(focus);
  return `任务：${task}

${OBSERVER_RULE}

数据：
${scenario}

请严格按 VMMP 推理。只输出下面这几行，不要标题、不要表格、不要解释格式。
每行必须用到上面数据里的具体舰名或事实，不要只复述定义。
必须先写结论，再写 C/R/O/M/E 过程；后续证据类扩展图对照结论阅读。
C/R/O/M/E 的主语都是美方观察者；O 路径各步只处理日方目标或日方意图证据。

结论：一句话（威胁=最高优先日方目标及等级；意图=佯动/真打、主方向或阶段）
C：一句话，点出美方此刻盯住的日方认知对象
R：一句话，点出与日方相关的关键关系（距离、航向、暴露等）
O：严格按路径逐条，每步单独一行，格式「步骤名：一句话」
路径：${pathLine}
M：两句，说明如何落到高亮（日方关键单位）、作战指向、关注区或日方威胁排序
E：一句话自检（确认未混入日方视角或上帝视角双侧排序）

VMMP：
${json}`;
}
