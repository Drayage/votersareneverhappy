// 밸런스 안전장치 (docs/05_밸런스.md §5, §6 반영)
// 무한 콤보를 구조적으로 차단하는 하드 캡들.

export const CAPS = {
  /** 지속 점수 트리거 턴당 발동 상한 */
  triggerPerTurn: 6,
  /** 턴당 구매 상한 */
  buysPerTurn: 5,
  /** 턴당 액션 상한 */
  actionsPerTurn: 10,
  /** 동시 발효 가능한 곱연산(globalScoreMult) 유물 최대 개수 */
  maxScoreMultipliers: 2,
  /** 시장 더미 종류당 재고 */
  marketStock: 10,
  /** 기본 시장 슬롯 */
  marketSlots: 10,
  /** 기본 유물 슬롯 */
  relicSlots: 3,
  /** 최대 유물 슬롯 */
  maxRelicSlots: 6,
  /** 손패 크기 */
  handSize: 6,
  /** 턴당 기본 예산(기초 세수) — 5턴 단기 게임의 램프 보조 */
  baseBudget: 3,
  /** 턴당 기본 구매 수 — 5턴 단기 게임이라 도미니언(1)보다 높게 */
  baseBuys: 2,
} as const;

/** 평가 차수별 목표 점수 */
export const EVAL_TARGETS = [50, 150, 400, 1000, 2500];

/** 상점 새로고침 비용(기본/증가) */
export const REROLL_BASE = 20;
export const REROLL_STEP = 10;
