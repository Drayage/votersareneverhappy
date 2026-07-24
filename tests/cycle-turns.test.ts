import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { endTurn, newGame } from "../src/engine/game";
import { CYCLE_TURNS } from "../src/engine/caps";
import type { GameState } from "../src/engine/types";

const content = loadContent();

/** 손패를 비우고 지정한 턴/차수에서 곧바로 턴을 끝낼 수 있게 만든 상태 */
function atTurnEnd(evalIndex: number, turn: number): GameState {
  const s = newGame(content, 1);
  return { ...s, evalIndex, turn, hand: [], actions: 0, buys: 0 };
}

describe("주기별 턴 수 (CYCLE_TURNS: 9→8→7→6→5)", () => {
  it("차수가 오를수록 턴 수가 1씩 줄어든다", () => {
    expect(CYCLE_TURNS).toEqual([9, 8, 7, 6, 5]);
  });

  it("각 차수의 마지막 턴을 끝내면 평가로 전환된다", () => {
    for (let evalIndex = 0; evalIndex < CYCLE_TURNS.length; evalIndex++) {
      const lastTurn = CYCLE_TURNS[evalIndex];
      const s = endTurn(atTurnEnd(evalIndex, lastTurn), content);
      expect(s.phase).toBe("evaluation");
    }
  });

  it("마지막 턴 전까지는 후보/태그 선택 단계로 이어진다", () => {
    for (let evalIndex = 0; evalIndex < CYCLE_TURNS.length; evalIndex++) {
      const lastTurn = CYCLE_TURNS[evalIndex];
      const s = endTurn(atTurnEnd(evalIndex, lastTurn - 1), content);
      expect(s.phase).toBe("candidate");
    }
  });
});
