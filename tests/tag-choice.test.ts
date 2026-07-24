import { describe, expect, it } from "vitest";
import { loadContent } from "../src/content/loader";
import {
  chooseCandidate,
  chooseCandidateTag,
  endTurn,
  newGame,
  rerollCandidates,
} from "../src/engine/game";
import type { GameState } from "../src/engine/types";

const content = loadContent();

/** 손패를 비우고 지정한 턴을 곧바로 끝낼 수 있게 만든 상태 */
function atTurnEnd(turn: number): GameState {
  const s = newGame(content, 1);
  return { ...s, turn, hand: [], actions: 0, buys: 0 };
}

describe("주기당 1·4번째 턴 — 태그 선택 후 후보 (docs/05 §1.4)", () => {
  it("1턴째를 끝내면 카드 후보 대신 태그 3개가 제시된다", () => {
    const s = endTurn(atTurnEnd(1), content);
    expect(s.phase).toBe("candidate");
    expect(s.tagChoices).toHaveLength(3);
    expect(s.candidates).toHaveLength(0);
  });

  it("4턴째를 끝내도 마찬가지다", () => {
    const s = endTurn(atTurnEnd(4), content);
    expect(s.tagChoices).toHaveLength(3);
    expect(s.candidates).toHaveLength(0);
  });

  it("2턴째(태그 선택 턴 아님)를 끝내면 평소처럼 카드 후보 5장이 바로 나온다", () => {
    const s = endTurn(atTurnEnd(2), content);
    expect(s.tagChoices).toHaveLength(0);
    expect(s.candidates).toHaveLength(5);
  });

  it("제시된 태그를 고르면 그 태그가 있는 카드로만 후보가 채워진다", () => {
    let s = endTurn(atTurnEnd(1), content);
    const tag = s.tagChoices[0];
    s = chooseCandidateTag(s, content, tag);
    expect(s.tagChoices).toHaveLength(0);
    expect(s.candidateTagFilter).toBe(tag);
    expect(s.candidates.length).toBeGreaterThan(0);
    for (const id of s.candidates) {
      expect(content.cards.get(id)!.tags).toContain(tag);
    }
  });

  it("제시되지 않은 태그는 거부한다", () => {
    const s = endTurn(atTurnEnd(1), content);
    expect(chooseCandidateTag(s, content, "corruption" as never)).toBe(s);
  });

  it("태그를 고르기 전에는 카드 후보를 선택할 수 없다(후보가 비어 있으므로)", () => {
    const s = endTurn(atTurnEnd(1), content);
    expect(chooseCandidate(s, content, "tax_collect")).toBe(s);
  });

  it("리롤권으로 태그 선택 단계 자체를 다시 뽑을 수 있다", () => {
    let s = { ...endTurn(atTurnEnd(1), content), rerollTickets: 1 };
    const before = s.tagChoices.slice();
    s = rerollCandidates(s, content);
    expect(s.rerollTickets).toBe(0);
    expect(s.tagChoices).toHaveLength(3);
    expect(s.candidates).toHaveLength(0);
    void before;
  });

  it("태그 선택 후에는 리롤이 같은 태그로 후보만 다시 뽑는다", () => {
    let s = endTurn(atTurnEnd(1), content);
    const tag = s.tagChoices[0];
    s = chooseCandidateTag(s, content, tag);
    s = { ...s, rerollTickets: 1 };
    s = rerollCandidates(s, content);
    expect(s.rerollTickets).toBe(0);
    expect(s.candidateTagFilter).toBe(tag);
    for (const id of s.candidates) {
      expect(content.cards.get(id)!.tags).toContain(tag);
    }
  });
});

describe("시장 교체 쿨다운 — 방금 뺀 카드는 2턴 후보에서 제외", () => {
  /** 시장을 꽉 채우고, 특정 카드를 후보로 강제한 candidate 상태를 만든다. */
  function fullMarketAt(turn: number): GameState {
    const s = newGame(content, 1);
    const market = content.cardList.filter((c) => c.tier !== "start").slice(0, s.marketSlots).map((c) => ({ defId: c.id, stock: 3 }));
    return { ...s, phase: "candidate", turn, tagChoices: [], market, marketSlots: s.marketSlots };
  }

  it("포화 시장에서 카드를 교체하면 내보낸 카드에 쿨다운이 걸리고, 이후 후보에 안 뜬다", () => {
    let s = fullMarketAt(2);
    const removeId = s.market[0].defId;
    // 후보로 시장에 없는 카드 하나를 강제
    const addId = content.cardList.find((c) => c.tier !== "start" && !s.market.some((m) => m.defId === c.id))!.id;
    s = { ...s, candidates: [addId] };
    s = chooseCandidate(s, content, addId, removeId);
    expect(s.marketCooldown[removeId]).toBeGreaterThan(0); // 쿨다운 설정됨

    // 다음 두 번의 후보 생성(2·3턴)에서 removeId가 안 나오는지 — endTurn으로 후보 생성
    // (2·4턴은 태그 선택 턴이라 3·5턴 종료로 일반 후보를 뽑는다)
    let cooldownSeenTurns = 0;
    for (let t = 3; t <= 4; t++) {
      const es = endTurn({ ...s, phase: "play", turn: t, hand: [], actions: 0, buys: 0 }, content);
      if (es.candidates.length > 0) {
        expect(es.candidates).not.toContain(removeId);
        cooldownSeenTurns++;
      }
      // 쿨다운은 endTurn마다 1씩 감소
      s = { ...s, marketCooldown: es.marketCooldown };
    }
    expect(cooldownSeenTurns).toBeGreaterThan(0);
  });

  it("쿨다운은 후보 세트를 뽑을 때마다 1씩 줄고 0이 되면 제거된다", () => {
    const s0 = { ...newGame(content, 1), marketCooldown: { some_card: 2 }, phase: "play" as const, turn: 3, hand: [], actions: 0, buys: 0 };
    let s = endTurn(s0, content);
    expect(s.marketCooldown.some_card).toBe(1);
    s = endTurn({ ...s, phase: "play", turn: 3, hand: [], actions: 0, buys: 0 }, content);
    expect(s.marketCooldown.some_card).toBeUndefined();
  });
});
