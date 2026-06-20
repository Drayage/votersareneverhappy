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
        default:
          break;
      }
    }
  }

  // 태그별 배수 적용
  const perTag: Record<string, number> = {};
  let settlementScore = general;
  for (const t of ALL_TAGS) {
    const v = bucket[t] * (tagMult[t] ?? 1);
    if (v !== 0) perTag[t] = Math.round(v);
    settlementScore += v;
  }
  settlementScore = Math.round(settlementScore);

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

  const penaltyPct = Math.max(0, state.activePenaltyPct);
  const corruptionPct = Math.floor(Math.max(0, state.gauges.corruption) / 5) * 10;

  let finalScore = subtotal * globalMult;
  finalScore *= 1 - penaltyPct / 100;
  finalScore *= 1 - corruptionPct / 100;
  finalScore = Math.max(0, Math.round(finalScore));

  const target = EVAL_TARGETS[state.evalIndex];
  const passed = finalScore >= target;

  return {
    evalIndex: state.evalIndex,
    target,
    baseCycleScore,
    settlementScore,
    pollutionPenalty,
    globalMult,
    penaltyPct,
    corruptionPct,
    finalScore,
    passed,
    fundGained: passed ? finalScore : 0,
    perTag,
  };
}

export function tagLabelCounts(state: GameState, content: Content): Array<[Tag, number]> {
  const counts = tagCounts(state, content);
  return (ALL_TAGS as Tag[])
    .map((t) => [t, counts[t]] as [Tag, number])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
}
