import type {
  AnalysisTask,
  SlicePack,
  TaskFocus,
  VmmpMode,
} from "./types";

/** System prompt: COP layout from cleaned force data. */
export const SITUATION_SYSTEM_PROMPT = `你是海军战役「通用作战态势图（COP）」布局生成器。
输入是清洗后的单位态势数据与场景说明（可含威胁等级参考；可选附带 VMMP 范式）。
你的唯一输出必须是合法 JSON（不要 Markdown 围栏，不要解释文字），符合 SituationViewSpec 结构。

目标：生成态势地图布局、关键指标叙述，以及威胁等级列表 threat_ratings（威胁任务）或阶段/方向相关编码（意图任务）。默认不强制四张兵力统计图。

硬性规则：
1. 地图为主界面：给出 center、zoom、需要高亮的单位名 highlight_names、作战方向轴线 axes、威胁圈 threat_zones。
2. KPI 由服务端用清洗数据固定覆盖：美航母、日航母舰体、在空飞机、损伤舰艇。
   默认不展示水面舰艇/在空飞机/舰载机构成四张统计图；若允许自由设计 charts，再按任务补 0～4 张任务相关图。
3. threat_ratings 必须按目标列出 perspective（可用「蓝方看红方/红方看蓝方」或「美方看日方/日方看美方」）、target、level、evidence。
4. 禁止编造不存在的航母、交火或单位；经纬度必须来自输入数据。中途岛约 28.21°N, 177.38°W（longitude ≈ -177.38）。
5. 红方=USN（美含中途岛，地图用红色），蓝方=IJN（日，地图用蓝色）。
6. 若某切片舰体缺失（如飞龙），在 narrative 中标注“舰体未导出/未知”，不得当作已沉没定论。
7. charts.series 的 value 必须是数字；kpis.value 必须是数字。
8. intent_findings / threat_findings / priorities 请输出空数组 []（不展示文字研判面板）。
9. 若用户消息含 VMMP：先按 C/R/O 组织认知，再按 M 映射到 map（highlight/axes/threat_zones）与 threat_ratings，最后用 E 自检；仍只输出 SituationViewSpec JSON。`;

export type PromptVmmpOptions = {
  vmmp_mode?: VmmpMode;
  task_focus?: TaskFocus;
  /** 已序列化的 VMMP JSON 全文；仅 vmmp_mode=on 时传入 */
  vmmp_json?: string | null;
  /** true=服务端覆盖固定四图；false=由模型设计 charts（对比实验） */
  lock_charts?: boolean;
};

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
    {"id":"us-cv","label":"美航母","value":3,"tone":"usn"},
    {"id":"ijn-cv","label":"日航母舰体","value":4,"tone":"ijn"},
    {"id":"air","label":"在空飞机","value":0,"tone":"warn"},
    {"id":"dmg","label":"损伤舰艇","value":0,"tone":"neutral"}
  ],
  "charts": [
    {"id":"ships","type":"bar","title":"水面舰艇数量","series":[{"name":"USN","value":28,"side":"USN"},{"name":"IJN","value":20,"side":"IJN"}]},
    {"id":"airborne","type":"bar","title":"在空飞机数量","series":[{"name":"USN","value":0,"side":"USN"},{"name":"IJN","value":0,"side":"IJN"}]},
    {"id":"usn-embarked-class","type":"pie","title":"红方舰载机机型构成（就绪）","series":[{"name":"战斗机-野猫","value":79,"side":"USN"}]},
    {"id":"ijn-embarked-class","type":"pie","title":"蓝方舰载机机型构成（就绪）","series":[{"name":"战斗机-零式","value":73,"side":"IJN"}]}
  ],
  "intent_findings": [],
  "threat_findings": [],
  "priorities": [],
  "threat_ratings": [
    {"perspective":"红方看蓝方","target":"南云四航母","level":"高","evidence":"..."},
    {"perspective":"蓝方看红方","target":"中途岛机场","level":"高","evidence":"..."}
  ]
}`;

function buildVmmpGuidanceBlock(
  taskFocus: TaskFocus,
  vmmpJson: string,
): string {
  const focusLabel = taskFocus === "intent" ? "意图研判（VMMP_I）" : "威胁分析（VMMP_W）";
  const mapHints =
    taskFocus === "intent"
      ? `地图侧重（意图）：
- axes：用作战方向/运动指向表达 Directional + Continuity
- highlight_names：突出与假设验证相关的关键实体
- threat_zones：仅在有空间聚集或关键活动区时使用，勿伪造交火圈
- narrative：点明佯动/真实、方向、阶段判断依据（仍保持 2–4 句）
- threat_ratings：意图任务下可输出空数组 []（前端不展示威胁等级图）
- charts（若允许自由设计）：必须含阶段/航向/编队状态类图；禁止以威胁排序为主图`
      : `地图侧重（威胁）：
- highlight_names：优先高亮筛选出的关键威胁目标（Salience / Screening）
- threat_zones：按威胁等级表达空间威胁/关注区（Hierarchy / Salience）
- axes：可选，用于进击轴或发现几何
- threat_ratings：按优先级排序列出（Ordering / Ranking），level 与 evidence 必填
- narrative：点明筛选—评估—排序要点（仍保持 2–4 句）
- charts（若允许自由设计）：优先威胁等级对比、目标优先级条形、多因素聚合（bar/pie/stacked_bar）`;

  return `## VMMP 范式约束（必须遵循）
任务焦点: ${focusLabel}
请严格依据下列 VMMP 推理后再生成界面：
1) 先从 C/R/O 明确要认知的对象、关系与操作（可参考 reasoning_path）
2) 再按 M 映射到视觉组织，并落实到 map.highlight_names / map.axes / map.threat_zones 与 threat_ratings
3) 最后按 E 的评价维度自检（空间、比较、筛选/证据、排序/顺序、不确定性等）
不要只复述 JSON；把映射结果写进 SituationViewSpec 字段。

${mapHints}

### VMMP JSON
${vmmpJson}
`;
}

/** Build the user prompt from slice pack + data summary. */
export function buildSituationUserPrompt(
  pack: SlicePack,
  _tasks: AnalysisTask[],
  dataSummary: string,
  options?: PromptVmmpOptions,
): string {
  const ratingTask = (pack.threat?.tasks ?? []).find(
    (t) => t.reference_ratings?.length,
  );
  const ratingsBlock = ratingTask?.reference_ratings
    ? JSON.stringify(ratingTask.reference_ratings, null, 2)
    : "（本切片无参考威胁等级，请根据兵力几何自行给出合理 threat_ratings）";

  const vmmpMode = options?.vmmp_mode ?? "off";
  const taskFocus = options?.task_focus ?? "threat";
  const vmmpBlock =
    vmmpMode === "on" && options?.vmmp_json
      ? `\n${buildVmmpGuidanceBlock(taskFocus, options.vmmp_json)}\n`
      : "";

  const focusLine =
    vmmpMode === "on"
      ? `任务焦点: ${taskFocus === "intent" ? "意图研判" : "威胁分析"}（已注入 VMMP）`
      : `任务焦点: ${taskFocus === "intent" ? "意图研判" : "威胁分析"}（对照组，无 VMMP）`;

  const lockCharts = options?.lock_charts !== false;
  const chartOutHint = lockCharts
    ? `kpis 可按示例填写（服务端会覆盖为固定四项 KPI）。charts 默认留空数组 []（界面不展示四张兵力统计图）。`
    : `请为当前任务自行设计 0～4 张 charts（type 仅限 bar / pie / stacked_bar），数字必须来自输入数据：
- 威胁任务：优先目标比较或威胁强度相关图
- 意图任务：优先方向/阶段/状态相关图
- 不要再输出水面舰艇数量、在空飞机数量、红/蓝舰载机就绪构成、双方舰载机就绪总数这类通用图
- 不要输出「威胁目标优先级排序」类条形图（威胁排序已由界面单独展示）
- 每张图要有清晰 title；series.value 必须是数字
服务端不会用固定四图覆盖；kpis 仍可能被覆盖为固定四项。`;

  return `## 场景
战役: ${pack.scenario}
时间片: ${pack.time_slice}
阶段: ${pack.phase_label}
${focusLine}
态势简述: ${pack.intent.situation_brief ?? ""}
威胁语境: ${pack.threat.threat_context ?? ""}

## 兵力与几何摘要（由清洗数据压缩）
${dataSummary}

## 威胁等级参考（威胁任务用于 threat_ratings；意图任务仅作背景，勿做成主图）
${ratingsBlock}
${vmmpBlock}
## 输出要求
只输出一个 SituationViewSpec JSON，结构如下：
${SITUATION_OUTPUT_SCHEMA}

${
  taskFocus === "intent"
    ? `请根据兵力几何生成 map（务必含 axes 作战指向）、title、narrative（含阶段/佯动判断）。
threat_ratings 可输出 []。意图任务前端展示阶段条与方向证据，不展示威胁等级图。`
    : `请根据兵力几何生成 map、title、narrative，并填写 threat_ratings（可蓝/红或美/日视角）。`
}
${chartOutHint}
intent_findings、threat_findings、priorities 一律输出 []。`;
}

/** Prompt template document for export / paper writing. */
export const PROMPT_TEMPLATE_MARKDOWN = `# 中途岛战役态势界面生成提示词模板

## 用法
\`\`\`
输入 = 时间片清洗数据摘要 + 场景简述 + 威胁等级参考
     +（可选）VMMP_W 或 VMMP_I JSON（vmmp_mode=on）
输出 = SituationViewSpec（JSON）→ 前端地图
  · 威胁任务：威胁目标排序图
  · 意图任务：阶段/指向/证据面板
  · 默认不展示四张兵力统计图
视觉 A/B：打开 /compare，左 A 无 VMMP、右 B 注入 VMMP
\`\`\`

## System
见 \`SITUATION_SYSTEM_PROMPT\`

## 设计意图
1. **地图主界面**：LLM 产出布局与标注；渲染由 Leaflet 完成。
2. **任务主图**：威胁用排序；意图用阶段与证据；不默认挂通用兵力四图。
3. **不展示意图/威胁文字研判面板**。
4. **防幻觉**：schema + 清洗摘要双约束。
`;
