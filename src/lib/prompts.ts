import type {
  AnalysisTask,
  SlicePack,
  TaskFocus,
  VmmpMode,
} from "./types";
import { listFillableNames, SLOT_ALIAS_HINT } from "./fillSlots";

/** System prompt: fill renderer slots from cleaned force data. */
export const SITUATION_SYSTEM_PROMPT = `你是海军战役「通用作战态势图（COP）」填槽器，不是排版器、也不是画图器。
输入是清洗后的单位态势数据与场景说明（可含威胁等级参考；可选附带 VMMP 范式）。
界面布局由前端渲染器固定绘制；轴、圈、统计图的几何与图种由服务端用本片坐标计算。你只填写规定槽位的 JSON。
你的唯一输出必须是合法 JSON（不要 Markdown 围栏，不要解释文字）。

目标：填写 slots（高亮谁、轴从哪到哪、圈围着谁、推荐哪种工作模式）与 threat_ratings（威胁任务）或 narrative（意图任务）。不要设计页面分区，不要自拟统计图，不要输出经纬度。

硬性规则：
1. 槽位写在 slots，不要写 map.center / zoom / 经纬度 / radius_nm。map 可输出空数组，渲染器会覆盖。
   slots.highlights：本片真实单位名或集群别名，最多 8 个。
   slots.axes：from / to 用单位名或集群别名（如「南云」「中途岛」「TF16」），side 为 USN 或 IJN，label 短文本。禁止 from/to 填坐标数组。
   语义：USN=美方指向（红），IJN=日方指向（蓝）。双方有清晰指向时各至少 1 条；某侧说不清才可不画。
   （A/B 共用本规则；实验唯一变量是用户消息是否附带 VMMP JSON。）
2. slots.zones：around 用单位名或集群别名，level 仅 紧急/高/中/低，label 短文本。可 1～6 条。禁止 center、radius_nm。
   圆心与半径由渲染器按 around 对应兵力计算。全图紧急区宜 ≤2。
   威胁任务：圈对准筛出的日方威胁（少画纯己方编队圈）；意图任务：圈对准支撑阶段/指向的活动区。
   槽为空时服务端才回退本地骨架。zone_overrides 可输出 []。
   （A/B 共用本规则；实验唯一变量是是否附带 VMMP JSON。）
3. KPI 由服务端用清洗数据固定覆盖：美航母、日航母舰体、在空飞机、损伤舰艇。
   主生成台另固定四张统计图：水面舰艇数量、在空飞机数量、红方（美）舰载机就绪构成、蓝方（日）舰载机就绪构成。对比页统计图由渲染器从 threat_ratings 与落槽后的 map 推导，模型必须输出 charts: []。禁止输出图种、series、CSS 或百分比。
   slots.layout 只能是 "map_dominant"（总览）/ "space_first"（空间优先）/ "chart_dominant"（证据优先）之一；slots.layout_reason 写一句，说明当前问题更需要整体感知、空间探索还是证据比较。服务端规则拿得准时会覆盖该选择。禁止自拟模板名。
4. 观察者固定为美方（红方）。禁止上帝视角双侧对称叙述与双侧威胁排序。
   threat_ratings 只输出「红方看蓝方」（或「美方看日方」），target 只能是日方兵力/设施；禁止写入美方己方单位，也禁止输出「蓝方看红方」。
   threat_ratings.level 仅用：紧急 / 高 / 中 / 低（必要时「无/不适用」）。含义：
     - 紧急：正在接触或可立即致伤；
     - 高：战役重心且已暴露，或具备发现己方能力；
     - 中：重要但本时刻非直接致伤；
     - 低：不改变战役主结构。
     有「威胁等级参考」时优先沿用其等级与目标。
5. 禁止编造不存在的航母、交火或单位；禁止输出经纬度。中途岛用名称「中途岛」，不要写坐标。
6. 红方=USN（美含中途岛，地图用红色），蓝方=IJN（日，地图用蓝色）。
7. 若某切片舰体缺失（如飞龙），在 narrative 中标注“舰体未导出/未知”，不得当作已沉没定论。
8. kpis 与 charts 一律输出 []（渲染器会覆盖）。
9. intent_findings / threat_findings / priorities 请输出空数组 []（不展示文字研判面板）。
10. 若用户消息含 VMMP：先按 C/R/O 组织认知，再按 M 映射到 slots.highlights / axes / zones 与 threat_ratings，最后用 E 自检；仍只输出填槽 JSON。`;

export type PromptVmmpOptions = {
  vmmp_mode?: VmmpMode;
  task_focus?: TaskFocus;
  /** 已序列化的 VMMP JSON 全文；仅 vmmp_mode=on 时传入 */
  vmmp_json?: string | null;
  /** true=服务端覆盖固定四图；false=对比页任务图槽由服务端从 ratings/map 生成 */
  lock_charts?: boolean;
};

export const SITUATION_OUTPUT_SCHEMA = `{
  "generated_by": "llm",
  "time_slice": "Txx",
  "title": "短标题",
  "phase_label": "阶段标签",
  "narrative": "2-4 句态势叙述（基于兵力几何与场景说明）",
  "slots": {
    "highlights": ["南云航母", "Enterprise"],
    "axes": [
      {"from":"南云","to":"中途岛","side":"IJN","label":"南云→中途岛"},
      {"from":"TF16","to":"赤城","side":"USN","label":"TF16→赤城"}
    ],
    "zones": [
      {"around":"南云航母","level":"紧急","label":"南云换弹集群"},
      {"around":"在空接触带","level":"高","label":"在空接触"}
    ],
    "layout": "map_dominant",
    "layout_reason": "先建立整体印象，再按需深入空间或证据"
  },
  "map": {"highlight_names":[],"axes":[],"threat_zones":[]},
  "zone_overrides": [],
  "kpis": [],
  "charts": [],
  "intent_findings": [],
  "threat_findings": [],
  "priorities": [],
  "threat_ratings": [
    {"perspective":"红方看蓝方","target":"南云四航母","level":"高","evidence":"..."},
    {"perspective":"红方看蓝方","target":"水侦/发现链","level":"紧急","evidence":"..."},
    {"perspective":"红方看蓝方","target":"护航驱逐舰","level":"低","evidence":"..."}
  ]
}`;

/** A/B 共用的任务落图提示（唯一差别在是否另附 VMMP JSON，不在此拆权）。 */
function buildSharedTaskMapHints(taskFocus: TaskFocus): string {
  if (taskFocus === "intent") {
    return `## 填槽侧重（意图 · A/B 相同）
- slots.axes：from/to 用名称。美方指向（USN 红）+ 日方指向（IJN 蓝）。意图结论主要靠蓝轴说清「日方主指向」；红轴表示我方如何压近。双方有清晰指向时各至少 1 条
- slots.highlights：支撑意图假设的关键实体（勿默认双方航母全亮）
- slots.zones：around 用名称，只圈支撑「阶段/指向/佯动」的集群；禁止经纬度
- narrative：以美方观察者口吻写佯动/真实、方向、阶段依据（2–4 句）；禁止美日双侧对称散文
- threat_ratings：意图任务下输出 []
- charts：必须 []
- slots.layout：map_dominant / space_first / chart_dominant；意图题若以指向、方位为主偏 space_first，多证据对照偏 chart_dominant`;
  }
  return `## 填槽侧重（威胁 · A/B 相同）
- slots.highlights：仅高亮筛出的日方关键威胁（勿亮美方己方航母）
- slots.zones：around 对准日方威胁集群/水侦带；少画纯己方 TF/中途岛装饰圈；紧急区宜少而准；禁止经纬度
- slots.axes：from/to 用名称。蓝轴标敌方运动/威胁方向，红轴标我方接敌方向；双方有清晰指向时各至少 1 条
- threat_ratings：仅「红方看蓝方」；level 只用 紧急/高/中/低；有参考表则沿用参考等级；evidence 必填
- narrative：以美方视角写筛选—评估—排序要点（2–4 句）
- charts：必须 []
- slots.layout：map_dominant / space_first / chart_dominant；比较威胁排序、交叉验证偏 chart_dominant，定位活动区偏 space_first`;
}

/** 仅在 vmmp_mode=on 时追加：CROME 路径 + VMMP JSON（A/B 的唯一实验变量）。 */
function buildVmmpGuidanceBlock(
  taskFocus: TaskFocus,
  vmmpJson: string,
): string {
  const focusLabel = taskFocus === "intent" ? "意图研判（VMMP_I）" : "威胁分析（VMMP_W）";

  return `## VMMP 范式约束（必须遵循；对照组无本段）
任务焦点: ${focusLabel}
请严格依据下列 VMMP 推理后再填写槽位（不要设计界面或统计图）：
1) 先从 C/R/O 明确要认知的对象、关系与操作（可参考 reasoning_path）
2) 再按 M 映射到视觉组织，并落实到 slots.highlights / slots.axes / slots.zones 与 threat_ratings（落图权限与对照组相同，见上方「填槽侧重」；around/from/to 只用名称）
3) 最后按 E 的评价维度自检（空间、比较、筛选/证据、排序/顺序、不确定性等）
不要只复述 JSON；把映射结果写进 slots。charts 保持 []。禁止经纬度。

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
    ? `kpis 与 charts 输出 [] 即可（服务端会覆盖为固定四项 KPI 与四张兵力统计图）。不要设计布局，不要输出经纬度。`
    : `对比页 charts 必须输出 []。统计图由渲染器按 threat_ratings 与落槽后的 map 计算，不要自行设计图种或布局。
请把可对比差异写在 threat_ratings、slots.highlights / axes / zones 与 narrative 上。`;

  const nameBlock = listFillableNames(pack).map((n) => `- ${n}`).join("\n");
  const sharedMapHints = buildSharedTaskMapHints(taskFocus);

  const outputTail =
    taskFocus === "intent"
      ? `请填写 slots：axes（美方+日方，from/to 用名称）、zones（around 用名称）、highlights、title、narrative（美方视角下的阶段/佯动判断）。
map / kpis / charts 输出空即可。threat_ratings 输出 []。禁止经纬度。`
      : `请填写 slots：axes（美方+日方，from/to 用名称）、zones（around 对准日方威胁）、highlights、title、narrative，并填写 threat_ratings。
map / kpis / charts 输出空即可。threat_ratings：只输出「红方看蓝方」；level 只用 紧急/高/中/低（有参考表则沿用）。禁止经纬度。`;

  return `## 场景
战役: ${pack.scenario}
时间片: ${pack.time_slice}
阶段: ${pack.phase_label}
${focusLine}
态势简述: ${pack.intent.situation_brief ?? ""}
威胁语境: ${pack.threat.threat_context ?? ""}

## 兵力与几何摘要（由清洗数据压缩）
${dataSummary}

## 可填槽名称（from / to / around / highlights 只用这些或别名）
${SLOT_ALIAS_HINT}
本片单位：
${nameBlock}

## 威胁等级参考（威胁任务用于 threat_ratings；意图任务仅作背景，勿做成主图）
${ratingsBlock}

${sharedMapHints}
${vmmpBlock}
## 输出要求
只输出一个 SituationViewSpec JSON，结构如下：
${SITUATION_OUTPUT_SCHEMA}

${outputTail}
${chartOutHint}
intent_findings、threat_findings、priorities 一律输出 []。`;
}

/** Prompt template document for export / paper writing. */
export const PROMPT_TEMPLATE_MARKDOWN = `# 中途岛战役态势界面生成提示词模板

## 用法
\`\`\`
输入 = 时间片清洗数据摘要 + 场景简述 + 威胁等级参考
     +（可选）VMMP_W 或 VMMP_I JSON（vmmp_mode=on）
输出 = 填槽 JSON（slots + threat_ratings + narrative；charts 必须 []）→ 渲染器画几何与界面
  · 槽位：slots.highlights / axes.from-to / zones.around、threat_ratings（威胁）、narrative
  · 轴与圈：模型只给名称；圆心、半径、中心点由 pack 坐标计算
  · 布局：渲染器固定三种工作模式；模型只从白名单选 slots.layout，不画界面
  · 统计图：渲染器从 pack + 填槽结果生成，模型不画图
视觉 A/B：打开 /compare，左 A 无 VMMP、右 B 注入 VMMP
\`\`\`

## System
见 \`SITUATION_SYSTEM_PROMPT\`

## 设计意图
1. **渲染器主界面**：三种工作模式固定；LLM 只填名称槽，并可从白名单推荐一种模式。Leaflet 与统计图由数据渲染。
2. **关注圈**：around 用名称；几何由渲染器算；槽空才回退骨架。
3. **作战指向**：from/to 用名称；美方（USN）+ 日方（IJN）；双方有清晰依据时各至少 1 条。
4. **A/B 唯一变量**：用户消息是否附带 VMMP JSON（及 CROME 路径要求）。
5. **任务主图**：威胁用排序；意图用阶段与证据。
6. **防幻觉**：禁止模型输出经纬度；半径与紧急区数量由渲染器夹紧。
`;
