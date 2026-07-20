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
