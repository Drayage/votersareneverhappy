// 밸런스 안전장치 (docs/05_밸런스.md §5, §6 반영)
// 무한 콤보를 구조적으로 차단하는 하드 캡들.

export const CAPS = {
  /** 지속 점수 트리거의 "소스(트리거 카드/유물/정책)당" 턴 발동 상한.
   *  턴당 공유 상한(구 6회)은 전문 덱을 벌주고 잡식 덱을 방치해서 소스당으로 전환 —
   *  소스를 모을수록 총 여지가 커지고(전문화 보상), 곁다리 트리거는 여전히 억제된다.
   *  트리거의 방향성은 "다타수·저화력": 상한은 넉넉히, 낱발 점수는 낮게. */
  triggerPerSource: 6,
  /** 턴당 구매 상한 */
  buysPerTurn: 5,
  /** 턴당 액션 상한 */
  actionsPerTurn: 10,
  /** 동시 발효 가능한 곱연산(globalScoreMult) 유물 최대 개수 */
  maxScoreMultipliers: 2,
  /** 시장 더미 종류당 재고 */
  marketStock: 3,
  /** 기본 시장 슬롯 */
  marketSlots: 10,
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
  stableIncomeMaxPct: 0.2,
  /** 포퓰리즘으로 증가할 수 있는 평가 목표의 최대치 */
  targetBonusMaxPct: 80,
  /** 부패로 깎일 수 있는 최종 점수의 최대치 — 완전 봉쇄 대신 회복 여지를 남긴다. */
  corruptionPenaltyMaxPct: 80,
  /** 리롤권: 평가 통과 시 기본 1장 + 초과 달성률 25%마다 +1장, 이 값에서 상한 */
  rerollTicketsMaxPerCycle: 6,
} as const;

/** 평가 차수별 목표 점수 — 2차는 플레이형 덱(트리거/러시)의 엔진 완성 전이라 완만하게 */
export const EVAL_TARGETS = [70, 160, 420, 900, 1800];
