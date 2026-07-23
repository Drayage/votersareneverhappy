// 도감(발견 기록) & 게임 기록의 localStorage 영속화.
// 게임 상태(GameState)와 달리 이 데이터는 런을 넘어 누적된다(브라우저 로컬 저장).

const DISCOVERED_KEY = "vnh.discovered.v1";
const RECORDS_KEY = "vnh.records.v1";
const RECORDS_MAX = 50; // 최근 N판만 보관

/** 도감에 채워진(발견한) 콘텐츠 id 집합. 카드/유물/정책을 종류별로 나눠 저장. */
export interface Discovered {
  cards: string[];
  relics: string[];
  policies: string[];
}

/** 한 판의 결과 기록 (승/패, 도달 차수, 무한 레벨 등). */
export interface GameRecord {
  date: number; // epoch ms
  seed: number;
  won: boolean; // 정규 5차 클리어 여부
  evalReached: number; // 도달한 평가 차수(1-based)
  endlessLevel: number; // 무한 모드에서 넘긴 추가 레벨 수(0이면 무한 모드 미진입)
  finalScore: number;
  relics: number; // 보유 유물 수
  policies: number; // 시행한 정책 수(누적)
}

function safeGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* 저장 실패(프라이빗 모드 등)는 조용히 무시 — 도감/기록은 부가 기능 */
  }
}

export function loadDiscovered(): Discovered {
  const raw = safeGet(DISCOVERED_KEY);
  if (!raw) return { cards: [], relics: [], policies: [] };
  try {
    const p = JSON.parse(raw) as Partial<Discovered>;
    return {
      cards: Array.isArray(p.cards) ? p.cards : [],
      relics: Array.isArray(p.relics) ? p.relics : [],
      policies: Array.isArray(p.policies) ? p.policies : [],
    };
  } catch {
    return { cards: [], relics: [], policies: [] };
  }
}

export function saveDiscovered(d: Discovered): void {
  safeSet(DISCOVERED_KEY, JSON.stringify(d));
}

export function loadRecords(): GameRecord[] {
  const raw = safeGet(RECORDS_KEY);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as GameRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveRecords(records: GameRecord[]): void {
  safeSet(RECORDS_KEY, JSON.stringify(records.slice(0, RECORDS_MAX)));
}
