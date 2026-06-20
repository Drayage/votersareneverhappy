import { describe, it, expect } from "vitest";
import { cardSchema } from "../src/content/schema";
import { loadContent } from "../src/content/loader";
import { newGame, playCard, buyCard, endTurn } from "../src/engine/game";
import type { CardDef, GameState } from "../src/engine/types";

const content = loadContent();

// 확장성 스모크 테스트:
// "기존 effect kind만 쓰는 새 카드"는 코드 수정 0줄로 — JSON에 넣기만 하면 — 동작해야 한다.
// 여기서는 런타임에 새 카드 정의를 콘텐츠에 주입하여 그 계약을 검증한다.
describe("콘텐츠 확장성", () => {
  it("모든 시드 카드/유물/정책이 zod 검증을 통과한다", () => {
    expect(content.cardList.length).toBeGreaterThan(40);
    expect(content.relicList.length).toBeGreaterThan(20);
    expect(content.policyList.length).toBeGreaterThan(0);
  });

  it("기존 kind만 사용하는 새 카드를 추가하면 코드 변경 없이 검증·동작한다", () => {
    // 1) 스키마 검증 (잘못된 카드면 여기서 실패)
    const newCard: CardDef = cardSchema.parse({
      id: "test_grand_plaza",
      name: "대광장",
      type: "score",
      tags: ["culture", "tourism"],
      cost: 4,
      tier: "A",
      text: "사용: +7점. 정산: 문화 카드당 +1점",
      onPlay: [{ kind: "gainScore", amount: 7 }],
      settlement: [{ kind: "settlementPerTag", tag: "culture", points: 1 }],
    }) as CardDef;

    // 2) 콘텐츠에 주입 (실서비스에선 data/cards.json 한 줄 추가에 해당)
    content.cards.set(newCard.id, newCard);
    content.cardList.push(newCard);

    // 3) 엔진이 별도 수정 없이 이 카드를 구매·사용해 점수를 낸다
    let s: GameState = newGame(content, 1);
    s = { ...s, market: [...s.market, { defId: newCard.id, stock: 5 }], budget: 10, buys: 2 };
    const before = s.cycleScore;
    s = buyCard(s, content, newCard.id);
    // 손으로 옮겨 사용
    const bought = s.discard.find((c) => c.defId === newCard.id)!;
    s = { ...s, hand: [...s.hand, bought], discard: s.discard.filter((c) => c.uid !== bought.uid) };
    s = playCard(s, content, bought.uid);
    expect(s.cycleScore).toBe(before + 7); // onPlay gainScore 7 반영

    // 정리: 다른 테스트에 영향 없도록 제거
    content.cards.delete(newCard.id);
    content.cardList.pop();
    // endTurn 호출이 예외 없이 동작하는지(스모크)
    expect(() => endTurn(s, content)).not.toThrow();
  });
});
