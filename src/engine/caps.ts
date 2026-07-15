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
  marketStock: 5,
  /** 기본 시장 슬롯 */
  marketSlots: 10,
  /** 기본 유물 슬롯 */
  relicSlots: 3,
  /** 최대 유물 슬롯 */
  maxRelicSlots: 6,
  /** 손패 크기 */
  handSize: 6,
  /** 턴당 기본 예산 — 0: 예산은 재물 카드로만 번다(원래 설계) */
  baseBudget: 0,
  /** 턴당 기본 구매 수 */
  baseBuys: 2,
  /** 평가 1주기당 턴 수 (기존 5에서 늘려 예산 램프를 보완) */
  turnsPerCycle: 8,
  /** 정산 곱연산(과학) 총 배수 하드 캡 */
  settlementMultCap: 10,
  /** 복지 '목표 비례 안정 세입' 총합 상한(목표 대비). 다수 적재로 자동 통과 방지 */
  stableIncomeMaxPct: 0.4,
  /** 포퓰리즘으로 증가할 수 있는 평가 목표의 최대치 */
  targetBonusMaxPct: 80,
  /** 부패로 깎일 수 있는 최종 점수의 최대치 — 완전 봉쇄 대신 회복 여지를 남긴다. */
  corruptionPenaltyMaxPct: 80,
} as const;

/** 평가 차수별 목표 점수 */
export const EVAL_TARGETS = [70, 180, 420, 900, 1800];

/** 상점 새로고침 비용(기본/증가) */
export const REROLL_BASE = 20;
export const REROLL_STEP = 10;
