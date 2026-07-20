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
  confirmEvaluation: () => void;
  buyRelic: (id: string) => void;
  buyPolicy: (id: string) => void;
  removeCard: (uid: number) => void;
  reroll: () => void;
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
  confirmEvaluation: () => set((s) => ({ state: G.confirmEvaluation(s.state, s.content) })),
  buyRelic: (id) => set((s) => ({ state: G.buyRelic(s.state, s.content, id) })),
  buyPolicy: (id) => set((s) => ({ state: G.buyPolicy(s.state, s.content, id) })),
  removeCard: (uid) => set((s) => ({ state: G.removeOwnedCard(s.state, s.content, uid) })),
  reroll: () => set((s) => ({ state: G.rerollShop(s.state, s.content) })),
  nextCycle: () => set((s) => ({ state: G.nextCycle(s.state, s.content) })),
}));
