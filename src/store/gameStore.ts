import { create } from "zustand";
import type { Content, GameState, Tag } from "../engine/types";
import { loadContent } from "../content/loader";
import { EVAL_TARGETS } from "../engine/caps";
import * as G from "../engine/game";
import {
  loadDiscovered,
  saveDiscovered,
  loadRecords,
  saveRecords,
  type Discovered,
  type GameRecord,
} from "./persistence";

const content: Content = loadContent();

/** 앱 최상위 화면 — 타이틀/게임/도감/기록. GameState.phase(게임 내부 단계)와는 별개 축이다. */
export type Screen = "title" | "game" | "compendium" | "records";

interface Store {
  content: Content;
  state: GameState;
  seedInput: number;

  screen: Screen;
  discovered: Discovered;
  records: GameRecord[];

  // 화면 전환
  goTitle: () => void;
  goCompendium: () => void;
  goRecords: () => void;
  startGame: (seed?: number) => void;

  newGame: (seed?: number) => void;
  setSeed: (n: number) => void;
  play: (uid: number) => void;
  resolveChoice: (uids: number[]) => void;
  playTreasures: () => void;
  buy: (defId: string) => void;
  endTurn: () => void;
  chooseCandidate: (addId: string, removeId?: string) => void;
  chooseCandidateTag: (tag: Tag) => void;
  rerollCandidates: () => void;
  confirmEvaluation: () => void;
  pickRelic: (id: string) => void;
  pickPolicy: (id: string) => void;
  removeCard: (uid: number) => void;
  skipRemoval: () => void;
  rerollRelics: () => void;
  rerollPolicies: () => void;
  nextCycle: () => void;
  startEndless: () => void;
}

/** 현재 게임 상태에서 새로 발견한 콘텐츠를 도감에 병합한다. (변화 없으면 원본 그대로 반환) */
function mergeDiscoveries(prev: Discovered, s: GameState): Discovered {
  const cards = new Set(prev.cards);
  const relics = new Set(prev.relics);
  const policies = new Set(prev.policies);
  // 카드: 시장에 놓였거나 내 덱에 들어온(= 산) 카드
  for (const m of s.market) cards.add(m.defId);
  for (const c of [...s.deck, ...s.hand, ...s.discard, ...s.inPlay]) cards.add(c.defId);
  // 유물: 실제로 고른(보유) 유물
  for (const id of s.relics) relics.add(id);
  // 정책: 시행 이력 + 대기 중인 선택
  for (const id of s.policyHistory) policies.add(id);
  if (s.pendingPolicy) policies.add(s.pendingPolicy);
  for (const id of s.policies) policies.add(id);

  if (cards.size === prev.cards.length && relics.size === prev.relics.length && policies.size === prev.policies.length) {
    return prev; // 변화 없음
  }
  return { cards: [...cards], relics: [...relics], policies: [...policies] };
}

/** 한 판이 종료되는 전환(→win / →gameover)이면 기록 한 줄을 만든다. 아니면 null. */
function buildRecordOnTransition(prev: GameState, next: GameState): GameRecord | null {
  const entered = (p: string) => prev.phase !== p && next.phase === p;
  const finalEvalIdx = EVAL_TARGETS.length - 1;
  if (entered("win")) {
    return {
      date: Date.now(),
      seed: next.seed,
      won: true,
      evalReached: next.evalIndex + 1,
      endlessLevel: 0,
      finalScore: next.lastSettlement?.finalScore ?? 0,
      relics: next.relics.length,
      policies: next.policyHistory.length,
    };
  }
  if (entered("gameover")) {
    return {
      date: Date.now(),
      seed: next.seed,
      won: next.endless, // 무한 모드 중 사망이면 정규 5차는 이미 클리어한 것
      evalReached: next.evalIndex + 1,
      endlessLevel: next.endless ? Math.max(0, next.evalIndex - finalEvalIdx) : 0,
      finalScore: next.lastSettlement?.finalScore ?? 0,
      relics: next.relics.length,
      policies: next.policyHistory.length,
    };
  }
  return null;
}

export const useGame = create<Store>((set) => {
  const initialDiscovered = loadDiscovered();
  const initialRecords = loadRecords();

  /** 엔진 전이를 적용하고 도감/기록 부수효과를 처리하는 공통 래퍼. */
  const apply = (fn: (s: GameState) => GameState) =>
    set((store) => {
      const next = fn(store.state);
      if (next === store.state) return {}; // 무변화 — 부수효과도 없음

      const discovered = mergeDiscoveries(store.discovered, next);
      if (discovered !== store.discovered) saveDiscovered(discovered);

      let records = store.records;
      const rec = buildRecordOnTransition(store.state, next);
      if (rec) {
        records = [rec, ...store.records];
        saveRecords(records);
      }
      return { state: next, discovered, records };
    });

  return {
    content,
    state: G.newGame(content, 1),
    seedInput: 1,

    screen: "title",
    discovered: initialDiscovered,
    records: initialRecords,

    goTitle: () => set({ screen: "title" }),
    goCompendium: () => set({ screen: "compendium" }),
    goRecords: () => set({ screen: "records" }),
    startGame: (seed) =>
      set((s) => {
        const state = G.newGame(s.content, seed ?? s.seedInput);
        const discovered = mergeDiscoveries(s.discovered, state);
        if (discovered !== s.discovered) saveDiscovered(discovered);
        return { state, discovered, screen: "game" };
      }),

    newGame: (seed) =>
      set((s) => {
        const state = G.newGame(s.content, seed ?? s.seedInput);
        const discovered = mergeDiscoveries(s.discovered, state);
        if (discovered !== s.discovered) saveDiscovered(discovered);
        return { state, discovered };
      }),
    setSeed: (n) => set({ seedInput: n }),
    play: (uid) => apply((st) => G.playCard(st, content, uid)),
    resolveChoice: (uids) => apply((st) => G.resolveChoice(st, content, uids)),
    playTreasures: () => apply((st) => G.playAllTreasures(st, content)),
    buy: (defId) => apply((st) => G.buyCard(st, content, defId)),
    endTurn: () => apply((st) => G.endTurn(st, content)),
    chooseCandidate: (addId, removeId) => apply((st) => G.chooseCandidate(st, content, addId, removeId)),
    chooseCandidateTag: (tag) => apply((st) => G.chooseCandidateTag(st, content, tag)),
    rerollCandidates: () => apply((st) => G.rerollCandidates(st, content)),
    confirmEvaluation: () => apply((st) => G.confirmEvaluation(st, content)),
    pickRelic: (id) => apply((st) => G.pickRewardRelic(st, content, id)),
    pickPolicy: (id) => apply((st) => G.pickRewardPolicy(st, content, id)),
    removeCard: (uid) => apply((st) => G.removeRewardCard(st, content, uid)),
    skipRemoval: () => apply((st) => G.skipRewardRemoval(st)),
    rerollRelics: () => apply((st) => G.rerollRewardRelics(st, content)),
    rerollPolicies: () => apply((st) => G.rerollRewardPolicies(st, content)),
    nextCycle: () => apply((st) => G.nextCycle(st, content)),
    startEndless: () => apply((st) => G.startEndless(st, content)),
  };
});
