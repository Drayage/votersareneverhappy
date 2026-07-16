import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import { buyCard, chooseCandidate, endTurn, newGame, playCard } from "../src/engine/game";
import { CAPS } from "../src/engine/caps";
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

describe("연구지수(research)", () => {
  it("과학 카드가 연구를 생산하고, 턴이 지나도 유지된다", () => {
    let s = newGame(content, 46);
    s = {
      ...s,
      hand: [{ uid: 9500, defId: "lab" }],
      deck: [{ uid: 9501, defId: "basic_tax" }],
      discard: [],
      inPlay: [],
      actions: 1,
    };
    s = playCard(s, content, 9500); // +1드로우, +2연구
    expect(s.research).toBe(2);
    s = endTurn(s, content);
    expect(s.research).toBe(2); // 예산과 달리 소멸하지 않음
  });

  it("연구 비용 카드는 예산 대신 연구지수로 산다", () => {
    let s = newGame(content, 47);
    s = { ...s, market: [{ defId: "fusion_plant", stock: 5 }], buys: 1, budget: 0, research: 10 };
    const bought = buyCard(s, content, "fusion_plant");
    expect(bought.research).toBe(0); // 🔬10 차감
    expect(bought.budget).toBe(0); // 예산은 건드리지 않음
    expect(bought.discard.some((c) => c.defId === "fusion_plant")).toBe(true);
  });

  it("연구가 모자라면 구매할 수 없다", () => {
    let s = newGame(content, 48);
    s = { ...s, market: [{ defId: "fusion_plant", stock: 5 }], buys: 1, budget: 99, research: 9 };
    expect(buyCard(s, content, "fusion_plant")).toBe(s); // 예산이 많아도 불가
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

describe("트리거 소스당 상한과 확장(extraTriggerCap)", () => {
  const withTriggers = (relics: string[], used: number): GameState => {
    const s = newGame(content, 44);
    return {
      ...s,
      relics,
      inPlay: [
        { uid: 9300, defId: "tourist_info" },
        { uid: 9301, defId: "tourist_info" },
      ],
      hand: [{ uid: 9320, defId: "city_parade" }],
      deck: [],
      discard: [],
      actions: 1,
      cycleScore: 0,
      triggerFires: { "card:9300": used, "card:9301": used },
      turnMult: {},
      playedTagCounts: {},
    };
  };

  it("소스당 상한에 도달한 트리거는 더 발동하지 않는다", () => {
    const s = playCard(withTriggers([], CAPS.triggerPerSource), content, 9320);
    expect(s.cycleScore).toBe(8); // 도심 퍼레이드 +8만, 트리거 0회
  });

  it("전속 리포터(소스당 +2회)가 있으면 상한이 늘어 다시 발동한다", () => {
    const s = playCard(withTriggers(["city_reporter"], CAPS.triggerPerSource), content, 9320);
    expect(s.cycleScore).toBe(10); // +8 + 소스 2개 × 1점
    expect(s.triggerFires["card:9300"]).toBe(CAPS.triggerPerSource + 1);
  });

  it("(지속) 카드는 턴이 끝나도 플레이 영역에 남아 다음 턴에도 트리거가 발동한다", () => {
    let s = newGame(content, 45);
    s = {
      ...s,
      hand: [{ uid: 9400, defId: "grand_theater" }], // (지속 2턴) 문화 사용 시 +2점
      deck: [{ uid: 9401, defId: "festival" }],
      discard: [],
      inPlay: [],
      actions: 1,
      cycleScore: 0,
      turn: 1,
    };
    s = playCard(s, content, 9400); // 대극장 배치 (점수 타입, 액션 불요)
    expect(s.inPlay[0].persistLeft).toBe(2);

    s = endTurn(s, content); // 클린업 — 대극장은 잔여 1턴으로 유지
    expect(s.inPlay.map((c) => c.uid)).toEqual([9400]);
    expect(s.inPlay[0].persistLeft).toBe(1);

    s = chooseCandidate(s, content, s.candidates[0]); // 다음 턴 시작 (festival 드로우)
    const festival = s.hand.find((c) => c.defId === "festival")!;
    s = playCard(s, content, festival.uid); // 문화 카드 → 지속 중인 대극장 트리거 +2
    expect(s.cycleScore).toBe(7); // 축제 +5 + 트리거 +2

    s = endTurn(s, content); // 잔여 턴 소진 → 이번엔 버린 더미로
    expect(s.inPlay).toEqual([]);
    expect(s.discard.some((c) => c.uid === 9400 && c.persistLeft === undefined)).toBe(true);
  });

  it("재물 플레이는 트리거를 울리지 않는다", () => {
    let s = withTriggers([], 0);
    s = { ...s, inPlay: [{ uid: 9330, defId: "cruise_terminal" }], hand: [{ uid: 9331, defId: "tax_collect" }] };
    // 세금 징수는 상업 재물 — 크루즈 터미널(관광/문화 반응)과 태그도 다르지만,
    // 관광 태그 재물이 있다 해도 재물 타입 자체가 미발동. 여기서는 통합 확인.
    s = playCard(s, content, 9331);
    expect(s.cycleScore).toBe(0);
    expect(s.budget).toBe(2);
  });
});
