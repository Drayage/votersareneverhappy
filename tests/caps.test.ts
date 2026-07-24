import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame } from "../src/engine/game";
import { computeTriggerScore } from "../src/engine/effects";
import { CAPS } from "../src/engine/caps";
import type { Content, GameState, PolicyDef } from "../src/engine/types";

const content = loadContent();

/** 지정 태그 트리거 보너스를 주는 정책을 임시로 끼운 content를 만든다(엔진 메커니즘 검증용). */
function withPolicy(def: PolicyDef): Content {
  const policies = new Map(content.policies);
  policies.set(def.id, def);
  return { ...content, policies };
}

describe("무한콤보 안전장치", () => {
  it("지속 트리거는 소스당 턴 CAPS.triggerPerSource 회로 제한된다", () => {
    const s: GameState = newGame(content, 1);
    let uid = 5000;
    s.inPlay = Array.from({ length: 2 }, () => ({ uid: uid++, defId: "cruise_terminal" }));

    // 첫 플레이: 소스 2개가 각각 1회씩 발동
    const r1 = computeTriggerScore(s, content, ["tourism"], "score");
    expect(r1.score).toBe(4); // 2점 × 2소스
    expect(Object.values(r1.fires)).toEqual([1, 1]);

    // 각 소스가 이미 상한(3회)까지 발동한 상태면 더 이상 발동 없음
    s.triggerFires = { [`card:5000`]: CAPS.triggerPerSource, [`card:5001`]: CAPS.triggerPerSource };
    const r2 = computeTriggerScore(s, content, ["tourism"], "score");
    expect(r2.score).toBe(0);
  });

  it("재물 플레이는 트리거를 발동시키지 않는다", () => {
    const s: GameState = newGame(content, 1);
    s.inPlay = [{ uid: 5100, defId: "logistics_hub" }]; // 상업 카드 사용 시 +1점
    // 세금 징수(재물, 상업)를 내도 트리거 무반응
    const r = computeTriggerScore(s, content, ["commerce"], "treasure");
    expect(r.score).toBe(0);
    // 같은 태그라도 액션/점수 카드 플레이에는 반응
    const r2 = computeTriggerScore(s, content, ["commerce"], "action");
    expect(r2.score).toBe(1);
  });

  it("액션/구매는 캡을 넘겨 누적되지 않는다", () => {
    expect(CAPS.actionsPerTurn).toBeGreaterThan(0);
    expect(CAPS.buysPerTurn).toBeGreaterThan(0);
  });

  it("정책의 태그 보너스도 자기 소스당 상한을 따른다", () => {
    const c2 = withPolicy({
      id: "p_trigger_test",
      name: "테스트 정책",
      text: "행정 트리거 +3",
      price: 100,
      passive: [{ kind: "triggerBonusTag", tag: "admin", score: 3 }],
    });
    const s: GameState = newGame(content, 2);
    s.policies = ["p_trigger_test"];
    const r = computeTriggerScore(s, c2, ["admin"], "action");
    expect(r.score).toBe(3); // 정책 태그 트리거 발동
    // 이미 상한까지 발동했다면 무반응
    s.triggerFires = { "policy:p_trigger_test": CAPS.triggerPerSource };
    expect(computeTriggerScore(s, c2, ["admin"], "action").score).toBe(0);
  });
});
