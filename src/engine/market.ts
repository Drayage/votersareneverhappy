// 시장(Supply) 시스템 — 후보 3장 가중 생성 + 강제 추가/교체 (docs/01 §3)
import type { CardDef, Content, GameState, Tag } from "./types";
import { ALL_TAGS } from "./types";
import { weightedPick } from "./rng";

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

/** 평가 차수에 따른 티어 가중치 — 후반일수록 고티어 등장↑ */
function tierWeight(tier: CardDef["tier"], evalIndex: number): number {
  switch (tier) {
    case "B":
      return 1.0;
    case "A":
      return 0.5 + 0.4 * evalIndex;
    case "S":
      return 0.1 + 0.5 * evalIndex;
    default:
      return 0; // start 티어는 후보에 등장하지 않음
  }
}

/**
 * 후보 3장 생성.
 * 슬롯1=메인 태그 가중, 슬롯2=서브 태그 가중, 슬롯3=오프-컬러.
 */
export function generateCandidates(
  state: GameState,
  content: Content
): { candidates: string[]; rngState: number } {
  const ranked = rankedTags(state, content);
  const mainTag = ranked[0];
  const subTag = ranked[1];
  const offColor = new Set<Tag>([mainTag, subTag]);

  const inMarket = new Set(state.market.map((m) => m.defId));
  const pool = content.cardList.filter((c) => c.tier !== "start" && !inMarket.has(c.id));

  const chosen: string[] = [];
  let rng = state.rngState;

  const pickWith = (
    weightFn: (c: CardDef) => number
  ): string | null => {
    const avail = pool.filter((c) => !chosen.includes(c.id));
    if (avail.length === 0) return null;
    const weights = avail.map((c) => Math.max(0.0001, tierWeight(c.tier, state.evalIndex) * weightFn(c)));
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
  // 슬롯3: 오프-컬러 (메인/서브 태그가 전혀 없는 카드 우대)
  const s3 = pickWith((c) => (c.tags.some((t) => offColor.has(t)) ? 0.2 : 3));
  if (s3) chosen.push(s3);

  // 풀이 부족하면 남는 슬롯을 무작위 보충
  while (chosen.length < 3) {
    const extra = pickWith(() => 1);
    if (!extra) break;
    chosen.push(extra);
  }

  return { candidates: chosen, rngState: rng };
}
