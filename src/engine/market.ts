// 시장(Supply) 시스템 — 후보 5장 가중 생성 + 강제 추가/교체 (docs/01 §3)
import type { CardDef, Content, GameState, Tag } from "./types";
import { ALL_TAGS } from "./types";
import { shuffle, weightedPick } from "./rng";

/** 플레이어 빌드의 태그 빈도 (덱 + 현재 시장 기준) */
function buildTagFrequency(state: GameState, content: Content): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const t of ALL_TAGS) freq[t] = 0;
  const defs: (CardDef | undefined)[] = [
    ...[...state.deck, ...state.hand, ...state.discard, ...state.inPlay].map((c) =>
      content.cards.get(c.defId)
    ),
    ...state.market.map((m) => content.cards.get(m.defId)),
  ];
  for (const d of defs) if (d) for (const t of d.tags) freq[t] += 1;
  return freq;
}

function rankedTags(state: GameState, content: Content): Tag[] {
  const freq = buildTagFrequency(state, content);
  return (ALL_TAGS as Tag[]).slice().sort((a, b) => freq[b] - freq[a]);
}

/** 태그선택형 정책(needsTagChoice) 중 시장 봉쇄 효과가 활성 상태면 그 태그를 반환한다. */
function activePolicyBan(state: GameState, content: Content): Tag | null {
  if (!state.activePolicyTag) return null;
  for (const id of state.policies) {
    if (content.policies.get(id)?.passive?.some((e) => e.kind === "activeTagMarketBan")) {
      return state.activePolicyTag;
    }
  }
  return null;
}

/** 태그선택형 정책 중 시장 집중(가중치 폭증) 효과가 활성 상태면 그 태그·배율을 반환한다. */
function activePolicyBoost(state: GameState, content: Content): { tag: Tag; weight: number } | null {
  if (!state.activePolicyTag) return null;
  for (const id of state.policies) {
    const eff = content.policies.get(id)?.passive?.find((e) => e.kind === "activeTagMarketBoost");
    if (eff) return { tag: state.activePolicyTag, weight: (eff as { weight: number }).weight };
  }
  return null;
}

/** 평가 차수에 따른 티어 가중치 — 후반일수록 고티어 등장↑.
 *  S는 초반 등장을 크게 올렸다(0.1→0.35): 엔진 덱이 2차 벽 전에 페이오프 카드를 "볼" 수 있어야 한다.
 *  균형은 가격(스케일 카드는 비쌈)·재고(3장)가 잡으므로, 등장률은 "접근/계획"만 담당한다. */
export function tierWeight(tier: CardDef["tier"], evalIndex: number): number {
  switch (tier) {
    case "B":
      return 1.0;
    case "A":
      return 0.6 + 0.4 * evalIndex;
    case "S":
      return 0.35 + 0.55 * evalIndex;
    default:
      return 0; // start 티어는 후보에 등장하지 않음
  }
}

/**
 * 후보 5장 생성 (v0.11.2: 3→5 — 카드 풀이 138장까지 늘어나며 특정 태그/신규 카드가
 * 3장짜리 후보에 좀처럼 안 걸리는 문제 완화. 카드를 더 추가하는 대신 "볼 수 있는 폭"을 넓힌다).
 * 슬롯1·3=메인 태그 가중, 슬롯2=서브 태그 가중, 슬롯4=오프-컬러, 슬롯5=완전 무작위.
 */
export function generateCandidates(
  state: GameState,
  content: Content
): { candidates: string[]; rngState: number } {
  const ranked = rankedTags(state, content);
  const mainTag = ranked[0];
  const subTag = ranked[1];
  const offColor = new Set<Tag>([mainTag, subTag]);
  const banned = activePolicyBan(state, content);
  const boosted = activePolicyBoost(state, content);

  const inMarket = new Set(state.market.map((m) => m.defId));
  const pool = content.cardList.filter(
    (c) => c.tier !== "start" && !inMarket.has(c.id) && !(banned && c.tags.includes(banned))
  );

  const chosen: string[] = [];
  let rng = state.rngState;

  const pickWith = (
    weightFn: (c: CardDef) => number
  ): string | null => {
    const avail = pool.filter((c) => !chosen.includes(c.id));
    if (avail.length === 0) return null;
    const weights = avail.map((c) => {
      let w = tierWeight(c.tier, state.evalIndex) * weightFn(c);
      if (boosted && c.tags.includes(boosted.tag)) w *= boosted.weight;
      return Math.max(0.0001, w);
    });
    const r = weightedPick(rng, weights);
    rng = r.state;
    return avail[r.index].id;
  };

  // 슬롯1: 메인 태그 가중 (≈70/30)
  const s1 = pickWith((c) => (c.tags.includes(mainTag) ? 3 : 1));
  if (s1) chosen.push(s1);
  // 슬롯2: 서브 태그 가중 (≈50/50)
  const s2 = pickWith((c) => (c.tags.includes(subTag) ? 2 : 1));
  if (s2) chosen.push(s2);
  // 슬롯3: 메인 태그 가중 재적용 (빌드 방향을 더 확실히 밀어줌)
  const s3 = pickWith((c) => (c.tags.includes(mainTag) ? 3 : 1));
  if (s3) chosen.push(s3);
  // 슬롯4: 오프-컬러 (메인/서브 태그가 전혀 없는 카드 우대 — 방향 전환·희귀 카드 발견 창구)
  const s4 = pickWith((c) => (c.tags.some((t) => offColor.has(t)) ? 0.2 : 3));
  if (s4) chosen.push(s4);
  // 슬롯5: 완전 무작위 (태그 가중 없이 전체 풀에서)
  const s5 = pickWith(() => 1);
  if (s5) chosen.push(s5);

  // 풀이 부족하면 남는 슬롯을 무작위 보충
  while (chosen.length < 5) {
    const extra = pickWith(() => 1);
    if (!extra) break;
    chosen.push(extra);
  }

  return { candidates: chosen, rngState: rng };
}

/** 주기당 1·4번째 턴 종료 시 제시할 태그 3개 — 실제로 뽑을 카드가 있는 태그만 후보로 삼는다. */
export function pickTagChoices(state: GameState, content: Content): { tags: Tag[]; rngState: number } {
  const banned = activePolicyBan(state, content);
  const inMarket = new Set(state.market.map((m) => m.defId));
  const pool = content.cardList.filter((c) => c.tier !== "start" && !inMarket.has(c.id));
  const available = (ALL_TAGS as Tag[]).filter((t) => t !== banned && pool.some((c) => c.tags.includes(t)));
  const pickFrom = available.length >= 3 ? available : (ALL_TAGS as Tag[]).filter((t) => t !== banned);
  const sh = shuffle(pickFrom, state.rngState);
  return { tags: sh.result.slice(0, 3), rngState: sh.state };
}

/** 태그 하나로 제한된 후보 5장 생성 (해당 태그가 없는 카드는 등장하지 않는다). */
export function generateCandidatesForTag(
  state: GameState,
  content: Content,
  tag: Tag
): { candidates: string[]; rngState: number } {
  if (activePolicyBan(state, content) === tag) return { candidates: [], rngState: state.rngState };
  const inMarket = new Set(state.market.map((m) => m.defId));
  const pool = content.cardList.filter(
    (c) => c.tier !== "start" && !inMarket.has(c.id) && c.tags.includes(tag)
  );

  const chosen: string[] = [];
  let rng = state.rngState;
  while (chosen.length < 5) {
    const avail = pool.filter((c) => !chosen.includes(c.id));
    if (avail.length === 0) break;
    const weights = avail.map((c) => Math.max(0.0001, tierWeight(c.tier, state.evalIndex)));
    const r = weightedPick(rng, weights);
    rng = r.state;
    chosen.push(avail[r.index].id);
  }

  return { candidates: chosen, rngState: rng };
}
