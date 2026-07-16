import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame, playCard } from "../src/engine/game";
import { computeSettlement } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

describe("회전 정산(settlementPerPlays)", () => {
  it("이번 주기에 낸 카드 수만큼 정산 점수를 얻는다", () => {
    let s: GameState = newGame(content, 41);
    s = {
      ...s,
      hand: [
        { uid: 9201, defId: "festival" },
        { uid: 9202, defId: "festival" },
        { uid: 9203, defId: "festival" },
      ],
      deck: [],
      discard: [{ uid: 9204, defId: "activity_report" }],
      inPlay: [],
      cyclePlays: 0,
      cyclePlayedTagCounts: {},
    };
    s = playCard(s, content, 9201);
    s = playCard(s, content, 9202);
    s = playCard(s, content, 9203);
    expect(s.cyclePlays).toBe(3);
    expect(computeSettlement(s, content).settlementScore).toBe(3); // 3플레이 × 1점
  });

  it("태그 지정 시 해당 태그 플레이만 세고, 상한이 적용된다", () => {
    let s: GameState = newGame(content, 42);
    s = {
      ...s,
      deck: [],
      hand: [],
      discard: [{ uid: 9210, defId: "festival_circuit" }],
      inPlay: [],
      cyclePlays: 60,
      cyclePlayedTagCounts: { culture: 60, tourism: 2 },
      cycleScore: 0,
    };
    // 문화: 60×2=120 → 상한 30, 관광: 2×2=4
    expect(computeSettlement(s, content).settlementScore).toBe(34);
  });
});

describe("주기 점수 배수(cycleScoreMult)", () => {
  it("플레이로 쌓은 점수에만 곱해진다", () => {
    let s: GameState = newGame(content, 43);
    s = { ...s, relics: ["live_city"], cycleScore: 100 };
    const r = computeSettlement(s, content);
    expect(r.baseCycleScore).toBe(150); // 100 × 1.5
    expect(r.settlementScore).toBe(0);
    expect(r.finalScore).toBe(150);
  });
});

describe("트리거 상한 확장(extraTriggerCap)", () => {
  const withTriggers = (relics: string[]): GameState => {
    const s = newGame(content, 44);
    return {
      ...s,
      relics,
      inPlay: Array.from({ length: 8 }, (_, i) => ({ uid: 9300 + i, defId: "tourist_info" })),
      hand: [{ uid: 9320, defId: "city_parade" }],
      deck: [],
      discard: [],
      actions: 1,
      cycleScore: 0,
      triggerCount: 0,
      turnMult: {},
      playedTagCounts: {},
    };
  };

  it("기본 상한 6회를 넘는 트리거는 발동하지 않는다", () => {
    const s = playCard(withTriggers([]), content, 9320);
    expect(s.cycleScore).toBe(14); // +8(도심 퍼레이드) + 트리거 6회 × 1점
  });

  it("전속 리포터(+3회)가 있으면 8개 트리거가 모두 발동한다", () => {
    const s = playCard(withTriggers(["city_reporter"]), content, 9320);
    expect(s.cycleScore).toBe(16); // +8 + 트리거 8회 × 1점
  });
});
