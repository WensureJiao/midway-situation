/**
 * 五个时间片 × 威胁/意图 × A/B，只生成短推理，便于看 B 是否沿 C/R/O/M 与 reasoning_path。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs", "vmmp_reasoning");
const slices = ["T1", "T21", "T81", "T145", "T193"];

function loadEnvLocal() {
  const text = fs.readFileSync(path.join(root, ".env.local"), "utf8");
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

function clip(s, n) {
  const raw = typeof s === "string" ? s : s == null ? "" : JSON.stringify(s);
  const t = raw.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function summarizePack(pack) {
  const pick = (side) =>
    (side.units || [])
      .filter(
        (u) =>
          u.unit_type === "Ship" &&
          (String(u.unit_class || "").includes("航空母舰") ||
            String(u.unit_class || "").includes("战列") ||
            /Tone|Chikuma|利根|筑摩|雾岛|榛名|Kirishima|Haruna/i.test(u.name)),
      )
      .slice(0, 10)
      .map((u) => {
        const bits = [
          u.name,
          u.status,
          `${u.speed_kn}kn/${u.heading_deg}°`,
          `(${Number(u.latitude).toFixed(2)},${Number(u.longitude).toFixed(2)})`,
        ];
        if (u.embarked_aircraft_count != null) bits.push(`舰载${u.embarked_aircraft_count}`);
        if (u.damaged) bits.push("受损");
        return bits.join(" ");
      })
      .join("；");

  const us = pack.sides.USN.summary;
  const ij = pack.sides.IJN.summary;
  return [
    `${pack.time_slice} ${pack.phase_label}`,
    `简报：${clip(pack.intent?.situation_brief, 280)}`,
    `威胁语境：${clip(pack.threat?.threat_context, 180)}`,
    `美：舰${us.ship_count} 在空${us.airborne_aircraft_count} 舰载就绪${us.embarked_ready_count}`,
    `日：舰${ij.ship_count} 在空${ij.airborne_aircraft_count} 舰载就绪${ij.embarked_ready_count}`,
    `美关键平台：${pick(pack.sides.USN) || "无"}`,
    `日关键平台：${pick(pack.sides.IJN) || "无"}`,
  ].join("\n");
}

function buildPrompt({ taskType, condition, scenario, vmmp, pathLine }) {
  const task =
    taskType === "threat"
      ? "威胁分析（筛选关键目标、评等级、排优先级）。视角：红方（美）看蓝方（日）。"
      : "意图研判（佯动还是真打、作战方向、行动阶段）。";

  if (condition === "A") {
    return `任务：${task}

数据：
${scenario}

请用不超过 6 行中文，说明你怎么从这些数据做出判断，以及态势图上会突出什么。
不要使用 C/R/O/M/E、reasoning_path 或范式术语。不要表格。`;
  }

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
${vmmp}`;
}

async function callLlm(env, userPrompt) {
  const base = (env.OPENAI_BASE_URL || "").replace(/\/$/, "");
  const model = env.OPENAI_MODEL || "qwen-plus";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: "你是态势推理助手。按用户要求的行数简短作答，使用简体中文。",
        },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`LLM ${res.status}: ${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("空响应");
  return { model, content };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const env = loadEnvLocal();
  if (!env.OPENAI_API_KEY) throw new Error("缺少 OPENAI_API_KEY");

  const vmmpW = JSON.parse(
    fs.readFileSync(path.join(root, "data/vmmp/VMMP_W_threat_analysis.json"), "utf8"),
  );
  const vmmpI = JSON.parse(
    fs.readFileSync(path.join(root, "data/vmmp/VMMP_I_intent_assessment.json"), "utf8"),
  );
  const pathW = vmmpW.VMMP_W.O_W.reasoning_path.join(" → ");
  const pathI = vmmpI.VMMP_I.O_I.reasoning_path.join(" → ");

  const jobs = [];
  for (const slice of slices) {
    for (const taskType of ["threat", "intent"]) {
      for (const condition of ["A", "B"]) {
        jobs.push({ slice, taskType, condition });
      }
    }
  }

  const index = [];
  for (const job of jobs) {
    const id = `${job.slice}-${job.taskType}-${job.condition}`;
    const outFile = path.join(outDir, `${id}.md`);
    if (fs.existsSync(outFile) && fs.statSync(outFile).size > 40) {
      console.log("skip", id);
      index.push({ ...job, id, skipped: true });
      continue;
    }
    const pack = JSON.parse(
      fs.readFileSync(
        path.join(root, "public/data/midway", job.slice, "pack.json"),
        "utf8",
      ),
    );
    const scenario = summarizePack(pack);
    const prompt = buildPrompt({
      taskType: job.taskType,
      condition: job.condition,
      scenario,
      vmmp: job.taskType === "threat" ? JSON.stringify(vmmpW) : JSON.stringify(vmmpI),
      pathLine: job.taskType === "threat" ? pathW : pathI,
    });
    console.log("run", id);
    const t0 = Date.now();
    const result = await callLlm(env, prompt);
    fs.writeFileSync(
      outFile,
      result.content + "\n",
      "utf8",
    );
    console.log("ok", id, Date.now() - t0 + "ms");
    index.push({
      ...job,
      id,
      model: result.model,
      ms: Date.now() - t0,
    });
  }

  fs.writeFileSync(
    path.join(outDir, "meta.json"),
    JSON.stringify(
      {
        model: env.OPENAI_MODEL,
        paths: { threat: pathW, intent: pathI },
        jobs: index,
        finished_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("done", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
