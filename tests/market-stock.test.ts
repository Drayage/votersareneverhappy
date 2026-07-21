import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { CAPS } from "../src/engine/caps";
import { buyCard, chooseCandidate, endTurn, newGame } from "../src/engine/game";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("시장 재고 순환", () => {
  it("시장에 들어온 카드의 기본 재고는 3장이다", () => {
    const state = newGame(content, 21);
    expect(CAPS.marketStock).toBe(3);
    expect(state.market.every((entry) => entry.stock === CAPS.marketStock)).toBe(true);
  });

  it("마지막 재고를 사면 시장에서 즉시 사라진다", () => {
    let state = newGame(content, 22);
    const defId = state.market[0].defId;
    const cost = content.cards.get(defId)!.cost;
    state = {
      ...state,
      market: state.market.map((entry) => entry.defId === defId ? { ...entry, stock: 1 } : entry),
      budget: cost,
      buys: 1,
    };

    state = buyCard(state, content, defId);

    expect(state.market.some((entry) => entry.defId === defId)).toBe(false);
    expect(state.discard.some((card) => card.defId === defId)).toBe(true);
  });

  it("품절로 빠진 카드는 다음 시장 진화 후보가 될 수 있다", () => {
    let state = newGame(content, 23);
    const defId = state.market[0].defId;
    const card = content.cards.get(defId)!;
    const candidateOnlyContent = { ...content, cardList: [card] };
    state = {
      ...state,
      turn: 2, // 1·4번째 턴은 태그 선택 단계가 끼어들므로 피한다(이 테스트와 무관)
      market: state.market.filter((entry) => entry.defId !== defId),
    };

    state = endTurn(state, candidateOnlyContent);

    expect(state.candidates).toContain(defId);
  });

  it("주기가 지날수록 신규 진입 카드의 재고가 1주기당 +1씩 늘어난다", () => {
    for (const evalIndex of [0, 1, 2]) {
      let state: GameState = { ...newGame(content, 24), phase: "candidate", evalIndex };
      const newId = content.cardList.find((c) => !state.market.some((m) => m.defId === c.id))!.id;
      state = { ...state, candidates: [newId] };
      state = chooseCandidate(state, content, newId);
      const entry = state.market.find((m) => m.defId === newId);
      expect(entry?.stock).toBe(CAPS.marketStock + evalIndex);
    }
  });
});
