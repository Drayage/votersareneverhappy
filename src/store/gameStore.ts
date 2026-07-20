import { create } from "zustand";
import type { Content, GameState } from "../engine/types";
import { loadContent } from "../content/loader";
import * as G from "../engine/game";

const content: Content = loadContent();

interface Store {
  content: Content;
  state: GameState;
  seedInput: number;

  newGame: (seed?: number) => void;
  setSeed: (n: number) => void;
  play: (uid: number) => void;
  resolveChoice: (uids: number[]) => void;
  playTreasures: () => void;
  buy: (defId: string) => void;
  endTurn: () => void;
  chooseCandidate: (addId: string, removeId?: string) => void;
  rerollCandidates: () => void;
  confirmEvaluation: () => void;
  pickRelic: (id: string) => void;
  pickPolicy: (id: string) => void;
  removeCard: (uid: number) => void;
  skipRemoval: () => void;
  rerollRelics: () => void;
  rerollPolicies: () => void;
  nextCycle: () => void;
}

export const useGame = create<Store>((set) => ({
  content,
  state: G.newGame(content, 1),
  seedInput: 1,

  newGame: (seed) => set((s) => ({ state: G.newGame(s.content, seed ?? s.seedInput) })),
  setSeed: (n) => set({ seedInput: n }),
  play: (uid) => set((s) => ({ state: G.playCard(s.state, s.content, uid) })),
  resolveChoice: (uids) => set((s) => ({ state: G.resolveChoice(s.state, s.content, uids) })),
  playTreasures: () => set((s) => ({ state: G.playAllTreasures(s.state, s.content) })),
  buy: (defId) => set((s) => ({ state: G.buyCard(s.state, s.content, defId) })),
  endTurn: () => set((s) => ({ state: G.endTurn(s.state, s.content) })),
  chooseCandidate: (addId, removeId) =>
    set((s) => ({ state: G.chooseCandidate(s.state, s.content, addId, removeId) })),
  rerollCandidates: () => set((s) => ({ state: G.rerollCandidates(s.state, s.content) })),
  confirmEvaluation: () => set((s) => ({ state: G.confirmEvaluation(s.state, s.content) })),
  pickRelic: (id) => set((s) => ({ state: G.pickRewardRelic(s.state, s.content, id) })),
  pickPolicy: (id) => set((s) => ({ state: G.pickRewardPolicy(s.state, s.content, id) })),
  removeCard: (uid) => set((s) => ({ state: G.removeRewardCard(s.state, s.content, uid) })),
  skipRemoval: () => set((s) => ({ state: G.skipRewardRemoval(s.state) })),
  rerollRelics: () => set((s) => ({ state: G.rerollRewardRelics(s.state, s.content) })),
  rerollPolicies: () => set((s) => ({ state: G.rerollRewardPolicies(s.state, s.content) })),
  nextCycle: () => set((s) => ({ state: G.nextCycle(s.state, s.content) })),
}));
