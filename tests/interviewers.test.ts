import { describe, expect, it } from "vitest";
import { panelKeys } from "@/lib/interviewers";

describe("panelKeys", () => {
  it("기본 순서는 daniel·mei·tina", () => {
    expect(panelKeys(["male", "female", "female"])).toEqual(["daniel", "mei", "tina"]);
  });
  it("남성 자리가 둘이어도 hank를 넣지 않는다", () => {
    expect(panelKeys(["male", "male", "female"])).toEqual(["daniel", "mei", "tina"]);
  });
  it("성별이 어긋나면 기본 패널 안에서 바꾼다", () => {
    expect(panelKeys(["female", "male"])).toEqual(["mei", "daniel"]);
  });
});
