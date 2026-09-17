import type { AnalysisTask, SlicePack } from "./types";

/** System prompt: COP layout from cleaned force data. */
export const SITUATION_SYSTEM_PROMPT = `你是海军战役「通用作战态势图（COP）」布局生成器。
输入是清洗后的单位态势数据与场景说明（可含威胁等级参考）。
你的唯一输出必须是合法 JSON（不要 Markdown 围栏，不要解释文字），符合 SituationViewSpec 结构。

目标：生成态势地图布局、关键指标叙述，以及威胁等级列表 threat_ratings；统计柱状/饼图由服务端用清洗数据固定覆盖。

硬性规则：
1. 地图为主界面：给出 center、zoom、需要高亮的单位名 highlight_names、作战方向轴线 axes、威胁圈 threat_zones。
2. 统计图固定为：水面舰艇数量、在空飞机数量、蓝方舰载机就绪机型构成、红方舰载机就绪机型构成，另加威胁目标排序图（依赖 threat_ratings）。
3. threat_ratings 必须按目标列出 perspective（蓝方看红方 / 红方看蓝方）、target、level、evidence。
4. 禁止编造不存在的航母、交火或单位；经纬度必须来自输入数据。中途岛约 28.21°N, 177.38°W（longitude ≈ -177.38）。
5. 红方=IJN（日），蓝方=USN（美含中途岛）。
6. 若某切片舰体缺失（如飞龙），在 narrative 中标注“舰体未导出/未知”，不得当作已沉没定论。
7. charts.series 的 value 必须是数字；kpis.value 可以是数字或短字符串。
8. intent_findings / threat_findings / priorities 请输出空数组 []（不展示文字研判面板）。`;

export const SITUATION_OUTPUT_SCHEMA = `{
  "generated_by": "llm",
  "time_slice": "Txx",
  "title": "短标题",
  "phase_label": "阶段标签",
  "narrative": "2-4 句态势叙述（基于兵力几何与场景说明）",
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
    {"id":"ships","type":"bar","title":"水面舰艇数量","series":[{"name":"USN","value":28,"side":"USN"},{"name":"IJN","value":20,"side":"IJN"}]},
    {"id":"airborne","type":"bar","title":"在空飞机数量","series":[{"name":"USN","value":0,"side":"USN"},{"name":"IJN","value":0,"side":"IJN"}]},
    {"id":"usn-embarked-class","type":"pie","title":"蓝方舰载机机型构成（就绪）","series":[{"name":"战斗机-野猫","value":79,"side":"USN"}]},
    {"id":"ijn-embarked-class","type":"pie","title":"红方舰载机机型构成（就绪）","series":[{"name":"战斗机-零式","value":73,"side":"IJN"}]}
  ],
  "intent_findings": [],
  "threat_findings": [],
  "priorities": [],
  "threat_ratings": [
    {"perspective":"蓝方看红方","target":"南云四航母","level":"高","evidence":"..."},
    {"perspective":"红方看蓝方","target":"中途岛机场","level":"高","evidence":"..."}
  ]
}`;

/** Build the user prompt from slice pack + data summary. */
export function buildSituationUserPrompt(
  pack: SlicePack,
  _tasks: AnalysisTask[],
  dataSummary: string,
): string {
  const ratingTask = (pack.threat?.tasks ?? []).find(
    (t) => t.reference_ratings?.length,
  );
  const ratingsBlock = ratingTask?.reference_ratings
    ? JSON.stringify(ratingTask.reference_ratings, null, 2)
    : "（本切片无参考威胁等级，请根据兵力几何自行给出合理 threat_ratings）";

  return `## 场景
战役: ${pack.scenario}
时间片: ${pack.time_slice}
阶段: ${pack.phase_label}
态势简述: ${pack.intent.situation_brief ?? ""}
威胁语境: ${pack.threat.threat_context ?? ""}

## 兵力与几何摘要（由清洗数据压缩）
${dataSummary}

## 威胁等级参考（用于 threat_ratings / 威胁目标排序图）
${ratingsBlock}

## 输出要求
只输出一个 SituationViewSpec JSON，结构如下：
${SITUATION_OUTPUT_SCHEMA}

请根据兵力几何生成 map、title、narrative、kpis，并填写 threat_ratings（可蓝/红视角）。
charts 可按示例填写（服务端会覆盖为固定四张数据图）。
intent_findings、threat_findings、priorities 一律输出 []。`;
}

/** Prompt template document for export / paper writing. */
export const PROMPT_TEMPLATE_MARKDOWN = `# 中途岛战役态势界面生成提示词模板

## 用法
\`\`\`
输入 = 时间片清洗数据摘要 + 场景简述 + 威胁等级参考
输出 = SituationViewSpec（JSON）→ 前端地图 + 固定统计图 + 威胁等级图
\`\`\`

## System
见 \`SITUATION_SYSTEM_PROMPT\`

## 设计意图
1. **地图主界面**：LLM 产出布局与标注；渲染由 Leaflet 完成。
2. **固定统计图**：水面舰艇、在空飞机、蓝/红舰载机就绪构成 + 威胁目标排序。
3. **不展示意图/威胁文字研判面板**，但保留威胁等级图表。
4. **防幻觉**：schema + 清洗摘要双约束。
`;
