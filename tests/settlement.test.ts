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

  it("settlementTagCountMult: 과학 카드 수 × 4 (스마트시티)", () => {
    // smart_city([science,admin]) + lab([science]) + research_complex([science,education])
    const s = withDeck(["smart_city", "lab", "research_complex"]);
    const r = computeSettlement(s, content);
    // 과학 카드 3장. smart_city: 3×4=12. lab: settlementPerTag science 3장×2=6. 합 18
    expect(r.settlementScore).toBe(18);
  });

  it("settlementMultTag: 노벨상 유물이 과학 정산을 ×2", () => {
    const base = withDeck(["lab", "lab", "lab"]); // 과학 3장 → lab 3장 각각 perTag science 2 = 3장×2×3소스=18
    const baseR = computeSettlement(base, content);
    const withNobel = withDeck(["lab", "lab", "lab"], { relics: ["nobel"] });
    const nobelR = computeSettlement(withNobel, content);
    expect(nobelR.settlementScore).toBe(baseR.settlementScore * 2);
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
