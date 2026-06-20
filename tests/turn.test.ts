import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame, endTurn, chooseCandidate } from "../src/engine/game";
import { CAPS } from "../src/engine/caps";

const content = loadContent();

describe("턴 종료 시 예산 처리", () => {
  it("남은 예산은 턴 종료 즉시 0이 되고 이월되지 않는다", () => {
    let s = newGame(content, 1);
    s = { ...s, budget: 7 }; // 사용하지 않은 예산을 남긴 상태로 가정
    s = endTurn(s, content);
    expect(s.budget).toBe(0); // 턴 종료 즉시 소멸

    // 시장 진화 후 다음 턴 시작 → 기초 세수로만 재충전(이월 0)
    s = chooseCandidate(s, content, s.candidates[0]);
    expect(s.phase).toBe("play");
    expect(s.budget).toBe(CAPS.baseBudget); // 유물/정책 없으므로 기초 세수와 동일
  });
});
