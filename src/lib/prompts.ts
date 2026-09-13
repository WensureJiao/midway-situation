import type { AnalysisTask, SlicePack } from "./types";

/** System prompt: forces structured COP JSON, no free-form HTML. */
export const SITUATION_SYSTEM_PROMPT = `你是海军战役「通用作战态势图（COP）」布局生成器。
输入是清洗后的单位态势数据 + 意图研判/威胁分析任务。
你的唯一输出必须是合法 JSON（不要 Markdown 围栏，不要解释文字），符合 SituationViewSpec 结构。

硬性规则：
1. 地图为主界面：给出 center、zoom、需要高亮的单位名 highlight_names、作战方向轴线 axes、威胁圈 threat_zones。
2. 配常见统计图：至少包含兵力对比柱状图、在空机型饼图/柱状图、威胁等级分布；可加舰载机就绪堆叠图。
3. 研判结论必须可追溯到输入任务的 capability / reference / hints，禁止编造不存在的航母或交火。
4. 经纬度使用输入数据中的真实坐标；中途岛约 28.21°N, 177.38°W（即 longitude ≈ -177.38）。
5. 红方=IJN（日），蓝方=USN（美含中途岛）。
6. 若某切片舰体缺失（如飞龙），在 narrative 中标注“舰体未导出/未知”，不得当作已沉没定论。
7. charts.series 的 value 必须是数字；kpis.value 可以是数字或短字符串。`;

export const SITUATION_OUTPUT_SCHEMA = `{
  "generated_by": "llm",
  "time_slice": "Txx",
  "title": "短标题",
  "phase_label": "阶段标签",
  "narrative": "2-4 句态势叙述",
  "map": {
    "center": [lat, lon],
    "zoom": 6,
    "highlight_names": ["单位名..."],
    "axes": [
      {"id":"a1","from":[lat,lon],"to":[lat,lon],"label":"进击轴","side":"IJN"}
    ],
    "threat_zones": [
      {"id":"z1","center":[lat,lon],"radius_nm":40,"level":"高","label":"说明","side":"IJN"}
    ]
  },
  "kpis": [
    {"id":"k1","label":"美航母","value":3,"tone":"usn"}
  ],
  "charts": [
    {
      "id":"c1",
      "type":"bar",
      "title":"水面舰艇数量",
      "series":[{"name":"USN","value":28,"side":"USN"},{"name":"IJN","value":20,"side":"IJN"}]
    }
  ],
  "intent_findings": [
    {"task_id":"T1-INT-01","capability":"...","bullets":["..."]}
  ],
  "threat_findings": [
    {"task_id":"T1-THR-01","capability":"...","bullets":["..."]}
  ],
  "priorities": [
    {"side":"USN","label":"蓝方优先级","items":[{"rank":1,"target":"...","action":"..."}]}
  ],
  "threat_ratings": [
    {"perspective":"蓝方看红方","target":"...","level":"高","evidence":"..."}
  ]
}`;

/** Build the user prompt from slice pack + selected analysis tasks. */
export function buildSituationUserPrompt(
  pack: SlicePack,
  tasks: AnalysisTask[],
  dataSummary: string,
): string {
  const taskBlock = tasks
    .map((t) => {
      const extra: string[] = [];
      if (t.input_hints?.length) {
        extra.push(`输入提示: ${t.input_hints.join("；")}`);
      }
      if (t.evaluation_points?.length) {
        extra.push(`评分点: ${t.evaluation_points.join("、")}`);
      }
      if (t.reference_answer) {
        extra.push(`参考结论: ${JSON.stringify(t.reference_answer)}`);
      }
      if (t.usn_view_key_threats) {
        extra.push(`美方关键威胁: ${JSON.stringify(t.usn_view_key_threats)}`);
      }
      if (t.ijn_view_key_threats) {
        extra.push(`日方关键威胁: ${JSON.stringify(t.ijn_view_key_threats)}`);
      }
      if (t.reference_ratings) {
        extra.push(`参考等级: ${JSON.stringify(t.reference_ratings)}`);
      }
      if (t.usn_priority_order) {
        extra.push(`美方优先级: ${JSON.stringify(t.usn_priority_order)}`);
      }
      if (t.ijn_priority_order) {
        extra.push(`日方优先级: ${JSON.stringify(t.ijn_priority_order)}`);
      }
      return [
        `### ${t.task_id}｜${t.category}｜${t.capability}`,
        t.prompt,
        ...extra,
      ].join("\n");
    })
    .join("\n\n");

  return `## 场景
战役: ${pack.scenario}
时间片: ${pack.time_slice}
阶段: ${pack.phase_label}
态势简述: ${pack.intent.situation_brief ?? ""}
威胁语境: ${pack.threat.threat_context ?? ""}

## 兵力与几何摘要（由清洗数据压缩）
${dataSummary}

## 本轮分析任务（数据+任务共同作为输入）
${taskBlock}

## 输出要求
只输出一个 SituationViewSpec JSON，结构如下：
${SITUATION_OUTPUT_SCHEMA}

请把上述任务的研判结果映射到 intent_findings / threat_findings / priorities / threat_ratings，
并把关键单位投影到 map.highlight_names、axes、threat_zones 与 charts。`;
}

/** Prompt template document for export / paper writing. */
export const PROMPT_TEMPLATE_MARKDOWN = `# 中途岛战役态势界面生成提示词模板

## 用法
\`\`\`
输入 = 时间片清洗数据摘要 + 意图研判/威胁分析任务
输出 = SituationViewSpec（JSON）→ 前端地图 + 统计图渲染
\`\`\`

## System
见 \`SITUATION_SYSTEM_PROMPT\`

## User 插槽
- \`{{scenario}}\` / \`{{time_slice}}\` / \`{{phase_label}}\`
- \`{{situation_brief}}\` / \`{{threat_context}}\`
- \`{{data_summary}}\`：舰艇/在空机/机场的坐标、航向、状态、损伤、舰载机就绪摘要
- \`{{tasks}}\`：选中的 INT/THR 任务全文（含 prompt、hints、reference）

## 设计意图
1. **地图主界面**：LLM 不画图，只产出布局与标注；渲染由 Leaflet 完成。
2. **统计图**：强制要求 bar/pie 等常见图表，避免纯文字报告。
3. **任务可评测**：findings 绑定 task_id，便于对照六项能力。
4. **防幻觉**：schema + 清洗摘要双约束；飞龙等缺失舰体显式标注未知。
`;
