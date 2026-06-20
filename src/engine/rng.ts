// 시드 기반 결정적 난수 (mulberry32) — 런 재현성/테스트용.
// 엔진은 GameState.rngState만 갱신하며 외부 Math.random을 쓰지 않는다.

export function nextRandom(state: number): { value: number; state: number } {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** [0, n) 정수 */
export function nextInt(state: number, n: number): { value: number; state: number } {
  const r = nextRandom(state);
  return { value: Math.floor(r.value * n), state: r.state };
}

/** 가중치 배열에서 인덱스 하나를 뽑는다. */
export function weightedPick(
  state: number,
  weights: number[]
): { index: number; state: number } {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return { index: 0, state };
  const r = nextRandom(state);
  let roll = r.value * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return { index: i, state: r.state };
  }
  return { index: weights.length - 1, state: r.state };
}

/** Fisher–Yates 셔플 (불변: 새 배열 반환) */
export function shuffle<T>(arr: T[], state: number): { result: T[]; state: number } {
  const result = arr.slice();
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextInt(s, i + 1);
    s = r.state;
    const j = r.value;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { result, state: s };
}
