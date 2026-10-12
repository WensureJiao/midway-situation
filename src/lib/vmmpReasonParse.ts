/** VMMP_I 默认认知操作路径（与 data/vmmp/VMMP_I_*.json 对齐） */
export const INTENT_REASONING_PATH = [
  "Identify",
  "Trace",
  "Compare",
  "Relate",
  "Infer",
  "Verify",
] as const;

/** VMMP_W 默认路径（与 data/vmmp/VMMP_W_*.json 对齐） */
export const THREAT_REASONING_PATH = [
  "Identify",
  "Locate",
  "Filter",
  "Compare",
  "Aggregate",
  "Assess",
  "Rank",
  "Verify",
] as const;

export type CrotmeBlock = {
  /** 研判结论（置顶展示；扩展图依此对照） */
  conclusion?: string;
  C?: string;
  R?: string;
  /** O 路径逐步 */
  O: { step: string; text: string }[];
  M?: string;
  E?: string;
  /** A 侧或解析失败时的原文 */
  freeform?: string;
  /** 是否像按 C/R/O/M/E 写的 */
  structured: boolean;
};

const STEP_RE =
  /^(Identify|Locate|Trace|Filter|Compare|Relate|Aggregate|Assess|Evaluate|Rank|Infer|Verify|Explain|识别|定位|追踪|筛选|比较|关联|聚合|评估|排序|推断|核对)[:：]\s*(.+)$/i;

/**
 * 解析对比页推理文本：B 侧期望 C/R/O/M/E；A 侧多为自由叙述。
 */
export function parseCrotmeReasoning(raw: string | undefined | null): CrotmeBlock {
  const text = (raw ?? "").trim();
  if (!text) {
    return { O: [], structured: false, freeform: "" };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let conclusion: string | undefined;
  let C: string | undefined;
  let R: string | undefined;
  let M: string | undefined;
  let E: string | undefined;
  const O: { step: string; text: string }[] = [];
  const other: string[] = [];

  for (const line of lines) {
    const mCon = line.match(/^(?:结论|CONCLUSION)[:：]\s*(.+)$/i);
    if (mCon) {
      conclusion = mCon[1].trim();
      continue;
    }
    const mC = line.match(/^C[:：]\s*(.+)$/i);
    if (mC) {
      C = mC[1].trim();
      continue;
    }
    const mR = line.match(/^R[:：]\s*(.+)$/i);
    if (mR) {
      R = mR[1].trim();
      continue;
    }
    const mM = line.match(/^M[:：]\s*(.+)$/i);
    if (mM) {
      M = (M ? `${M} ` : "") + mM[1].trim();
      continue;
    }
    const mE = line.match(/^E[:：]\s*(.+)$/i);
    if (mE) {
      E = mE[1].trim();
      continue;
    }
    if (/^O[:：]/i.test(line) && !STEP_RE.test(line.replace(/^O[:：]\s*/i, ""))) {
      continue;
    }
    const stepLine = line.replace(/^O[:：]\s*/i, "");
    const mS = stepLine.match(STEP_RE);
    if (mS) {
      O.push({ step: mS[1], text: mS[2].trim() });
      continue;
    }
    other.push(line);
  }

  const structured = Boolean(conclusion || C || R || M || E || O.length);

  // 无显式结论时：优先 Infer/Rank/Assess，否则用 C
  if (!conclusion) {
    const infer =
      [...O].reverse().find((o) =>
        /^(Infer|Rank|Assess|推断|排序|评估)$/i.test(o.step),
      ) ?? O[O.length - 1];
    conclusion = infer?.text || C || undefined;
  }

  // A 侧自由文：首行作结论，其余作过程
  let freeform = structured ? undefined : text;
  if (!structured && !conclusion && other.length) {
    conclusion = other[0];
    freeform = other.slice(1).join("\n") || text;
  } else if (!structured && conclusion && other.length) {
    freeform = other.join("\n");
  }

  return {
    conclusion,
    C,
    R,
    O,
    M,
    E,
    structured,
    freeform,
  };
}
