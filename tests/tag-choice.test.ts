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

  it("2턴째(태그 선택 턴 아님)를 끝내면 평소처럼 카드 후보 3장이 바로 나온다", () => {
    const s = endTurn(atTurnEnd(2), content);
    expect(s.tagChoices).toHaveLength(0);
    expect(s.candidates).toHaveLength(3);
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
