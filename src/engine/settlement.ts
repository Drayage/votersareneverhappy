// 정산 & 평가 계산 (docs/05_밸런스.md §1, §6 반영)
import type { CardInstance, Content, GameState, SettlementResult, Tag } from "./types";
import { ALL_TAGS } from "./types";
import { CAPS, EVAL_TARGETS } from "./caps";
import { collectPassives } from "./effects";

/** 덱 전체 보유 카드 (정산 카운트 기준) */
export function ownedCards(state: GameState): CardInstance[] {
  return [...state.deck, ...state.hand, ...state.discard, ...state.inPlay];
}

export function tagCounts(state: GameState, content: Content): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of ALL_TAGS) counts[t] = 0;
  for (const ci of ownedCards(state)) {
    const def = content.cards.get(ci.defId);
    if (!def) continue;
    for (const t of def.tags) counts[t] += 1;
  }
  return counts;
}

/** 평가 정산을 계산한다 (상태를 바꾸지 않음 — 결과만 반환). */
export function computeSettlement(state: GameState, content: Content): SettlementResult {
  const owned = ownedCards(state);
  const counts = tagCounts(state, content);
  const totalOwned = owned.length;

  const bucket: Record<string, number> = {};
  for (const t of ALL_TAGS) bucket[t] = 0;
  let general = 0;
  const tagMult: Record<string, number> = {};
  let settleMultFactor = 1; // 과학: 정산 전체 배수
  let pctOfTargetSum = 0; // 복지: 통과 목표 비례 안정 점수(과학 배수 미적용)

  // 통과 목표(포퓰리즘 증가 포함)는 settlementPctOfTarget 계산에 필요 → 먼저 구한다.
  const targetBonusPctEarly = Math.min(CAPS.targetBonusMaxPct, Math.max(0, state.activeTargetBonusPct));
  const baseTarget = EVAL_TARGETS[state.evalIndex];
  const target = Math.round(baseTarget * (1 + targetBonusPctEarly / 100));

  // settlement 효과원 = 보유 카드 각 인스턴스 + relic settlement
  const sources = [
    ...owned.map((ci) => content.cards.get(ci.defId)?.settlement),
    ...state.relics.map((id) => content.relics.get(id)?.settlement),
  ];

  for (const effs of sources) {
    if (!effs) continue;
    for (const e of effs) {
      switch (e.kind) {
        case "settlementPerTag":
          bucket[e.tag] += counts[e.tag] * e.points;
          break;
        case "settlementTagCountMult":
          bucket[e.tag] += counts[e.tag] * e.mult;
          break;
        case "settlementPerDeck":
          general += totalOwned * e.points;
          break;
        case "settlementFormula": {
          const sum = e.tags.reduce((a, t) => a + counts[t], 0);
          general += Math.min(e.cap, Math.floor((sum * sum) / e.divide));
          break;
        }
        case "gainScore":
          general += e.amount;
          break;
        case "settlementMultTag":
          tagMult[e.tag] = (tagMult[e.tag] ?? 1) * e.mult;
          break;
        case "settlementGlobalMultPerTag":
          // 과학: 보유 태그 카드 수에 비례한 곱연산 (캡은 합산 후 적용)
          settleMultFactor *= 1 + e.perCard * counts[e.tag];
          break;
        case "settlementEduLevel":
          // 교육: 누적 학습 레벨 × points
          general += Math.max(0, state.eduLevel) * e.points;
          break;
        case "penaltyToScore":
          // 복지: 벌점을 점수로 전환
          general +=
            Math.max(0, state.gauges.pollution) * e.perPollution +
            Math.max(0, state.gauges.corruption) * e.perCorruption;
          break;
        case "settlementPctOfTarget":
          // 복지: 통과 목표의 일정 비율을 안정 점수로 (과학 배수 미적용)
          pctOfTargetSum += e.pct;
          break;
        default:
          break;
      }
    }
  }

  // 태그별 배수 적용 → 정산 가산 기반
  const perTag: Record<string, number> = {};
  let settlementBase = general;
  for (const t of ALL_TAGS) {
    const v = bucket[t] * (tagMult[t] ?? 1);
    if (v !== 0) perTag[t] = Math.round(v);
    settlementBase += v;
  }
  // 과학 정산 배수 (하드 캡 적용)
  const settlementMult = Math.min(CAPS.settlementMultCap, Math.max(1, settleMultFactor));
  // 복지 안정 세입(목표 비례)은 과학 배수와 별개로 더한다. 총합은 상한으로 캡(자동 통과 방지).
  const stableIncome = Math.round(target * Math.min(pctOfTargetSum, CAPS.stableIncomeMaxPct));
  const settlementScore = Math.round(settlementBase * settlementMult) + stableIncome;

  const pollutionPenalty = -2 * Math.max(0, state.gauges.pollution);

  const baseCycleScore = state.cycleScore;
  const subtotal = baseCycleScore + settlementScore + pollutionPenalty;

  // globalScoreMult: 상위 2개만 발효 (CAPS.maxScoreMultipliers)
  const mults = collectPassives(state, content)
    .filter((e) => e.kind === "globalScoreMult")
    .map((e) => (e as { mult: number }).mult)
    .sort((a, b) => b - a)
    .slice(0, CAPS.maxScoreMultipliers);
  const globalMult = mults.reduce((a, b) => a * b, 1);

  const targetBonusPct = targetBonusPctEarly;
  const corruptionPct = Math.min(
    CAPS.corruptionPenaltyMaxPct,
    Math.floor(Math.max(0, state.gauges.corruption) / 5) * 10
  );

  // 부패만 점수를 직접 깎는다(곱연산). 포퓰리즘은 점수가 아니라 목표를 올린다(target에 이미 반영).
  let finalScore = subtotal * globalMult;
  finalScore *= 1 - corruptionPct / 100;
  finalScore = Math.max(0, Math.round(finalScore));

  const passed = finalScore >= target;

  return {
    evalIndex: state.evalIndex,
    target,
    baseTarget,
    baseCycleScore,
    settlementScore,
    settlementMult,
    pollutionPenalty,
    globalMult,
    targetBonusPct,
    corruptionPct,
    finalScore,
    passed,
    fundGained: passed ? finalScore : 0,
    perTag,
  };
}

/** 보유 교육 카드 수 (eduLevel 누적용) */
export function educationCount(state: GameState, content: Content): number {
  return tagCounts(state, content).education;
}

export function tagLabelCounts(state: GameState, content: Content): Array<[Tag, number]> {
  const counts = tagCounts(state, content);
  return (ALL_TAGS as Tag[])
    .map((t) => [t, counts[t]] as [Tag, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
}
