# VMMP A/B 预实验记录

**日期**：2026-09-19  
**场景**：中途岛 T1（初始态势 / 集结）  
**模型**：qwen-plus（阿里云兼容接口，temperature=0.2）  
**条件**：
- **A**：仅任务说明 + 场景摘要  
- **B**：同上 + 对应 VMMP JSON（威胁用 `VMMP_W`，意图用 `VMMP_I`）

**评分人**：助手（按 JSON 中 E 维度打分）  
**重要说明**：这是**预实验**，不是正式盲评专家结果。正式结论仍需 2–3 名懂任务的人盲评。

**原始材料目录**：`docs/vmmp_ab_test/`

---

## 1. 实验设置

| 项目 | 内容 |
|------|------|
| 场景数据 | T1 pack 摘要（兵力摘要 + force_posture + threat_context） |
| 威胁任务 | 关键威胁筛选 / 等级评估 / 优先级排序（蓝方看红方） |
| 意图任务 | 佯动区分 / 作战方向 / 行动阶段 |
| 每条件次数 | 1 次（预实验；正式建议 ≥3） |
| 应用代码 | **未修改**；用 `scripts/vmmp_ab_test.mjs` 离线调用 |

---

## 2. 评分量表（1–5）

### 威胁分析（E_W）
SpatialFit / ComparisonFit / AggregationFit / HierarchyFit / ScreeningFit / RankingFit / UncertaintyFit / ConsistencyFit

### 意图研判（E_I）
SpatialFit / TemporalFit / RelationFit / ComparisonFit / EvidenceFit / SequenceFit / UncertaintyFit / ConsistencyFit

另记过程指标：
- **推理符合度**：是否真用 C/R/O/M（不只复述）
- **任务贴合度**：威胁是否偏筛选/等级/排序；意图是否偏证据/时间/假设验证

---

## 3. 威胁分析得分

| 指标 | A（无 VMMP） | B（有 VMMP_W） |
|------|-------------:|---------------:|
| SpatialFit | 4 | 4 |
| ComparisonFit | 4 | 5 |
| AggregationFit | 3 | 5 |
| HierarchyFit | 3 | 4 |
| ScreeningFit | 4 | 5 |
| RankingFit | 3 | 5 |
| UncertaintyFit | 4 | 5 |
| ConsistencyFit | 4 | 4 |
| **等权总分** | **3.63** | **4.63** |
| 推理符合度 | 2 | 5 |
| 任务贴合度 | 3 | 5 |

### 简评
- **A**：方案完整、可读，强调“谁先发现谁”、时间线与几何优势；但**没有清晰的威胁目标排序表**，层级/聚合偏弱，推理未走范式。
- **B**：明确走 Identify→…→Rank；有**四航母雷达图对齐比较**、**①②③④优先级列表**、Akagi/Hiryu 显著性突出；与 E_W 更对齐。  
- **差值**：总分约 **+1.0**；筛选/排序/聚合提升最明显。

---

## 4. 意图研判得分

| 指标 | A（无 VMMP） | B（有 VMMP_I） |
|------|-------------:|---------------:|
| SpatialFit | 4 | 5 |
| TemporalFit | 2 | 4 |
| RelationFit | 3 | 5 |
| ComparisonFit | 4 | 5 |
| EvidenceFit | 3 | 5 |
| SequenceFit | 3 | 5 |
| UncertaintyFit | 4 | 5 |
| ConsistencyFit | 4 | 4 |
| **等权总分** | **3.38** | **4.75** |
| 推理符合度 | 2 | 5 |
| 任务贴合度 | 3 | 5 |

### 简评
- **A**：能正确判断“集结、无佯动、指向中途岛”，界面偏综合态势；**证据—假设链弱**，时间连续与认知顺序一般。
- **B**：显式 Identify→Trace→Compare→Relate→Infer→Verify；有**假设验证区（支持/证伪）**、阶段条、航向连续性；EvidenceFit / SequenceFit 明显更好。  
- **差值**：总分约 **+1.4**；证据链与推理顺序提升最大。

---

## 5. 综合结论（仅针对本次预实验）

1. **在 T1 + qwen-plus 下，附带 VMMP JSON 的 B 组，在 E 指标上均高于 A 组。**  
2. 提升主要体现在：**结构化推理** + **任务专用视觉组织**（威胁：排序/筛选/比较；意图：证据/假设/阶段）。  
3. A 组并非“差”，而是更像通用态势看板；B 组更像“按任务认知结构生成的界面”。  
4. **限制**：单场景、单次采样、评分非盲评、且评的是**文字界面方案**而非真实可点界面。  
5. **建议下一步**：同一设置再跑 2 次；换 T21/T81；找 1–2 人盲评；有正向结果后再考虑接入生成台。

---

## 6. 文件清单

| 文件 | 说明 |
|------|------|
| `00_scenario_summary.txt` | 共用场景摘要 |
| `T1-threat-A_prompt.txt` / `_response.md` | 威胁对照 |
| `T1-threat-B_prompt.txt` / `_response.md` | 威胁实验 |
| `T1-intent-A_prompt.txt` / `_response.md` | 意图对照 |
| `T1-intent-B_prompt.txt` / `_response.md` | 意图实验 |
| `meta.json` | 模型、耗时、token |
| `scores.json` | 机器可读分数 |
| `RESULTS.md` | 本报告 |
