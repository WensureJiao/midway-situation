import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  assertReasoningKey,
  buildReasoningPrompt,
  reasoningFilePath,
} from "@/lib/vmmpReasoning";
import type { SlicePack, TaskFocus } from "@/lib/types";

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

async function callReasoningLlm(user: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("未配置 OPENAI_API_KEY");
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
      model: process.env.OPENAI_MODEL || "qwen-plus",
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: "你是态势推理助手。按用户要求的行数简短作答，使用简体中文。",
        },
        { role: "user", content: user },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`LLM ${res.status}: ${raw.slice(0, 240)}`);
  const data = JSON.parse(raw) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("推理返回为空");
  return content;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const key = assertReasoningKey(
      url.searchParams.get("slice") || "",
      url.searchParams.get("focus") || "",
      url.searchParams.get("side") || "",
    );
    const file = reasoningFilePath(key.slice, key.focus, key.side);
    try {
      const text = await fs.readFile(file, "utf8");
      return NextResponse.json({ ok: true, text });
    } catch {
      return NextResponse.json({ ok: true, text: "" });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      time_slice?: string;
      task_focus?: TaskFocus;
      side?: string;
    };
    const key = assertReasoningKey(
      body.time_slice || "T1",
      body.task_focus || "threat",
      body.side || "",
    );
    const pack = await loadPack(key.slice);
    const text = await callReasoningLlm(
      buildReasoningPrompt(pack, key.focus, key.side),
    );
    const file = reasoningFilePath(key.slice, key.focus, key.side);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, "utf8");
    return NextResponse.json({ ok: true, text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
