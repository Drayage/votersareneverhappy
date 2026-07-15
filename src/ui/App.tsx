import { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { CardView } from "./CardView";
import type { CardDef, Content, GameState } from "../engine/types";
import { TAG_LABELS } from "../engine/types";
import { effectiveCost, playCostOf } from "../engine/effects";
import { CAPS, EVAL_TARGETS } from "../engine/caps";
import { computeSettlement, ownedCards, tagLabelCounts } from "../engine/settlement";

function cardDef(content: Content, id: string): CardDef {
  return content.cards.get(id)!;
}

function comboPreview(card: CardDef, state: GameState): number | undefined {
  const effects = (card.onPlay ?? []).filter((e) => e.kind === "comboScore");
  if (effects.length === 0) return undefined;
  return effects.reduce((sum, effect) => sum + Math.min(effect.cap, (state.playedTagCounts[effect.tag] ?? 0) * effect.points), 0);
}

function Header() {
  const { seedInput, setSeed, newGame } = useGame();
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="city-seal" aria-hidden="true">市</div>
        <div>
          <div className="eyebrow">CITY HALL DECKBUILDER · v0.2</div>
          <h1>유권자가 너무해</h1>
          <p>시장을 설계하고, 공약을 엮고, 다섯 번의 평가를 버텨라.</p>
        </div>
      </div>
      <div className="run-controls">
        <label htmlFor="seed-input">도시 코드</label>
        <input id="seed-input" type="number" value={seedInput} onChange={(e) => setSeed(Number(e.target.value))} />
        <button className="button button-secondary" onClick={() => newGame()}>새 도시</button>
      </div>
    </header>
  );
}

function EvaluationRail({ state }: { state: GameState }) {
  return (
    <section className="evaluation-rail" aria-label="평가 진행도">
      {EVAL_TARGETS.map((target, index) => {
        const status = index < state.evalIndex ? "done" : index === state.evalIndex ? "current" : "future";
        return (
          <div className={`rail-step ${status}`} key={target}>
            <span className="rail-dot">{index < state.evalIndex ? "✓" : index + 1}</span>
            <div><strong>{index + 1}차 평가</strong><small>목표 {target.toLocaleString()}</small></div>
          </div>
        );
      })}
    </section>
  );
}

function Dashboard({ state, content }: { state: GameState; content: Content }) {
  const projection = computeSettlement(state, content);
  const scorePct = Math.min(100, (projection.finalScore / Math.max(1, projection.target)) * 100);
  const turnsLeft = CAPS.turnsPerCycle - state.turn + 1;
  return (
    <section className="dashboard">
      <div className="score-card">
        <div className="score-card-head"><span>이번 평가 예상</span><strong>{projection.finalScore.toLocaleString()} <small>/ {projection.target.toLocaleString()}</small></strong></div>
        <div className="score-track"><span style={{ width: `${scorePct}%` }} /></div>
        <div className="score-caption">
          <span>{projection.finalScore >= projection.target ? "현재 통과권" : `${(projection.target - projection.finalScore).toLocaleString()}점 더 필요`}</span>
          <span>{turnsLeft}턴 남음</span>
        </div>
      </div>
      <div className="resource-grid">
        <Resource icon="₩" label="예산" value={state.budget} tone="gold" />
        <Resource icon="★" label="누적 점수" value={state.cycleScore} tone="mint" />
        <Resource icon="⚡" label="액션" value={state.actions} />
        <Resource icon="＋" label="구매" value={state.buys} />
        <Resource icon="◆" label="상점 자금" value={state.fund} tone="gold" />
      </div>
    </section>
  );
}

function Resource({ icon, label, value, tone = "" }: { icon: string; label: string; value: number; tone?: string }) {
  return <div className={`resource ${tone}`}><span className="resource-icon">{icon}</span><div><small>{label}</small><strong>{value.toLocaleString()}</strong></div></div>;
}

function CityProfile({ state, content }: { state: GameState; content: Content }) {
  const topTags = tagLabelCounts(state, content).slice(0, 4);
  const projection = computeSettlement(state, content);
  return (
    <aside className="city-profile">
      <div className="profile-head"><span className="eyebrow">CITY PROFILE</span><strong>우리 도시의 색</strong></div>
      <div className="identity-list">
        {topTags.map(([tag, count], index) => (
          <div className="identity-row" key={tag}>
            <span className={`identity-rank tone-${tag}`}>{index + 1}</span>
            <span>{TAG_LABELS[tag]}</span><strong>{count}</strong>
          </div>
        ))}
      </div>
      <div className="profile-facts">
        <span>학습 레벨 <b>{state.eduLevel}</b></span>
        <span>정산 예상 <b>+{projection.settlementScore + projection.pollutionPenalty}</b></span>
        <span>시장 규모 <b>{state.market.length}/{state.marketSlots}</b></span>
      </div>
    </aside>
  );
}

function RiskStrip({ state }: { state: GameState }) {
  const risks = [
    state.gauges.pollution > 0 ? { label: "환경", value: `-${state.gauges.pollution * 2}점`, level: state.gauges.pollution } : null,
    state.gauges.corruption > 0 ? { label: "부패", value: `-${Math.min(CAPS.corruptionPenaltyMaxPct, Math.floor(state.gauges.corruption / 5) * 10)}%`, level: state.gauges.corruption } : null,
    state.gauges.populismDebuff > 0 ? { label: "다음 목표", value: `+${Math.min(CAPS.targetBonusMaxPct, state.gauges.populismDebuff)}%`, level: state.gauges.populismDebuff } : null,
    state.activeTargetBonusPct > 0 ? { label: "이번 목표", value: `+${Math.min(CAPS.targetBonusMaxPct, state.activeTargetBonusPct)}%`, level: state.activeTargetBonusPct } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; level: number }>;
  if (risks.length === 0) return <div className="risk-strip is-safe"><span>●</span> 현재 도시 위험 지표가 안정적입니다.</div>;
  return <div className="risk-strip">{risks.map((risk) => <span className={risk.level >= 10 ? "is-high" : ""} key={risk.label}>{risk.label} <b>{risk.value}</b></span>)}</div>;
}

function RelicStrip({ state, content }: { state: GameState; content: Content }) {
  const items = [
    ...state.relics.map((id) => ({ ...content.relics.get(id)! })),
    ...state.policies.map((id) => ({ rarity: "policy" as const, role: "정책", ...content.policies.get(id)! })),
  ];
  if (items.length === 0) return null;
  return <div className="relic-strip">{items.map((item) => <div className={`relic-token ${item.rarity}`} key={item.id}><span>{item.name}</span><small>{item.text}</small></div>)}</div>;
}

function SectionTitle({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return <div className="section-title"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>{note && <p>{note}</p>}</div>;
}

function PlayPhase() {
  const { state, content, play, playTreasures, buy, endTurn } = useGame();
  const hasTreasure = state.hand.some((c) => cardDef(content, c.defId).type === "treasure");
  return (
    <div className="game-grid">
      <div className="game-main">
        <section className="panel hand-panel">
          <SectionTitle kicker={`TURN ${state.turn} · COUNCIL DESK`} title={`손에 든 안건 ${state.hand.length}장`} note="카드 순서를 바꾸면 연계 점수가 달라집니다." />
          <div className="card-grid hand-grid">
            {state.hand.map((instance) => {
              const card = cardDef(content, instance.defId);
              const playCost = playCostOf(card);
              const dead = card.deadInHand;
              return <CardView key={instance.uid} card={card} onClick={() => play(instance.uid)} disabled={dead || state.actions < playCost} badge={dead ? "처리 불가" : state.actions < playCost ? "액션 부족" : "사용"} comboPreview={comboPreview(card, state)} />;
            })}
            {state.hand.length === 0 && <EmptyState>처리할 안건이 없습니다.</EmptyState>}
          </div>
          <div className="action-row">
            <button className="button button-secondary" disabled={!hasTreasure} onClick={playTreasures}>재정 카드 모두 사용</button>
            <button className="button button-primary" onClick={endTurn}>턴 마감 <span>→</span></button>
          </div>
        </section>

        <section className="panel market-panel">
          <SectionTitle kicker="CITY SUPPLY" title={`정책 시장 ${state.market.length}/${state.marketSlots}`} note="예산으로 매입하면 버린 더미에 들어갑니다." />
          <div className="card-grid market-grid">
            {state.market.map((entry) => {
              const card = cardDef(content, entry.defId);
              const cost = effectiveCost(state, content, card);
              const canBuy = state.buys > 0 && state.budget >= cost && entry.stock > 0;
              return <CardView compact key={entry.defId} card={card} cost={cost} onClick={() => buy(entry.defId)} disabled={!canBuy} badge={entry.stock > 0 ? `재고 ${entry.stock}` : "품절"} />;
            })}
          </div>
        </section>

        <section className="panel inplay-panel">
          <SectionTitle kicker="TODAY'S RECORD" title={`이번 턴 처리 완료 ${state.inPlay.length}장`} />
          <div className="mini-card-row">
            {state.inPlay.map((instance) => {
              const card = cardDef(content, instance.defId);
              return <div className={`mini-card tone-${card.tags[0]}`} key={instance.uid}><strong>{card.name}</strong><span>{card.tags.map((tag) => TAG_LABELS[tag]).join(" · ")}</span></div>;
            })}
            {state.inPlay.length === 0 && <span className="muted">아직 처리한 카드가 없습니다.</span>}
          </div>
        </section>
      </div>
      <CityProfile state={state} content={content} />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

function CandidateModal() {
  const { state, content, chooseCandidate } = useGame();
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const full = state.market.length >= state.marketSlots;
  const commit = (addId: string, removeId?: string) => { chooseCandidate(addId, removeId); setPendingAdd(null); };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal candidate-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-title">
        <span className="modal-kicker">MARKET EVOLUTION</span>
        <h2 id="candidate-title">도시에 새 정책이 들어옵니다</h2>
        <p>{full ? "추가할 카드를 고른 뒤 시장에서 내보낼 카드를 선택하세요." : "세 후보 중 하나를 골라 시장의 방향을 결정하세요. 거부할 수는 없습니다."}</p>
        <div className="choice-label"><span>1</span> 도입할 카드</div>
        <div className="card-grid choice-grid">
          {state.candidates.map((id) => { const card = cardDef(content, id); return <CardView key={id} card={card} cost={effectiveCost(state, content, card)} highlight={pendingAdd === id} onClick={() => full ? setPendingAdd(id) : commit(id)} badge={pendingAdd === id ? "선택됨" : "도입"} />; })}
        </div>
        {full && pendingAdd && <><div className="choice-label danger"><span>2</span> 시장에서 제외할 카드</div><div className="card-grid choice-grid compact-choices">{state.market.map((entry) => { const card = cardDef(content, entry.defId); return <CardView compact key={entry.defId} card={card} cost={effectiveCost(state, content, card)} onClick={() => commit(pendingAdd, entry.defId)} badge="제외" />; })}</div></>}
      </section>
    </div>
  );
}

function EvaluationModal() {
  const { state, confirmEvaluation } = useGame();
  const result = state.lastSettlement!;
  return (
    <div className="modal-backdrop">
      <section className={`modal evaluation-modal ${result.passed ? "passed" : "failed"}`} role="dialog" aria-modal="true" aria-labelledby="evaluation-title">
        <div className="result-mark" aria-hidden="true">{result.passed ? "✓" : "!"}</div>
        <span className="modal-kicker">EVALUATION {state.evalIndex + 1}</span>
        <h2 id="evaluation-title">{result.passed ? "유권자 평가 통과" : "시정 평가 미달"}</h2>
        <p>{result.passed ? "도시는 다음 단계로 나아갈 준비가 됐습니다." : "이번 도시 운영은 여기서 종료됩니다."}</p>
        <div className="result-score"><strong>{result.finalScore.toLocaleString()}</strong><span>/ {result.target.toLocaleString()}</span></div>
        <div className="result-breakdown">
          <ResultLine label="카드 플레이" value={result.baseCycleScore} />
          <ResultLine label={`정산${result.settlementMult !== 1 ? ` ×${result.settlementMult.toFixed(2)}` : ""}`} value={result.settlementScore} />
          {result.pollutionPenalty !== 0 && <ResultLine label="환경 페널티" value={result.pollutionPenalty} negative />}
          {result.globalMult !== 1 && <ResultLine label="유물 배수" value={`×${result.globalMult.toFixed(2)}`} />}
          {result.corruptionPct > 0 && <ResultLine label="부패 감산" value={`-${result.corruptionPct}%`} negative />}
          {result.targetBonusPct > 0 && <ResultLine label="포퓰리즘 목표 증가" value={`+${result.targetBonusPct}%`} negative />}
        </div>
        {result.passed && <div className="fund-reward">다음 상점 자금 <strong>+{result.fundGained.toLocaleString()}</strong></div>}
        <button className="button button-primary button-wide" onClick={confirmEvaluation}>{result.passed && state.evalIndex < 4 ? "시정 상점으로" : "결과 확인"} →</button>
      </section>
    </div>
  );
}

function ResultLine({ label, value, negative = false }: { label: string; value: number | string; negative?: boolean }) {
  return <div><span>{label}</span><strong className={negative ? "negative" : ""}>{typeof value === "number" && value > 0 ? "+" : ""}{typeof value === "number" ? value.toLocaleString() : value}</strong></div>;
}

function ShopPhase() {
  const { state, content, buyRelic, buyPolicy, reroll, removeCard, nextCycle } = useGame();
  const owned = ownedCards(state);
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const card of owned) map.set(card.defId, (map.get(card.defId) ?? 0) + 1); return map; }, [owned]);
  return (
    <div className="shop-layout">
      <section className="panel shop-main">
        <SectionTitle kicker="BETWEEN EVALUATIONS" title="시정 상점" note={`사용 가능 자금 ${state.fund.toLocaleString()}`} />
        <h3>유물 · 도시를 바꾸는 영구 효과</h3>
        <div className="shop-grid">{state.shopRelics.map((id) => { const item = content.relics.get(id)!; const can = state.fund >= item.price && state.relics.length < state.relicSlots; return <article className={`shop-item ${item.rarity}`} key={id}><span className="shop-role">{item.role}</span><h4>{item.name}</h4><p>{item.text}</p><div><strong>{item.price}</strong><button className="button button-small" disabled={!can} onClick={() => buyRelic(id)}>구매</button></div></article>; })}</div>
        <div className="shop-subhead"><h3>정책 · 이번 런의 운영 원칙</h3><span>유물 슬롯 {state.relics.length}/{state.relicSlots}</span></div>
        <div className="shop-grid">{state.shopPolicies.map((id) => { const item = content.policies.get(id)!; return <article className="shop-item policy" key={id}><span className="shop-role">정책</span><h4>{item.name}</h4><p>{item.text}</p><div><strong>{item.price}</strong><button className="button button-small" disabled={state.fund < item.price} onClick={() => buyPolicy(id)}>채택</button></div></article>; })}</div>
        <div className="action-row shop-actions"><button className="button button-secondary" disabled={state.fund < state.rerollCost} onClick={reroll}>목록 새로고침 · {state.rerollCost}</button><button className="button button-primary" onClick={nextCycle}>다음 평가 시작 →</button></div>
      </section>
      <aside className="panel deck-cleaner"><SectionTitle kicker="URBAN RENEWAL" title="덱 정비" note="30 자금으로 카드 한 장을 제거합니다." /><div className="deck-list">{[...counts.entries()].map(([id, count]) => { const instance = owned.find((card) => card.defId === id)!; const card = cardDef(content, id); return <button key={id} disabled={state.fund < 30} onClick={() => removeCard(instance.uid)}><span className={`deck-dot tone-${card.tags[0]}`} /><span><strong>{card.name}</strong><small>{card.tags.map((tag) => TAG_LABELS[tag]).join(" · ")}</small></span><b>×{count}</b></button>; })}</div></aside>
    </div>
  );
}

function EndModal({ win }: { win: boolean }) {
  const { state, newGame } = useGame();
  return <div className="modal-backdrop"><section className={`modal end-modal ${win ? "passed" : "failed"}`} role="dialog" aria-modal="true"><div className="result-mark">{win ? "★" : "×"}</div><span className="modal-kicker">FINAL REPORT</span><h2>{win ? "도시는 전설이 되었습니다" : "새로운 시장을 기다립니다"}</h2><p>{state.evalIndex + 1}차 평가 도달 · 상점 자금 {state.fund.toLocaleString()}</p><button className="button button-primary button-wide" onClick={() => newGame()}>같은 코드로 다시 시작</button></section></div>;
}

export default function App() {
  const { state, content } = useGame();
  return (
    <div className="app-shell">
      <Header />
      <EvaluationRail state={state} />
      <Dashboard state={state} content={content} />
      <RiskStrip state={state} />
      <RelicStrip state={state} content={content} />
      {state.phase === "play" && <PlayPhase />}
      {state.phase === "shop" && <ShopPhase />}
      {state.phase === "candidate" && <CandidateModal />}
      {state.phase === "evaluation" && <EvaluationModal />}
      {state.phase === "win" && <EndModal win />}
      {state.phase === "gameover" && <EndModal win={false} />}
      <footer><span>유권자가 너무해 · playable prototype v0.2</span><span>시장 진화형 도시 덱빌더</span></footer>
    </div>
  );
}
