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
  skipRewardRemoval,
} from "../src/engine/game";
import { computeSettlement } from "../src/engine/settlement";
import { effectiveCost } from "../src/engine/effects";
import { generateCandidates, generateCandidatesForTag, pickTagChoices } from "../src/engine/market";
import type { Content, GameState } from "../src/engine/types";

const content = loadContent();

/** 1차 통과 직후 상태(evaluation, passed)를 만든다. */
function passedEval(seed: number, patch?: Partial<GameState>): GameState {
  const s = newGame(content, seed);
  return {
    ...s,
    phase: "evaluation",
    lastSettlement: { ...computeSettlement(s, content), finalScore: 999, target: 70, passed: true },
    ...patch,
  };
}

/** 보상 단계에서 유물을 골라 정책뽑기 단계까지 도달한 상태. */
function atPolicyStep(seed: number): GameState {
  let s = confirmEvaluation(passedEval(seed), content);
  s = pickRewardRelic(s, content, s.rewardRelicChoices[0]);
  return s;
}

describe("정책 대상 태그는 드래프트 때 내 덱 기준으로 미리 굴려진다", () => {
  it("ownedTag 정책은 내가 가진 태그, unownedTag(분야 정리)는 안 가진 태그로 굴려진다", () => {
    // 시작 덱 = 기본 세수(admin) + 낡은 공약(populism) → owned = {admin, populism}
    const owned = new Set(["admin", "populism"]);
    let sawOwned = false;
    let sawUnowned = false;
    for (let seed = 1; seed <= 40; seed++) {
      const s = atPolicyStep(seed);
      for (let i = 0; i < s.rewardPolicyChoices.length; i++) {
        const p = content.policies.get(s.rewardPolicyChoices[i])!;
        const tag = s.rewardPolicyChoiceTags[i];
        if (p.target === "ownedTag") {
          expect(tag).not.toBeNull();
          expect(owned.has(tag as string)).toBe(true);
          sawOwned = true;
        } else if (p.target === "unownedTag") {
          expect(tag).not.toBeNull();
          expect(owned.has(tag as string)).toBe(false);
          sawUnowned = true;
        } else {
          expect(tag).toBeNull(); // 기본형은 태그 없음
        }
      }
    }
    expect(sawOwned && sawUnowned).toBe(true); // 두 유형 모두 최소 한 번은 관측
  });

  it("정책을 고르면 미리 굴려진 태그가 pendingPolicyTag로 편입되고 곧바로 진행 가능", () => {
    let s = atPolicyStep(7);
    // 태그형 정책이 후보에 있으면 그걸, 없으면 첫 후보를 고른다
    const idx = s.rewardPolicyChoices.findIndex((id) => content.policies.get(id)!.target);
    const pick = idx >= 0 ? idx : 0;
    const expectedTag = s.rewardPolicyChoiceTags[pick];
    s = pickRewardPolicy(s, content, s.rewardPolicyChoices[pick]);
    expect(s.pendingPolicyTag).toBe(expectedTag ?? null);
    expect(skipRewardRemoval(s)).not.toBe(s); // 후속 태그 선택 없이 바로 진행
    s = skipRewardRemoval(s);
    s = nextCycle(s, content);
    expect(s.activePolicyTag).toBe(expectedTag ?? null);
  });
});

describe("분야 집중(activeTagScoreMult) — 그 태그 플레이 점수 ×1.5", () => {
  it("턴 시작 시 activePolicyTag의 turnMult가 1.5로 설정된다", () => {
    let s: GameState = newGame(content, 3);
    s = { ...s, policies: ["p_tag_playmult"], activePolicyTag: "industry", hand: [], actions: 0, buys: 0 };
    s = endTurn(s, content);
    s = chooseCandidateTag(s, content, s.tagChoices[0]);
    s = chooseCandidate(s, content, s.candidates[0]);
    expect(s.phase).toBe("play");
    expect(s.turnMult.industry).toBeCloseTo(1.5, 5);
  });
});

describe("분야 결산(activeTagSettlementMult) — 그 태그 정산 점수 ×1.5", () => {
  it("지정 태그의 정산 기여가 1.5배가 된다", () => {
    const base: GameState = {
      ...newGame(content, 4),
      deck: [{ uid: 1, defId: "industrial_lot" }, { uid: 2, defId: "factory" }, { uid: 3, defId: "factory" }],
      hand: [], discard: [], inPlay: [],
    };
    const without = computeSettlement(base, content);
    const withMult = computeSettlement({ ...base, policies: ["p_tag_settlemult"], activePolicyTag: "industry" }, content);
    expect(withMult.settlementScore).toBeCloseTo(without.settlementScore * 1.5, 0);
  });
});

describe("분야 보조금(activeTagCostReduction) — 그 태그 카드 구매 비용 -1", () => {
  it("지정 태그 카드만 비용이 1 줄고, 다른 태그는 그대로", () => {
    const s: GameState = { ...newGame(content, 5), policies: ["p_tag_discount"], activePolicyTag: "industry" };
    const factory = content.cards.get("factory")!; // industry
    const banner = content.cards.get("banner")!; // pr
    expect(effectiveCost(s, content, factory)).toBe(Math.max(0, factory.cost - 1));
    expect(effectiveCost(s, content, banner)).toBe(banner.cost);
  });
});

describe("분야 정리(activeTagMarketBan) — 지정 태그 후보 배제", () => {
  function withBan(tag: string): GameState {
    return { ...newGame(content, 5), policies: ["p_tag_ban"], activePolicyTag: tag as never };
  }
  it("generateCandidates에 봉쇄 태그가 안 나온다", () => {
    const gen = generateCandidates(withBan("commerce"), content);
    for (const id of gen.candidates) expect(content.cards.get(id)!.tags).not.toContain("commerce");
  });
  it("generateCandidatesForTag(봉쇄 태그)는 빈 후보", () => {
    expect(generateCandidatesForTag(withBan("commerce"), content, "commerce" as never).candidates).toEqual([]);
  });
  it("1·4턴 태그 선택지에도 봉쇄 태그가 안 나온다", () => {
    const s = withBan("commerce");
    for (let seed = 0; seed < 20; seed++) {
      expect(pickTagChoices({ ...s, rngState: seed }, content).tags).not.toContain("commerce");
    }
  });
});

describe("분야 육성(activeTagMarketBoost) — 지정 태그 후보 가중", () => {
  it("가중치가 붙어 그 태그가 더 자주 선택된다", () => {
    const commerceOnly = content.cardList.filter((c) => c.tags.includes("commerce") && c.tier !== "start").slice(0, 1);
    const industryOnly = content.cardList.filter((c) => c.tags.includes("industry") && c.tier !== "start").slice(0, 1);
    const narrow: Content = { ...content, cardList: [...commerceOnly, ...industryOnly] };
    let commerceWins = 0;
    const trials = 40;
    for (let seed = 1; seed <= trials; seed++) {
      const s: GameState = { ...newGame(content, seed), policies: ["p_tag_boost"], activePolicyTag: "commerce", rngState: seed * 7919 };
      const gen = generateCandidates(s, narrow);
      if (gen.candidates[0] && content.cards.get(gen.candidates[0])!.tags.includes("commerce")) commerceWins++;
    }
    expect(commerceWins).toBeGreaterThan(trials * 0.5); // 과반 이상 (weight 4)
  });
});
