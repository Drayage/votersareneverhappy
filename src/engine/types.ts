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
  // 지속(트리거)
  | { kind: "onPlayTag"; tag: Tag; score: number }
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
  // 복지: 이번 평가 점수 하한 보장
  | { kind: "settlementFloor"; points: number }
  // 시너지/배수 (턴 한정)
  | { kind: "multiplyTagScore"; tag: Tag; mult: number }
  // 리스크 게이지
  | { kind: "pollution"; amount: number }
  | { kind: "corruption"; amount: number }
  | { kind: "populismDebuff"; amount: number }
  // 유물 전용 (passive 훅)
  | { kind: "passivePerTurn"; resource: "budget" | "draw" | "action" | "buy"; amount: number }
  | { kind: "costReduction"; cardType: CardType | "all"; amount: number }
  | { kind: "globalScoreMult"; mult: number }
  | { kind: "extraMarketSlot"; amount: number }
  | { kind: "removeScorePenalty" }
  | { kind: "triggerBonusTag"; tag: Tag; score: number }
  | { kind: "settlementMultTag"; tag: Tag; mult: number };

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
  /** 손에 들면 드로우를 막는 빈 카드(낡은 공약 등) */
  deadInHand?: boolean;
}

export type RelicRarity = "common" | "rare" | "legendary";

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

/** 특수 정책 (data/policies.json) — 런 전체에 적용되는 글로벌 효과 */
export interface PolicyDef {
  id: string;
  name: string;
  text: string;
  price: number;
  passive?: Effect[];
}

/** 덱 안의 카드 인스턴스 (같은 정의의 여러 장을 구분) */
export interface CardInstance {
  uid: number;
  defId: string;
}

export type Phase = "play" | "candidate" | "evaluation" | "shop" | "gameover" | "win";

/** 시장 한 칸 */
export interface MarketEntry {
  defId: string;
  stock: number;
}

export interface Gauges {
  pollution: number;
  corruption: number;
  populismDebuff: number; // 다음 주기 점수 감소율 누적 (%)
}

export interface GameState {
  seed: number;
  rngState: number;
  phase: Phase;

  evalIndex: number; // 0~4
  turn: number; // 1~5

  budget: number;
  cycleScore: number;
  fund: number;

  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  inPlay: CardInstance[];

  actions: number;
  buys: number;

  market: MarketEntry[];
  marketSlots: number; // 기본 10
  candidates: string[]; // 턴 종료 시 제시되는 후보 defId 3장

  relics: string[]; // relic defId
  relicSlots: number; // 기본 3
  policies: string[]; // policy defId

  gauges: Gauges;

  // 교육 누적 학습 레벨 (평가 주기 시작마다 보유 교육 카드 수만큼 증가, 복리)
  eduLevel: number;

  // 이번 턴 누적 트리거 횟수(캡 적용용)
  triggerCount: number;

  // 이번 턴 태그별 점수 배수 (relic passive + multiplyTagScore). 매 턴 리셋.
  turnMult: Record<string, number>;

  // 포퓰리즘: 이번 평가의 "목표 점수 증가율(%)" (지난 주기 누적분이 이월되어 발효)
  activeTargetBonusPct: number;

  // 상점 제시 목록 (evalIndex 사이)
  shopRelics: string[];
  shopPolicies: string[];
  rerollCost: number;

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
  fundGained: number;
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
