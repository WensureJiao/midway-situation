import type {
  AnalysisTask,
  SlicePack,
  TaskFocus,
  ThreatZone,
  VmmpMode,
} from "./types";
import { buildThreatZoneSkeleton } from "./threatZones";

/** System prompt: COP layout from cleaned force data. */
export const SITUATION_SYSTEM_PROMPT = `你是海军战役「通用作战态势图（COP）」布局生成器。
输入是清洗后的单位态势数据与场景说明（可含威胁等级参考；可选附带 VMMP 范式）。
你的唯一输出必须是合法 JSON（不要 Markdown 围栏，不要解释文字），符合 SituationViewSpec 结构。

目标：生成态势地图布局、关键指标叙述，以及威胁等级列表 threat_ratings（威胁任务）或阶段/方向相关编码（意图任务）。主生成台的四张兵力统计图由服务端覆盖。

硬性规则：
1. 地图为主界面：给出 center、zoom、需要高亮的单位名 highlight_names、作战指向线 axes（from→to 虚线箭头，表示接敌/运动方向，不是坐标轴）。
   axes 必须同时包含至少一条 side:"IJN"（蓝箭头，如南云群心→中途岛）与一条 side:"USN"（红箭头，如美特混群心→南云群心）；坐标取自输入单位几何。
2. 关注圈由服务端用「本地骨架」固定位置与半径；你不得新造圈、不得改 center/radius。
   请输出 zone_overrides：仅对骨架里已有的 id（nagumo / midway / tf16|tf17 / air-contact）做 level/label 升降级。
   map.threat_zones 可写 []（推荐）或原样复制骨架；服务端会忽略你自造的圈。
   level 只用：紧急 / 高 / 中 / 低。前端仅「紧急」画深红紧急区，其余为琥珀关注区。
   升降级约束（比纯写死更贴阶段，但不可随意）：
   - nagumo：默认未损=高、受损=紧急；升紧急需受损，或阶段含危机/换弹/接触，或 ratings 已有紧急且你提供 evidence；
   - air-contact：骨架有则默认紧急；勿无故降级；
   - midway / tf16 / tf17：默认高；升紧急必须 evidence，且参考 ratings 含紧急；
   - 全图紧急区最多约 2 条；无依据时保持骨架默认，不要硬塞紧急。
3. KPI 由服务端用清洗数据固定覆盖：美航母、日航母舰体、在空飞机、损伤舰艇。
   主生成台另固定四张统计图：水面舰艇数量、在空飞机数量、红方（美）舰载机就绪构成、蓝方（日）舰载机就绪构成。对比页改用任务固定图槽（由 threat_ratings 与 map 推导），模型请输出 charts: []。
4. 观察者固定为美方（红方）。禁止上帝视角双侧对称叙述与双侧威胁排序。
   threat_ratings 只输出「红方看蓝方」（或「美方看日方」），target 只能是日方兵力/设施；禁止写入美方己方单位，也禁止输出「蓝方看红方」。
   threat_ratings.level 仅用：紧急 / 高 / 中 / 低（必要时「无/不适用」）。含义：
     - 紧急：正在接触或可立即致伤；
     - 高：战役重心且已暴露，或具备发现己方能力；
     - 中：重要但本时刻非直接致伤；
     - 低：不改变战役主结构。
     有「威胁等级参考」时优先沿用其等级与目标。
5. 禁止编造不存在的航母、交火或单位；经纬度必须来自输入数据。中途岛约 28.21°N, 177.38°W（longitude ≈ -177.38）。
6. 红方=USN（美含中途岛，地图用红色），蓝方=IJN（日，地图用蓝色）。
7. 若某切片舰体缺失（如飞龙），在 narrative 中标注“舰体未导出/未知”，不得当作已沉没定论。
8. charts.series 的 value 必须是数字；kpis.value 必须是数字。
9. intent_findings / threat_findings / priorities 请输出空数组 []（不展示文字研判面板）。
10. 若用户消息含 VMMP：先按 C/R/O 组织认知，再按 M 映射到 map（highlight/axes）与 zone_overrides / threat_ratings，最后用 E 自检；仍只输出 SituationViewSpec JSON。`;

export type PromptVmmpOptions = {
  vmmp_mode?: VmmpMode;
  task_focus?: TaskFocus;
  /** 已序列化的 VMMP JSON 全文；仅 vmmp_mode=on 时传入 */
  vmmp_json?: string | null;
  /** true=服务端覆盖固定四图；false=对比页任务图槽由服务端从 ratings/map 生成 */
  lock_charts?: boolean;
  /** 本地关注圈骨架，注入 user prompt */
  zone_skeleton?: ThreatZone[];
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
      {"id":"a1","from":[lat,lon],"to":[lat,lon],"label":"南云→中途岛","side":"IJN"},
      {"id":"a2","from":[lat,lon],"to":[lat,lon],"label":"美特混→南云","side":"USN"}
    ],
    "threat_zones": []
  },
  "zone_overrides": [
    {"id":"nagumo","level":"高","label":"南云机动部队"},
    {"id":"midway","level":"高"},
    {"id":"tf16","level":"高"}
  ],
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
    {"perspective":"红方看蓝方","target":"水侦/发现链","level":"紧急","evidence":"..."},
    {"perspective":"红方看蓝方","target":"护航驱逐舰","level":"低","evidence":"..."}
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
- axes：须同时有 IJN（蓝，南云→中途岛）与 USN（红，美特混→南云）各至少一条
- highlight_names：突出与假设验证相关的关键实体（日/美航母、中途岛等）
- zone_overrides：在本地骨架上按阶段微调（危机/受损可升 nagumo 为紧急）；勿新造圈
- narrative：以美方观察者口吻写佯动/真实、方向、阶段依据（2–4 句）；禁止美日双侧对称散文
- threat_ratings：意图任务下输出 []
- charts：对比页由服务端生成，此处请输出 []`
      : `地图侧重（威胁）：
- highlight_names：优先高亮筛出的日方关键威胁目标（Salience / Screening）
- zone_overrides：对齐 ratings 与几何；升紧急须 evidence；紧急区宜少而准
- axes：须同时有 IJN（蓝）与 USN（红）各至少一条
- threat_ratings：仅「红方看蓝方」；level 只用 紧急/高/中/低；有参考表则沿用参考等级；evidence 必填
- narrative：以美方视角写筛选—评估—排序要点（2–4 句）
- charts：对比页由服务端生成，此处请输出 []`;

  return `## VMMP 范式约束（必须遵循）
任务焦点: ${focusLabel}
请严格依据下列 VMMP 推理后再生成界面：
1) 先从 C/R/O 明确要认知的对象、关系与操作（可参考 reasoning_path）
2) 再按 M 映射到视觉组织，并落实到 map.highlight_names / map.axes、zone_overrides 与 threat_ratings
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
    ? `kpis 与 charts 可按示例填写（服务端会覆盖为固定四项 KPI 与四张兵力统计图）。`
    : `对比页 charts 由服务端按任务与是否注入 VMMP 选型生成（柱/条/饼/散点/雷达/热力等），请输出 "charts": []。
有 VMMP 时应把可对比差异写在 threat_ratings、map.highlight_names / axes、zone_overrides 与 phase 相关叙述上，便于服务端选出合适图种；不要自行设计统计图。`;

  const skeleton =
    options?.zone_skeleton ?? buildThreatZoneSkeleton(pack);
  const skeletonBlock = JSON.stringify(skeleton, null, 2);

  return `## 场景
战役: ${pack.scenario}
时间片: ${pack.time_slice}
阶段: ${pack.phase_label}
${focusLine}
态势简述: ${pack.intent.situation_brief ?? ""}
威胁语境: ${pack.threat.threat_context ?? ""}

## 兵力与几何摘要（由清洗数据压缩）
${dataSummary}

## 本地关注圈骨架（位置/半径已定；请基于此输出 zone_overrides，勿改 center/radius，勿新增 id）
${skeletonBlock}

## 威胁等级参考（威胁任务用于 threat_ratings；意图任务仅作背景，勿做成主图）
${ratingsBlock}
${vmmpBlock}
## 输出要求
只输出一个 SituationViewSpec JSON，结构如下：
${SITUATION_OUTPUT_SCHEMA}

${
  taskFocus === "intent"
    ? `请生成 map（axes：IJN 蓝 + USN 红）、zone_overrides（在骨架上按阶段微调）、title、narrative（美方视角下的阶段/佯动判断）。
map.threat_zones 请输出 []。threat_ratings 可输出 []。`
    : `请生成 map（axes：IJN 蓝 + USN 红）、zone_overrides（升紧急须带 evidence）、title、narrative，并填写 threat_ratings。
map.threat_zones 请输出 []。threat_ratings：只输出「红方看蓝方」；level 只用 紧急/高/中/低（有参考表则沿用）。`
}
${chartOutHint}
intent_findings、threat_findings、priorities 一律输出 []。`;
}

/** Prompt template document for export / paper writing. */
export const PROMPT_TEMPLATE_MARKDOWN = `# 中途岛战役态势界面生成提示词模板

## 用法
\`\`\`
输入 = 时间片清洗数据摘要 + 场景简述 + 威胁等级参考 + 本地关注圈骨架
     +（可选）VMMP_W 或 VMMP_I JSON（vmmp_mode=on）
输出 = SituationViewSpec（JSON）→ 前端地图
  · 关注圈：本地骨架 + LLM zone_overrides（服务端校验合并）
  · 威胁任务：威胁目标排序图
  · 意图任务：阶段/指向/证据面板
视觉 A/B：打开 /compare，左 A 无 VMMP、右 B 注入 VMMP
\`\`\`

## System
见 \`SITUATION_SYSTEM_PROMPT\`

## 设计意图
1. **地图主界面**：LLM 产出布局与标注；渲染由 Leaflet 完成。
2. **关注圈**：本地定几何，LLM 只做有证据的升降级。
3. **任务主图**：威胁用排序；意图用阶段与证据。
4. **防幻觉**：骨架白名单 + 服务端 merge 配额。
`;
