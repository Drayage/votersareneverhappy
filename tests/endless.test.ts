import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { confirmEvaluation, newGame, startEndless } from "../src/engine/game";
import { EVAL_TARGETS, ENDLESS_TURNS, targetFor, turnsFor } from "../src/engine/caps";
import { computeSettlement } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("무한 모드 목표/턴 스케일 (targetFor/turnsFor)", () => {
  it("정규 5차까지는 EVAL_TARGETS를 그대로 반환한다", () => {
    for (let i = 0; i < EVAL_TARGETS.length; i++) expect(targetFor(i)).toBe(EVAL_TARGETS[i]);
  });

  it("무한 레벨(5차 이후)은 목표가 매 레벨 더 큰 배율로 폭증한다(증가폭 기하급수)", () => {
    const last = EVAL_TARGETS[EVAL_TARGETS.length - 1];
    const t5 = targetFor(5);
    const t6 = targetFor(6);
    const t7 = targetFor(7);
    expect(t5).toBeGreaterThan(last);
    // 배율 자체가 커진다: (t6/t5) > (t5/last)
    expect(t6 / t5).toBeGreaterThan(t5 / last);
    expect(t7 / t6).toBeGreaterThan(t6 / t5);
  });

  it("무한 모드 주기당 턴 수는 ENDLESS_TURNS(5턴)로 고정된다", () => {
    expect(turnsFor(5)).toBe(ENDLESS_TURNS);
    expect(turnsFor(9)).toBe(ENDLESS_TURNS);
  });
});

describe("무한 모드 진입/진행 (startEndless)", () => {
  /** 5차를 통과한 직후(evaluation, passed) 상태를 인위적으로 만든다. */
  function atFinalPass(endless = false): GameState {
    const base = newGame(content, 1);
    const s: GameState = { ...base, evalIndex: EVAL_TARGETS.length - 1, endless };
    // 통과 판정이 나오도록 목표를 훨씬 초과하는 정산 결과를 직접 넣는다.
    s.lastSettlement = {
      ...computeSettlement(s, content),
      finalScore: 999999,
      target: targetFor(s.evalIndex),
      passed: true,
    };
    s.phase = "evaluation";
    return s;
  }

  it("정규 5차를 통과하면 승리(win) 화면으로 간다", () => {
    const s = confirmEvaluation(atFinalPass(false), content);
    expect(s.phase).toBe("win");
    expect(s.endless).toBe(false);
  });

  it("승리 화면에서 startEndless를 부르면 endless가 켜지고 보상 단계로 진입한다", () => {
    let s = confirmEvaluation(atFinalPass(false), content);
    s = startEndless(s, content);
    expect(s.endless).toBe(true);
    expect(s.phase).toBe("reward");
  });

  it("startEndless는 win 단계가 아니면 아무 효과가 없다", () => {
    const playing = newGame(content, 1);
    expect(startEndless(playing, content)).toBe(playing);
  });

  it("무한 모드(endless=true)에선 5차 이후 통과 시 다시 win이 아니라 보상 단계로 이어진다", () => {
    const base = newGame(content, 1);
    const s: GameState = { ...base, evalIndex: 6, endless: true };
    s.lastSettlement = {
      ...computeSettlement(s, content),
      finalScore: 999999,
      target: targetFor(6),
      passed: true,
    };
    s.phase = "evaluation";
    const next = confirmEvaluation(s, content);
    expect(next.phase).toBe("reward");
  });
});
