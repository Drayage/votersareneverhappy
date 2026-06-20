// 효과 적용 헬퍼 — 데이터 주도 효과를 게임 상태에 반영하는 순수 함수들.
// game.ts / settlement.ts 가 이 헬퍼를 호출한다.

import type { CardDef, Content, Effect, GameState, Tag, CardType } from "./types";

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
 * 트리거원 = 이미 inPlay 인 카드들의 trigger + relic trigger.
 * CAPS.triggerPerTurn 으로 턴당 발동 횟수를 제한한다.
 */
export function computeTriggerScore(
  state: GameState,
  content: Content,
  playedTags: Tag[],
  triggerCapRemaining: number
): { score: number; fired: number } {
  let score = 0;
  let fired = 0;
  const consider = (effs: Effect[] | undefined) => {
    if (!effs) return;
    for (const e of effs) {
      if (e.kind === "onPlayTag" && playedTags.includes(e.tag)) {
        if (fired >= triggerCapRemaining) return;
        score += e.score;
        fired += 1;
      }
    }
  };
  for (const ci of state.inPlay) {
    consider(content.cards.get(ci.defId)?.trigger);
  }
  for (const id of state.relics) {
    consider(content.relics.get(id)?.trigger);
  }
  return { score, fired };
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
