import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import { newGame } from "../src/engine/game";
import { computeSettlement } from "../src/engine/settlement";
import type { GameState } from "../src/engine/types";

const content = loadContent();

/** 보유 덱을 임의 카드 목록으로 강제 세팅한 상태를 만든다. */
function withDeck(defIds: string[], patch?: Partial<GameState>): GameState {
  const s = newGame(content, 1);
  let uid = 1000;
  s.deck = defIds.map((defId) => ({ uid: uid++, defId }));
  s.hand = [];
  s.discard = [];
  s.inPlay = [];
  return { ...s, ...patch };
}

describe("정산 계산", () => {
  it("settlementPerTag: 문화 카드당 +2 (국립박물관 보유)", () => {
    // 국립박물관(museum, [culture,tourism]) + 도시축제(festival,[culture]) + 공연장(concert_hall,[culture])
    const s = withDeck(["museum", "festival", "concert_hall"]);
    const r = computeSettlement(s, content);
    // 문화 카드 3장 × 2점 = 6 (museum 의 settlementPerTag culture)
    expect(r.settlementScore).toBe(6);
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
    expect(r.settlementScore).toBe(4); // 문화 기반 2점 × 1.9 ≈ 4
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

  it("안정 세입은 상한(목표의 20%)으로 캡 — 복지는 안전망이지 승리 버튼이 아니다", () => {
    // welfare_net 5장 = 20%×5 = 100% → 캡 20%로 제한 → 목표 70의 20% = 14점
    const five = withDeck(["welfare_net", "welfare_net", "welfare_net", "welfare_net", "welfare_net"]);
    const r = computeSettlement(five, content);
    expect(r.settlementScore).toBe(14); // 다수 적재해도 20% 상한
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

  it("settlementMultTag 스택 상한: 상위 2개만 곱연산, 나머지는 가산 (문화 뻥튀기 차단)", () => {
    // 문화 4장(박물관·축제·공연장·비엔날레) + 유물 유네스코(×1.75)·문예 후원(×1.25) + 비엔날레(×1.5)
    // 기반: 4장 × 2점(박물관) = 8
    // 배수 소스 [1.75, 1.5, 1.25] → 상위 2개 곱(1.75×1.5=2.625) + 나머지 가산(+0.25) = 2.875
    const s = withDeck(["museum", "festival", "concert_hall", "biennale"], {
      relics: ["unesco", "culture_patron"],
    });
    const r = computeSettlement(s, content);
    expect(r.settlementScore).toBe(23); // 8 × 2.875 = 23 (무제한 곱이면 8×3.28=26)
  });

  it("환경 임계 배수(settlementThresholdMult): 환경 5장 이상일 때만 전체 정산 ×1.3", () => {
    // 탄소중립(환경당 +4) 포함 환경 5장 → 기반 20점, 임계 충족 → ×1.3 = 26
    const met = withDeck(["eco_expo", "carbon_neutral", "small_park", "green_space", "stream_restoration"]);
    const rMet = computeSettlement(met, content);
    expect(rMet.settlementMult).toBeCloseTo(1.3, 5);
    expect(rMet.settlementScore).toBe(26);

    // 환경 4장(임계 미달) → 배수 없음: 기반 16점 그대로
    const short = withDeck(["eco_expo", "carbon_neutral", "small_park", "green_space"]);
    const rShort = computeSettlement(short, content);
    expect(rShort.settlementMult).toBe(1);
    expect(rShort.settlementScore).toBe(16);
  });

  it("정치 조건형 공약(settlementIfPlays): 이번 주기 낸 태그 수가 조건을 넘어야만 지급", () => {
    // 문화도시 공약: 이번 주기 문화 5장 이상 플레이 시 +30. 보유만으로는 발동하지 않는다.
    const idle = withDeck(["culture_pledge"], { cyclePlayedTagCounts: { culture: 4 } });
    expect(computeSettlement(idle, content).settlementScore).toBe(0);

    const kept = withDeck(["culture_pledge"], { cyclePlayedTagCounts: { culture: 5 } });
    expect(computeSettlement(kept, content).settlementScore).toBe(30);
  });

  it("복지 최소 보장(settlementFloor): 정산이 약할 때만 목표의 25%까지 보정", () => {
    // 기초생활 보장 단독: 정산 0 → 목표 70의 25% = 18점으로 보정
    const weak = withDeck(["basic_living"]);
    expect(computeSettlement(weak, content).settlementScore).toBe(18);

    // 정산이 이미 하한보다 크면 아무것도 하지 않는다 (개혁 법안 +25 > 18)
    const strong = withDeck(["basic_living", "reform_bill"]);
    expect(computeSettlement(strong, content).settlementScore).toBe(25);

    // 여러 장 겹쳐도 하한은 최댓값 하나만 — 2장이어도 18점 그대로
    const dup = withDeck(["basic_living", "basic_living"]);
    expect(computeSettlement(dup, content).settlementScore).toBe(18);
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
