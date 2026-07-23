import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame } from "../src/engine/game";
import { previewHandCardSettlementValue, previewMarketCardSettlementValue } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

function withDeck(defIds: string[], patch?: Partial<GameState>): GameState {
  const s = newGame(content, 1);
  let uid = 1000;
  s.deck = defIds.map((defId) => ({ uid: uid++, defId }));
  s.hand = [];
  s.discard = [];
  s.inPlay = [];
  return { ...s, ...patch };
}

describe("정산카드 실시간 미리보기", () => {
  it("previewHandCardSettlementValue: 손패의 정산카드를 제거했을 때의 차액을 계산한다", () => {
    const s = withDeck(["festival", "concert_hall"], { hand: [{ uid: 500, defId: "museum" }] });
    // 문화 3장(museum+festival+concert_hall) × 2점 = 6, museum을 빼면 정산 소스 자체가 사라져 0
    expect(previewHandCardSettlementValue(s, content, 500)).toBe(6);
  });

  it("previewHandCardSettlementValue: 존재하지 않는 uid나 정산 효과 없는 카드는 0", () => {
    const s = withDeck(["festival"], { hand: [{ uid: 501, defId: "basic_tax" }] });
    expect(previewHandCardSettlementValue(s, content, 999)).toBe(0); // 없는 uid
    expect(previewHandCardSettlementValue(s, content, 501)).toBe(0); // settlement 효과 없음
  });

  it("previewMarketCardSettlementValue: 지금 산다면 정산에 얼마나 보탤지 가상 계산", () => {
    const s = withDeck(["festival", "concert_hall"]);
    expect(previewMarketCardSettlementValue(s, content, "museum")).toBe(6);
  });

  it("previewMarketCardSettlementValue: 정산 효과 없는 카드는 0", () => {
    const s = withDeck(["festival"]);
    expect(previewMarketCardSettlementValue(s, content, "basic_tax")).toBe(0);
  });
});
