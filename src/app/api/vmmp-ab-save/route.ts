import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { SituationViewSpec, TaskFocus } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      time_slice: string;
      task_focus: TaskFocus;
      spec_a: SituationViewSpec;
      spec_b: SituationViewSpec;
    };
    const slice = body.time_slice || "T1";
    const focus = body.task_focus || "threat";
    const dir = path.join(process.cwd(), "public", "data", "vmmp_ab_visual");
    await fs.mkdir(dir, { recursive: true });
    const base = `${slice}-${focus}`;
    await fs.writeFile(
      path.join(dir, `${base}-A.json`),
      JSON.stringify(body.spec_a, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(dir, `${base}-B.json`),
      JSON.stringify(body.spec_b, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(dir, `${base}-meta.json`),
      JSON.stringify(
        {
          saved_at: new Date().toISOString(),
          time_slice: slice,
          task_focus: focus,
        },
        null,
        2,
      ),
      "utf8",
    );
    return NextResponse.json({ ok: true, base });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
