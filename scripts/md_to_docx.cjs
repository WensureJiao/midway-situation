/**
 * Convert docs/vmmp_analysis_report.md → docs/vmmp_analysis_report.docx
 */
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
} = require("docx");
const { marked } = require("marked");

const mdPath = path.join(__dirname, "..", "docs", "vmmp_analysis_report.md");
const outPath = path.join(__dirname, "..", "docs", "vmmp_analysis_report.docx");

const md = fs.readFileSync(mdPath, "utf8");
const tokens = marked.lexer(md);

const thin = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

function runsFromInline(tokens) {
  if (!tokens) return [new TextRun("")];
  const runs = [];
  for (const t of tokens) {
    if (t.type === "text") {
      runs.push(new TextRun({ text: t.text, font: "微软雅黑", size: 21 }));
    } else if (t.type === "strong") {
      const inner = (t.tokens || [{ type: "text", text: t.text }])
        .map((x) => x.text || "")
        .join("");
      runs.push(
        new TextRun({ text: inner, bold: true, font: "微软雅黑", size: 21 }),
      );
    } else if (t.type === "em") {
      const inner = (t.tokens || [{ type: "text", text: t.text }])
        .map((x) => x.text || "")
        .join("");
      runs.push(
        new TextRun({ text: inner, italics: true, font: "微软雅黑", size: 21 }),
      );
    } else if (t.type === "codespan") {
      runs.push(
        new TextRun({
          text: t.text,
          font: "Consolas",
          size: 18,
          color: "333333",
        }),
      );
    } else if (t.type === "link") {
      runs.push(
        new TextRun({
          text: t.text || t.href,
          font: "微软雅黑",
          size: 21,
          color: "0563C1",
          underline: {},
        }),
      );
    } else if (t.type === "escape" || t.raw) {
      runs.push(
        new TextRun({
          text: t.text || t.raw || "",
          font: "微软雅黑",
          size: 21,
        }),
      );
    } else if (t.tokens) {
      runs.push(...runsFromInline(t.tokens));
    } else if (t.text) {
      runs.push(new TextRun({ text: t.text, font: "微软雅黑", size: 21 }));
    }
  }
  return runs.length ? runs : [new TextRun({ text: "", font: "微软雅黑" })];
}

function cell(text, opts = {}) {
  return new TableCell({
    borders,
    width: { size: opts.width || 2400, type: WidthType.DXA },
    shading: opts.header
      ? { type: ShadingType.CLEAR, fill: "F0EDE6" }
      : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text ?? "").replace(/\|/g, ""),
            bold: !!opts.header,
            font: "微软雅黑",
            size: opts.header ? 18 : 17,
          }),
        ],
      }),
    ],
  });
}

function parseTable(token) {
  const colCount = token.header.length;
  const colW = Math.floor(9000 / colCount);
  const headerRow = new TableRow({
    children: token.header.map((h) =>
      cell(
        (h.tokens ? h.tokens.map((x) => x.text || "").join("") : h.text) || "",
        { header: true, width: colW },
      ),
    ),
  });
  const bodyRows = token.rows.map(
    (row) =>
      new TableRow({
        children: row.map((c) =>
          cell(
            (c.tokens ? c.tokens.map((x) => x.text || "").join("") : c.text) ||
              "",
            { width: colW },
          ),
        ),
      }),
  );
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: [headerRow, ...bodyRows],
  });
}

const children = [];

for (const token of tokens) {
  if (token.type === "heading") {
    const level =
      token.depth === 1
        ? HeadingLevel.HEADING_1
        : token.depth === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;
    children.push(
      new Paragraph({
        heading: level,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: token.text,
            bold: true,
            font: "微软雅黑",
            size: token.depth === 1 ? 32 : token.depth === 2 ? 26 : 22,
          }),
        ],
      }),
    );
  } else if (token.type === "paragraph") {
    children.push(
      new Paragraph({
        spacing: { after: 120, line: 360 },
        children: runsFromInline(token.tokens),
      }),
    );
  } else if (token.type === "blockquote") {
    for (const inner of token.tokens || []) {
      if (inner.type === "paragraph") {
        children.push(
          new Paragraph({
            spacing: { after: 80 },
            indent: { left: 420 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: "8B7355" },
            },
            children: [
              new TextRun({
                text: "",
                font: "微软雅黑",
              }),
              ...runsFromInline(inner.tokens).map((r) => {
                // clone-ish: re-create with italic feel via wrapping
                return r;
              }),
            ],
          }),
        );
      }
    }
  } else if (token.type === "list") {
    for (const item of token.items) {
      const textParts = [];
      for (const it of item.tokens || []) {
        if (it.type === "paragraph" || it.type === "text") {
          textParts.push(...runsFromInline(it.tokens || [{ type: "text", text: it.text }]));
        }
      }
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360 },
          children: [
            new TextRun({ text: "• ", font: "微软雅黑", size: 21 }),
            ...(textParts.length
              ? textParts
              : [new TextRun({ text: item.text || "", font: "微软雅黑", size: 21 })]),
          ],
        }),
      );
    }
  } else if (token.type === "code") {
    const lines = token.text.replace(/\r\n/g, "\n").split("\n");
    for (const line of lines) {
      children.push(
        new Paragraph({
          spacing: { after: 0 },
          shading: { type: ShadingType.CLEAR, fill: "F5F3EE" },
          children: [
            new TextRun({
              text: line || " ",
              font: "Consolas",
              size: 16,
            }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ children: [] }));
  } else if (token.type === "table") {
    children.push(parseTable(token));
    children.push(new Paragraph({ children: [], spacing: { after: 160 } }));
  } else if (token.type === "hr") {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 120 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" },
        },
        children: [],
      }),
    );
  } else if (token.type === "space") {
    children.push(new Paragraph({ children: [] }));
  }
}

const doc = new Document({
  styles: {
    default: {
      document: {
        styles: [
          {
            id: "Normal",
            name: "Normal",
            run: { font: "微软雅黑", size: 21 },
          },
        ],
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
              text: "VMMP 范式引入效果分析报告",
              bold: true,
              font: "微软雅黑",
              size: 36,
            }),
          ],
        }),
        ...children,
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("Wrote", outPath, `(${buf.length} bytes)`);
});
