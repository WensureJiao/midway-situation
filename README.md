# 中途岛战役 · LLM 态势生成台

以中途岛五个时间片的**清洗数据 + 意图研判/威胁分析任务**为输入，用提示词模板引导生成 **SituationViewSpec**，并渲染为：

- **地图主界面**（Leaflet）：舰艇 / 在空机 / 岸基设施、作战轴线、威胁圈
- **统计图**（Recharts）：兵力对比、在空数量、机型构成、运动状态、舰载机就绪等
- **研判面板**：六项能力对应的结论、威胁等级与优先级

## 时间片

| ID | 阶段 |
|----|------|
| T1 | 初始态势 / 南云集结 |
| T21 | 广域搜索与接触 |
| T81 | 机库危机（鱼雷换炸弹） |
| T145 | 残局猎杀 |
| T193 | 终局收束 |

数据位于 `public/data/midway/`（`pack.json` 为前端压缩包；原始清洗 JSON 同目录保留）。

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址：http://127.0.0.1:43127

## 测试流程

1. 选择时间片（T1–T193）
2. 勾选要喂给模型的分析任务（默认全选六项）
3. 选择 **本地生成**（确定性，无需密钥）或 **LLM**
4. 点击「生成态势」，查看地图 + 图表；可打开「提示词」检查组装结果

### 可选：真实 LLM

```bash
export OPENAI_API_KEY=sk-...
# 可选
export OPENAI_BASE_URL=https://api.openai.com/v1
export OPENAI_MODEL=gpt-4o-mini
npm run dev
```

未配置密钥时，LLM 模式会**自动回退**本地生成器，并在界面提示。

## 提示词模板

见 [`prompts/态势生成提示词模板.md`](./prompts/态势生成提示词模板.md) 与 `src/lib/prompts.ts`。

## 技术栈

Next.js · TypeScript · Tailwind · Leaflet · Recharts
