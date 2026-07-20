import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame, playCard } from "../src/engine/game";
import { computeSettlement } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("리사이클(recycleInPlay)", () => {
  it("최근에 낸 카드를 덱 위로 되돌리고, 드로우로 회수해 같은 턴에 재사용할 수 있다", () => {
    let s = newGame(content, 31);
    s = {
      ...s,
      hand: [
        { uid: 9101, defId: "tax_collect" },
        { uid: 9102, defId: "night_shuttle" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 2,
      budget: 0,
    };

    s = playCard(s, content, 9101); // +2예산 → inPlay
    s = playCard(s, content, 9102); // tax_collect 덱 위로 → +1드로우로 즉시 회수
    expect(s.hand.some((c) => c.uid === 9101)).toBe(true);
    expect(s.inPlay.some((c) => c.uid === 9101)).toBe(false);

    s = playCard(s, content, 9101); // 재사용
    expect(s.budget).toBe(4);
  });

  it("낸 카드가 없으면 아무것도 되돌리지 않는다", () => {
    let s = newGame(content, 32);
    s = {
      ...s,
      hand: [{ uid: 9105, defId: "night_shuttle" }],
      deck: [{ uid: 9106, defId: "basic_tax" }],
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9105);
    expect(s.hand.map((c) => c.uid)).toEqual([9106]); // 드로우만 발생
  });
});

describe("정산 전용 카드(손패 패널티)", () => {
  it("정산 전용 카드는 손에서 사용할 수 없다", () => {
    let s = newGame(content, 33);
    s = { ...s, hand: [{ uid: 9110, defId: "central_market" }], actions: 5 };
    expect(playCard(s, content, 9110)).toBe(s);
  });

  it("removeScorePenalty(공약 면책 특례)가 있으면 정산 전용 카드가 손에 들어오지 않는다", () => {
    let s: GameState = newGame(content, 34);
    s = {
      ...s,
      policies: ["p_no_penalty"],
      hand: [{ uid: 9120, defId: "bus_line" }],
      deck: [
        { uid: 9121, defId: "central_market" },
        { uid: 9122, defId: "basic_tax" },
        { uid: 9123, defId: "basic_tax" },
      ],
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9120); // +2드로우
    expect(s.hand.map((c) => c.defId)).toEqual(["basic_tax", "basic_tax"]);
    expect(s.discard.some((c) => c.defId === "central_market")).toBe(true);
  });
});

describe("자금 보상(목표 달성률 기반)", () => {
  const withScore = (cycleScore: number): GameState => {
    const s = newGame(content, 35);
    return { ...s, cycleScore }; // 시작 덱에는 정산 효과가 없어 finalScore = cycleScore
  };

  it("턱걸이 통과는 목표만큼 받는다", () => {
    const r = computeSettlement(withScore(70), content);
    expect(r.passed).toBe(true);
    expect(r.fundGained).toBe(70);
  });

  it("초과분은 절반 비율로만 얹는다", () => {
    const r = computeSettlement(withScore(84), content); // 달성률 120% → 자금 110%
    expect(r.fundGained).toBe(77);
  });

  it("오버킬은 목표×1.5에서 캡된다", () => {
    const r = computeSettlement(withScore(700), content);
    expect(r.fundGained).toBe(105);
  });

  it("실패 시 자금은 0", () => {
    const r = computeSettlement(withScore(10), content);
    expect(r.fundGained).toBe(0);
  });
});
