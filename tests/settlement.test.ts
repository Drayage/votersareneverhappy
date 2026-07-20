import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame } from "../src/engine/game";
import { computeSettlement } from "../src/engine/settlement";
import { CAPS } from "../src/engine/caps";
import type { GameState } from "../src/engine/types";

const content = loadContent();

/** 보유 덱을 임의 카드 목록으로 강제 세팅한 상태를 만든다.
 *  정산 값 계산 자체를 검증하기 위해 cyclePlays 를 넉넉히 둬 처리 한도에 걸리지 않게 한다
 *  (처리 한도는 별도 describe 에서 검증). */
function withDeck(defIds: string[], patch?: Partial<GameState>): GameState {
  const s = newGame(content, 1);
  let uid = 1000;
  s.deck = defIds.map((defId) => ({ uid: uid++, defId }));
  s.hand = [];
  s.discard = [];
  s.inPlay = [];
  s.cyclePlays = 100;
  return { ...s, ...patch };
}

describe("정산 계산", () => {
  it("settlementPerTag: 문화 카드당 +3 (국립박물관 보유)", () => {
    // 국립박물관(museum, [culture,tourism]) + 도시축제(festival,[culture]) + 공연장(concert_hall,[culture])
    const s = withDeck(["museum", "festival", "concert_hall"]);
    const r = computeSettlement(s, content);
    // 문화 카드 3장 × 3점 = 9 (museum 의 settlementPerTag culture)
    expect(r.settlementScore).toBe(9);
  });

  it("과학 배수는 '이번 주기에 낸 과학 카드 수'로 계산된다 — 안 내면 배수 없음", () => {
    // 배수 소스(smart_city)를 보유해도 과학 카드를 한 장도 안 냈으면 배수 1 (스플래시 억제)
    const idle = withDeck(["museum", "smart_city"]);
    expect(computeSettlement(idle, content).settlementMult).toBe(1);

    // smart_city(18%/장) × 과학 5장 플레이 → ×1.9
    const active = withDeck(["museum", "smart_city"], {
      cyclePlayedTagCounts: { science: 5 },
    });
    const r = computeSettlement(active, content);
    expect(r.settlementMult).toBeCloseTo(1.9, 5);
    expect(r.settlementScore).toBe(6); // 문화 기반 3점 × 1.9 ≈ 6
  });

  it("교육 학습 레벨(eduLevel)이 점수로 환산된다", () => {
    // library: 학습 레벨 1당 +2점. eduLevel을 5로 가정 → 10점
    const s = withDeck(["library"], { eduLevel: 5 });
    expect(computeSettlement(s, content).settlementScore).toBe(10);
  });

  it("복지: 벌점을 점수로 전환(penaltyToScore)", () => {
    // disaster_fund: 환경 1당 +3, 부패 1당 +3. 환경3·부패2 → +15 (단, 환경 벌점 -6은 별도)
    const s = withDeck(["disaster_fund"], {
      gauges: { pollution: 3, corruption: 2, populismDebuff: 0 },
    });
    const r = computeSettlement(s, content);
    expect(r.settlementScore).toBe(15);
  });

  it("복지: 통과 목표 비례 안정 세입(settlementPctOfTarget)", () => {
    // welfare_net: 통과 목표의 20%. 1차 목표 70 → +14점 (과학 배수 미적용)
    const s = withDeck(["welfare_net"]); // evalIndex 0 → 목표 70
    expect(computeSettlement(s, content).settlementScore).toBe(14);
  });

  it("안정 세입은 상한(목표의 40%)으로 캡되어 다수 적재로 자동 통과 불가", () => {
    // welfare_net 5장 = 20%×5 = 100% → 캡 40%로 제한 → 목표 70의 40% = 28점
    const five = withDeck(["welfare_net", "welfare_net", "welfare_net", "welfare_net", "welfare_net"]);
    const r = computeSettlement(five, content);
    expect(r.settlementScore).toBe(28); // 70점이 아니라 캡 적용 28점
    expect(r.passed).toBe(false); // 목표 70 미달 → 자동 통과 안 됨
  });

  it("환경 벌점은 정산에서 차감된다", () => {
    const s = withDeck(["festival"], { gauges: { pollution: 3, corruption: 0, populismDebuff: 0 } });
    const r = computeSettlement(s, content);
    expect(r.pollutionPenalty).toBe(-6);
  });

  it("globalScoreMult 유물은 최대 2개만 발효(캡)", () => {
    // megacity ×1.5, great_city ×1.2, city_report ×1.15 → 상위 2개(1.5×1.2=1.8)만
    const s = withDeck(["festival"], {
      relics: ["megacity", "great_city", "city_report"],
      cycleScore: 100,
    });
    const r = computeSettlement(s, content);
    expect(r.globalMult).toBeCloseTo(1.8, 5);
  });

  it("포퓰리즘 목표 증가와 부패 감산은 80%에서 멈춘다", () => {
    const s = withDeck(["festival"], {
      cycleScore: 100,
      activeTargetBonusPct: 999,
      gauges: { pollution: 0, corruption: 100, populismDebuff: 0 },
    });
    const r = computeSettlement(s, content);
    expect(r.targetBonusPct).toBe(80);
    expect(r.target).toBe(126); // 70 × 1.8
    expect(r.corruptionPct).toBe(80);
    expect(r.finalScore).toBe(20);
  });
});

describe("행정 처리 한도 (정산은 낸 카드 수에 비례)", () => {
  it("아무것도 내지 않으면(cyclePlays 0) 정산 점수는 0 — 무플레이 자동 통과 봉쇄", () => {
    // 복지 안전망 5장: 원래 목표의 40%(28점)를 무료로 줬지만, 낸 카드가 없으면 0으로 캡
    const s = withDeck(Array(5).fill("welfare_net"), { cyclePlays: 0 });
    const r = computeSettlement(s, content);
    expect(r.settlementRaw).toBe(28); // 계산상 원점수는 그대로
    expect(r.settlementCap).toBe(0); // 처리 한도 0
    expect(r.settlementScore).toBe(0); // 캡 적용
  });

  it("낸 카드 1장당 settlementPerPlay 점까지 정산이 인정된다", () => {
    const N = CAPS.settlementPerPlay;
    // 국립박물관(문화당 +3) + 문화 카드 다수로 큰 정산을 만들고, 낸 카드 수로 상한 확인
    const deck = ["museum", ...Array(10).fill("festival")]; // 문화 11장 → 박물관 정산 33
    const s = withDeck(deck, { cyclePlays: 0 });
    expect(computeSettlement(s, content).settlementScore).toBe(0); // 0장 → 0
    const s1 = withDeck(deck, { cyclePlays: 1 });
    const r1 = computeSettlement(s1, content);
    expect(r1.settlementCap).toBe(N);
    expect(r1.settlementScore).toBe(33); // 33 < N → 그대로 인정
    const bigDeck = ["big_corp", ...Array(40).fill("tax_collect")]; // 상업 41 → 정산 123
    const s2 = withDeck(bigDeck, { cyclePlays: 1 });
    expect(computeSettlement(s2, content).settlementScore).toBe(N); // 123 > N → 한도로 캡
    const s3 = withDeck(bigDeck, { cyclePlays: 5 });
    expect(computeSettlement(s3, content).settlementScore).toBe(123); // 5장 → 5N 한도, 그대로
  });
});
