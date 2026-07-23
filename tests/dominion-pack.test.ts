import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import {
  chooseCandidate,
  chooseCandidateTag,
  confirmEvaluation,
  endTurn,
  newGame,
  nextCycle,
  pickRewardPolicy,
  pickRewardRelic,
  playCard,
  resolveChoice,
  skipRewardRemoval,
} from "../src/engine/game";
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
    s = { ...s, hand: [{ uid: 9640, defId: "full_mobilization" }], deck: Array.from({ length: 6 }, (_, i) => ({ uid: 9650 + i, defId: "banner" })), discard: [], inPlay: [], actions: 2, budget: 0 };
    expect(playCard(s, content, 9640)).toBe(s); // 액션 부족 → 불가
    s = { ...s, actions: 3 };
    s = playCard(s, content, 9640);
    expect(s.hand.length).toBe(5); // +5드로우
    expect(s.budget).toBe(3);
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
    expect(s.budget).toBe(4); // +2예산 × 2 (두 번 발동 증명)
    expect(s.actions).toBe(0); // 이중 결재 1액션 외 추가 소모 없음
    expect(s.inPlay.some((c) => c.uid === 9661)).toBe(true);
    // 세금 징수는 재정(treasure) 카드 → 두 번 발동해도 주기 낸 카드 수엔 세지 않는다(재정 제외 규칙)
    expect(s.cyclePlayedTagCounts.commerce ?? 0).toBe(0);
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

describe("리롤권/압축/순환 신규 카드", () => {
  it("여론조사: +1드로우와 함께 리롤권을 1장 직접 획득한다", () => {
    let s: GameState = newGame(content, 57);
    s = { ...s, hand: [{ uid: 9700, defId: "opinion_poll" }], deck: [{ uid: 9701, defId: "banner" }], discard: [], inPlay: [], actions: 1, rerollTickets: 0 };
    s = playCard(s, content, 9700);
    expect(s.rerollTickets).toBe(1);
    expect(s.hand.some((c) => c.uid === 9701)).toBe(true);
  });

  it("여론조사로 얻는 리롤권은 주기당 최대 5장 — 평가 통과 보상과는 별개 상한", () => {
    let s: GameState = newGame(content, 60);
    s = {
      ...s,
      hand: Array.from({ length: 6 }, (_, i) => ({ uid: 9730 + i, defId: "opinion_poll" })),
      deck: Array.from({ length: 6 }, (_, i) => ({ uid: 9740 + i, defId: "banner" })),
      discard: [],
      inPlay: [],
      actions: 6,
      rerollTickets: 0,
    };
    for (const card of s.hand.slice()) {
      s = playCard(s, content, card.uid);
    }
    expect(s.rerollTickets).toBe(5); // 6장을 냈어도 카드 출처 상한 5장에서 멈춤
    expect(s.cycleCardRerollTickets).toBe(5);

    // 평가를 통과해 보상 단계로 넘어가면, 카드 출처 상한과 무관하게 통과 보상(2장)이 그대로 더해진다
    s = { ...s, phase: "evaluation", lastSettlement: { evalIndex: 0, target: 70, baseTarget: 70, baseCycleScore: 0, settlementScore: 0, settlementMult: 1, pollutionPenalty: 0, globalMult: 1, targetBonusPct: 0, corruptionPct: 0, finalScore: 70, passed: true, perTag: {} } };
    s = confirmEvaluation(s, content);
    expect(s.rerollTickets).toBe(7);
    expect(s.cycleCardRerollTickets).toBe(5); // 아직 같은 주기 — 리셋은 다음 주기 시작 시점

    // 유물뽑기 → 정책뽑기 → 카드 정비(건너뛰기) → 다음 주기로 넘어가면 카드 출처 카운터가 리셋된다
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    s = pickRewardPolicy(s, content, s.rewardPolicyChoices[0]);
    s = skipRewardRemoval(s);
    s = nextCycle(s, content);
    expect(s.evalIndex).toBe(1);
    expect(s.cycleCardRerollTickets).toBe(0);
  });

  it("증거 인멸: 손패 최대 2장을 영구 제거하고 부패 게이지를 낮춘다", () => {
    let s: GameState = newGame(content, 58);
    s = {
      ...s,
      hand: [
        { uid: 9710, defId: "destroy_evidence" },
        { uid: 9711, defId: "basic_tax" },
        { uid: 9712, defId: "old_pledge" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 1,
      gauges: { pollution: 0, corruption: 2, populismDebuff: 0 },
    };
    s = playCard(s, content, 9710);
    expect(s.pendingChoice?.kind).toBe("trashFromHand");
    const before = ownedCards(s).length;
    s = resolveChoice(s, content, [9711, 9712]);
    expect(ownedCards(s).length).toBe(before - 2);
    expect(s.discard.length).toBe(0); // 폐기는 버린 더미로도 안 감
    expect(s.gauges.corruption).toBe(1); // 부패 게이지 -1
  });

  it("쾌속 환승: 낸 카드 1장을 덱 위로 되돌리고 +2드로우", () => {
    let s: GameState = newGame(content, 59);
    s = {
      ...s,
      hand: [
        { uid: 9720, defId: "tax_collect" },
        { uid: 9721, defId: "express_transfer" },
      ],
      deck: [],
      discard: [],
      inPlay: [],
      actions: 2,
      budget: 0,
    };
    s = playCard(s, content, 9720); // 세금 징수 → inPlay
    s = playCard(s, content, 9721); // 세금 징수를 덱 위로 되돌리고 +2드로우 → 즉시 회수
    expect(s.hand.some((c) => c.uid === 9720)).toBe(true);
    expect(s.inPlay.some((c) => c.uid === 9720)).toBe(false);
  });
});
