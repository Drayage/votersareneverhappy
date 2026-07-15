import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { chooseCandidate, endTurn, newGame, playCard } from "../src/engine/game";

const content = loadContent();

describe("연계 효과와 시장 불변식", () => {
  it("먼저 낸 같은 태그 카드 수만큼 연계 점수를 얻는다", () => {
    let s = newGame(content, 11);
    s = {
      ...s,
      hand: [
        { uid: 9001, defId: "tax_collect" },
        { uid: 9002, defId: "night_market" },
      ],
      actions: 2,
      cycleScore: 0,
      playedTagCounts: {},
    };

    s = playCard(s, content, 9001);
    s = playCard(s, content, 9002);

    expect(s.playedTagCounts.commerce).toBe(2);
    expect(s.cycleScore).toBe(2);
    expect(s.budget).toBe(3);
  });

  it("연계 점수는 카드별 상한을 넘지 않는다", () => {
    let s = newGame(content, 12);
    s = {
      ...s,
      hand: [{ uid: 9010, defId: "night_market" }],
      actions: 1,
      cycleScore: 0,
      playedTagCounts: { commerce: 20 },
    };

    s = playCard(s, content, 9010);
    expect(s.cycleScore).toBe(6);
  });

  it("제시되지 않은 후보나 존재하지 않는 제거 대상은 거부한다", () => {
    let s = newGame(content, 13);
    s = endTurn(s, content);
    const before = s;

    expect(chooseCandidate(s, content, "big_pledge")).toBe(before);

    s = { ...s, market: Array.from({ length: s.marketSlots }, (_, i) => ({
      defId: content.cardList[i + 2].id,
      stock: 10,
    })) };
    const candidate = s.candidates[0];
    expect(chooseCandidate(s, content, candidate, "not_in_market")).toBe(s);
  });
});
