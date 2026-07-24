// 상태머신 — 모든 게임 진행 액션. 각 액션은 새 GameState 를 반환(불변 스타일).
import type { CardDef, CardInstance, Content, GameState, RelicRarity, Tag } from "./types";
import { ALL_TAGS } from "./types";
import { CAPS, EVAL_TARGETS, targetFor, turnsFor } from "./caps";
import { shuffle, nextInt, weightedPick } from "./rng";
import {
  collectPassives,
  computeBuyTriggerScore,
  computeTriggerScore,
  effectiveCost,
  extraMarketSlots,
  hasRemoveScorePenalty,
  playCostOf,
  tagMultiplier,
} from "./effects";
import { computeSettlement, computeRerollTickets, ownedCards, educationCount, tagCounts } from "./settlement";
import { generateCandidates, generateCandidatesForTag, pickTagChoices } from "./market";

/** 주기당 카드 후보 대신 태그 3개를 먼저 고르게 하는 턴 (docs/05 §1.4) */
const TAG_CHOICE_TURNS = new Set([1, 4]);

/** 시장에서 내보낸 카드가 후보에서 제외되는 턴 수(방금 뺀 카드가 곧바로 다시 나오지 않게) */
const MARKET_REMOVE_COOLDOWN = 2;

/** 시장 쿨다운을 1씩 줄이고 0 이하가 된 항목은 제거해 새 객체로 반환 */
function decayCooldown(cd: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, n] of Object.entries(cd)) if (n - 1 > 0) next[id] = n - 1;
  return next;
}

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
    research: 0,
    rerollTickets: 0,
    deck,
    hand: [],
    discard: [],
    inPlay: [],
    actions: 1,
    buys: 1,
    market: STARTING_MARKET.map((defId) => ({ defId, stock: CAPS.marketStock })),
    marketSlots: CAPS.marketSlots,
    candidates: [],
    tagChoices: [],
    candidateTagFilter: null,
    relics: [],
    policies: [],
    pendingPolicy: null,
    policyHistory: [],
    pendingPolicyTag: null,
    activePolicyTag: null,
    gauges: { pollution: 0, corruption: 0, populismDebuff: 0 },
    eduLevel: 0,
    triggerFires: {},
    turnMult: {},
    playedTagCounts: {},
    cyclePlays: 0,
    cyclePlayedTagCounts: {},
    cycleCardRerollTickets: 0,
    pendingChoice: null,
    activeTargetBonusPct: 0,
    rewardRelicChoices: [],
    rewardPolicyChoices: [],
    rewardPolicyChoiceTags: [],
    rewardRemovalDone: false,
    endless: false,
    marketCooldown: {},
    lastSettlement: null,
    uidCounter: uid,
    log: [],
  };
  return startCycle(state, content);
}

/** 평가 주기 시작: 덱 회수·셔플, 점수 리셋, 포퓰리즘 디버프 적용 */
function startCycle(prev: GameState, content: Content): GameState {
  const s = clone(prev);
  // 정책은 영구가 아니라 "뽑은 다음 한 주기 동안만" 적용된다 — 지난 주기 정책을 교체하고
  // 새로 뽑아둔(pendingPolicy) 정책을 이번 주기 활성 정책으로 편입한다.
  s.policies = s.pendingPolicy ? [s.pendingPolicy] : [];
  if (s.pendingPolicy) s.policyHistory.push(s.pendingPolicy);
  s.pendingPolicy = null;
  s.activePolicyTag = s.pendingPolicyTag;
  s.pendingPolicyTag = null;
  const all = ownedCards(s);
  const sh = shuffle(all, s.rngState);
  s.deck = sh.result;
  s.rngState = sh.state;
  s.hand = [];
  s.discard = [];
  s.inPlay = [];
  s.cycleScore = 0;
  s.turn = 1;
  s.cyclePlays = 0;
  s.cyclePlayedTagCounts = {};
  s.cycleCardRerollTickets = 0;
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
      else if (e.resource === "research") s.research += e.amount;
    } else if (e.kind === "corruption") {
      s.gauges.corruption = Math.max(0, s.gauges.corruption + e.amount);
    } else if (e.kind === "pollution") {
      s.gauges.pollution = Math.max(0, s.gauges.pollution + e.amount);
    } else if (e.kind === "populismDebuff") {
      s.gauges.populismDebuff = Math.max(0, s.gauges.populismDebuff + e.amount);
    }
  }
  s.actions = Math.min(actions, CAPS.actionsPerTurn);
  s.buys = Math.min(buys, CAPS.buysPerTurn);
  s.budget = budget;
  s.triggerFires = {};
  s.playedTagCounts = {};

  // 턴 점수 배수: relic passive multiplyTagScore
  s.turnMult = {};
  for (const e of passives) {
    if (e.kind === "multiplyTagScore") s.turnMult[e.tag] = (s.turnMult[e.tag] ?? 1) * e.mult;
    // 태그선택형 정책(activeTagScoreMult) — 고정 tag 대신 activePolicyTag를 참조
    else if (e.kind === "activeTagScoreMult" && s.activePolicyTag) {
      s.turnMult[s.activePolicyTag] = (s.turnMult[s.activePolicyTag] ?? 1) * e.mult;
    }
  }

  // 드로우
  drawInto(s, content, CAPS.handSize + drawBonus);

  // (지속) 카드의 duration 효과 — 플레이 영역에 남아 있는 동안 매 턴 시작 시 발동
  for (const ci of s.inPlay) {
    for (const e of content.cards.get(ci.defId)?.duration ?? []) {
      if (e.kind === "gainBudget") s.budget += e.amount;
      else if (e.kind === "gainAction") s.actions = Math.min(s.actions + e.amount, CAPS.actionsPerTurn);
      else if (e.kind === "gainBuy") s.buys = Math.min(s.buys + e.amount, CAPS.buysPerTurn);
      else if (e.kind === "gainDraw") drawInto(s, content, e.amount);
      else if (e.kind === "gainScore") s.cycleScore += e.amount;
      else if (e.kind === "gainResearch") s.research += e.amount;
    }
  }

  s.pendingChoice = null;
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

/** 선택형 효과 kind — 대상 지정이 필요해 pendingChoice 로 보류된다 */
const CHOICE_KINDS = [
  "discardThenDraw",
  "trashFromHand",
  "playTwice",
  "discardForScore",
  "discardForBudget",
  "trashForScore",
  "trashForDraw",
  "trashForBudget",
  "discardForCostScore",
  "topDeckGamble",
] as const;

function hasChoiceEffect(def: CardDef): boolean {
  return (def.onPlay ?? []).some((e) => (CHOICE_KINDS as readonly string[]).includes(e.kind));
}

/**
 * 카드 1회 "발동"의 공통 처리 — 효과·트리거·점수·플레이 카운트.
 * 손패→inPlay 이동과 액션 비용 지불은 호출부(playCard/resolveChoice) 책임.
 */
function applyPlayEffects(s: GameState, content: Content, def: CardDef): void {
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
      case "gainResearch":
        s.research += e.amount;
        break;
      case "gainRerollTicket": {
        // 카드로 얻는 리롤권은 주기당 상한(CAPS.cardRerollTicketMaxPerCycle) —
        // 평가 통과 보상(computeRerollTickets)은 이 상한과 별개로 지급된다.
        const remaining = Math.max(0, CAPS.cardRerollTicketMaxPerCycle - s.cycleCardRerollTickets);
        const granted = Math.min(e.amount, remaining);
        s.rerollTickets += granted;
        s.cycleCardRerollTickets += granted;
        break;
      }
      case "budgetPerAction":
        // playCost 차감 후 남아 있는 액션 수 기준 (액션을 소모하지는 않는다)
        s.budget += s.actions * e.amount;
        break;
      case "discardThenDraw":
        s.pendingChoice = { kind: "discardThenDraw", max: e.count };
        break;
      case "trashFromHand":
        s.pendingChoice = { kind: "trashFromHand", max: e.count };
        break;
      case "playTwice":
        s.pendingChoice = { kind: "playTwice", max: 1 };
        break;
      case "discardForScore":
        s.pendingChoice = { kind: "discardForScore", max: e.max };
        break;
      case "discardForBudget":
        s.pendingChoice = { kind: "discardForBudget", max: e.max, tag: e.tag, per: e.per };
        break;
      case "trashForScore":
        s.pendingChoice = { kind: "trashForScore", max: 1 };
        break;
      case "trashForDraw":
        s.pendingChoice = { kind: "trashForDraw", max: 1 };
        break;
      case "trashForBudget":
        s.pendingChoice = { kind: "trashForBudget", max: 1 };
        break;
      case "topDeckGamble":
        s.pendingChoice = { kind: "topDeckGamble", max: 1, tag: e.tag, bonus: e.bonus };
        break;
      case "conditionalScore": {
        // scope="hand"면 손패의 tag 카드 수(이 카드는 아직 손패에 있으므로 포함), 아니면 덱 전체 보유 수
        const n =
          e.scope === "hand"
            ? s.hand.reduce((a, c) => a + (content.cards.get(c.defId)?.tags.includes(e.tag) ? 1 : 0), 0)
            : tagCounts(s, content)[e.tag] ?? 0;
        baseScore += n >= e.count ? e.ifMet : e.ifNot;
        break;
      }
      case "discardForCostScore":
        s.pendingChoice = { kind: "discardForCostScore", max: 1, mult: e.mult };
        break;
      case "digTagForBudget": {
        // 뽑을 더미에서 tag 카드를 최대 max장 찾아 손패로. 가져온 수만큼 +예산.
        let dug = 0;
        for (let i = 0; i < s.deck.length && dug < e.max; ) {
          if (content.cards.get(s.deck[i].defId)?.tags.includes(e.tag)) {
            s.hand.push(s.deck.splice(i, 1)[0]);
            dug++;
          } else i++;
        }
        s.budget += dug;
        break;
      }
      case "gainCurse":
        for (let i = 0; i < e.count; i++) s.discard.push({ uid: s.uidCounter++, defId: "old_pledge" });
        break;
      case "comboScore":
        baseScore += Math.min(e.cap, (s.playedTagCounts[e.tag] ?? 0) * e.points);
        break;
      case "recycleInPlay": {
        // 이번 턴 낸 카드(자신 제외 — 아직 inPlay 미추가) 최근 count장을 덱 위로.
        // 액션을 소모하는 카드에만 붙여 무한 루프를 막는다(액션 상한이 자연 제동).
        const n = Math.min(e.count, s.inPlay.length);
        if (n > 0) {
          const returned = s.inPlay.splice(s.inPlay.length - n, n);
          for (const c of returned) delete c.persistLeft; // 플레이 영역을 떠나면 지속 해제
          s.deck.unshift(...returned);
        }
        break;
      }
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

  // 2) 지속 트리거 점수/예산 (자기 자신 제외 — 아직 inPlay 미추가. 재물 플레이는 미발동)
  const trig = computeTriggerScore(s, content, def.tags as Tag[], def.type);
  for (const [key, n] of Object.entries(trig.fires)) {
    s.triggerFires[key] = (s.triggerFires[key] ?? 0) + n;
  }
  s.budget += trig.budget; // onPlayTagBudget(관광안내소 등) — 예산형 트리거는 배수 미적용

  // 3) 배수 적용 후 점수 적립
  const mult = tagMultiplier(s, def.tags as Tag[]);
  s.cycleScore += Math.round((baseScore + trig.score) * mult);

  // 4) 플레이 카운트
  //  - playedTagCounts: 이번 "턴" 연계(comboScore)용 — 재정 포함(턴 내 손패 순서 판단).
  //  - cyclePlays / cyclePlayedTagCounts: 이번 "주기" 정산(회전·조건형·과학 배수)용 —
  //    onPlayTag 트리거의 "재정 외" 규칙과 통일해 재정(treasure) 카드는 세지 않는다.
  //    (시정 활동 보고서 등 "낸 카드 1장당 +N"이 재정 스팸으로 부풀지 않게)
  for (const tag of def.tags) {
    s.playedTagCounts[tag] = (s.playedTagCounts[tag] ?? 0) + 1;
  }
  if (def.type !== "treasure") {
    s.cyclePlays += 1;
    for (const tag of def.tags) {
      s.cyclePlayedTagCounts[tag] = (s.cyclePlayedTagCounts[tag] ?? 0) + 1;
    }
  }
}

export function playCard(prev: GameState, content: Content, uid: number): GameState {
  if (prev.phase !== "play" || prev.pendingChoice) return prev;
  const s = clone(prev);
  const idx = s.hand.findIndex((c) => c.uid === uid);
  if (idx < 0) return prev;
  const card = s.hand[idx];
  const def = content.cards.get(card.defId);
  if (!def) return prev;
  if (def.deadInHand && !hasRemoveScorePenalty(s, content)) return prev; // 빈 카드 사용 불가
  const pc = playCostOf(def);
  if (s.actions < pc) return prev; // 플레이 코스트만큼 액션 필요
  s.actions -= pc;

  applyPlayEffects(s, content, def);

  // 손패 → inPlay 이동
  s.hand.splice(idx, 1);
  if (def.persistTurns) card.persistLeft = def.persistTurns;
  s.inPlay.push(card);
  return s;
}

/**
 * 보류 중인 선택형 효과를 해소한다. uids = 손패에서 고른 카드들 (빈 배열 = 선택 안 함).
 * - discardThenDraw: 고른 카드를 버리고 그 수만큼 드로우
 * - trashFromHand: 고른 카드를 게임에서 완전히 제거 (압축)
 * - playTwice: 고른 카드 1장을 액션 소모 없이 두 번 발동
 */
export function resolveChoice(prev: GameState, content: Content, uids: number[]): GameState {
  const pending = prev.pendingChoice;
  if (prev.phase !== "play" || !pending) return prev;
  const unique = new Set(uids);
  if (unique.size !== uids.length || uids.length > pending.max) return prev;
  if (!uids.every((u) => prev.hand.some((c) => c.uid === u))) return prev;

  const s = clone(prev);
  s.pendingChoice = null;

  if (pending.kind === "discardThenDraw") {
    for (const u of uids) {
      const i = s.hand.findIndex((c) => c.uid === u);
      s.discard.push(s.hand.splice(i, 1)[0]);
    }
    drawInto(s, content, uids.length);
  } else if (pending.kind === "trashFromHand") {
    for (const u of uids) {
      s.hand.splice(s.hand.findIndex((c) => c.uid === u), 1); // 어디에도 넣지 않음 = 영구 제거
    }
  } else if (pending.kind === "playTwice" && uids.length === 1) {
    const i = s.hand.findIndex((c) => c.uid === uids[0]);
    const card = s.hand[i];
    const def = content.cards.get(card.defId);
    if (!def) return prev;
    if (def.deadInHand && !hasRemoveScorePenalty(s, content)) return prev;
    if (hasChoiceEffect(def)) return prev; // 선택형 효과의 중첩 보류 방지
    applyPlayEffects(s, content, def);
    applyPlayEffects(s, content, def);
    s.hand.splice(s.hand.findIndex((c) => c.uid === uids[0]), 1);
    if (def.persistTurns) card.persistLeft = def.persistTurns;
    s.inPlay.push(card);
  } else if (pending.kind === "discardForScore") {
    for (const u of uids) {
      const i = s.hand.findIndex((c) => c.uid === u);
      s.discard.push(s.hand.splice(i, 1)[0]);
    }
    s.cycleScore += uids.length;
  } else if (pending.kind === "discardForCostScore") {
    // 고른 카드를 버린 더미로(영구 제거 아님) 보내고, 그 카드 비용 × mult 만큼 점수
    let gained = 0;
    for (const u of uids) {
      const i = s.hand.findIndex((c) => c.uid === u);
      const card = s.hand.splice(i, 1)[0];
      gained += (content.cards.get(card.defId)?.cost ?? 0) * pending.mult;
      s.discard.push(card);
    }
    s.cycleScore += gained;
  } else if (pending.kind === "discardForBudget") {
    const per = pending.per ?? 1;
    let gained = 0;
    for (const u of uids) {
      const i = s.hand.findIndex((c) => c.uid === u);
      const card = s.hand.splice(i, 1)[0];
      s.discard.push(card);
      // tag 지정 시 그 태그 카드만 예산 산정(상업 "처분": 버린 상업 카드 1장당 +3), 미지정 시 버린 수 전부
      if (!pending.tag || content.cards.get(card.defId)?.tags.includes(pending.tag)) gained += per;
    }
    s.budget += gained;
  } else if (pending.kind === "trashForScore" && uids.length === 1) {
    const i = s.hand.findIndex((c) => c.uid === uids[0]);
    const def = content.cards.get(s.hand[i].defId);
    if (!def) return prev;
    s.hand.splice(i, 1); // 어디에도 넣지 않음 = 영구 제거
    s.cycleScore += def.cost;
  } else if (pending.kind === "trashForDraw" && uids.length === 1) {
    const i = s.hand.findIndex((c) => c.uid === uids[0]);
    const def = content.cards.get(s.hand[i].defId);
    if (!def) return prev;
    s.hand.splice(i, 1);
    drawInto(s, content, def.cost);
  } else if (pending.kind === "trashForBudget" && uids.length === 1) {
    const i = s.hand.findIndex((c) => c.uid === uids[0]);
    const def = content.cards.get(s.hand[i].defId);
    if (!def) return prev;
    s.hand.splice(i, 1);
    s.budget += def.cost;
  } else if (pending.kind === "topDeckGamble" && uids.length === 1) {
    const i = s.hand.findIndex((c) => c.uid === uids[0]);
    const card = s.hand[i];
    const def = content.cards.get(card.defId);
    if (!def) return prev;
    s.hand.splice(i, 1);
    s.deck.unshift(card);
    if (def.tags.includes(pending.tag)) s.cycleScore += pending.bonus;
  }
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
  if (prev.phase !== "play" || prev.pendingChoice) return prev;
  const s = clone(prev);
  const entry = s.market.find((m) => m.defId === defId);
  const def = content.cards.get(defId);
  if (!entry || !def || entry.stock <= 0) return prev;
  if (s.buys <= 0) return prev;
  if (def.costResearch) {
    // 연구 비용 카드: 예산 대신 연구지수로 산다 (구매 횟수는 동일하게 소모)
    if (s.research < def.costResearch) return prev;
    s.research -= def.costResearch;
  } else {
    const cost = effectiveCost(s, content, def);
    if (s.budget < cost) return prev;
    s.budget -= cost;
  }
  s.buys -= 1;
  entry.stock -= 1;
  if (entry.stock === 0) s.market = s.market.filter((item) => item.defId !== defId);
  s.discard.push({ uid: s.uidCounter++, defId });
  // 구매 트리거 (상권 활성화 등)
  s.cycleScore += computeBuyTriggerScore(s, content);
  return s;
}

export function endTurn(prev: GameState, content: Content): GameState {
  if (prev.phase !== "play" || prev.pendingChoice) return prev;
  const s = clone(prev);
  // 턴 종료 트리거: 지속 카드의 onTurnEndHandScore — 손패를 버리기 전, 못 낸(들고 있던) 카드 수만큼 점수
  //   (복지 네트워크: "손에 많이 들고 있었다 = 못 냈다"를 보상하는 안정형. 재정 포함 — 손패 전부 카운트)
  const handHeld = s.hand.length;
  for (const ci of s.inPlay) {
    for (const e of content.cards.get(ci.defId)?.trigger ?? []) {
      if (e.kind === "onTurnEndHandScore") s.cycleScore += handHeld * e.points;
    }
  }
  // 클린업 — (지속) 카드는 잔여 턴이 남아 있으면 플레이 영역에 유지
  const staying: CardInstance[] = [];
  for (const c of s.inPlay) {
    if ((c.persistLeft ?? 0) > 1) {
      staying.push({ ...c, persistLeft: (c.persistLeft as number) - 1 });
    } else {
      delete c.persistLeft;
      s.discard.push(c);
    }
  }
  s.discard.push(...s.hand);
  s.hand = [];
  s.inPlay = staying;
  // 예산은 턴 종료 시 소멸(이월 없음). 다음 턴 시작 시 기초 세수로 재충전된다.
  s.budget = 0;
  s.actions = 0;
  s.buys = 0;
  if (s.turn < turnsFor(s.evalIndex)) {
    if (TAG_CHOICE_TURNS.has(s.turn)) {
      const tc = pickTagChoices(s, content);
      s.tagChoices = tc.tags;
      s.candidateTagFilter = null;
      s.candidates = [];
      s.rngState = tc.rngState;
    } else {
      const gen = generateCandidates(s, content);
      s.candidates = gen.candidates;
      s.tagChoices = [];
      s.candidateTagFilter = null;
      s.rngState = gen.rngState;
    }
    // 이번 후보 세트를 뽑은 뒤 쿨다운 감소 — 방금 뺀 카드는 이번·다음 후보에서 제외되고 그 다음에 복귀
    s.marketCooldown = decayCooldown(s.marketCooldown);
    s.phase = "candidate";
    return s;
  }
  // 마지막 턴 → 평가 정산
  s.lastSettlement = computeSettlement(s, content);
  s.phase = "evaluation";
  return s;
}

/** 태그 선택 턴(1·4번째): 후보 카드 대신 제시된 태그 3개 중 하나를 골라 그 태그로 후보를 채운다. */
export function chooseCandidateTag(prev: GameState, content: Content, tag: Tag): GameState {
  if (prev.phase !== "candidate" || !prev.tagChoices.includes(tag)) return prev;
  const s = clone(prev);
  s.tagChoices = [];
  s.candidateTagFilter = tag;
  const gen = generateCandidatesForTag(s, content, tag);
  s.candidates = gen.candidates;
  s.rngState = gen.rngState;
  return s;
}

export function chooseCandidate(
  prev: GameState,
  content: Content,
  addId: string,
  removeId?: string
): GameState {
  if (prev.phase !== "candidate" || prev.tagChoices.length > 0) return prev;
  if (!prev.candidates.includes(addId) || !content.cards.has(addId)) return prev;
  const s = clone(prev);
  const slots = CAPS.marketSlots + extraMarketSlots(s, content);
  s.marketSlots = slots;
  const already = s.market.some((m) => m.defId === addId);
  if (!already) {
    if (s.market.length >= slots) {
      if (!removeId) return prev; // 포화 시 제거 대상 필수
      if (!s.market.some((m) => m.defId === removeId)) return prev;
      s.market = s.market.filter((m) => m.defId !== removeId);
      s.marketCooldown = { ...s.marketCooldown, [removeId]: MARKET_REMOVE_COOLDOWN }; // 방금 뺀 카드 재등장 쿨다운
    }
    // 추가한 카드가 쿨다운 중이었다면 해제(다시 시장에 있으니 의미 없음)
    if (s.marketCooldown[addId]) {
      s.marketCooldown = { ...s.marketCooldown };
      delete s.marketCooldown[addId];
    }
    s.market.push({ defId: addId, stock: CAPS.marketStock + s.evalIndex });
  }
  s.candidates = [];
  s.candidateTagFilter = null;
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
  // 점수 보상: 달성률이 높을수록 리롤권을 더 받는다 (턱걸이 1장, 초과 25%마다 +1, 상한 있음)
  s.rerollTickets += computeRerollTickets(res);
  // 정규 5차를 처음 통과하면 승리 화면. 무한 모드(endless)에선 통과해도 곧바로 다음 주기로 이어간다.
  if (s.evalIndex >= EVAL_TARGETS.length - 1 && !s.endless) {
    s.phase = "win";
    return s;
  }
  // 보상 단계 진입: 유물뽑기 → 정책뽑기 → 카드 정비(선택) → 다음 주기. 펀드/구매 없음.
  generateRelicDraft(s, content);
  generatePolicyDraft(s, content);
  s.rewardRemovalDone = false;
  s.phase = "reward";
  return s;
}

/** 무한 모드 시작: 승리 화면에서 "계속 도전"을 누르면 endless를 켜고 곧바로 보상 단계로 진입한다.
 *  이후로는 평가를 통과해도 다시 승리 화면이 뜨지 않고 주기가 무한히 이어진다(목표는 매 레벨 폭증). */
export function startEndless(prev: GameState, content: Content): GameState {
  if (prev.phase !== "win") return prev;
  const s = clone(prev);
  s.endless = true;
  generateRelicDraft(s, content);
  generatePolicyDraft(s, content);
  s.rewardRemovalDone = false;
  s.phase = "reward";
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

/** 유물 희귀도별 등장 가중치 — 차수가 오를수록 상급 유물이 서서히 열린다.
 *  브론즈는 항상 흔하고, 실버는 완만하게 늘고, 골드·다이아는 초반엔 거의 안 보이다가
 *  후반 보상에서야 존재감이 생긴다(균등 추첨이던 이전엔 1차부터 다이아가 20%대로 나와 너무 강했다). */
function relicRarityWeight(rarity: RelicRarity, evalIndex: number): number {
  switch (rarity) {
    case "bronze":
      return 1.0;
    case "silver":
      return 0.5 + 0.25 * evalIndex;
    case "gold":
      return 0.12 + 0.18 * evalIndex;
    case "diamond":
      return 0.04 + 0.14 * evalIndex;
  }
}

/** 가중치 기반 비복원 추출 (아이템별 가중치 배열, n개 고를 때까지 매번 재추첨). */
function pickWeightedN(s: GameState, items: { id: string; w: number }[], n: number): string[] {
  const pool = items.slice();
  const out: string[] = [];
  while (out.length < n && pool.length > 0) {
    const weights = pool.map((x) => Math.max(0.0001, x.w));
    const r = weightedPick(s.rngState, weights);
    s.rngState = r.state;
    out.push(pool.splice(r.index, 1)[0].id);
  }
  return out;
}

function generateRelicDraft(s: GameState, content: Content): void {
  const ownedRelics = new Set(s.relics);
  const relicPool = content.relicList
    .filter((r) => !ownedRelics.has(r.id))
    .map((r) => ({ id: r.id, w: relicRarityWeight(r.rarity, s.evalIndex) }));
  s.rewardRelicChoices = pickWeightedN(s, relicPool, 3);
}

/** 태그형 정책의 대상 태그를 내 덱 구성 기준으로 굴린다. rng 소비. 없으면 null. */
function rollPolicyTag(s: GameState, content: Content, target: "ownedTag" | "unownedTag" | undefined): Tag | null {
  if (!target) return null;
  const counts = tagCounts(s, content);
  const owned = (ALL_TAGS as Tag[]).filter((t) => (counts[t] ?? 0) > 0);
  const unowned = (ALL_TAGS as Tag[]).filter((t) => (counts[t] ?? 0) === 0);
  const pool = target === "ownedTag" ? owned : unowned;
  // 안 가진 태그가 없거나(전 태그 보유) 가진 태그가 없으면 전체에서 폴백
  const from = pool.length > 0 ? pool : (ALL_TAGS as Tag[]);
  const r = nextInt(s.rngState, from.length);
  s.rngState = r.state;
  return from[r.value];
}

function generatePolicyDraft(s: GameState, content: Content): void {
  const ownedPolicies = new Set(s.policies);
  const policyPool = content.policyList.filter((p) => !ownedPolicies.has(p.id)).map((p) => p.id);
  s.rewardPolicyChoices = pickRandomN(s, policyPool, 3);
  s.rewardPolicyChoiceTags = s.rewardPolicyChoices.map((id) => rollPolicyTag(s, content, content.policies.get(id)?.target));
}

/** 유물뽑기: 3개 중 1택, 1회. 거부 불가(강제 선택) — 단, 후보가 없으면(모두 보유) 자동으로 넘어간다. */
export function pickRewardRelic(prev: GameState, _content: Content, id: string): GameState {
  if (prev.phase !== "reward" || !prev.rewardRelicChoices.includes(id)) return prev;
  const s = clone(prev);
  s.relics.push(id);
  s.rewardRelicChoices = [];
  return s;
}

/** 정책뽑기: 3개 중 1택, 1회. 유물뽑기가 끝난 뒤에만 가능.
 *  유물과 달리 즉시 발효되지 않는다 — 다음 주기 시작(startCycle) 때 policies로 편입되어
 *  "그 한 주기 동안만" 적용되고, 그다음 주기에는 사라진다. */
export function pickRewardPolicy(prev: GameState, _content: Content, id: string): GameState {
  if (prev.phase !== "reward" || prev.rewardRelicChoices.length > 0) return prev;
  const idx = prev.rewardPolicyChoices.indexOf(id);
  if (idx < 0) return prev;
  const s = clone(prev);
  s.pendingPolicy = id;
  // 드래프트 때 미리 굴려둔 대상 태그를 그대로 편입 대기(태그형이 아니면 null)
  s.pendingPolicyTag = prev.rewardPolicyChoiceTags[idx] ?? null;
  s.rewardPolicyChoices = [];
  s.rewardPolicyChoiceTags = [];
  return s;
}

/** 카드 정비: 원하는 카드 1장을 골라 덱에서 완전히 제거(선택 사항). 앞 두 단계가 끝난 뒤에만 가능. */
export function removeRewardCard(prev: GameState, _content: Content, uid: number): GameState {
  if (prev.phase !== "reward") return prev;
  if (
    prev.rewardRelicChoices.length > 0 ||
    prev.rewardPolicyChoices.length > 0 ||
    prev.rewardRemovalDone
  ) {
    return prev;
  }
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
    s.rewardRemovalDone = true;
    return s;
  }
  return prev;
}

/** 카드 정비 단계를 건너뛴다(제거하지 않고 다음으로). */
export function skipRewardRemoval(prev: GameState): GameState {
  if (prev.phase !== "reward") return prev;
  if (
    prev.rewardRelicChoices.length > 0 ||
    prev.rewardPolicyChoices.length > 0 ||
    prev.rewardRemovalDone
  ) {
    return prev;
  }
  const s = clone(prev);
  s.rewardRemovalDone = true;
  return s;
}

/** 유물뽑기 후보를 리롤권 1장으로 다시 뽑는다. */
export function rerollRewardRelics(prev: GameState, content: Content): GameState {
  if (prev.phase !== "reward" || prev.rewardRelicChoices.length === 0 || prev.rerollTickets <= 0) return prev;
  const s = clone(prev);
  s.rerollTickets -= 1;
  generateRelicDraft(s, content);
  return s;
}

/** 정책뽑기 후보를 리롤권 1장으로 다시 뽑는다. */
export function rerollRewardPolicies(prev: GameState, content: Content): GameState {
  if (prev.phase !== "reward" || prev.rewardRelicChoices.length > 0 || prev.rewardPolicyChoices.length === 0 || prev.rerollTickets <= 0) {
    return prev;
  }
  const s = clone(prev);
  s.rerollTickets -= 1;
  generatePolicyDraft(s, content);
  return s;
}

/** 시장 진화 후보(카드보상)를 리롤권 1장으로 다시 뽑는다. 태그 선택 단계라면 태그 3개를 다시 뽑는다. */
export function rerollCandidates(prev: GameState, content: Content): GameState {
  if (prev.phase !== "candidate" || prev.rerollTickets <= 0) return prev;
  const s = clone(prev);
  s.rerollTickets -= 1;
  if (s.tagChoices.length > 0) {
    const tc = pickTagChoices(s, content);
    s.tagChoices = tc.tags;
    s.rngState = tc.rngState;
    return s;
  }
  const gen = s.candidateTagFilter
    ? generateCandidatesForTag(s, content, s.candidateTagFilter)
    : generateCandidates(s, content);
  s.candidates = gen.candidates;
  s.rngState = gen.rngState;
  return s;
}

export function nextCycle(prev: GameState, content: Content): GameState {
  if (prev.phase !== "reward") return prev;
  // 유물뽑기·정책뽑기(+태그선택)·카드 정비가 모두 끝나야 다음 평가로 넘어간다.
  if (
    prev.rewardRelicChoices.length > 0 ||
    prev.rewardPolicyChoices.length > 0 ||
    !prev.rewardRemovalDone
  ) {
    return prev;
  }
  const s = clone(prev);
  s.evalIndex += 1;
  return startCycle(s, content);
}

// 편의: 현재 평가 목표
export function currentTarget(state: GameState): number {
  return targetFor(state.evalIndex);
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
