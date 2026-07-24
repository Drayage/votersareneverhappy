// 「유권자가 너무해」 엔진 핵심 타입
// 엔진은 순수 TS — React/DOM 의존이 전혀 없어야 한다.

/** 15개 태그 (코드용 id). 한국어 라벨은 TAG_LABELS 참조. */
export type Tag =
  | "commerce" // 상업
  | "industry" // 산업
  | "science" // 과학
  | "residential" // 주거
  | "transport" // 교통
  | "admin" // 행정
  | "culture" // 문화
  | "tourism" // 관광
  | "education" // 교육
  | "welfare" // 복지
  | "environment" // 환경
  | "pr" // 홍보
  | "politics" // 정치
  | "corruption" // 부패
  | "populism"; // 포퓰리즘

export const TAG_LABELS: Record<Tag, string> = {
  commerce: "상업",
  industry: "산업",
  science: "과학",
  residential: "주거",
  transport: "교통",
  admin: "행정",
  culture: "문화",
  tourism: "관광",
  education: "교육",
  welfare: "복지",
  environment: "환경",
  pr: "홍보",
  politics: "정치",
  corruption: "부패",
  populism: "포퓰리즘",
};

export const ALL_TAGS = Object.keys(TAG_LABELS) as Tag[];

export type CardType = "treasure" | "action" | "score";
export type Tier = "start" | "B" | "A" | "S";

/**
 * 효과(Effect) — 데이터 주도 설계의 핵심.
 * 새 카드 추가 시 기존 kind를 재사용하면 JSON만 수정하면 된다.
 * 새 kind를 추가할 때만 effects.ts에 핸들러를 1개 더 등록한다.
 */
export type Effect =
  // 즉발/자원
  | { kind: "gainBudget"; amount: number }
  | { kind: "gainScore"; amount: number }
  | { kind: "gainDraw"; amount: number }
  | { kind: "gainAction"; amount: number }
  | { kind: "gainBuy"; amount: number }
  // 연계: 이 카드를 내기 전에 사용한 특정 태그 카드 수만큼 점수 획득
  | { kind: "comboScore"; tag: Tag; points: number; cap: number }
  // 리사이클: 이번 턴 낸 카드(최근 순) 최대 count장을 덱 맨 위로 되돌린다
  | { kind: "recycleInPlay"; count: number }
  // 연구지수 획득 (과학 태그 전용 누적 재화 — 턴/주기가 지나도 유지)
  | { kind: "gainResearch"; amount: number }
  // 리롤권 획득 (카드 후보/유물뽑기/정책뽑기 재추첨용 — 턴/주기가 지나도 유지)
  | { kind: "gainRerollTicket"; amount: number }
  // 남은 액션 1개당 +N예산 (액션 비축의 환금 — playCost 차감 후의 액션 수 기준)
  | { kind: "budgetPerAction"; amount: number }
  // 선택형(pendingChoice 보류): 손패에서 최대 count장을 버리고 그 수만큼 드로우 (필터)
  | { kind: "discardThenDraw"; count: number }
  // 선택형: 손패에서 최대 count장을 게임에서 완전히 폐기 (압축)
  | { kind: "trashFromHand"; count: number }
  // 선택형: 손패의 카드 1장을 골라 액션 소모 없이 두 번 발동 (왕좌의 방)
  | { kind: "playTwice" }
  // 선택형: 손패에서 최대 max장을 버리고(재드로우 없음), 버린 수만큼 +점수 (하이리스크 손패 소모)
  | { kind: "discardForScore"; max: number }
  // 선택형: 손패에서 최대 max장을 버리고(재드로우 없음), +예산.
  //   tag 미지정: 버린 수 × per(기본 1). tag 지정: 버린 것 중 그 태그 카드 수 × per (상업 "처분" 등).
  | { kind: "discardForBudget"; max: number; tag?: Tag; per?: number }
  // 선택형: 손패 카드 1장을 골라 완전히 폐기하고, 그 카드의 비용만큼 +점수
  | { kind: "trashForScore" }
  // 선택형: 손패 카드 1장을 골라 완전히 폐기하고, 그 카드의 비용만큼 드로우
  | { kind: "trashForDraw" }
  // 선택형: 손패 카드 1장을 골라 완전히 폐기하고, 그 카드의 비용만큼 +예산
  | { kind: "trashForBudget" }
  // 선택형(도박): 손패 카드 1장을 골라 덱 맨 위로 되돌린다. 그 카드가 tag를 가지면 즉시 +bonus점(아니면 0)
  | { kind: "topDeckGamble"; tag: Tag; bonus: number }
  // 조건부 즉발 점수: scope 미지정/"owned"면 덱 전체 보유 tag 카드, "hand"면 손패의 tag 카드(이 카드 포함)가
  // count장 이상이면 ifMet, 아니면 ifNot (하이리스크 조건형)
  | { kind: "conditionalScore"; tag: Tag; count: number; ifMet: number; ifNot: number; scope?: "owned" | "hand" }
  // 선택형: 손패 카드 1장을 골라 버리고(버린 더미로 감, 영구 제거 아님), 그 카드의 비용 × mult 만큼 점수
  | { kind: "discardForCostScore"; mult: number }
  // 즉발: 덱(뽑을 더미)에서 tag 카드를 최대 max장 찾아 손패로 가져오고, 가져온 수만큼 +예산 (주거 디그)
  | { kind: "digTagForBudget"; tag: Tag; max: number }
  // 낡은 공약(정크) 카드를 count장 버린 더미에 추가 — 강력한 효과의 대가로 덱을 희석시키는 저주형 페널티
  | { kind: "gainCurse"; count: number }
  // 정책 전용: 이번 주기 정산 점수 전체에 곱연산(다른 정산 배수들과 별개로 최종 settlementScore에 적용)
  | { kind: "settlementScoreMult"; mult: number }
  // 정책 전용 — 태그 자체는 effect에 없고 GameState.activePolicyTag(드래프트 때 미리 굴려진 태그)를 참조한다.
  | { kind: "activeTagScoreMult"; mult: number } // 그 태그 플레이 점수 ×mult (매 턴, multiplyTagScore와 동일 적용부)
  | { kind: "activeTagSettlementMult"; mult: number } // 그 태그 정산 점수 ×mult
  | { kind: "activeTagCostReduction"; amount: number } // 그 태그 카드 구매 비용 -amount
  | { kind: "activeTagMarketBoost"; weight: number } // 시장 진화 후보에서 그 태그가 자주 등장
  | { kind: "activeTagMarketBan" } // 시장 진화 후보에서 그 태그 카드가 아예 등장하지 않음
  // 정산: 이번 주기에 낸 카드 수 기반 (tag 지정 시 해당 태그 플레이만) — 회전 덱의 정산 경로
  | { kind: "settlementPerPlays"; tag?: Tag; points: number; cap: number }
  // passive: 주기 점수(플레이로 쌓은 점수)에만 곱해지는 배수 — 정산 배수(과학)와 대칭
  | { kind: "cycleScoreMult"; mult: number }
  // passive: 지속 트리거 턴당 발동 상한 확장
  | { kind: "extraTriggerCap"; amount: number }
  // 지속(트리거)
  | { kind: "onPlayTag"; tag: Tag; score: number }
  // 지속 트리거(예산형): 재정 외 tag 카드를 낼 때마다 +budget예산 (관광안내소 등). onPlayTag와 같은 소스당 상한 공유
  | { kind: "onPlayTagBudget"; tag: Tag; budget: number }
  // 지속 트리거: 어떤 카드든(재정 포함) 낼 때마다 그 카드의 태그 수 × points 점수 (정치 브리핑룸)
  | { kind: "onPlayAnyTagCount"; points: number }
  // 지속 트리거(턴 종료): 턴이 끝날 때 손패에 남은(못 낸) 카드 1장당 +points 점수 (복지 네트워크)
  | { kind: "onTurnEndHandScore"; points: number }
  | { kind: "onBuyScore"; score: number }
  // 정산
  | { kind: "settlementPerTag"; tag: Tag; points: number }
  | { kind: "settlementPerDeck"; points: number }
  | { kind: "settlementTagCountMult"; tag: Tag; mult: number }
  | { kind: "settlementFormula"; formula: "squareTags"; tags: Tag[]; divide: number; cap: number }
  // 과학: 정산 전체를 곱한다 (태그 카드 1장당 +perCard 배)
  | { kind: "settlementGlobalMultPerTag"; tag: Tag; perCard: number }
  // 교육: 누적 학습 레벨(eduLevel)을 점수로 (런 내내 복리)
  | { kind: "settlementEduLevel"; points: number }
  // 복지: 환경/부패 벌점을 오히려 점수로 전환
  | { kind: "penaltyToScore"; perPollution: number; perCorruption: number }
  // 복지: 통과 목표의 일정 비율만큼 안정적으로 점수 획득(과학 배수 미적용)
  | { kind: "settlementPctOfTarget"; pct: number }
  // 시너지/배수 (턴 한정)
  | { kind: "multiplyTagScore"; tag: Tag; mult: number }
  // 리스크 게이지
  | { kind: "pollution"; amount: number }
  | { kind: "corruption"; amount: number }
  | { kind: "populismDebuff"; amount: number }
  // 유물 전용 (passive 훅)
  | { kind: "passivePerTurn"; resource: "budget" | "draw" | "action" | "buy" | "research"; amount: number }
  | { kind: "costReduction"; cardType: CardType | "all"; amount: number }
  | { kind: "globalScoreMult"; mult: number }
  | { kind: "extraMarketSlot"; amount: number }
  | { kind: "removeScorePenalty" }
  | { kind: "triggerBonusTag"; tag: Tag; score: number }
  | { kind: "settlementMultTag"; tag: Tag; mult: number }
  // 임계 배수: 해당 태그 보유 수가 count 이상이면 전체 정산 ×mult (docs/02 환경 로드맵)
  | { kind: "settlementThresholdMult"; tag: Tag; count: number; mult: number }
  // 조건형 공약: 이번 주기 낸 해당 태그 카드가 count장 이상이면 +points (docs/02 정치 로드맵)
  | { kind: "settlementIfPlays"; tag: Tag; count: number; points: number }
  // 복지 최소 보장: 정산 점수가 통과 목표의 pct 미만이면 pct까지 끌어올린다.
  // 여러 소스는 합산이 아니라 최댓값 하나만 적용(하한은 겹쳐도 커지지 않는다).
  | { kind: "settlementFloor"; pct: number }
  // 복지 최소 보장(플레이 축): 이번 주기 카드 플레이로 얻은 점수(baseCycleScore)가
  // 통과 목표의 pct 미만이면 pct까지 끌어올린다. settlementFloor와 대상만 다른 자매 효과.
  | { kind: "playScoreFloor"; pct: number };

/** 선택형 효과의 보류 상태 — 대상 지정이 필요한 onPlay 효과가 여기 담겼다가 resolveChoice로 해소된다. */
export type PendingChoice =
  | { kind: "discardThenDraw"; max: number }
  | { kind: "trashFromHand"; max: number }
  | { kind: "playTwice"; max: number }
  | { kind: "discardForScore"; max: number }
  | { kind: "discardForBudget"; max: number; tag?: Tag; per?: number }
  | { kind: "trashForScore"; max: number }
  | { kind: "trashForDraw"; max: number }
  | { kind: "trashForBudget"; max: number }
  | { kind: "discardForCostScore"; max: number; mult: number }
  | { kind: "topDeckGamble"; max: number; tag: Tag; bonus: number };

/** 카드 정의 (data/cards.json 한 항목) */
export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  tags: Tag[];
  cost: number;
  tier: Tier;
  text: string;
  onPlay?: Effect[]; // 사용 시 1회
  trigger?: Effect[]; // 지속 트리거(다른 카드 사용/구매 시)
  settlement?: Effect[]; // 평가 시 정산
  /** 플레이 코스트(액션 풀에서 차감). 미지정 시 타입 기본값: 재물 0 / 액션 1 / 점수 0 */
  playCost?: number;
  /** 손에 들면 드로우를 막는 빈 카드(낡은 공약 등) */
  deadInHand?: boolean;
  // (지속 N턴): 낸 뒤 N턴 동안 플레이 영역에 유지된다(트리거가 다음 턴에도 발동).
  persistTurns?: number;
  // (지속) 카드가 플레이 영역에 남아 있는 동안 매 턴 시작 시 발동하는 효과 (Seaside 지속형).
  // 자원류(gainDraw/gainBudget/gainAction/gainBuy/gainScore/gainResearch)만 지원.
  duration?: Effect[];
  // 연구 비용: 지정 시 이 카드는 예산 대신 연구지수로 구매한다 (cost는 0으로 둔다).
  costResearch?: number;
}

export type RelicRarity = "bronze" | "silver" | "gold" | "diamond";

/** 유물 정의 (data/relics.json 한 항목) */
export interface RelicDef {
  id: string;
  name: string;
  rarity: RelicRarity;
  role: string;
  text: string;
  price: number;
  /** 항시 적용되는 패시브 효과 */
  passive?: Effect[];
  /** 카드처럼 트리거/정산에 끼어드는 효과 */
  trigger?: Effect[];
  settlement?: Effect[];
}

/** 특수 정책 (data/policies.json) — 뽑은 "다음 한 주기 동안만" 적용되는 소소한 임시 효과 (유물과 달리 영구 아님) */
export interface PolicyDef {
  id: string;
  name: string;
  text: string;
  price: number;
  passive?: Effect[];
  /** 정산 시 적용되는 효과 (유물과 동일하게 정산 소스로 집계) */
  settlement?: Effect[];
  /** 태그형 정책의 대상 태그를 드래프트 때 어떻게 굴릴지:
   *  "ownedTag" = 내가 가진 태그 중 하나, "unownedTag" = 내가 안 가진 태그 중 하나.
   *  굴려진 태그는 GameState.rewardPolicyChoiceTags에 저장돼 후보 카드에 표시되고,
   *  픽 시 pendingPolicyTag→activePolicyTag로 편입되어 activeTag* 효과가 참조한다. */
  target?: "ownedTag" | "unownedTag";
}

/** 덱 안의 카드 인스턴스 (같은 정의의 여러 장을 구분) */
export interface CardInstance {
  uid: number;
  defId: string;
  // (지속) 카드가 플레이 영역에 남아 있을 잔여 턴 수. 플레이 영역을 떠나면 제거된다.
  persistLeft?: number;
}

export type Phase = "play" | "candidate" | "evaluation" | "reward" | "gameover" | "win";

/** 시장 한 칸 */
export interface MarketEntry {
  defId: string;
  stock: number;
}

export interface Gauges {
  pollution: number;
  corruption: number;
  populismDebuff: number; // 다음 평가 목표 증가율 누적 (%)
}

export interface GameState {
  seed: number;
  rngState: number;
  phase: Phase;

  evalIndex: number; // 0~4
  turn: number; // 1~5

  budget: number;
  cycleScore: number;
  // 연구지수: 과학 카드가 생산하는 누적 재화. 턴/주기가 지나도 유지되며 연구 비용 카드 구매에 쓴다.
  research: number;
  // 리롤권: 평가 통과 시 달성률에 비례해 지급(점수 높을수록 많음). 턴/주기가 지나도 유지되며
  // 카드 후보(candidate)·유물뽑기·정책뽑기의 3개 후보를 다시 뽑는 데 쓴다.
  rerollTickets: number;

  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  inPlay: CardInstance[];

  actions: number;
  buys: number;

  market: MarketEntry[];
  marketSlots: number; // 기본 10
  candidates: string[]; // 턴 종료 시 제시되는 후보 defId 5장

  // 주기당 1·4번째 턴 종료 시: 카드 후보 대신 태그 3개를 먼저 제시(택1). 비어있으면 평소대로 후보만 표시.
  tagChoices: Tag[];
  // tagChoices에서 고른 태그 — candidates가 해당 태그 카드로만 채워졌음을 표시(리롤 시에도 유지).
  candidateTagFilter: Tag | null;

  // 시장에서 방금 내보낸(교체된) 카드의 재등장 쿨다운 — defId → 남은 후보 세트 수.
  // 이 값이 0보다 크면 그 카드는 시장 진화 후보에 뜨지 않는다(방금 뺀 카드가 바로 다시 나오는 것 방지).
  marketCooldown: Record<string, number>;

  relics: string[]; // relic defId — 영구 보유

  // 정책: 유물과 달리 영구가 아니라 "뽑은 다음 한 주기 동안만" 적용된다.
  // policies는 항상 0~1개(현재 주기에 활성화된 정책)만 담기고, 주기 시작마다 교체된다.
  policies: string[];
  // 보상 단계에서 정책을 고르면 여기에 대기하다가, 다음 주기 시작(startCycle) 때 policies로 교체 편입된다.
  pendingPolicy: string | null;
  // 지금까지 활성화됐던 정책 id 기록(클리어 화면 표시용). 게임플레이 효과에는 관여하지 않는다.
  policyHistory: string[];
  // 태그형 정책을 고르면 드래프트 때 굴려진 태그가 여기 대기 — pendingPolicy와 함께 다음 주기에 activePolicyTag로 편입.
  pendingPolicyTag: Tag | null;
  // 현재 주기에 활성화된 태그형 정책의 태그(없으면 null). market.ts/game.ts/settlement.ts/effects.ts가
  // 특정 정책 id와 함께 참조해 "그 태그"에 적용할 효과를 계산한다.
  activePolicyTag: Tag | null;

  gauges: Gauges;

  // 교육 누적 학습 레벨 (평가 주기 시작마다 보유 교육 카드 수만큼 증가, 복리)
  eduLevel: number;

  // 이번 턴 트리거원(소스)별 발동 횟수 — 소스당 상한 적용용. 매 턴 리셋.
  triggerFires: Record<string, number>;

  // 이번 턴 태그별 점수 배수 (relic passive + multiplyTagScore). 매 턴 리셋.
  turnMult: Record<string, number>;

  // 이번 턴 이미 사용한 카드의 태그 수. comboScore와 UI의 연계 미리보기에 사용.
  playedTagCounts: Record<string, number>;

  // 이번 평가 주기 동안 낸 카드 총수/태그별 수. settlementPerPlays(회전 정산)에 사용.
  cyclePlays: number;
  cyclePlayedTagCounts: Record<string, number>;

  // 이번 주기에 카드(gainRerollTicket)로 획득한 리롤권 수 — CAPS.cardRerollTicketMaxPerCycle 상한 추적용.
  // 평가 통과 보상(리롤권)은 이 카운터와 무관하다.
  cycleCardRerollTickets: number;

  // 선택형 효과의 보류 상태. 설정되어 있는 동안 다른 행동이 막히고, resolveChoice 로만 해소된다.
  pendingChoice: PendingChoice | null;

  // 포퓰리즘: 이번 평가의 "목표 점수 증가율(%)" (지난 주기 누적분이 이월되어 발효)
  activeTargetBonusPct: number;

  // 평가 통과 후 보상 단계 (evalIndex 사이) — 유물뽑기 → 정책뽑기 → 카드 정비 → 다음 주기.
  // 각 배열이 비면 그 단계는 완료된 것으로 간주(순서대로 소비).
  rewardRelicChoices: string[]; // 3개 중 1택
  rewardPolicyChoices: string[]; // 3개 중 1택
  // rewardPolicyChoices와 정렬된 배열 — 각 후보의 미리 굴려진 대상 태그(태그형 정책만, 기본형은 null).
  rewardPolicyChoiceTags: (Tag | null)[];
  rewardRemovalDone: boolean; // 카드 정비(선택) 단계 완료 여부

  // 무한 모드: 5차 클리어 후 계속 진행 중이면 true. 이 동안엔 평가를 통과해도 "win"이 아니라
  // 곧바로 보상 → 다음 주기로 이어지며, 목표 점수는 매 레벨 기하급수로 폭증한다(targetFor).
  endless: boolean;

  // 직전 평가 결과 (EvaluationScreen 표시용)
  lastSettlement: SettlementResult | null;

  uidCounter: number;

  log: string[];
}

/** 정산/평가 결과 내역 */
export interface SettlementResult {
  evalIndex: number;
  target: number;
  baseCycleScore: number; // 정산 전 누적(즉발/지속)
  settlementScore: number; // 정산 가산분(과학 배수 적용 후)
  settlementMult: number; // 과학 정산 배수
  pollutionPenalty: number; // 음수
  globalMult: number; // 곱연산 유물 결과 배수
  targetBonusPct: number; // 포퓰리즘: 목표 점수 증가율(%)
  corruptionPct: number; // 부패: 점수 감산율(%)
  baseTarget: number; // 포퓰리즘 적용 전 기본 목표
  finalScore: number;
  passed: boolean;
  perTag: Record<string, number>; // 태그별 정산 기여
}

/** 모든 콘텐츠를 담은 컨테이너 (loader가 생성) */
export interface Content {
  cards: Map<string, CardDef>;
  relics: Map<string, RelicDef>;
  policies: Map<string, PolicyDef>;
  cardList: CardDef[];
  relicList: RelicDef[];
  policyList: PolicyDef[];
}
