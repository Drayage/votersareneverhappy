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
  /** 같은 태그의 정산 배수(settlementMultTag)가 곱연산으로 발효되는 최대 소스 수.
   *  상위 N개만 곱하고 나머지는 (mult-1) 가산 — 문화처럼 유물·카드 배수가 한 태그에
   *  몰려도 기하급수 폭주를 막는다(§5.2 C5와 같은 안전장치를 태그 배수에도 적용). */
  maxTagMultStack: 2,
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
  /** 정산 곱연산(과학) 총 배수 하드 캡 */
  settlementMultCap: 10,
  /** 복지 '목표 비례 안정 세입' 총합 상한(목표 대비). 다수 적재로 자동 통과 방지 */
  stableIncomeMaxPct: 0.2,
  /** 복지 '정산 최소 보장'(settlementFloor·playScoreFloor) 하한의 상한(목표 대비).
   *  두 효과(정산 축/플레이 축)가 공유하는 캡 — 여러 소스는 각 축에서 최댓값만 적용 */
  settlementFloorMaxPct: 0.3,
  /** 포퓰리즘으로 증가할 수 있는 평가 목표의 최대치 */
  targetBonusMaxPct: 80,
  /** 부패로 깎일 수 있는 최종 점수의 최대치 — 완전 봉쇄 대신 회복 여지를 남긴다. */
  corruptionPenaltyMaxPct: 80,
  /** 리롤권: 평가 통과 시 기본 2장 + 초과 달성률 25%마다 +1장, 이 값에서 상한 */
  rerollTicketsMaxPerCycle: 7,
  /** 카드(gainRerollTicket)로 얻을 수 있는 리롤권의 주기당 상한.
   *  평가 통과 보상(computeRerollTickets)과는 별도 — 클리어 보상 자체는 이 캡의 영향을 받지 않는다. */
  cardRerollTicketMaxPerCycle: 5,
} as const;

/** 평가 차수별 목표 점수 — 2차는 플레이형 덱(트리거/러시)의 엔진 완성 전이라 완만하게 */
export const EVAL_TARGETS = [70, 160, 420, 900, 1800];

/** 평가 차수별 주기당 턴 수 — 차수가 오를수록 턴이 줄어 압박이 커진다 */
export const CYCLE_TURNS = [9, 8, 7, 6, 5];

/** 무한 모드(5차 클리어 후) 주기당 턴 수 — 5턴씩 짧게 몰아친다. */
export const ENDLESS_TURNS = 5;

/** 평가 차수의 목표 점수. 정규 5차까지는 고정, 그 이후(무한 모드)는 배율 자체가 매 레벨 커진다(증가폭 기하급수). */
export function targetFor(evalIndex: number): number {
  if (evalIndex < EVAL_TARGETS.length) return EVAL_TARGETS[evalIndex];
  let t = EVAL_TARGETS[EVAL_TARGETS.length - 1];
  for (let i = EVAL_TARGETS.length; i <= evalIndex; i++) {
    // 무한 레벨이 깊어질수록 배율 자체가 커진다: 2.2 → 2.4 → 2.6 … (점수 증가폭이 기하급수적으로 폭발)
    const mult = 2.2 + 0.2 * (i - EVAL_TARGETS.length);
    t = Math.round(t * mult);
  }
  return t;
}

/** 평가 차수의 주기당 턴 수. 정규 구간은 CYCLE_TURNS, 무한 모드는 ENDLESS_TURNS(5턴). */
export function turnsFor(evalIndex: number): number {
  return evalIndex < CYCLE_TURNS.length ? CYCLE_TURNS[evalIndex] : ENDLESS_TURNS;
}
