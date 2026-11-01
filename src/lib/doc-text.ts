import "server-only";
import { inflateRawSync } from "node:zlib";
import * as CFB from "cfb";

/** 8MB 파일이 압축 폭탄이어도 서버 메모리를 다 쓰지 못하게 푸는 양을 제한한다 */
const MAX_UNZIPPED = 32 * 1024 * 1024;
const ZIP_LOCAL = 0x04034b50;
const ZIP_END = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const BODY_XML = /^(?:word\/document|Contents\/section\d+)\.xml$/;
const HWP_SECTION = /BodyText\/Section\d+$/;
const HWP_PARA_TEXT = 67;
const XML_ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

class DocError extends Error {}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });

function inflater() {
  let left = MAX_UNZIPPED;
  return (data: Buffer) => {
    const out = inflateRawSync(data, { maxOutputLength: left });
    left -= out.length;
    return out;
  };
}

/** docx·hwpx(ZIP)의 본문 XML만 푼다. cfb의 ZIP 읽기는 전체를 제한 없이 풀어서 쓰지 않는다. */
function zipBodies(buf: Buffer): string[] {
  const end = buf.lastIndexOf(ZIP_END);
  if (end < 0) throw new Error("ZIP 끝 레코드 없음");
  const inflate = inflater();
  const found: { name: string; text: string }[] = [];
  let p = buf.readUInt32LE(end + 16);
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (BODY_XML.test(name)) {
      const local = buf.readUInt32LE(p + 42);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      found.push({ name, text: (method === 8 ? inflate(data) : data).toString("utf8") });
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return found.sort(byName).map((f) => f.text);
}

function xmlText(xml: string): string {
  return xml
    .replace(/<\/(?:w|hp):p>|<(?:w:br|hp:lineBreak)\b[^>]*\/>/g, "\n")
    .replace(/<(?:w|hp):tab\b[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|quot|apos|amp);/g, (_, name: string) => XML_ENTITIES[name]);
}

/** HWP 5.0 문단 글자(UTF-16LE). 컨트롤 코드 중 일부는 8 WCHAR를 차지한다. */
function paraText(b: Buffer): string {
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2) {
    const c = b.readUInt16LE(i);
    if (c >= 32) s += String.fromCharCode(c);
    else if (c === 9) s += "\t";
    else if (c === 10) s += "\n";
    else if (c === 30 || c === 31) s += " ";
    if ((c >= 1 && c <= 9) || c === 11 || c === 12 || (c >= 14 && c <= 23)) i += 14;
  }
  return s;
}

function recordsText(b: Buffer): string {
  const lines: string[] = [];
  let p = 0;
  while (p + 4 <= b.length) {
    const head = b.readUInt32LE(p);
    p += 4;
    let size = head >>> 20;
    if (size === 0xfff) {
      size = b.readUInt32LE(p);
      p += 4;
    }
    if ((head & 0x3ff) === HWP_PARA_TEXT) lines.push(paraText(b.subarray(p, p + size)));
    p += size;
  }
  return lines.join("\n");
}

function hwpText(buf: Buffer): string {
  const cfb = CFB.read(buf, { type: "buffer" });
  const flags = Buffer.from(CFB.find(cfb, "/FileHeader")!.content as Uint8Array).readUInt32LE(36);
  if (flags & 0b10) throw new DocError("암호가 걸린 HWP는 읽을 수 없습니다. 암호를 풀어 저장한 뒤 다시 올려 주세요.");
  if (flags & 0b100) throw new DocError("배포용 HWP는 읽을 수 없습니다. PDF로 저장해 올려 주세요.");
  const inflate = inflater();
  return cfb.FullPaths.flatMap((name, i) => (HWP_SECTION.test(name) ? [{ name, i }] : []))
    .sort(byName)
    .map(({ i }) => {
      const data = Buffer.from(cfb.FileIndex[i].content as Uint8Array);
      return recordsText(flags & 1 ? inflate(data) : data);
    })
    .join("\n");
}

/** 업로드한 문서에서 본문 글자를 뽑는다. PDF는 Gemini가 직접 읽으므로 여기로 오지 않는다. */
export async function fileToText(file: File): Promise<string> {
  if (/\.(txt|md)$/i.test(file.name)) return file.text();
  if (!/\.(docx|hwp|hwpx)$/i.test(file.name)) throw new Error(`${file.name}: PDF, DOCX, HWP 파일만 올릴 수 있습니다.`);
  const unreadable = `${file.name} 파일을 읽지 못했습니다. PDF로 저장해 올리거나 직접 입력으로 붙여넣어 주세요.`;
  const buf = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = (buf.readUInt32LE(0) === ZIP_LOCAL ? zipBodies(buf).map(xmlText).join("") : hwpText(buf)).trim();
  } catch (e) {
    throw e instanceof DocError ? e : new Error(unreadable);
  }
  if (!text) throw new Error(unreadable);
  return text;
}
