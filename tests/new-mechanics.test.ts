import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame, playCard, resolveChoice } from "../src/engine/game";
import { ownedCards } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("조건부 즉발 점수(conditionalScore)", () => {
  it("보유 태그 카드 수가 조건 미달이면 ifNot, 충족하면 ifMet", () => {
    let s: GameState = newGame(content, 61);
    s = {
      ...s,
      hand: [{ uid: 9800, defId: "industry_cluster_push" }],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
    };
    // 시작 덱(기본 세수 7 + 낡은 공약 3)엔 산업 카드가 없다 → 조건 미달
    s = playCard(s, content, 9800);
    expect(s.cycleScore).toBe(4); // ifNot

    let s2: GameState = newGame(content, 62);
    s2 = {
      ...s2,
      hand: [{ uid: 9801, defId: "industry_cluster_push" }],
      deck: Array.from({ length: 5 }, (_, i) => ({ uid: 9810 + i, defId: "factory" })), // 산업 카드 5장
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
    };
    s2 = playCard(s2, content, 9801);
    expect(s2.cycleScore).toBe(28); // ifMet
  });
});

describe("낡은 공약 추가(gainCurse) — 강한 효과의 대가로 덱을 희석", () => {
  it("사용 시 버린 더미에 낡은 공약(old_pledge)이 추가된다", () => {
    let s: GameState = newGame(content, 63);
    s = { ...s, hand: [{ uid: 9820, defId: "blind_pledge" }], deck: [], discard: [], inPlay: [], actions: 1, cycleScore: 0 };
    const before = ownedCards(s).length; // blind_pledge 1장뿐
    s = playCard(s, content, 9820);
    expect(s.cycleScore).toBe(16);
    expect(s.discard.some((c) => c.defId === "old_pledge")).toBe(true);
    expect(ownedCards(s).length).toBe(before + 1); // 저주 카드 1장만 순증(blind_pledge는 손→inPlay 이동일 뿐)
  });
});

describe("버리고 값 획득 (discardForScore / discardForBudget)", () => {
  it("discardForScore: 버린 수만큼 점수, 재드로우 없음", () => {
    let s: GameState = newGame(content, 64);
    s = {
      ...s,
      hand: [
        { uid: 9830, defId: "emergency_clearance" },
        { uid: 9831, defId: "basic_tax" },
        { uid: 9832, defId: "old_pledge" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
    };
    s = playCard(s, content, 9830);
    expect(s.pendingChoice?.kind).toBe("discardForScore");
    s = resolveChoice(s, content, [9831, 9832]);
    expect(s.cycleScore).toBe(2);
    expect(s.hand.length).toBe(0); // 재드로우 없음
    expect(s.discard.some((c) => c.uid === 9831)).toBe(true);
  });

  it("discardForBudget: 버린 수만큼 예산", () => {
    let s: GameState = newGame(content, 65);
    s = {
      ...s,
      hand: [
        { uid: 9840, defId: "inventory_cashout" },
        { uid: 9841, defId: "basic_tax" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      budget: 0,
    };
    s = playCard(s, content, 9840);
    s = resolveChoice(s, content, [9841]);
    expect(s.budget).toBe(1);
  });

  it("선택 안 함(빈 배열)도 가능 — 아무것도 얻지 않는다", () => {
    let s: GameState = newGame(content, 66);
    s = { ...s, hand: [{ uid: 9850, defId: "emergency_clearance" }], deck: [], discard: [], inPlay: [], actions: 1, cycleScore: 0 };
    s = playCard(s, content, 9850);
    s = resolveChoice(s, content, []);
    expect(s.cycleScore).toBe(0);
    expect(s.pendingChoice).toBeNull();
  });
});

describe("폐기하고 값 획득 (trashForScore / trashForDraw)", () => {
  it("trashForScore: 폐기한 카드의 비용만큼 점수, 완전 제거(버린 더미로도 안 감)", () => {
    let s: GameState = newGame(content, 67);
    s = {
      ...s,
      hand: [
        { uid: 9860, defId: "asset_liquidation" },
        { uid: 9861, defId: "municipal_bond" }, // cost 3
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
    };
    s = playCard(s, content, 9860);
    expect(s.pendingChoice?.kind).toBe("trashForScore");
    s = resolveChoice(s, content, [9861]);
    expect(s.cycleScore).toBe(3); // municipal_bond 비용만큼
    expect(s.discard.some((c) => c.uid === 9861)).toBe(false);
    expect(s.hand.some((c) => c.uid === 9861)).toBe(false);
  });

  it("trashForDraw: 폐기한 카드의 비용만큼 드로우", () => {
    let s: GameState = newGame(content, 68);
    s = {
      ...s,
      hand: [
        { uid: 9870, defId: "admin_asset_swap" },
        { uid: 9871, defId: "subway" }, // cost 5
      ],
      deck: Array.from({ length: 6 }, (_, i) => ({ uid: 9880 + i, defId: "banner" })),
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9870);
    s = resolveChoice(s, content, [9871]);
    expect(s.hand.length).toBe(5); // subway 비용(5)만큼 드로우
  });

  it("trashForBudget: 폐기한 카드의 비용만큼 예산, 완전 제거(버린 더미로도 안 감)", () => {
    let s: GameState = newGame(content, 71);
    s = {
      ...s,
      hand: [
        { uid: 9910, defId: "real_estate_sale" },
        { uid: 9911, defId: "subway" }, // cost 5
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      budget: 0,
    };
    s = playCard(s, content, 9910);
    expect(s.pendingChoice?.kind).toBe("trashForBudget");
    s = resolveChoice(s, content, [9911]);
    expect(s.budget).toBe(5); // subway 비용만큼
    expect(s.discard.some((c) => c.uid === 9911)).toBe(false);
    expect(s.hand.some((c) => c.uid === 9911)).toBe(false);
  });
});

describe("도박(topDeckGamble)", () => {
  it("고른 카드가 지정 태그를 가지면 즉시 보너스 점수, 덱 맨 위로 되돌아간다", () => {
    let s: GameState = newGame(content, 69);
    s = {
      ...s,
      hand: [
        { uid: 9890, defId: "blind_bet" },
        { uid: 9891, defId: "tax_collect" }, // commerce 태그
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
    };
    s = playCard(s, content, 9890);
    expect(s.pendingChoice).toEqual({ kind: "topDeckGamble", max: 1, tag: "commerce", bonus: 10 });
    s = resolveChoice(s, content, [9891]);
    expect(s.cycleScore).toBe(10);
    expect(s.deck[0]?.uid).toBe(9891); // 덱 맨 위로
    expect(s.hand.some((c) => c.uid === 9891)).toBe(false);
  });

  it("태그가 맞지 않으면 보너스 없음(그래도 덱 맨 위로는 간다)", () => {
    let s: GameState = newGame(content, 70);
    s = {
      ...s,
      hand: [
        { uid: 9900, defId: "blind_bet" },
        { uid: 9901, defId: "old_pledge" }, // populism 태그, commerce 아님
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
    };
    s = playCard(s, content, 9900);
    s = resolveChoice(s, content, [9901]);
    expect(s.cycleScore).toBe(0);
    expect(s.deck[0]?.uid).toBe(9901);
  });
});
