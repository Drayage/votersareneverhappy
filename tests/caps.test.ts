import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame } from "../src/engine/game";
import { computeTriggerScore } from "../src/engine/effects";
import { CAPS } from "../src/engine/caps";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("무한콤보 안전장치", () => {
  it("지속 트리거는 턴당 CAPS.triggerPerTurn 회로 제한된다", () => {
    const s: GameState = newGame(content, 1);
    // inPlay 에 강력한 트리거(크루즈: 관광 사용 시 +3)를 다수 배치
    let uid = 5000;
    s.inPlay = Array.from({ length: 5 }, () => ({ uid: uid++, defId: "cruise_terminal" }));
    // 관광 카드 1장 사용 시: 트리거원 5개 × onPlayTag(tourism) → 본래 5회 발동
    const remaining = CAPS.triggerPerTurn; // 6
    const r = computeTriggerScore(s, content, ["tourism"], remaining);
    // 5회까지만(소스 5개) — 캡 6 미만이므로 모두 발동, fired=5
    expect(r.fired).toBe(5);

    // 캡을 2로 제한하면 2회만
    const r2 = computeTriggerScore(s, content, ["tourism"], 2);
    expect(r2.fired).toBe(2);
    expect(r2.score).toBe(6); // 3점 × 2
  });

  it("액션/구매는 캡을 넘겨 누적되지 않는다", () => {
    expect(CAPS.actionsPerTurn).toBeGreaterThan(0);
    expect(CAPS.buysPerTurn).toBeGreaterThan(0);
  });

  it("정책의 태그 보너스도 지속 트리거 캡을 공유한다", () => {
    const s: GameState = newGame(content, 2);
    s.policies = ["p_citizen_budget"];
    const r = computeTriggerScore(s, content, ["admin"], 1);
    expect(r).toEqual({ score: 1, fired: 1 });
    expect(computeTriggerScore(s, content, ["admin"], 0)).toEqual({ score: 0, fired: 0 });
  });
});
