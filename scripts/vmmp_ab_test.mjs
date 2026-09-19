/**
 * VMMP A/B 离线测试：不改应用代码，直接调 LLM。
 * A=无范式，B=附带对应 VMMP JSON。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "vmmp_ab_test");
const vmmpDir = "d:\\研究生项目1\\模拟战役\\态势图测试";

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  const text = fs.readFileSync(p, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function summarizePack(pack) {
  const usn = pack.sides.USN.summary;
  const ijn = pack.sides.IJN.summary;
  const posture = pack.intent?.force_posture;
  const brief = pack.intent?.situation_brief || pack.phase_label;
  return [
    `场景：${pack.scenario} / ${pack.time_slice}`,
    `阶段：${pack.phase_label}`,
    `简报：${brief}`,
    `美方摘要：舰${usn.ship_count}、在空机${usn.airborne_aircraft_count}、设施${usn.facility_count}、舰载就绪约${usn.embarked_ready_count}`,
    `日方摘要：舰${ijn.ship_count}、在空机${ijn.airborne_aircraft_count}、舰载就绪约${ijn.embarked_ready_count}`,
    `兵力态势：${JSON.stringify(posture)}`,
    `威胁上下文：${pack.threat?.threat_context || ""}`,
  ].join("\n");
}

function buildPrompt({ taskType, condition, scenario, vmmp }) {
  const taskLine =
    taskType === "threat"
      ? "任务：威胁分析（关键威胁目标筛选、威胁等级评估、目标优先级排序）。视角：红方（美军）看蓝方（日军）。"
      : "任务：意图研判（佯动与真实打击区分、作战方向判断、行动阶段推断）。";

  const commonOut = `请输出中文，结构如下：
## 推理过程
（简要写出你如何从数据得出结论）
## 态势界面方案
1. 地图：放什么、如何编码（位置/航向/突出）
2. 图表与指标：需要哪些图、KPI
3. 布局：主辅视图如何安排
4. 要突出的信息与不确定性如何表达`;

  if (condition === "A") {
    return `${taskLine}

场景数据：
${scenario}

${commonOut}`;
  }

  return `${taskLine}

场景数据：
${scenario}

请严格依据下面的 VMMP 范式进行推理：
1) 先从 C/R/O 判断当前任务要认知什么、什么关系、做什么操作
2) 再按 M 映射到视觉组织 T
3) 最后按 E 的评价维度自检
推理过程中请点名用到的 C/R/O/M 要素，不要只复述 JSON。

VMMP：
${vmmp}

${commonOut}`;
}

async function callLlm(env, userPrompt) {
  const apiKey = env.OPENAI_API_KEY;
  const base = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = env.OPENAI_MODEL || "qwen-plus";
  const system =
    "你是作战态势可视化设计助手。根据任务与数据给出可落地的态势界面方案。不要编造场景中不存在的交火。";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`LLM ${res.status}: ${raw.slice(0, 500)}`);
  }
  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("空响应");
  return { model, content, usage: data.usage || null };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const env = loadEnvLocal();
  if (!env.OPENAI_API_KEY) throw new Error("缺少 OPENAI_API_KEY");

  const pack = JSON.parse(
    fs.readFileSync(path.join(root, "public/data/midway/T1/pack.json"), "utf8"),
  );
  const scenario = summarizePack(pack);
  const vmmpW = fs.readFileSync(
    path.join(vmmpDir, "VMMP_W_threat_analysis.json"),
    "utf8",
  );
  const vmmpI = fs.readFileSync(
    path.join(vmmpDir, "VMMP_I_intent_assessment.json"),
    "utf8",
  );

  const jobs = [
    { id: "T1-threat-A", taskType: "threat", condition: "A", vmmp: null },
    { id: "T1-threat-B", taskType: "threat", condition: "B", vmmp: vmmpW },
    { id: "T1-intent-A", taskType: "intent", condition: "A", vmmp: null },
    { id: "T1-intent-B", taskType: "intent", condition: "B", vmmp: vmmpI },
  ];

  const meta = {
    started_at: new Date().toISOString(),
    scenario: "T1",
    note: "预实验：助手按 E 指标评分；非正式盲评专家结果",
    runs: [],
  };

  fs.writeFileSync(
    path.join(outDir, "00_scenario_summary.txt"),
    scenario,
    "utf8",
  );

  for (const job of jobs) {
    console.log("Running", job.id, "...");
    const prompt = buildPrompt({
      taskType: job.taskType,
      condition: job.condition,
      scenario,
      vmmp: job.vmmp,
    });
    fs.writeFileSync(
      path.join(outDir, `${job.id}_prompt.txt`),
      prompt,
      "utf8",
    );
    const t0 = Date.now();
    const result = await callLlm(env, prompt);
    const ms = Date.now() - t0;
    fs.writeFileSync(
      path.join(outDir, `${job.id}_response.md`),
      result.content,
      "utf8",
    );
    meta.runs.push({
      id: job.id,
      taskType: job.taskType,
      condition: job.condition,
      model: result.model,
      latency_ms: ms,
      usage: result.usage,
      response_file: `${job.id}_response.md`,
    });
    console.log("OK", job.id, ms + "ms");
  }

  meta.finished_at = new Date().toISOString();
  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  console.log("Done. Outputs in", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
