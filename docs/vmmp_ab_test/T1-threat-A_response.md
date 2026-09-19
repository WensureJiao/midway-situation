## 推理过程  
T1 是纯静态集结阶段，无空中接触、无雷达/无线电侦察交火、无机动对抗。威胁分析不能套用“即时打击链”逻辑，而应聚焦**开战潜力（War Initiation Potential）**——即哪一方更可能率先完成侦察发现、组织有效攻击波、并达成首波打击优势。关键约束条件有三：  
- **红方**：四艘航母全部在场（含飞龙，虽本切片未显舰体但明确以T1为完整基线），但Kaga与Soryu停泊未动，Akagi与Hiryu仅12 kn航速且编队未齐速；所有舰载机均在甲板/机库就绪（共约228架），但**无一架升空，无一架执行搜索任务**；水侦依赖巡洋舰/战列舰搭载，尚未释放。  
- **蓝方**：TF16与TF17已启航（15 kn）、航向稳定（245°/284°），距中途岛约180–220海里；舰载机总数234架（企业+大黄蜂159 + 约克城75），全部就绪；**但同样未放侦察机**——因尚未进入预定搜索扇区，且PBY等岸基侦察机亦未起飞。  
- **决定性变量是“侦察启动窗口”**：南云部队航向112.5°（东南偏东），正朝中途岛方向缓慢推进，其前出水侦最远覆盖半径约150海里；而美舰队航向西南（245°–284°），正横向切入日军预期航线，具备更优的“侧翼侦察前置角”。地理上，TF17（约克城）位置最靠西（176.90°W），比TF16更接近日军预计搜索前沿，且航向284°使其右舷侦察扇区可最早覆盖日军北翼。  
→ 因此，**红方威胁等级不来自当前杀伤力，而来自其航母集群的完整性、高载机量与进攻导向航向；蓝方威胁等级则来自其舰队机动性、分散部署带来的侦察冗余度，以及岛屿作为固定传感器节点的潜在价值**。优先级排序须基于“谁更可能先获得战术信息优势”，而非“谁火力更强”。

## 态势界面方案  

### 1. 地图：核心态势底图（矢量海图+动态编码）  
- **要素放置**：  
  - 红方：四艘航母以**独立图标+舰名标签**置于南云编队中心（29.15°N, 179.75°W），按实际状态差异化编码：  
    ▪ Akagi/Hiryu：蓝色填充+12 kn航速箭头（长度=速度比例，方向112.5°），边框加粗；  
    ▪ Kaga/Soryu：灰色填充+静止圆点（0 kn），边框虚线；  
    ▪ 护航舰群：以“集群热区”形式呈现（半透明红色椭圆，覆盖雾岛/榛名等坐标），标注“Escorts: 7 ships, avg. speed 0 kn, uncoordinated”。  
  - 蓝方：  
    ▪ TF16：双航母图标（企业+大黄蜂）聚合显示，带15 kn航速箭头（245°），底部标注“TF16: 159 air, heading 245°, formation 70% synced”；  
    ▪ TF17：单航母图标（约克城），15 kn箭头（284°），标注“TF17: 75 air, heading 284°, formation 95% synced”；  
    ▪ 中途岛：岛屿轮廓+跑道符号，叠加雷达覆盖扇区（以岛为中心、半径200海里、方位0°–90°的浅蓝扇形，标注“Midway Radar: PBY launch window T+45min”）。  
  - **关键叠加层**：  
    ▪ “First-Look Opportunity Zone”（首视机会区）：以TF17位置为圆心、180海里半径的绿色环带，与日军航向112.5°延长线相交区域高亮闪烁（表示未来2小时内最可能实现双向目视/雷达接触的走廊）；  
    ▪ “Japanese Search Radius (Water-based)”：以利根/筑摩为圆心、150海里半径的黄色虚线圈（标注“IJN Recon Max Range: Type 0 Recon Seaplane, 150 NM”）。  

### 2. 图表与指标：聚焦开战潜力量化  
- **主KPI仪表盘（顶部横栏）**：  
  | 指标 | 红方值 | 蓝方值 | 说明 |  
  |---|---|---|---|  
  | **Carrier Combat Readiness** | 100%（4/4 in formation） | 92%（3/3 mobile, TF16 sync lag） | 基于航母数量+机动状态+载机就绪率加权 |  
  | **Reconnaissance Latency** | High（水侦释放需T+30min，当前0架在空） | Medium（PBY可T+15min起飞，舰载侦察机T+25min） | 从当前时刻到首架侦察机离舰时间预估 |  
  | **Detection Geometry Advantage** | -1.8（航向正对目标，但侧翼暴露） | +2.3（TF17航向284°，形成对日军北翼的斜向截击角） | 基于相对航向差、距离、地球曲率修正的几何优势指数 |  
  | **Sensor Redundancy** | Low（仅2艘重巡搭载水侦，无备份） | High（TF16/TF17双侦察体系 + Midway岸基PBY + B-17远程巡逻能力） | 可同时启用的独立侦察平台数 |  

- **辅助图表**：  
  - **“Search Initiation Timeline” 横轴时间图**（X轴：T+0 到 T+90min）：  
    ▪ 红方：两条虚线——水侦释放（T+30min）、首轮舰载侦察机起飞（T+60min，需Kaga/Soryu启航后整备）；  
    ▪ 蓝方：三条实线——PBY from Midway（T+15min）、Scout SBD from TF17（T+25min）、Scout SBD from TF16（T+35min）；  
    ▪ 标注交汇点：“First Mutual Detection Window: T+42–T+58min”。  
  - **“Carrier Strike Capacity vs. Readiness Lag” 散点图**：  
    X轴=载机总数（红235 / 蓝234），Y轴=平均出击准备时间（红：Kaga/Soryu停泊→+22min整备延迟；蓝：TF16同步率低→+8min协调延迟）；气泡大小=单舰最大单波攻击量（Akagi: 36架，约克城: 24架）。突出红方高总量但高延迟、蓝方总量略低但响应更快。

### 3. 布局：主辅协同、决策流导向  
- **主视图（70%宽度）**：中央海图（含所有动态编码与叠加层），采用深蓝底色+高对比矢量图标，支持缩放/平移；地图右上角嵌入KPI仪表盘（固定位置）。  
- **左辅视图（15%宽度）**：垂直时间轴“Search Initiation Timeline”，实时标注当前T1时刻（红色竖线），左右延伸至T+90min。  
- **右辅视图（15%宽度）**：散点图+简要结论卡片：“**Highest Initiation Risk: TF17 → IJN Northern Flank (T+45min)**”，附小字说明：“Due to optimal heading (284°), proximity (192 NM), and full aircrew readiness — no delay from formation sync.”  
- **底部状态栏**：滚动文字：“T1 Status: No airborne units. All forces in pre-search posture. Threat priority = Reconnaissance Initiative Dominance, not firepower.”

### 4. 要突出的信息与不确定性表达  
- **必须突出的核心信息**：  
  ▪ “红方航母集群完整性是最大威胁源”——通过四航母独立图标+统一基线标签（“Nagumo TF: Full Carrier Strength @ T1”）强调；  
  ▪ “蓝方TF17是侦察主动权支点”——用橙色光晕环绕TF17图标，并在地图旁添加箭头指向其与日军北翼的连线；  
  ▪ “无空中单位”为绝对前提——地图全局禁用任何飞行器符号，所有“air”字段强制显示为“0”并加灰底红字。  
- **不确定性表达方式**：  
  ▪ 所有时间预估（如T+30min水侦释放）用**虚线+问号图标**标注，悬停显示置信区间（例：“T+30±8min — based on historical IJN seaplane launch drills”）；  
  ▪ “First Mutual Detection Window”用**半透明紫色渐变带**覆盖时间轴，两端标注“Low Confidence”；  
  ▪ 在KPI仪表盘中，“Detection Geometry Advantage”数值旁加⚠️图标，提示：“Assumes standard IJN search pattern; deviation would shift advantage by ±1.2 units.”  
- **禁止暗示交火**：不出现任何弹道线、火控圈、命中概率、损伤预测；所有“威胁”表述限定于“侦察发现可能性”“攻击波组织潜力”“指挥链响应裕度”三类非接触维度。