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

  it("과학은 정산 전체를 곱한다(settlementGlobalMultPerTag) — 단독이면 거의 0", () => {
    // 점수 기반이 없는 순수 과학 덱: 곱할 대상이 없어 0
    const pure = withDeck(["lab", "smart_city"]);
    expect(computeSettlement(pure, content).settlementScore).toBe(0);

    // 문화 기반(평면) + 과학(곱): 과학이 문화 점수를 증폭
    // 문화 카드 museum 1장 → 문화 1장×3 = 3점 기반.
    // 과학 카드 = lab+smart_city+university(science 태그 포함) → count(science)=3
    // 배수 = (1+0.08*3)*(1+0.18*3) = 1.24 * 1.54 = 1.9096 → 3 * 1.9096 ≈ 6 (반올림)
    const mixed = withDeck(["museum", "lab", "smart_city", "university"]);
    const r = computeSettlement(mixed, content);
    expect(r.settlementMult).toBeGreaterThan(1.5);
    expect(r.settlementScore).toBeGreaterThan(3); // 문화 기반 3점이 과학 배수로 증폭됨
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
    // welfare_net: 통과 목표의 20%. 1차 목표 50 → +10점 (과학 배수 미적용)
    const s = withDeck(["welfare_net"]); // evalIndex 0 → 목표 50
    expect(computeSettlement(s, content).settlementScore).toBe(10);
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
});
