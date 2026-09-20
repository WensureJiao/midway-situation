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

export function buildReasoningPrompt(
  pack: SlicePack,
  focus: TaskFocus,
  side: ReasonSide,
): string {
  const task =
    focus === "threat"
      ? "威胁分析（筛选关键目标、评等级、排优先级）。视角：红方（美）看蓝方（日）。"
      : "意图研判（佯动还是真打、作战方向、行动阶段）。";
  const scenario = [
    `${pack.time_slice} ${pack.phase_label}`,
    `简报：${pack.intent.situation_brief ?? ""}`,
    `威胁语境：${pack.threat.threat_context ?? ""}`,
    summarizePackForPrompt(pack),
  ].join("\n");

  if (side === "A") {
    return `任务：${task}

数据：
${scenario}

请用不超过 8 行中文，说明你怎么从这些数据做出判断，以及态势图上会突出什么。
不要使用 C/R/O/M/E、reasoning_path 或范式术语。不要表格。`;
  }

  const { json, pathLine } = loadVmmp(focus);
  return `任务：${task}

数据：
${scenario}

请严格按 VMMP 推理。只输出下面这几行，不要标题、不要表格、不要解释格式。
每行必须用到上面数据里的具体舰名或事实，不要只复述定义。

C：一句话，点出此刻用到的认知对象
R：一句话，点出关键认知关系
O：严格按路径逐条，每步单独一行，格式「步骤名：一句话」
路径：${pathLine}
M：两句，说明关系如何落到高亮、轴线、威胁圈或排序
E：一句话自检

VMMP：
${json}`;
}
