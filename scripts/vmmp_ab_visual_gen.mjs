/**
 * 调用本地 generate API，生成并保存视觉 A/B JSON（UTF-8）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "data", "vmmp_ab_visual");
const baseUrl = process.env.COP_BASE || "http://127.0.0.1:43127";

async function generate(focus, vmmp_mode) {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      time_slice: "T1",
      mode: "llm",
      task_focus: focus,
      vmmp_mode,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok || !data.spec) {
    throw new Error(data.error || `generate failed ${res.status}`);
  }
  if (data.used_fallback) {
    console.warn("fallback", focus, vmmp_mode, data.error);
  }
  return data.spec;
}

async function save(focus, a, b) {
  fs.mkdirSync(outDir, { recursive: true });
  const prefix = `T1-${focus}`;
  fs.writeFileSync(
    path.join(outDir, `${prefix}-A.json`),
    JSON.stringify(a, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(outDir, `${prefix}-B.json`),
    JSON.stringify(b, null, 2),
    "utf8",
  );
  fs.writeFileSync(
    path.join(outDir, `${prefix}-meta.json`),
    JSON.stringify(
      {
        saved_at: new Date().toISOString(),
        time_slice: "T1",
        task_focus: focus,
        model: "qwen-plus",
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log("saved", prefix, "titleA=", a.title, "titleB=", b.title);
}

async function main() {
  for (const focus of ["threat", "intent"]) {
    console.log("===", focus);
    const a = await generate(focus, "off");
    const b = await generate(focus, "on");
    await save(focus, a, b);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
