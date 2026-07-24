// 효과 적용 헬퍼 — 데이터 주도 효과를 게임 상태에 반영하는 순수 함수들.
// game.ts / settlement.ts 가 이 헬퍼를 호출한다.

import type { CardDef, Content, Effect, GameState, Tag, CardType } from "./types";
import { CAPS } from "./caps";

/** 카드 플레이 코스트(액션 풀에서 차감). 기본: 재물 0 / 액션 1 / 점수 0. */
export function playCostOf(card: CardDef): number {
  return card.playCost ?? (card.type === "action" ? 1 : 0);
}

/** relic + policy 의 passive 효과를 모두 모은다. */
export function collectPassives(state: GameState, content: Content): Effect[] {
  const out: Effect[] = [];
  for (const id of state.relics) {
    const r = content.relics.get(id);
    if (r?.passive) out.push(...r.passive);
  }
  for (const id of state.policies) {
    const p = content.policies.get(id);
    if (p?.passive) out.push(...p.passive);
  }
  return out;
}

/** passive 중 특정 kind 만 추출 */
export function passivesOfKind<K extends Effect["kind"]>(
  state: GameState,
  content: Content,
  kind: K
): Extract<Effect, { kind: K }>[] {
  return collectPassives(state, content).filter((e) => e.kind === kind) as Extract<
    Effect,
    { kind: K }
  >[];
}

export function hasRemoveScorePenalty(state: GameState, content: Content): boolean {
  return passivesOfKind(state, content, "removeScorePenalty").length > 0;
}

export function extraMarketSlots(state: GameState, content: Content): number {
  return passivesOfKind(state, content, "extraMarketSlot").reduce((a, e) => a + e.amount, 0);
}

/** 지속 트리거 턴당 발동 상한 확장량 (relic/policy passive) */
export function extraTriggerCap(state: GameState, content: Content): number {
  return passivesOfKind(state, content, "extraTriggerCap").reduce((a, e) => a + e.amount, 0);
}

/** 카드 실구매 비용 (costReduction 적용, 최소 0) */
export function effectiveCost(state: GameState, content: Content, card: CardDef): number {
  let reduction = 0;
  for (const e of passivesOfKind(state, content, "costReduction")) {
    if (e.cardType === "all" || e.cardType === (card.type as CardType)) reduction += e.amount;
  }
  return Math.max(0, card.cost - reduction);
}

/** 이번 턴 점수 배수: 카드 태그들에 걸린 turnMult 의 곱 */
export function tagMultiplier(state: GameState, tags: Tag[]): number {
  let m = 1;
  for (const t of tags) {
    const v = state.turnMult[t];
    if (v) m *= v;
  }
  return m;
}

/**
 * 카드를 사용할 때 발생하는 "지속 트리거" 점수를 계산한다.
 * 트리거원 = 이미 inPlay 인 카드들의 trigger + relic trigger + 유물/정책의 triggerBonusTag.
 * - 재물 플레이에는 반응하지 않는다 — 공짜 플레이(액션 불요)가 공짜 트리거가 되는 것을 막고,
 *   트리거 수입을 액션 경제에 묶는다.
 * - 상한은 소스당: 각 소스는 턴에 CAPS.triggerPerSource + extraTriggerCap 회까지 발동.
 */
export function computeTriggerScore(
  state: GameState,
  content: Content,
  playedTags: Tag[],
  playedType: CardType
): { score: number; budget: number; fires: Record<string, number> } {
  const fires: Record<string, number> = {};
  let score = 0;
  let budget = 0;
  if (playedType === "treasure") return { score, budget, fires };
  const perSource = CAPS.triggerPerSource + extraTriggerCap(state, content);

  // 소스당 상한 소모. pts/bud 중 발동한 쪽을 자원에 더한다(같은 소스는 상한을 공유).
  const tally = (key: string, pts: number, bud: number) => {
    const used = (state.triggerFires[key] ?? 0) + (fires[key] ?? 0);
    if (used >= perSource) return;
    fires[key] = (fires[key] ?? 0) + 1;
    score += pts;
    budget += bud;
  };
  const consider = (key: string, effs: Effect[] | undefined) => {
    if (!effs) return;
    for (const e of effs) {
      if (e.kind === "onPlayTag" && playedTags.includes(e.tag)) tally(key, e.score, 0);
      else if (e.kind === "onPlayTagBudget" && playedTags.includes(e.tag)) tally(key, 0, e.budget);
    }
  };

  for (const ci of state.inPlay) consider(`card:${ci.uid}`, content.cards.get(ci.defId)?.trigger);
  for (const id of state.relics) consider(`relic:${id}`, content.relics.get(id)?.trigger);
  for (const id of state.relics) {
    for (const e of content.relics.get(id)?.passive ?? []) {
      if (e.kind === "triggerBonusTag" && playedTags.includes(e.tag)) tally(`relicp:${id}`, e.score, 0);
    }
  }
  for (const id of state.policies) {
    for (const e of content.policies.get(id)?.passive ?? []) {
      if (e.kind === "triggerBonusTag" && playedTags.includes(e.tag)) tally(`policy:${id}`, e.score, 0);
    }
  }
  return { score, budget, fires };
}

/** 구매 시 발동하는 onBuyScore 트리거 합 (inPlay + relic) */
export function computeBuyTriggerScore(state: GameState, content: Content): number {
  let score = 0;
  const consider = (effs: Effect[] | undefined) => {
    if (!effs) return;
    for (const e of effs) if (e.kind === "onBuyScore") score += e.score;
  };
  for (const ci of state.inPlay) consider(content.cards.get(ci.defId)?.trigger);
  for (const id of state.relics) consider(content.relics.get(id)?.trigger);
  return score;
}
