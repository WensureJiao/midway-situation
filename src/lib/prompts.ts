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
   axes 语义：side:"USN"=美方指向（红），side:"IJN"=日方指向（蓝）；不是随便两条装饰线。
   坐标必须取自输入单位几何；标签/方向须能对应本切片可见运动或任务结论，禁止为凑数乱画。
   默认预期：双方都有清晰指向依据时，应各至少 1 条（IJN + USN 双轴并存）。
   仅当某一侧本切片指向说不清、或与任务结论无关时，才可不画该侧轴——不是提倡单轴。
   （A/B 共用本规则；实验唯一变量是用户消息是否附带 VMMP JSON。）
2. 关注圈按任务自绘，不要被默认骨架钉死：请在 map.threat_zones 输出本任务真正要盯的圈（可 1～6 条）。
   每条含 id、center[lat,lon]、radius_nm、level、label；可选 side:"USN"|"IJN"。
   center 必须靠近输入单位真实坐标（可取群心/关键舰/岸基），radius_nm 建议 10～30（紧贴兵力，勿画过大圈）；禁止远离兵力的空想圈。
   level 只用：紧急 / 高 / 中 / 低。前端四档分色：紧急酒红、高亮橙、中浅橙、低杏橙（同谱渐淡）。全图紧急区宜 ≤2。
   威胁任务：圈应对准筛出的日方威胁（少画或不画纯己方编队圈）；意图任务：圈应对准支撑假设的活动区/指向相关海域。
   本地骨架仅作参考与回退：若 threat_zones 为空或校验失败，服务端才用骨架 + zone_overrides。
   zone_overrides 可选（仅回退路径有用）：对骨架 id 做 level/label/hidden。优先写满 threat_zones，而不是交空数组。
   （A/B 共用本规则；实验唯一变量是是否附带 VMMP JSON。）
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
    "threat_zones": [
      {"id":"ijn-cv-cluster","center":[28.92,-179.12],"radius_nm":18,"level":"高","label":"南云航母集群","side":"IJN"},
      {"id":"recon-belt","center":[29.06,-178.21],"radius_nm":16,"level":"紧急","label":"水侦接触带","side":"IJN"}
    ]
  },
  "zone_overrides": [],
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

/** A/B 共用的任务落图提示（唯一差别在是否另附 VMMP JSON，不在此拆权）。 */
function buildSharedTaskMapHints(taskFocus: TaskFocus): string {
  if (taskFocus === "intent") {
    return `## 地图侧重（意图 · A/B 相同）
- axes：美方指向（USN 红）+ 日方指向（IJN 蓝）。意图结论主要靠蓝轴说清「日方主指向」；红轴表示我方如何压近，有依据应保留。双方有清晰指向时各至少 1 条；某侧无依据才可不画该侧
- highlight_names：突出支撑意图假设的关键实体（勿默认双方航母全亮）
- map.threat_zones：按意图假设自绘关注圈（圆心贴真实单位，勿照搬全部骨架圈）；只画支撑「阶段/指向/佯动」的海域
- narrative：以美方观察者口吻写佯动/真实、方向、阶段依据（2–4 句）；禁止美日双侧对称散文
- threat_ratings：意图任务下输出 []
- charts：对比页由服务端生成，此处请输出 []`;
  }
  return `## 地图侧重（威胁 · A/B 相同）
- highlight_names：仅高亮筛出的日方关键威胁（勿亮美方己方航母）
- map.threat_zones：按威胁排序自绘圈（对准日方威胁集群/水侦带等）；少画纯己方 TF/中途岛装饰圈；紧急区宜少而准
- axes：美方指向（USN）+ 日方指向（IJN）。威胁任务蓝轴标敌方运动/威胁方向，红轴标我方接敌方向；双方有清晰指向时各至少 1 条
- threat_ratings：仅「红方看蓝方」；level 只用 紧急/高/中/低；有参考表则沿用参考等级；evidence 必填
- narrative：以美方视角写筛选—评估—排序要点（2–4 句）
- charts：对比页由服务端生成，此处请输出 []`;
}

/** 仅在 vmmp_mode=on 时追加：CROME 路径 + VMMP JSON（A/B 的唯一实验变量）。 */
function buildVmmpGuidanceBlock(
  taskFocus: TaskFocus,
  vmmpJson: string,
): string {
  const focusLabel = taskFocus === "intent" ? "意图研判（VMMP_I）" : "威胁分析（VMMP_W）";

  return `## VMMP 范式约束（必须遵循；对照组无本段）
任务焦点: ${focusLabel}
请严格依据下列 VMMP 推理后再生成界面：
1) 先从 C/R/O 明确要认知的对象、关系与操作（可参考 reasoning_path）
2) 再按 M 映射到视觉组织，并落实到 map.highlight_names / map.axes / map.threat_zones 与 threat_ratings（落图权限与对照组相同，见上方「地图侧重」；圈须按筛排结果自绘，勿交空数组坐等骨架）
3) 最后按 E 的评价维度自检（空间、比较、筛选/证据、排序/顺序、不确定性等）
不要只复述 JSON；把映射结果写进 SituationViewSpec 字段。

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
    : `对比页 charts 由服务端按 threat_ratings 与 map 推导生成，请输出 "charts": []。
请把可对比差异写在 threat_ratings、map.highlight_names / axes / threat_zones 与 phase 相关叙述上；不要自行设计统计图。`;

  const skeleton =
    options?.zone_skeleton ?? buildThreatZoneSkeleton(pack);
  const skeletonBlock = JSON.stringify(skeleton, null, 2);
  const sharedMapHints = buildSharedTaskMapHints(taskFocus);

  const outputTail =
    taskFocus === "intent"
      ? `请生成 map：axes（美方+日方指向；双方有清晰指向时各至少 1 条）、threat_zones（按意图自绘，圆心贴真实单位，勿交空数组）、highlight_names、title、narrative（美方视角下的阶段/佯动判断）。
zone_overrides 可输出 []。threat_ratings 可输出 []。`
      : `请生成 map：axes（美方+日方指向；双方有清晰指向时各至少 1 条）、threat_zones（按威胁筛排自绘，对准日方威胁，勿交空数组）、highlight_names、title、narrative，并填写 threat_ratings。
zone_overrides 可输出 []。threat_ratings：只输出「红方看蓝方」；level 只用 紧急/高/中/低（有参考表则沿用）。`;

  return `## 场景
战役: ${pack.scenario}
时间片: ${pack.time_slice}
阶段: ${pack.phase_label}
${focusLine}
态势简述: ${pack.intent.situation_brief ?? ""}
威胁语境: ${pack.threat.threat_context ?? ""}

## 兵力与几何摘要（由清洗数据压缩）
${dataSummary}

## 本地关注圈骨架（仅供参考与回退；请优先按任务自绘 map.threat_zones，不要原样照抄全部骨架）
${skeletonBlock}

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
输入 = 时间片清洗数据摘要 + 场景简述 + 威胁等级参考 + 本地关注圈骨架
     +（可选）VMMP_W 或 VMMP_I JSON（vmmp_mode=on）
输出 = SituationViewSpec（JSON）→ 前端地图
  · 关注圈：LLM 按任务自绘 map.threat_zones（校验圆心靠近真实单位）；空/无效才回退本地骨架
  · 威胁任务：威胁目标排序图
  · 意图任务：阶段/指向/证据面板
视觉 A/B：打开 /compare，左 A 无 VMMP、右 B 注入 VMMP
\`\`\`

## System
见 \`SITUATION_SYSTEM_PROMPT\`

## 设计意图
1. **地图主界面**：LLM 产出布局与标注；渲染由 Leaflet 完成。
2. **关注圈**：按任务自绘（A/B 相同权限）；骨架仅参考/回退，避免画面被钉死。
3. **作战指向**：美方指向（USN）+ 日方指向（IJN）；双方有清晰依据时各至少 1 条；某侧无依据才可不画该侧（不提倡单轴）。
4. **A/B 唯一变量**：用户消息是否附带 VMMP JSON（及 CROME 路径要求）。
5. **任务主图**：威胁用排序；意图用阶段与证据。
6. **防幻觉**：圆心须靠近本切片单位；半径与紧急区数量服务端夹紧；对比页标「相对参考骨架变更」。
`;
