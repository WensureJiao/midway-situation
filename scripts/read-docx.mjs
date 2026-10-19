import fs from "fs";
import { inflateRawSync } from "zlib";

const p = process.argv[2];
const buf = fs.readFileSync(p);

function findLocal(name) {
  let i = 0;
  while (i < buf.length - 30) {
    if (buf.readUInt32LE(i) === 0x04034b50) {
      const comp = buf.readUInt16LE(i + 8);
      const compSize = buf.readUInt32LE(i + 18);
      const nameLen = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const fname = buf.slice(i + 30, i + 30 + nameLen).toString("utf8");
      const start = i + 30 + nameLen + extraLen;
      const data = buf.slice(start, start + compSize);
      if (fname === name) return { comp, data };
      i = start + compSize;
      continue;
    }
    i++;
  }
  return null;
}

const entry = findLocal("word/document.xml");
if (!entry) {
  console.error("document.xml not found");
  process.exit(1);
}
const xml =
  entry.comp === 0
    ? entry.data.toString("utf8")
    : inflateRawSync(entry.data).toString("utf8");

let text = xml
  .replace(/<\/w:p>/g, "\n")
  .replace(/<w:tab[^/]*\/>/g, "\t")
  .replace(/<[^>]+>/g, "");
text = text
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, "\n\n");
process.stdout.write(text);
