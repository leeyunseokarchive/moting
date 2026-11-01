import { deflateRawSync } from "node:zlib";
import CFB from "cfb";
import { describe, expect, it } from "vitest";
import { fileToText } from "../src/lib/doc-text";

function zip(files: Record<string, string>): Buffer {
  const c = CFB.utils.cfb_new();
  for (const [name, body] of Object.entries(files)) CFB.utils.cfb_add(c, `/${name}`, Buffer.from(body));
  return Buffer.from(CFB.write(c, { fileType: "zip", type: "buffer", compression: true }) as Uint8Array);
}

function record(tag: number, body: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32LE(tag | (body.length << 20));
  return Buffer.concat([head, body]);
}

function hwp(flags: number, section: Buffer): Buffer {
  const header = Buffer.alloc(256);
  header.write("HWP Document File");
  header.writeUInt32LE(flags, 36);
  const c = CFB.utils.cfb_new();
  CFB.utils.cfb_add(c, "/FileHeader", header);
  CFB.utils.cfb_add(c, "/BodyText/Section0", section);
  return Buffer.from(CFB.write(c, { type: "buffer" }) as Uint8Array);
}

const paraText = (text: string) => record(67, Buffer.from(text, "utf16le"));
const asFile = (buf: Buffer, name: string) => new File([new Uint8Array(buf)], name);

describe("fileToText", () => {
  it("docx 본문을 문단별로 뽑고 XML 이스케이프를 푼다", async () => {
    const xml = `<w:document><w:body><w:p><w:r><w:t>Redis &amp; Kafka</w:t></w:r></w:p><w:p><w:r><w:t>지연 180ms</w:t></w:r></w:p></w:body></w:document>`;
    const text = await fileToText(asFile(zip({ "word/document.xml": xml, "word/styles.xml": "<x>무시</x>" }), "자소서.docx"));
    expect(text).toBe("Redis & Kafka\n지연 180ms");
  });

  it("hwpx는 구역 순서대로 읽는다", async () => {
    const section = (t: string) => `<hs:sec><hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p></hs:sec>`;
    const buf = zip({ "Contents/section10.xml": section("끝"), "Contents/section2.xml": section("처음") });
    expect(await fileToText(asFile(buf, "이력서.hwpx"))).toBe("처음\n끝");
  });

  it("압축된 hwp 문단에서 인라인 컨트롤을 건너뛰고 글자만 뽑는다", async () => {
    const tab = Buffer.alloc(16);
    tab.writeUInt16LE(9, 0);
    const para = Buffer.concat([Buffer.from("이름", "utf16le"), tab, Buffer.from("김지원\r", "utf16le")]);
    const section = Buffer.concat([record(66, Buffer.alloc(22)), record(67, para), paraText("백엔드")]);
    const text = await fileToText(asFile(hwp(1, deflateRawSync(section)), "이력서.hwp"));
    expect(text).toBe("이름\t김지원\n백엔드");
  });

  it("암호가 걸린 hwp는 이유를 알려준다", async () => {
    await expect(fileToText(asFile(hwp(0b11, deflateRawSync(paraText("비밀"))), "잠김.hwp"))).rejects.toThrow("암호");
  });

  it("지원하지 않는 형식과 깨진 파일을 거절한다", async () => {
    await expect(fileToText(asFile(Buffer.from("x"), "옛날.doc"))).rejects.toThrow("PDF, DOCX, HWP");
    await expect(fileToText(asFile(Buffer.from("PK깨짐"), "깨짐.docx"))).rejects.toThrow("읽지 못했습니다");
  });

  it("압축 폭탄은 메모리를 다 쓰기 전에 멈춘다", async () => {
    const bomb = zip({ "word/document.xml": "0".repeat(40 * 1024 * 1024) });
    await expect(fileToText(asFile(bomb, "폭탄.docx"))).rejects.toThrow("읽지 못했습니다");
  });
});
