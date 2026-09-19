import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  buildPromptBundle,
  buildThreatRatingsFromPack,
  generateSituationLocal,
  buildFixedKpis,
} from "@/lib/localGenerator";
import type {
  GenerateRequest,
  GenerateResponse,
  SituationViewSpec,
  SlicePack,
} from "@/lib/types";
import { normalizeSituationSpec } from "@/lib/utils";

async function loadPack(timeSlice: string): Promise<SlicePack> {
  const file = path.join(
    process.cwd(),
    "public",
    "data",
    "midway",
    timeSlice,
    "pack.json",
  );
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as SlicePack;
}

function extractJson(text: string): SituationViewSpec {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("模型输出中未找到 JSON 对象");
  return JSON.parse(body.slice(start, end + 1)) as SituationViewSpec;
}

async function callLlm(
  system: string,
  user: string,
  model?: string,
): Promise<SituationViewSpec> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("未配置 OPENAI_API_KEY，已回退本地生成器");
  }
  const base =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ||
    "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM 调用失败: ${res.status} ${errText.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回空内容");
  const spec = extractJson(content);
  spec.generated_by = "llm";
  return spec;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRequest;
    const timeSlice = body.time_slice || "T1";
    const pack = await loadPack(timeSlice);
    const lockCharts = body.lock_charts !== false;
    const taskFocus = body.task_focus ?? "threat";
    const { system_prompt, prompt } = buildPromptBundle(pack, body.task_ids, {
      vmmp_mode: body.vmmp_mode ?? "off",
      task_focus: taskFocus,
      lock_charts: lockCharts,
    });

    let spec: SituationViewSpec;
    let used_fallback = false;
    let error: string | undefined;

    if (body.mode === "llm") {
      try {
        spec = await callLlm(system_prompt, prompt, body.model);
      } catch (e) {
        used_fallback = true;
        error = e instanceof Error ? e.message : String(e);
        spec = generateSituationLocal(pack, body.task_ids);
      }
    } else {
      spec = generateSituationLocal(pack, body.task_ids);
    }

    // KPI 固定；默认不再注入四张兵力统计图；对比页 lock_charts=false 时保留模型 charts
    const ratings =
      taskFocus === "intent"
        ? (spec.threat_ratings ?? [])
        : spec.threat_ratings?.length
          ? spec.threat_ratings
          : buildThreatRatingsFromPack(pack);
    const charts =
      !lockCharts && spec.charts?.length
        ? spec.charts.filter(
            (c) =>
              !["ships", "airborne", "usn-embarked-class", "ijn-embarked-class"].includes(
                c.id,
              ),
          )
        : [];
    spec = {
      ...spec,
      kpis: buildFixedKpis(pack),
      charts,
      intent_findings: [],
      threat_findings: [],
      priorities: [],
      threat_ratings: ratings,
    };

    const payload: GenerateResponse = {
      ok: true,
      system_prompt,
      prompt,
      spec: normalizeSituationSpec(spec),
      used_fallback,
      error,
    };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        system_prompt: "",
        prompt: "",
        spec: null,
        error: message,
      },
      { status: 500 },
    );
  }
}
