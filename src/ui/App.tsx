import { useState } from "react";
import { useGame } from "../store/gameStore";
import { CardView } from "./CardView";
import type { CardDef, Content, GameState } from "../engine/types";
import { effectiveCost } from "../engine/effects";
import { CAPS } from "../engine/caps";
import { ownedCards, computeSettlement } from "../engine/settlement";

function def(content: Content, id: string): CardDef {
  return content.cards.get(id)!;
}

function ResourceBar({ state, content }: { state: GameState; content: Content }) {
  // 지금 평가가 도래하면 정산으로 얻을 예상 추가 점수(과학 배수·환경 벌점 반영)
  const proj = computeSettlement(state, content);
  const settleDelta = proj.settlementScore + proj.pollutionPenalty;
  return (
    <div className="bar">
      <div className="stat"><span className="k">평가</span><span className="v">{state.evalIndex + 1} / 5</span></div>
      <div className="stat"><span className="k">턴</span><span className="v">{state.turn} / {CAPS.turnsPerCycle}</span></div>
      <div className="stat"><span className="k">예산</span><span className="v accent">{state.budget}</span></div>
      <div className="stat"><span className="k">발전 점수</span><span className="v good">{state.cycleScore}</span></div>
      <div className="stat">
        <span className="k">정산 예상(환경벌점 포함)</span>
        <span className="v good">{settleDelta >= 0 ? "+" : ""}{settleDelta}{proj.settlementMult !== 1 ? ` (×${proj.settlementMult.toFixed(2)})` : ""}</span>
      </div>
      {proj.corruptionPct > 0 && (
        <div className="stat"><span className="k">부패 감산</span><span className="v" style={{ color: "var(--bad)" }}>-{proj.corruptionPct}%</span></div>
      )}
      <div className="stat">
        <span className="k">예상 최종 / 목표{proj.targetBonusPct > 0 ? `(포퓰+${proj.targetBonusPct}%)` : ""}</span>
        <span className={`v ${proj.finalScore >= proj.target ? "good" : ""}`}>{proj.finalScore} / {proj.target}</span>
      </div>
      <div className="stat"><span className="k">액션</span><span className="v">{state.actions}</span></div>
      <div className="stat"><span className="k">구매</span><span className="v">{state.buys}</span></div>
      <div className="stat"><span className="k">뽑을 덱</span><span className="v">{state.deck.length}</span></div>
      <div className="stat"><span className="k">버림</span><span className="v">{state.discard.length}</span></div>
      <div className="spacer" />
      <div className="stat"><span className="k">자금(상점)</span><span className="v accent">{state.fund}</span></div>
    </div>
  );
}

function GaugeBar({ state }: { state: GameState }) {
  const g = state.gauges;
  return (
    <div className="gauges">
      {g.pollution > 0 && <span className="gauge bad">환경 벌점 {g.pollution} (정산 -{g.pollution * 2}점)</span>}
      {g.corruption > 0 && <span className="gauge bad">부패 {g.corruption} (평가 -{Math.floor(g.corruption / 5) * 10}%)</span>}
      {g.populismDebuff > 0 && <span className="gauge bad">다음 평가 목표 +{g.populismDebuff}%</span>}
      {state.activeTargetBonusPct > 0 && <span className="gauge bad">이번 평가 목표 +{state.activeTargetBonusPct}%</span>}
    </div>
  );
}

function RelicBar({ state, content }: { state: GameState; content: Content }) {
  if (state.relics.length === 0 && state.policies.length === 0) return null;
  return (
    <div className="relicbar">
      {state.relics.map((id) => {
        const r = content.relics.get(id)!;
        return (
          <div key={id} className={`relic ${r.rarity}`} title={r.text}>
            <div className="rn">{r.name}</div>
            <div className="rt">{r.text}</div>
          </div>
        );
      })}
      {state.policies.map((id) => {
        const p = content.policies.get(id)!;
        return (
          <div key={id} className="relic" title={p.text}>
            <div className="rn">{p.name}</div>
            <div className="rt">{p.text}</div>
          </div>
        );
      })}
    </div>
  );
}

function PlayPhase() {
  const { state, content, play, playTreasures, buy, endTurn } = useGame();
  const hasTreasure = state.hand.some((c) => def(content, c.defId).type === "treasure");
  return (
    <>
      <div className="cols">
        <div>
          <div className="panel">
            <h2>손패 ({state.hand.length})</h2>
            <div className="cardrow">
              {state.hand.map((ci) => {
                const d = def(content, ci.defId);
                const isAction = d.type === "action";
                const dead = d.deadInHand;
                return (
                  <CardView
                    key={ci.uid}
                    card={d}
                    onClick={() => play(ci.uid)}
                    disabled={dead || (isAction && state.actions <= 0)}
                    badge={dead ? "빈 카드" : isAction ? "액션" : "사용"}
                  />
                );
              })}
              {state.hand.length === 0 && <span className="muted">손패가 비었습니다.</span>}
            </div>
            <div className="btns">
              <button className="btn" disabled={!hasTreasure} onClick={playTreasures}>
                재물 모두 사용
              </button>
              <button className="btn ghost" onClick={endTurn}>
                턴 종료 →
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>사용한 카드 ({state.inPlay.length})</h2>
            <div className="cardrow">
              {state.inPlay.map((ci) => (
                <CardView key={ci.uid} card={def(content, ci.defId)} />
              ))}
              {state.inPlay.length === 0 && <span className="muted">아직 없음</span>}
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>시장 ({state.market.length} / {state.marketSlots})</h2>
          <div className="cardrow">
            {state.market.map((m) => {
              const d = def(content, m.defId);
              const cost = effectiveCost(state, content, d);
              const can = state.buys > 0 && state.budget >= cost && m.stock > 0;
              return (
                <CardView
                  key={m.defId}
                  card={d}
                  cost={cost}
                  onClick={() => buy(m.defId)}
                  disabled={!can}
                  badge={`재고 ${m.stock}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function CandidateModal() {
  const { state, content, chooseCandidate } = useGame();
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const full = state.market.length >= state.marketSlots;

  const commit = (addId: string, removeId?: string) => {
    chooseCandidate(addId, removeId);
    setPendingAdd(null);
  };

  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>시장 진화 — 후보 3장 중 1장을 추가</h2>
        <p className="muted">
          {full
            ? "시장이 가득 찼습니다(10칸). 추가할 카드를 고른 뒤, 제거할 기존 카드를 선택하세요."
            : "한 장을 골라 시장에 추가합니다. (거부 불가)"}
        </p>
        <div className="cardrow">
          {state.candidates.map((id) => (
            <CardView
              key={id}
              card={def(content, id)}
              cost={effectiveCost(state, content, def(content, id))}
              highlight={pendingAdd === id}
              onClick={() => (full ? setPendingAdd(id) : commit(id))}
              badge={pendingAdd === id ? "추가 예정" : undefined}
            />
          ))}
        </div>

        {full && pendingAdd && (
          <>
            <h2 style={{ marginTop: 16 }}>제거할 기존 시장 카드 선택</h2>
            <div className="cardrow">
              {state.market.map((m) => (
                <CardView
                  key={m.defId}
                  card={def(content, m.defId)}
                  cost={effectiveCost(state, content, def(content, m.defId))}
                  onClick={() => commit(pendingAdd, m.defId)}
                  badge="제거"
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EvaluationModal() {
  const { state, confirmEvaluation } = useGame();
  const r = state.lastSettlement!;
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>{state.evalIndex + 1}차 평가</h2>
        <table className="eval">
          <tbody>
            <tr><td>즉발·지속 누적</td><td>{r.baseCycleScore}</td></tr>
            {r.settlementMult !== 1 && <tr><td>정산 배수(과학)</td><td>×{r.settlementMult.toFixed(2)}</td></tr>}
            <tr><td>정산 점수{r.settlementMult !== 1 ? " (배수 적용)" : ""}</td><td>{r.settlementScore}</td></tr>
            {r.pollutionPenalty !== 0 && <tr><td>환경 벌점</td><td className="fail">{r.pollutionPenalty}</td></tr>}
            {r.globalMult !== 1 && <tr><td>점수 배수(유물)</td><td>×{r.globalMult.toFixed(2)}</td></tr>}
            {r.corruptionPct > 0 && <tr><td>부패 페널티</td><td className="fail">-{r.corruptionPct}%</td></tr>}
            <tr><td><b>최종 점수</b></td><td className="big">{r.finalScore}</td></tr>
            <tr><td>기본 목표</td><td>{r.baseTarget}</td></tr>
            {r.targetBonusPct > 0 && <tr><td>포퓰리즘 목표 증가</td><td className="fail">+{r.targetBonusPct}%</td></tr>}
            <tr><td><b>통과 목표</b></td><td><b>{r.target}</b></td></tr>
          </tbody>
        </table>
        <div className="center">
          {r.passed ? (
            <p className="pass big">통과! 자금 +{r.fundGained}</p>
          ) : (
            <p className="fail big">목표 미달 — 게임 오버</p>
          )}
        </div>
        <div className="center">
          <button className="btn" onClick={confirmEvaluation}>
            {r.passed ? (state.evalIndex >= 4 ? "결과 보기" : "상점으로 →") : "결과 보기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShopPhase() {
  const { state, content, buyRelic, buyPolicy, reroll, removeCard, nextCycle } = useGame();
  const owned = ownedCards(state);
  const counts = new Map<string, number>();
  for (const c of owned) counts.set(c.defId, (counts.get(c.defId) ?? 0) + 1);

  return (
    <div className="panel">
      <h2>상점 — 자금 {state.fund}</h2>
      <div className="row">
        <b>유물</b>
        {state.shopRelics.length === 0 && <span className="muted">(없음)</span>}
        {state.shopRelics.map((id) => {
          const r = content.relics.get(id)!;
          const can = state.fund >= r.price && state.relics.length < state.relicSlots;
          return (
            <div className={`shopitem ${r.rarity}`} key={id}>
              <div className="rn">{r.name}</div>
              <div className="rt muted">{r.text}</div>
              <div className="btns">
                <span className="price">{r.price}</span>
                <button className="btn" disabled={!can} onClick={() => buyRelic(id)}>구매</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted">유물 슬롯 {state.relics.length} / {state.relicSlots}</p>

      <div className="row">
        <b>정책</b>
        {state.shopPolicies.length === 0 && <span className="muted">(없음)</span>}
        {state.shopPolicies.map((id) => {
          const p = content.policies.get(id)!;
          const can = state.fund >= p.price;
          return (
            <div className="shopitem" key={id}>
              <div className="rn">{p.name}</div>
              <div className="rt muted">{p.text}</div>
              <div className="btns">
                <span className="price">{p.price}</span>
                <button className="btn" disabled={!can} onClick={() => buyPolicy(id)}>구매</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="btns">
        <button className="btn ghost" disabled={state.fund < state.rerollCost} onClick={reroll}>
          새로고침 ({state.rerollCost})
        </button>
        <button className="btn" onClick={nextCycle}>다음 평가 단계 →</button>
      </div>

      <h2 style={{ marginTop: 16 }}>덱 정리 — 카드 1장 제거 (30 자금)</h2>
      <div className="cardrow">
        {[...counts.entries()].map(([defId, n]) => {
          const inst = owned.find((c) => c.defId === defId)!;
          return (
            <CardView
              key={defId}
              card={def(content, defId)}
              badge={`×${n}`}
              disabled={state.fund < 30}
              onClick={() => removeCard(inst.uid)}
            />
          );
        })}
      </div>
    </div>
  );
}

function EndModal({ win }: { win: boolean }) {
  const { state, newGame, seedInput, setSeed } = useGame();
  return (
    <div className="modal-bg">
      <div className="modal center">
        <h2>{win ? "🎉 클리어! 5차 평가 통과" : "게임 오버"}</h2>
        <p className="muted">도달한 평가: {state.evalIndex + 1}차 / 누적 자금 {state.fund}</p>
        <div className="row center" style={{ justifyContent: "center" }}>
          <label className="muted">시드</label>
          <input
            type="number"
            value={seedInput}
            onChange={(e) => setSeed(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <button className="btn" onClick={() => newGame()}>새 게임</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { state, content, newGame, seedInput, setSeed } = useGame();
  return (
    <div className="app">
      <h1>유권자가 너무해 <span className="muted" style={{ fontSize: 13 }}>프로토타입</span></h1>
      <div className="sub">덱이 아니라 시장을 진화시키는 도시 경영 덱빌딩 로그라이크</div>

      <ResourceBar state={state} content={content} />
      <GaugeBar state={state} />
      <RelicBar state={state} content={content} />

      {state.phase === "play" && <PlayPhase />}
      {state.phase === "shop" && <ShopPhase />}
      {state.phase === "candidate" && <CandidateModal />}
      {state.phase === "evaluation" && <EvaluationModal />}
      {state.phase === "win" && <EndModal win />}
      {state.phase === "gameover" && <EndModal win={false} />}

      <div className="btns" style={{ marginTop: 16 }}>
        <label className="muted">시드</label>
        <input type="number" value={seedInput} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 80 }} />
        <button className="btn ghost" onClick={() => newGame()}>새 게임(시드 적용)</button>
      </div>
    </div>
  );
}
