// 상태머신 — 모든 게임 진행 액션. 각 액션은 새 GameState 를 반환(불변 스타일).
import type { CardDef, CardInstance, Content, GameState, Tag } from "./types";
import { ALL_TAGS } from "./types";
import { CAPS, EVAL_TARGETS, REROLL_BASE, REROLL_STEP } from "./caps";
import { shuffle, nextInt } from "./rng";
import {
  collectPassives,
  computeBuyTriggerScore,
  computeTriggerScore,
  effectiveCost,
  extraMarketSlots,
  hasRemoveScorePenalty,
  tagMultiplier,
} from "./effects";
import { computeSettlement, ownedCards, educationCount } from "./settlement";
import { generateCandidates } from "./market";

const clone = <T>(x: T): T => structuredClone(x);

const STARTING_DECK: Array<[string, number]> = [
  ["basic_tax", 7],
  ["old_pledge", 3],
];
// 초반 시장: 순수 예산(재물) + 순수 점수 + 액션 엔진 씨앗(주민센터) 하나.
// 그 외 시너지/지속 카드는 매 턴 시장 진화(후보)로 점차 합류한다.
const STARTING_MARKET = ["tax_collect", "treasury", "municipal_bond", "festival", "banner", "community_center"];

export function newGame(content: Content, seed = 1): GameState {
  let uid = 1;
  const deck: CardInstance[] = [];
  for (const [defId, n] of STARTING_DECK) {
    for (let i = 0; i < n; i++) deck.push({ uid: uid++, defId });
  }
  const state: GameState = {
    seed,
    rngState: seed >>> 0,
    phase: "play",
    evalIndex: 0,
    turn: 1,
    budget: 0,
    cycleScore: 0,
    fund: 0,
    deck,
    hand: [],
    discard: [],
    inPlay: [],
    actions: 1,
    buys: 1,
    market: STARTING_MARKET.map((defId) => ({ defId, stock: CAPS.marketStock })),
    marketSlots: CAPS.marketSlots,
    candidates: [],
    relics: [],
    relicSlots: CAPS.relicSlots,
    policies: [],
    gauges: { pollution: 0, corruption: 0, populismDebuff: 0 },
    eduLevel: 0,
    triggerCount: 0,
    turnMult: {},
    activeTargetBonusPct: 0,
    shopRelics: [],
    shopPolicies: [],
    rerollCost: REROLL_BASE,
    lastSettlement: null,
    uidCounter: uid,
    log: [],
  };
  return startCycle(state, content);
}

/** 평가 주기 시작: 덱 회수·셔플, 점수 리셋, 포퓰리즘 디버프 적용 */
function startCycle(prev: GameState, content: Content): GameState {
  const s = clone(prev);
  const all = ownedCards(s);
  const sh = shuffle(all, s.rngState);
  s.deck = sh.result;
  s.rngState = sh.state;
  s.hand = [];
  s.discard = [];
  s.inPlay = [];
  s.cycleScore = 0;
  s.turn = 1;
  // 교육: 이번 주기 시작 시 보유 교육 카드 수만큼 학습 레벨 누적(복리)
  s.eduLevel += educationCount(s, content);
  // 지난 주기에 누적된 포퓰리즘 부담이 이번 평가의 "목표 증가"로 발효
  s.activeTargetBonusPct = s.gauges.populismDebuff;
  s.gauges.populismDebuff = 0;
  s.marketSlots = CAPS.marketSlots + extraMarketSlots(s, content);
  return startTurn(s, content);
}

function startTurn(prev: GameState, content: Content): GameState {
  const s = clone(prev);
  const passives = collectPassives(s, content);

  // 자원 초기화 + passivePerTurn
  let actions = 1;
  let buys = CAPS.baseBuys;
  let budget = CAPS.baseBudget; // 턴당 기초 세수
  let drawBonus = 0;
  for (const e of passives) {
    if (e.kind === "passivePerTurn") {
      if (e.resource === "action") actions += e.amount;
      else if (e.resource === "buy") buys += e.amount;
      else if (e.resource === "budget") budget += e.amount;
      else if (e.resource === "draw") drawBonus += e.amount;
    } else if (e.kind === "corruption") {
      s.gauges.corruption = Math.max(0, s.gauges.corruption + e.amount);
    } else if (e.kind === "populismDebuff") {
      s.gauges.populismDebuff = Math.max(0, s.gauges.populismDebuff + e.amount);
    }
  }
  s.actions = Math.min(actions, CAPS.actionsPerTurn);
  s.buys = Math.min(buys, CAPS.buysPerTurn);
  s.budget = budget;
  s.triggerCount = 0;

  // 턴 점수 배수: relic passive multiplyTagScore
  s.turnMult = {};
  for (const e of passives) {
    if (e.kind === "multiplyTagScore") s.turnMult[e.tag] = (s.turnMult[e.tag] ?? 1) * e.mult;
  }

  // 드로우
  drawInto(s, content, CAPS.handSize + drawBonus);
  s.phase = "play";
  return s;
}

/** 덱에서 n장 드로우(부족 시 버린 더미 셔플). removeScorePenalty 시 빈 카드는 건너뜀. */
function drawInto(s: GameState, content: Content, n: number): void {
  const removePenalty = hasRemoveScorePenalty(s, content);
  let drawn = 0;
  let guard = 0;
  while (drawn < n && guard < 200) {
    guard++;
    if (s.deck.length === 0) {
      if (s.discard.length === 0) break;
      const sh = shuffle(s.discard, s.rngState);
      s.deck = sh.result;
      s.rngState = sh.state;
      s.discard = [];
    }
    const card = s.deck.shift()!;
    const def = content.cards.get(card.defId);
    if (removePenalty && def?.deadInHand) {
      s.discard.push(card); // 빈 카드는 손에 들지 않고 버림
      continue;
    }
    s.hand.push(card);
    drawn++;
  }
}

export function playCard(prev: GameState, content: Content, uid: number): GameState {
  if (prev.phase !== "play") return prev;
  const s = clone(prev);
  const idx = s.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return prev;
  const card = s.hand[idx];
  const def = content.cards.get(card.defId);
  if (!def) return prev;
  if (def.deadInHand && !hasRemoveScorePenalty(s, content)) return prev; // 빈 카드 사용 불가
  if (def.type === "action") {
    if (s.actions <= 0) return prev;
    s.actions -= 1;
  }

  // 1) 비점수 onPlay 효과 먼저 (배수/자원/게이지)
  let baseScore = 0;
  for (const e of def.onPlay ?? []) {
    switch (e.kind) {
      case "gainBudget":
        s.budget += e.amount;
        break;
      case "gainAction":
        s.actions = Math.min(s.actions + e.amount, CAPS.actionsPerTurn);
        break;
      case "gainBuy":
        s.buys = Math.min(s.buys + e.amount, CAPS.buysPerTurn);
        break;
      case "gainDraw":
        drawInto(s, content, e.amount);
        break;
      case "gainScore":
        baseScore += e.amount;
        break;
      case "multiplyTagScore":
        s.turnMult[e.tag] = (s.turnMult[e.tag] ?? 1) * e.mult;
        break;
      case "pollution":
        s.gauges.pollution = Math.max(0, s.gauges.pollution + e.amount);
        break;
      case "corruption":
        s.gauges.corruption = Math.max(0, s.gauges.corruption + e.amount);
        break;
      case "populismDebuff":
        s.gauges.populismDebuff = Math.max(0, s.gauges.populismDebuff + e.amount);
        break;
      default:
        break;
    }
  }

  // 2) 지속 트리거 점수 (자기 자신 제외 — 아직 inPlay 미추가)
  const capRemaining = Math.max(0, CAPS.triggerPerTurn - s.triggerCount);
  const trig = computeTriggerScore(s, content, def.tags as Tag[], capRemaining);
  s.triggerCount += trig.fired;

  // 3) 배수 적용 후 점수 적립
  const mult = tagMultiplier(s, def.tags as Tag[]);
  const gained = Math.round((baseScore + trig.score) * mult);
  s.cycleScore += gained;

  // 4) inPlay 로 이동
  s.hand.splice(idx, 1);
  s.inPlay.push(card);
  return s;
}

export function playAllTreasures(prev: GameState, content: Content): GameState {
  let s = prev;
  for (const c of [...prev.hand]) {
    const def = content.cards.get(c.defId);
    if (def?.type === "treasure") s = playCard(s, content, c.uid);
  }
  return s;
}

export function buyCard(prev: GameState, content: Content, defId: string): GameState {
  if (prev.phase !== "play") return prev;
  const s = clone(prev);
  const entry = s.market.find((m) => m.defId === defId);
  const def = content.cards.get(defId);
  if (!entry || !def || entry.stock <= 0) return prev;
  if (s.buys <= 0) return prev;
  const cost = effectiveCost(s, content, def);
  if (s.budget < cost) return prev;
  s.budget -= cost;
  s.buys -= 1;
  entry.stock -= 1;
  s.discard.push({ uid: s.uidCounter++, defId });
  // 구매 트리거 (상권 활성화 등)
  s.cycleScore += computeBuyTriggerScore(s, content);
  return s;
}

export function endTurn(prev: GameState, content: Content): GameState {
  if (prev.phase !== "play") return prev;
  const s = clone(prev);
  // 클린업
  s.discard.push(...s.hand, ...s.inPlay);
  s.hand = [];
  s.inPlay = [];
  // 예산은 턴 종료 시 소멸(이월 없음). 다음 턴 시작 시 기초 세수로 재충전된다.
  s.budget = 0;
  s.actions = 0;
  s.buys = 0;
  if (s.turn < CAPS.turnsPerCycle) {
    const gen = generateCandidates(s, content);
    s.candidates = gen.candidates;
    s.rngState = gen.rngState;
    s.phase = "candidate";
    return s;
  }
  // 마지막 턴 → 평가 정산
  s.lastSettlement = computeSettlement(s, content);
  s.phase = "evaluation";
  return s;
}

export function chooseCandidate(
  prev: GameState,
  content: Content,
  addId: string,
  removeId?: string
): GameState {
  if (prev.phase !== "candidate") return prev;
  const s = clone(prev);
  const slots = CAPS.marketSlots + extraMarketSlots(s, content);
  s.marketSlots = slots;
  const already = s.market.some((m) => m.defId === addId);
  if (!already) {
    if (s.market.length >= slots) {
      if (!removeId) return prev; // 포화 시 제거 대상 필수
      s.market = s.market.filter((m) => m.defId !== removeId);
    }
    s.market.push({ defId: addId, stock: CAPS.marketStock });
  }
  s.candidates = [];
  s.turn += 1;
  return startTurn(s, content);
}

export function confirmEvaluation(prev: GameState, content: Content): GameState {
  if (prev.phase !== "evaluation" || !prev.lastSettlement) return prev;
  const s = clone(prev);
  const res = s.lastSettlement!;
  if (!res.passed) {
    s.phase = "gameover";
    return s;
  }
  s.fund += res.fundGained;
  if (s.evalIndex >= EVAL_TARGETS.length - 1) {
    s.phase = "win";
    return s;
  }
  // 상점 오픈
  generateShop(s, content);
  s.phase = "shop";
  return s;
}

function pickRandomN(s: GameState, ids: string[], n: number): string[] {
  const pool = ids.slice();
  const out: string[] = [];
  while (out.length < n && pool.length > 0) {
    const r = nextInt(s.rngState, pool.length);
    s.rngState = r.state;
    out.push(pool.splice(r.value, 1)[0]);
  }
  return out;
}

function generateShop(s: GameState, content: Content): void {
  const ownedRelics = new Set(s.relics);
  const relicPool = content.relicList.filter((r) => !ownedRelics.has(r.id)).map((r) => r.id);
  s.shopRelics = pickRandomN(s, relicPool, 3);
  const ownedPolicies = new Set(s.policies);
  const policyPool = content.policyList.filter((p) => !ownedPolicies.has(p.id)).map((p) => p.id);
  s.shopPolicies = pickRandomN(s, policyPool, 2);
  s.rerollCost = REROLL_BASE;
}

export function buyRelic(prev: GameState, content: Content, id: string): GameState {
  if (prev.phase !== "shop") return prev;
  const s = clone(prev);
  const relic = content.relics.get(id);
  if (!relic || !s.shopRelics.includes(id)) return prev;
  if (s.relics.length >= s.relicSlots) return prev; // 슬롯 가득
  if (s.fund < relic.price) return prev;
  s.fund -= relic.price;
  s.relics.push(id);
  s.shopRelics = s.shopRelics.filter((r) => r !== id);
  return s;
}

export function buyPolicy(prev: GameState, content: Content, id: string): GameState {
  if (prev.phase !== "shop") return prev;
  const s = clone(prev);
  const policy = content.policies.get(id);
  if (!policy || !s.shopPolicies.includes(id)) return prev;
  if (s.fund < policy.price) return prev;
  s.fund -= policy.price;
  s.policies.push(id);
  s.shopPolicies = s.shopPolicies.filter((p) => p !== id);
  return s;
}

export function removeOwnedCard(prev: GameState, _content: Content, uid: number): GameState {
  if (prev.phase !== "shop") return prev;
  const cost = 30;
  if (prev.fund < cost) return prev;
  const s = clone(prev);
  const tryRemove = (arr: CardInstance[]) => {
    const i = arr.findIndex((c) => c.uid === uid);
    if (i >= 0) {
      arr.splice(i, 1);
      return true;
    }
    return false;
  };
  if (tryRemove(s.deck) || tryRemove(s.discard) || tryRemove(s.hand)) {
    s.fund -= cost;
    return s;
  }
  return prev;
}

export function rerollShop(prev: GameState, content: Content): GameState {
  if (prev.phase !== "shop") return prev;
  if (prev.fund < prev.rerollCost) return prev;
  const s = clone(prev);
  s.fund -= s.rerollCost;
  const cost = s.rerollCost;
  generateShop(s, content);
  s.rerollCost = cost + REROLL_STEP;
  return s;
}

export function nextCycle(prev: GameState, content: Content): GameState {
  if (prev.phase !== "shop") return prev;
  const s = clone(prev);
  s.evalIndex += 1;
  return startCycle(s, content);
}

// 편의: 현재 평가 목표
export function currentTarget(state: GameState): number {
  return EVAL_TARGETS[state.evalIndex];
}

// 편의: 보유 카드 태그 카운트 (UI/AI용)
export function ownedTagCounts(state: GameState, content: Content): Record<Tag, number> {
  const counts = {} as Record<Tag, number>;
  for (const t of ALL_TAGS) counts[t] = 0;
  for (const ci of ownedCards(state)) {
    const def = content.cards.get(ci.defId) as CardDef | undefined;
    if (def) for (const t of def.tags) counts[t] += 1;
  }
  return counts;
}
