import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/loader";
import * as G from "../src/engine/game";
import { effectiveCost } from "../src/engine/effects";
import type { Content, GameState } from "../src/engine/types";

const content = loadContent();

/** 한 턴을 그리디로 진행: 가능한 카드 모두 사용 → 가장 비싼 카드 구매. */
function greedyTurn(s0: GameState, content: Content): GameState {
  let s = s0;
  // 사용 가능한 카드 모두 사용 (드로우/액션이 늘어나면 재스캔)
  for (let guard = 0; guard < 100; guard++) {
    let acted = false;
    for (const card of s.hand) {
      const def = content.cards.get(card.defId)!;
      if (def.deadInHand) continue;
      if (def.type === "action" && s.actions <= 0) continue;
      const ns = G.playCard(s, content, card.uid);
      if (ns !== s) {
        s = ns;
        acted = true;
        break;
      }
    }
    if (!acted) break;
  }
  // 구매: 가치 휴리스틱 (초반 경제 우선, 이후 점수 우선)
  for (let guard = 0; guard < 20; guard++) {
    if (s.buys <= 0) break;
    const affordable = s.market
      .filter((m) => m.stock > 0)
      .map((m) => {
        const def = content.cards.get(m.defId)!;
        return { m, def, cost: effectiveCost(s, content, def) };
      })
      .filter((x) => (x.def.costResearch ? s.research >= x.def.costResearch : x.cost <= s.budget));
    if (affordable.length === 0) break;
    const sum = (def: (typeof affordable)[number]["def"], k: string) =>
      (def.onPlay ?? []).reduce((a, e) => a + ((e as { kind: string; amount?: number }).kind === k ? (e as { amount: number }).amount : 0), 0);
    const value = (def: (typeof affordable)[number]["def"]) => {
      const score = sum(def, "gainScore");
      const budget = sum(def, "gainBudget");
      const draw = sum(def, "gainDraw");
      const act = sum(def, "gainAction");
      const buy = sum(def, "gainBuy");
      const combo = (def.onPlay ?? []).reduce(
        (a, e) => a + (e.kind === "comboScore" ? Math.min(e.cap, e.points * 2) : 0),
        0
      );
      const trig = def.trigger?.length ? 4 : 0;
      const settle = def.settlement?.length ? 3 : 0;
      const econW = s.turn <= 2 ? 2.5 : 1.5;
      return score * 3 + combo * 2 + budget * econW + buy * 5 + draw * 2 + act * 1.5 + trig + settle;
    };
    affordable.sort((a, b) => value(b.def) - value(a.def));
    const ns = G.buyCard(s, content, affordable[0].m.defId);
    if (ns === s) break;
    s = ns;
  }
  return s;
}

/** 후보 선택: 즉발 점수/저가 점수 카드를 우선 추가, 시장 포화 시 가장 싼 카드 제거. */
function chooseGreedy(s: GameState, content: Content): GameState {
  const candValue = (id: string) => {
    const d = content.cards.get(id)!;
    const imm = (d.onPlay ?? []).reduce((a, e) => a + (e.kind === "gainScore" ? e.amount : 0), 0);
    const settle = d.settlement?.length ? 4 : 0;
    const trig = d.trigger?.length ? 4 : 0;
    const econ = (d.onPlay ?? []).reduce((a, e) => a + (e.kind === "gainBudget" ? e.amount : 0), 0);
    const combo = (d.onPlay ?? []).reduce(
      (a, e) => a + (e.kind === "comboScore" ? Math.min(e.cap, e.points * 2) : 0),
      0
    );
    // 저렴할수록 가산점(초반에 바로 살 수 있어야 함)
    return imm * 2 + combo * 1.5 + settle + trig + econ * 1.5 + Math.max(0, 6 - d.cost);
  };
  const cands = s.candidates.map((id) => ({ id, v: candValue(id) }));
  cands.sort((a, b) => b.v - a.v);
  const addId = cands[0].id;
  if (s.market.length >= s.marketSlots && !s.market.some((m) => m.defId === addId)) {
    const removeId = s.market
      .map((m) => ({ id: m.defId, cost: content.cards.get(m.defId)!.cost }))
      .sort((a, b) => a.cost - b.cost)[0].id;
    return G.chooseCandidate(s, content, addId, removeId);
  }
  return G.chooseCandidate(s, content, addId);
}

/** 한 평가 주기(8턴 + 후보) 자동진행 후, evaluation 단계의 state 반환. */
function autoCycle(s0: GameState, content: Content): GameState {
  let s = s0;
  for (let guard = 0; guard < 50; guard++) {
    if (s.phase === "play") {
      s = greedyTurn(s, content);
      s = G.endTurn(s, content);
    } else if (s.phase === "candidate") {
      s = chooseGreedy(s, content);
    } else if (s.phase === "evaluation") {
      break;
    } else {
      break;
    }
  }
  return s;
}

describe("그리디 자동플레이 시뮬레이션", () => {
  // 그리디 봇은 룩어헤드가 없는 "하수" 기준선이다.
  // 목표 70 대비 봇이 평균적으로 목표에 도달하면(=평균 통과), 유능한 인간 플레이는
  // 여유롭게 통과한다는 의미 — 즉 1차 난이도가 "초보도 통과 가능" 구간에 있음을 검증.
  it("1차 평가: 그리디 봇이 목표(70)를 안정적으로 넘되 과도하게 폭주하지 않는다", () => {
    const seeds = [1, 2, 3, 7, 42];
    const scores: number[] = [];
    for (const seed of seeds) {
      let s = G.newGame(content, seed);
      s = autoCycle(s, content);
      expect(s.phase).toBe("evaluation");
      scores.push(s.lastSettlement!.finalScore);
    }
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passed = scores.filter((x) => x >= 50).length;
    console.log("1차 finalScores:", scores, "avg:", avg.toFixed(1), "passed:", passed);
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(65);
    expect(avg).toBeGreaterThanOrEqual(80);
    expect(avg).toBeLessThan(130); // 첫 평가부터 점수가 지나치게 폭주하지 않음
    expect(passed).toBeGreaterThanOrEqual(4);
  });

  it("전체 런이 예외 없이 종료되고(승/패), 무한 루프에 빠지지 않는다", () => {
    let s = G.newGame(content, 1);
    let reachedShop = false;
    for (let cycle = 0; cycle < 6; cycle++) {
      s = autoCycle(s, content);
      expect(s.phase).toBe("evaluation");
      const passed = s.lastSettlement!.passed;
      console.log(`  ${cycle + 1}차: ${s.lastSettlement!.finalScore} / 목표 ${s.lastSettlement!.target} → ${passed ? "통과" : "실패"}`);
      s = G.confirmEvaluation(s, content);
      if (!passed) {
        expect(s.phase).toBe("gameover");
        break;
      }
      if (s.phase === "win") break;
      // shop: 가장 비싼 살 수 있는 유물 1개 구매 후 진행
      if (s.phase === "shop") {
        reachedShop = true;
        for (const id of [...s.shopRelics]) {
          const ns = G.buyRelic(s, content, id);
          if (ns !== s) {
            s = ns;
            break;
          }
        }
        s = G.nextCycle(s, content);
      }
    }
    console.log("전체 런 결과:", s.phase, "도달 평가:", s.evalIndex + 1, "차");
    expect(["win", "gameover"]).toContain(s.phase);
    expect(reachedShop).toBe(true); // 최소 상점·다음주기 경로를 실제로 거친다
  });
});
