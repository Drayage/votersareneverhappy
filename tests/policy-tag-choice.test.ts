import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import {
  chooseCandidate,
  chooseCandidateTag,
  endTurn,
  newGame,
  nextCycle,
  pickRewardPolicy,
  pickRewardPolicyTag,
  removeRewardCard,
  skipRewardRemoval,
} from "../src/engine/game";
import { computeSettlement } from "../src/engine/settlement";
import { generateCandidates, generateCandidatesForTag, pickTagChoices } from "../src/engine/market";
import type { Content, GameState } from "../src/engine/types";

const content = loadContent();

/** 방금 평가를 통과한 직후 상태 + 유물뽑기까지 마쳐서 정책뽑기 후보만 남긴 상태를 만든다. */
function atPolicyStep(policyId: string, evalIndex = 0): GameState {
  const s = newGame(content, 1);
  return {
    ...s,
    phase: "reward",
    rewardRelicChoices: [],
    rewardPolicyChoices: [policyId],
    rewardRemovalDone: false,
    evalIndex,
  };
}

describe("태그선택형 정책(needsTagChoice) — 픽 직후 태그를 골라야 진행된다", () => {
  it("태그선택형 정책을 고르면 rewardPolicyTagChoicePending이 켜지고, 그동안 카드 정비/다음 주기가 막힌다", () => {
    let s = atPolicyStep("p_tag_focus");
    s = pickRewardPolicy(s, content, "p_tag_focus");
    expect(s.pendingPolicy).toBe("p_tag_focus");
    expect(s.rewardPolicyTagChoicePending).toBe(true);

    expect(skipRewardRemoval(s)).toBe(s);
    expect(removeRewardCard(s, content, s.deck[0].uid)).toBe(s);
    expect(nextCycle(s, content)).toBe(s);
  });

  it("일반 정책(needsTagChoice 없음)을 고르면 곧바로 카드 정비 단계로 진행할 수 있다", () => {
    let s = atPolicyStep("p_extra_budget");
    s = pickRewardPolicy(s, content, "p_extra_budget");
    expect(s.rewardPolicyTagChoicePending).toBe(false);
    expect(skipRewardRemoval(s)).not.toBe(s);
  });

  it("태그를 고르면 pendingPolicyTag가 설정되고 이후 단계가 풀린다", () => {
    let s = atPolicyStep("p_tag_market_ban");
    s = pickRewardPolicy(s, content, "p_tag_market_ban");
    expect(pickRewardPolicyTag(s, content, "not-a-real-tag" as never)).not.toBe(s); // 타입상 막히진 않지만 값 자체는 그대로 반영(엔진은 콘텐츠 검증까지는 안 함)
    s = pickRewardPolicyTag(s, content, "industry");
    expect(s.pendingPolicyTag).toBe("industry");
    expect(s.rewardPolicyTagChoicePending).toBe(false);
    s = skipRewardRemoval(s);
    s = nextCycle(s, content);
    expect(s.evalIndex).toBe(1);
    expect(s.policies).toEqual(["p_tag_market_ban"]);
    expect(s.activePolicyTag).toBe("industry");
  });

  it("태그 선택 전에는 pickRewardPolicyTag가 아무 효과가 없다", () => {
    const s = newGame(content, 2);
    expect(pickRewardPolicyTag(s, content, "commerce")).toBe(s);
  });
});

describe("선택 태그 집중 육성(activeTagScoreMult) — 그 태그 점수만 배수 적용", () => {
  it("턴 시작 시 activePolicyTag의 turnMult가 정책 배수로 설정된다", () => {
    let s: GameState = newGame(content, 3);
    s = { ...s, policies: ["p_tag_focus"], activePolicyTag: "industry", hand: [], actions: 0, buys: 0 };
    s = endTurn(s, content); // 1턴째 종료 → 태그 선택 단계
    s = chooseCandidateTag(s, content, s.tagChoices[0]);
    s = chooseCandidate(s, content, s.candidates[0]); // 다음 턴 시작(startTurn 재계산)
    expect(s.phase).toBe("play");
    expect(s.turnMult.industry).toBeCloseTo(1.5, 5);
  });
});

describe("정산 총력전(settlementScoreMult) — 이번 주기 정산 점수 전체 배수", () => {
  it("정산 점수 전체에 곱연산으로 적용된다", () => {
    let s: GameState = newGame(content, 4);
    s = {
      ...s,
      policies: ["p_settlement_allin"],
      deck: [{ uid: 9990, defId: "museum" }, { uid: 9991, defId: "festival" }],
      hand: [],
      discard: [],
      inPlay: [],
    };
    const withMult = computeSettlement(s, content);
    const without = computeSettlement({ ...s, policies: [] }, content);
    expect(withMult.settlementScore).toBeCloseTo(without.settlementScore * 1.5, 0);
  });
});

describe("선택 태그 시장 봉쇄(activeTagMarketBan)", () => {
  function withBan(tag: string): GameState {
    const s = newGame(content, 5);
    return { ...s, policies: ["p_tag_market_ban"], activePolicyTag: tag as never };
  }

  it("시장 진화 후보(generateCandidates)에 봉쇄된 태그의 카드가 전혀 나오지 않는다", () => {
    const s = withBan("commerce");
    const gen = generateCandidates(s, content);
    for (const id of gen.candidates) {
      expect(content.cards.get(id)!.tags).not.toContain("commerce");
    }
  });

  it("봉쇄된 태그로 generateCandidatesForTag를 호출하면 후보가 비어 있다", () => {
    const s = withBan("commerce");
    const gen = generateCandidatesForTag(s, content, "commerce" as never);
    expect(gen.candidates).toEqual([]);
  });

  it("주기 1·4턴째 태그 선택지에도 봉쇄된 태그가 나오지 않는다", () => {
    const s = withBan("commerce");
    for (let seed = 0; seed < 20; seed++) {
      const gen = pickTagChoices({ ...s, rngState: seed }, content);
      expect(gen.tags).not.toContain("commerce");
    }
  });
});

describe("선택 태그 시장 점령(activeTagMarketBoost)", () => {
  it("가중치가 폭증해 다른 조건이 같을 때 그 태그가 압도적으로 자주 선택된다", () => {
    // 상업/산업 태그 카드만 남긴 축소 콘텐츠로 순수 가중치 효과만 검증
    const commerceOnly = content.cardList.filter((c) => c.tags.includes("commerce") && c.tier !== "start").slice(0, 1);
    const industryOnly = content.cardList.filter((c) => c.tags.includes("industry") && c.tier !== "start").slice(0, 1);
    const narrowContent: Content = { ...content, cardList: [...commerceOnly, ...industryOnly] };

    let commerceWins = 0;
    const trials = 30;
    for (let seed = 1; seed <= trials; seed++) {
      const s: GameState = { ...newGame(content, seed), policies: ["p_tag_market_surge"], activePolicyTag: "commerce", rngState: seed * 7919 };
      const gen = generateCandidates(s, narrowContent);
      if (gen.candidates[0] && content.cards.get(gen.candidates[0])!.tags.includes("commerce")) commerceWins++;
    }
    expect(commerceWins).toBeGreaterThanOrEqual(Math.round(trials * 0.7));
  });
});
