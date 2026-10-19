/**
 * 生成「态势统计图说明」Word，含图片占位框。
 * 运行: node scripts/gen-charts-guide-docx.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
} from "docx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "docs", "vmmp_charts_guide.docx");

const thin = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "CCCCCC",
};

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    ...opts,
    children: [
      new TextRun({
        text,
        font: "宋体",
        size: 21, // 10.5pt
        ...opts.run,
      }),
    ],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: "黑体", size: 28, bold: true })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: "黑体", size: 24, bold: true })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: "黑体", size: 22, bold: true })],
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: `• ${text}`, font: "宋体", size: 21 }),
    ],
  });
}

/** 图片占位：虚线框 + 说明，便于在 Word 里替换为截图 */
function imagePlaceholder(caption, hint) {
  const cell = new TableCell({
    borders: {
      top: { style: BorderStyle.DASHED, size: 12, color: "888888" },
      bottom: { style: BorderStyle.DASHED, size: 12, color: "888888" },
      left: { style: BorderStyle.DASHED, size: 12, color: "888888" },
      right: { style: BorderStyle.DASHED, size: 12, color: "888888" },
    },
    width: { size: 9000, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: "【在此插入图片】",
            font: "宋体",
            size: 22,
            color: "666666",
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [
          new TextRun({
            text: caption,
            font: "宋体",
            size: 20,
            color: "333333",
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 200 },
        children: [
          new TextRun({
            text: hint,
            font: "宋体",
            size: 18,
            color: "888888",
            italics: true,
          }),
        ],
      }),
    ],
  });

  return [
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: [9000],
      rows: [new TableRow({ children: [cell] })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 200 },
      children: [
        new TextRun({
          text: `图示位置：${caption}`,
          font: "宋体",
          size: 18,
          color: "555555",
        }),
      ],
    }),
  ];
}

function simpleTable(headers, rows) {
  const colW = Math.floor(9000 / headers.length);
  const headerRow = new TableRow({
    children: headers.map(
      (h) =>
        new TableCell({
          borders: { top: thin, bottom: thin, left: thin, right: thin },
          width: { size: colW, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: "E8E8E8" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: h, font: "宋体", size: 18, bold: true }),
              ],
            }),
          ],
        }),
    ),
  });
  const body = rows.map(
    (r) =>
      new TableRow({
        children: r.map(
          (c) =>
            new TableCell({
              borders: { top: thin, bottom: thin, left: thin, right: thin },
              width: { size: colW, type: WidthType.DXA },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: String(c), font: "宋体", size: 18 }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: headers.map(() => colW),
    rows: [headerRow, ...body],
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        styles: [{ id: "Normal", run: { font: "宋体", size: 21 } }],
      },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "中途岛态势统计图说明",
              font: "黑体",
              size: 36,
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 320 },
          children: [
            new TextRun({
              text: "（含插图占位，请按虚线框提示替换为实际截图）",
              font: "宋体",
              size: 20,
              color: "666666",
            }),
          ],
        }),

        p(
          "本文说明系统中新接入的统计图：图种白名单、对比页认知图槽、图种库 /charts。红方=美军（USN，含中途岛），蓝方=日军（IJN）。A=无 VMMP 范式；B=注入 VMMP（威胁用 VMMP_W，意图用 VMMP_I）。",
        ),

        h1("1. 设计原则（两层）"),
        p("统计图不追求一次画满很多种，而是拆成两层："),
        bullet("图种语法：系统支持哪些常见统计图（白名单）→ 入口 /charts"),
        bullet("任务图槽：A/B 左右同构，用认知结果拉开范式差异 → 入口 /compare"),
        p("另外区分："),
        bullet(
          "事实图：来自切片 pack（舰数、在空、机型）。同一切片 A/B 兵力相同，不能单独证明范式改进。",
        ),
        bullet(
          "认知图：来自该侧 threat_ratings / map（高亮、轴线、圈）/ 阶段推断。左右标题与图种相同，只比数值。",
        ),
        bullet(
          "不为图表而图表：横条与竖柱同类；0/1/0 阶段柱已弃用；环图、散点、堆叠柱本轮不启用。",
        ),
        ...imagePlaceholder(
          "图1　两层结构示意（主台 / 对比页 / 图种库关系）",
          "建议：手绘或截界面导航示意；宽约页面栏宽",
        ),

        h1("2. 图种白名单（7 类）"),
        simpleTable(
          ["图种", "主要用途"],
          [
            ["柱状图", "威胁等级分布；主台水面舰/在空计数"],
            ["分组柱状", "两视角目标数；美/日作战轴线数"],
            ["条形图", "红看蓝/蓝看红威胁排序（条长+颜色）"],
            ["折线图", "跨切片在空总数、舰数走势"],
            ["多序列折线", "跨切片美/日在空对比"],
            ["面积图", "跨切片意图阶段编码"],
            ["饼图", "证据构成、地图编码；红/蓝机型构成"],
          ],
        ),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        p(
          "不算统计图种：意图任务的「战役阶段」用分段高亮条（集结/搜索/接触三选一），不用柱状图。",
        ),
        ...imagePlaceholder(
          "图2　图种库白名单界面截图（/charts）",
          "建议：截取白名单卡片区域",
        ),

        h1("3. 对比页 /compare（实验主战场）"),
        p("左右各一栏：A 无范式，B 有 VMMP。图槽由服务端从该侧态势推导。"),

        h2("3.1 威胁任务"),
        simpleTable(
          ["图", "图种", "怎么读"],
          [
            ["威胁等级分布", "柱", "是否从「高」扎堆拉开层次"],
            ["视角目标数", "分组柱", "两视角是否都筛到、是否漏一边"],
            ["地图编码", "饼", "筛排是否落到高亮/轴/圈（非全场舰数）"],
          ],
        ),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        ...imagePlaceholder(
          "图3　对比页·威胁任务：A/B 并排（含三张认知图）",
          "建议：选同一时间片（如 T81），威胁焦点，生成后整页截图",
        ),
        ...imagePlaceholder(
          "图4　威胁等级分布局部放大（突出 A/B 差异）",
          "建议：只截柱图区域，左右对照",
        ),

        h2("3.2 意图任务"),
        simpleTable(
          ["呈现", "形式", "怎么读"],
          [
            ["战役阶段", "分段条", "亮哪一格；是否跳步或判错"],
            ["作战指向", "分组柱", "美/日轴线数；方向是否清楚"],
            ["证据构成", "饼+悬停", "悬停看轴/高亮/圈明细；叙述不进饼"],
          ],
        ),
        new Paragraph({ spacing: { after: 120 }, children: [] }),
        ...imagePlaceholder(
          "图5　对比页·意图任务：阶段条 + 作战指向 + 证据饼",
          "建议：意图焦点下 A/B 并排截图",
        ),
        ...imagePlaceholder(
          "图6　证据构成饼图悬停明细",
          "建议：鼠标悬停某一扇区时截屏，显示具体证据条目",
        ),

        h1("4. 图种库 /charts"),
        p("用于展示白名单图种，数据为真实切片。"),
        bullet("时间片按钮 T1/T21/T81/T145/T193 → 只看该片图"),
        bullet("「时间线 T1→T193」按钮（与切片齐平）→ 只看跨切片图"),
        bullet("A/B 切换：认知图随侧变化；兵力类图两边相同"),

        h2("4.1 单切片视图"),
        p(
          "含：威胁等级分布、视角目标数、红看蓝/蓝看红威胁排序、红/蓝舰载机饼图、意图证据构成等。",
        ),
        ...imagePlaceholder(
          "图7　图种库·单切片（如 T81 · B）",
          "建议：选中 T81 与 B，截主图区",
        ),
        ...imagePlaceholder(
          "图8　红看蓝威胁排序条形（颜色分档）",
          "建议：局部放大条形图与色例",
        ),

        h2("4.2 时间线视图"),
        p(
          "含：在空飞机总数（折线）、美/日在空（多线）、意图阶段编码（面积）、水面舰艇总数（折线；纵轴在数值接近时自动收紧）。",
        ),
        ...imagePlaceholder(
          "图9　图种库·时间线 T1→T193",
          "建议：点「时间线」按钮后截四张跨切片图",
        ),

        h1("5. 主生成台（对照）"),
        p("主界面仍固定四张兵力事实图，与对比实验分流："),
        bullet("水面舰艇数量（柱）"),
        bullet("在空飞机数量（柱）"),
        bullet("红方舰载机机型构成·就绪（饼）"),
        bullet("蓝方舰载机机型构成·就绪（饼）"),
        ...imagePlaceholder(
          "图10　主生成台四张兵力图",
          "建议：主台生成后截图表区",
        ),

        h1("6. 写报告可用的对照句式（示例）"),
        bullet(
          "同一切片兵力事实相同，B 侧威胁等级分布从「高」扎堆变为紧急/高/中分层，说明筛选层次改善。",
        ),
        bullet(
          "视角目标数上，A 侧某视角为空或混入己方（需结合排序列表核对），B 侧两视角均有条目且更干净。",
        ),
        bullet(
          "意图证据构成饼图悬停可见轴线标签与高亮实体；B 侧方向类证据更完整。",
        ),
        bullet(
          "跨切片阶段面积上，B 侧更贴近 T1→T193 战役进程（集结→搜索→接触）。",
        ),
        p(
          "注意：统计图是放大镜，主证据仍是地图编码与推理文字；若两侧 ratings 本身接近，图也会接近。",
        ),

        h1("7. 插图清单（便于你对照补图）"),
        simpleTable(
          ["编号", "建议内容", "来源界面"],
          [
            ["图1", "两层结构示意", "自绘/总览"],
            ["图2", "白名单", "/charts"],
            ["图3", "威胁 A/B 并排", "/compare"],
            ["图4", "等级分布局部", "/compare"],
            ["图5", "意图 A/B 并排", "/compare"],
            ["图6", "证据悬停", "/compare 或 /charts"],
            ["图7", "单切片总览", "/charts"],
            ["图8", "威胁排序条形", "/charts"],
            ["图9", "时间线", "/charts"],
            ["图10", "主台兵力四图", "主生成台"],
          ],
        ),
        new Paragraph({ spacing: { after: 200 }, children: [] }),
        p(
          "操作提示：在 Word 中选中虚线框内文字后，插入 → 图片 → 此设备，替换占位；图题可保留或改为「图×　……」。",
        ),
      ],
    },
  ],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buf);
console.log("Wrote", outPath);
