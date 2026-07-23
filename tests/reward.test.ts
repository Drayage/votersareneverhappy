import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import {
  confirmEvaluation,
  newGame,
  nextCycle,
  pickRewardPolicy,
  pickRewardRelic,
  removeRewardCard,
  rerollCandidates,
  rerollRewardPolicies,
  rerollRewardRelics,
  skipRewardRemoval,
} from "../src/engine/game";
import { CAPS } from "../src/engine/caps";
import type { GameState } from "../src/engine/types";

const content = loadContent();

/** 방금 1차 평가를 통과한 직후 상태를 만든다 (evaluation phase, lastSettlement 세팅). */
function passedEval(finalScore: number, patch?: Partial<GameState>): GameState {
  const s = newGame(content, 1);
  return {
    ...s,
    phase: "evaluation",
    lastSettlement: {
      evalIndex: 0,
      target: 70,
      baseTarget: 70,
      baseCycleScore: finalScore,
      settlementScore: 0,
      settlementMult: 1,
      pollutionPenalty: 0,
      globalMult: 1,
      targetBonusPct: 0,
      corruptionPct: 0,
      finalScore,
      passed: finalScore >= 70,
      perTag: {},
    },
    ...patch,
  };
}

describe("보상 단계 진입(confirmEvaluation)", () => {
  it("통과 시 유물·정책 후보 3개씩을 생성하고 리롤권을 지급, phase는 reward로", () => {
    let s = passedEval(70);
    s = confirmEvaluation(s, content);
    expect(s.phase).toBe("reward");
    expect(s.rewardRelicChoices).toHaveLength(3);
    expect(s.rewardPolicyChoices).toHaveLength(3);
    expect(s.rewardRemovalDone).toBe(false);
    expect(s.rerollTickets).toBe(2); // 턱걸이 통과 → 2장
  });

  it("실패 시 gameover로 전환되고 보상 단계에 진입하지 않는다", () => {
    let s = passedEval(10);
    s = confirmEvaluation(s, content);
    expect(s.phase).toBe("gameover");
    expect(s.rewardRelicChoices).toHaveLength(0);
    expect(s.rerollTickets).toBe(0);
  });

  it("마지막 평가(4번째, evalIndex 4)를 통과하면 보상 없이 바로 win", () => {
    let s = passedEval(1800, { evalIndex: 4, lastSettlement: { ...passedEval(1800).lastSettlement!, evalIndex: 4, target: 1800, baseTarget: 1800, finalScore: 1800, passed: true } });
    s = confirmEvaluation(s, content);
    expect(s.phase).toBe("win");
    expect(s.rerollTickets).toBe(2); // 점수 보상 자체는 지급됨(승리 후 의미는 없지만 일관성 유지)
  });
});

describe("유물뽑기·정책뽑기 (3개 중 1택, 순서 강제)", () => {
  it("유물을 고르면 소유 목록에 추가되고 후보가 비워진다", () => {
    let s = confirmEvaluation(passedEval(70), content);
    const chosen = s.rewardRelicChoices[0];
    s = pickRewardRelic(s, content, chosen);
    expect(s.relics).toContain(chosen);
    expect(s.rewardRelicChoices).toHaveLength(0);
  });

  it("후보에 없는 id는 거부한다", () => {
    const s = confirmEvaluation(passedEval(70), content);
    expect(pickRewardRelic(s, content, "no_such_relic")).toBe(s);
  });

  it("유물을 고르기 전에는 정책을 고를 수 없다", () => {
    const s = confirmEvaluation(passedEval(70), content);
    expect(pickRewardPolicy(s, content, s.rewardPolicyChoices[0])).toBe(s);
  });

  it("유물 선택 후에는 정책을 고를 수 있다 — 단, 정책은 즉시 발효되지 않고 다음 주기에 편입 대기한다", () => {
    let s = confirmEvaluation(passedEval(70), content);
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    const chosen = s.rewardPolicyChoices[0];
    s = pickRewardPolicy(s, content, chosen);
    expect(s.pendingPolicy).toBe(chosen);
    expect(s.policies).toEqual([]); // 아직 이번 주기엔 미적용
    expect(s.rewardPolicyChoices).toHaveLength(0);
  });
});

describe("카드 정비(선택 사항)", () => {
  function toRemovalStep(): GameState {
    let s = confirmEvaluation(passedEval(70), content);
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    s = pickRewardPolicy(s, content, s.rewardPolicyChoices[0]);
    return s;
  }

  it("유물·정책을 고르기 전에는 카드 제거/건너뛰기가 막힌다", () => {
    const s = confirmEvaluation(passedEval(70), content);
    const target = s.deck[0];
    expect(removeRewardCard(s, content, target.uid)).toBe(s);
    expect(skipRewardRemoval(s)).toBe(s);
  });

  it("원하는 카드를 골라 완전히 제거할 수 있다(버린 더미로도 안 감)", () => {
    let s = toRemovalStep();
    const before = s.deck.length + s.discard.length + s.hand.length + s.inPlay.length;
    const target = s.deck[0];
    s = removeRewardCard(s, content, target.uid);
    expect(s.rewardRemovalDone).toBe(true);
    const after = s.deck.length + s.discard.length + s.hand.length + s.inPlay.length;
    expect(after).toBe(before - 1);
    expect(s.discard.some((c) => c.uid === target.uid)).toBe(false);
  });

  it("건너뛰면 아무것도 제거되지 않고 완료 처리된다", () => {
    let s = toRemovalStep();
    const before = s.deck.length;
    s = skipRewardRemoval(s);
    expect(s.rewardRemovalDone).toBe(true);
    expect(s.deck.length).toBe(before);
  });
});

describe("다음 평가로 진행(nextCycle) — 세 단계 완료 강제", () => {
  it("어느 한 단계라도 남아있으면 진행할 수 없다", () => {
    let s = confirmEvaluation(passedEval(70), content);
    expect(nextCycle(s, content)).toBe(s); // 아무것도 안 함
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    expect(nextCycle(s, content)).toBe(s); // 정책 남음
    s = pickRewardPolicy(s, content, s.rewardPolicyChoices[0]);
    expect(nextCycle(s, content)).toBe(s); // 카드 정비 남음
  });

  it("세 단계를 모두 마치면 다음 주기로 넘어간다(evalIndex 증가, 새 손패) — 대기 중이던 정책이 이번 주기 정책으로 편입된다", () => {
    let s = confirmEvaluation(passedEval(70), content);
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    const chosenPolicy = s.rewardPolicyChoices[0];
    s = pickRewardPolicy(s, content, chosenPolicy);
    s = skipRewardRemoval(s);
    s = nextCycle(s, content);
    expect(s.evalIndex).toBe(1);
    expect(s.phase).toBe("play");
    expect(s.turn).toBe(1);
    expect(s.hand.length).toBeGreaterThan(0);
    expect(s.policies).toEqual([chosenPolicy]);
    expect(s.pendingPolicy).toBeNull();
    expect(s.policyHistory).toContain(chosenPolicy);
  });
});

describe("리롤권 소비 (유물뽑기·정책뽑기·카드보상 후보 다시 뽑기)", () => {
  it("리롤권이 있으면 유물 후보를 다시 뽑고 1장 소모한다", () => {
    let s = confirmEvaluation(passedEval(175), content); // 달성률 250% → 넉넉한 리롤권
    const before = s.rewardRelicChoices.slice();
    const tickets = s.rerollTickets;
    expect(tickets).toBeGreaterThan(0);
    s = rerollRewardRelics(s, content);
    expect(s.rerollTickets).toBe(tickets - 1);
    expect(s.rewardRelicChoices).toHaveLength(3);
    // 재추첨 결과가 이전과 100% 동일할 필요는 없으므로 값 자체보다 소모/개수만 검증
    void before;
  });

  it("리롤권이 0장이면 리롤할 수 없다", () => {
    let s = confirmEvaluation(passedEval(70), content); // 턱걸이 → 2장
    s = rerollRewardRelics(s, content); // 2장 → 1장
    s = rerollRewardRelics(s, content); // 1장 → 0장
    expect(s.rerollTickets).toBe(0);
    const before = s.rewardRelicChoices.slice();
    s = rerollRewardRelics(s, content); // 더 이상 불가
    expect(s.rewardRelicChoices).toEqual(before);
  });

  it("정책 리롤은 유물 선택이 끝난 뒤에만 가능하다", () => {
    let s = confirmEvaluation(passedEval(175), content);
    expect(rerollRewardPolicies(s, content).rewardPolicyChoices).toEqual(s.rewardPolicyChoices); // 아직 유물 단계
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    const tickets = s.rerollTickets;
    s = rerollRewardPolicies(s, content);
    expect(s.rerollTickets).toBe(tickets - 1);
    expect(s.rewardPolicyChoices).toHaveLength(3);
  });

  it("카드보상(시장 진화 후보) 리롤은 candidate 단계에서만 동작한다", () => {
    let s = newGame(content, 1);
    s = { ...s, rerollTickets: 2, phase: "play" };
    expect(rerollCandidates(s, content)).toBe(s); // play phase에서는 불가
    s = { ...s, phase: "candidate", candidates: ["festival", "banner", "tax_collect"] };
    const tickets = s.rerollTickets;
    s = rerollCandidates(s, content);
    expect(s.rerollTickets).toBe(tickets - 1);
    expect(s.candidates).toHaveLength(3);
  });
});

describe("리롤권 상한", () => {
  it("아무리 오버킬해도 CAPS.rerollTicketsMaxPerCycle을 넘지 않는다", () => {
    const s = confirmEvaluation(passedEval(10000), content);
    expect(s.rerollTickets).toBe(CAPS.rerollTicketsMaxPerCycle);
  });
});

describe("정책은 유물과 달리 영구가 아니라 '다음 한 주기만' 적용된다", () => {
  it("1주기차 정책은 2주기가 시작되면 사라지고, 2주기차에 새로 고른 정책으로 교체된다", () => {
    let s = confirmEvaluation(passedEval(70), content);
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    const policyA = s.rewardPolicyChoices[0];
    s = pickRewardPolicy(s, content, policyA);
    s = skipRewardRemoval(s);
    s = nextCycle(s, content); // 2주기 시작 — policyA가 이번 주기 정책으로 편입
    expect(s.policies).toEqual([policyA]);

    // 2주기차 평가를 통과했다고 가정하고 보상 단계로 다시 진입
    s = {
      ...s,
      phase: "evaluation",
      lastSettlement: {
        evalIndex: 1,
        target: 160,
        baseTarget: 160,
        baseCycleScore: 160,
        settlementScore: 0,
        settlementMult: 1,
        pollutionPenalty: 0,
        globalMult: 1,
        targetBonusPct: 0,
        corruptionPct: 0,
        finalScore: 160,
        passed: true,
        perTag: {},
      },
    };
    s = confirmEvaluation(s, content);
    // policyA는 여전히 활성(3주기 시작 전까지) — 아직 만료 전
    expect(s.policies).toEqual([policyA]);
    s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
    const policyB = s.rewardPolicyChoices[0];
    expect(policyB).not.toBe(policyA); // 방금 활성 정책은 재추첨 후보에서 제외됨
    s = pickRewardPolicy(s, content, policyB);
    s = skipRewardRemoval(s);
    s = nextCycle(s, content); // 3주기 시작 — policyA는 사라지고 policyB로 교체

    expect(s.policies).toEqual([policyB]);
    expect(s.policies).not.toContain(policyA);
    expect(s.policyHistory).toEqual([policyA, policyB]); // 이력에는 둘 다 남는다
  });
});
