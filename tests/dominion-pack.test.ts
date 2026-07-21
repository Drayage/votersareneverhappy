import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { chooseCandidate, chooseCandidateTag, endTurn, newGame, playCard, resolveChoice } from "../src/engine/game";
import { ownedCards } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("액션·드로우 확장 팩 (도미니언 이식)", () => {
  it("잔업 수당: 남은 액션 1개당 +2예산 (액션은 소모하지 않음)", () => {
    let s: GameState = newGame(content, 51);
    s = { ...s, hand: [{ uid: 9601, defId: "overtime_pay" }], deck: [], discard: [], inPlay: [], actions: 4, budget: 0 };
    s = playCard(s, content, 9601); // playCost 1 차감 후 남은 액션 3 × 2
    expect(s.budget).toBe(6);
    expect(s.actions).toBe(3);
  });

  it("총동원령: 액션 3을 모아야 낼 수 있다", () => {
    let s: GameState = newGame(content, 54);
    s = { ...s, hand: [{ uid: 9640, defId: "full_mobilization" }], deck: Array.from({ length: 6 }, (_, i) => ({ uid: 9650 + i, defId: "banner" })), discard: [], inPlay: [], actions: 2, buys: 2 };
    expect(playCard(s, content, 9640)).toBe(s); // 액션 부족 → 불가
    s = { ...s, actions: 3 };
    s = playCard(s, content, 9640);
    expect(s.hand.length).toBe(5); // +5드로우
    expect(s.buys).toBe(4);
    expect(s.actions).toBe(0);
  });
});

describe("선택 시스템(pendingChoice)", () => {
  it("문서고 정리: 고른 카드만 버리고 그 수만큼 드로우, 해소 전엔 다른 행동 불가", () => {
    let s: GameState = newGame(content, 52);
    s = {
      ...s,
      hand: [
        { uid: 9610, defId: "archive_sort" },
        { uid: 9611, defId: "basic_tax" },
        { uid: 9612, defId: "central_market" },
        { uid: 9613, defId: "festival" },
      ],
      deck: [
        { uid: 9620, defId: "banner" },
        { uid: 9621, defId: "banner" },
      ],
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9610);
    expect(s.pendingChoice).toEqual({ kind: "discardThenDraw", max: 9 });
    expect(endTurn(s, content)).toBe(s); // 보류 중엔 턴 종료 불가
    expect(playCard(s, content, 9613)).toBe(s); // 보류 중엔 플레이 불가

    s = resolveChoice(s, content, [9611, 9612]); // 세수·중앙시장 버리기
    expect(s.pendingChoice).toBeNull();
    expect(s.hand.map((c) => c.defId).sort()).toEqual(["banner", "banner", "festival"]);
    expect(s.discard.some((c) => c.uid === 9611)).toBe(true);
  });

  it("행정 감사: 고른 카드를 게임에서 영구 제거한다 (선택 안 함도 가능)", () => {
    let s: GameState = newGame(content, 53);
    s = {
      ...s,
      hand: [
        { uid: 9630, defId: "audit" },
        { uid: 9631, defId: "basic_tax" },
        { uid: 9632, defId: "old_pledge" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9630);
    const before = ownedCards(s).length;
    const skipped = resolveChoice(s, content, []); // 선택 안 함 → 그대로 해소
    expect(skipped.pendingChoice).toBeNull();
    expect(ownedCards(skipped).length).toBe(before);

    s = resolveChoice(s, content, [9631, 9632]);
    expect(ownedCards(s).length).toBe(before - 2);
    expect(s.discard.length).toBe(0); // 버린 것이 아니라 완전 제거
  });

  it("이중 결재: 고른 카드를 액션 소모 없이 두 번 발동한다", () => {
    let s: GameState = newGame(content, 55);
    s = {
      ...s,
      hand: [
        { uid: 9660, defId: "double_stamp" },
        { uid: 9661, defId: "tax_collect" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      budget: 0,
      cyclePlays: 0,
      cyclePlayedTagCounts: {},
    };
    s = playCard(s, content, 9660);
    expect(s.pendingChoice?.kind).toBe("playTwice");
    s = resolveChoice(s, content, [9661]);
    expect(s.budget).toBe(4); // +2예산 × 2
    expect(s.actions).toBe(0); // 이중 결재 1액션 외 추가 소모 없음
    expect(s.inPlay.some((c) => c.uid === 9661)).toBe(true);
    expect(s.cyclePlayedTagCounts.commerce).toBe(2); // 두 번 발동 = 두 번 낸 것으로 집계
  });

  it("부두 정비: (지속) 다음 턴 시작 시에도 +2드로우가 발동한다", () => {
    let s: GameState = newGame(content, 56);
    s = {
      ...s,
      hand: [{ uid: 9670, defId: "wharf" }],
      deck: Array.from({ length: 12 }, (_, i) => ({ uid: 9680 + i, defId: "banner" })),
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9670); // +2드로우, 지속 배치
    expect(s.hand.length).toBe(2);
    s = endTurn(s, content);
    expect(s.inPlay.map((c) => c.defId)).toEqual(["wharf"]); // 지속 유지
    s = chooseCandidateTag(s, content, s.tagChoices[0]); // 1턴째 종료 → 태그 선택 단계
    s = chooseCandidate(s, content, s.candidates[0]); // 다음 턴 시작
    expect(s.hand.length).toBe(8); // 기본 6 + duration 2
  });
});
