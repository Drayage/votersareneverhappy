import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { CardView } from "./CardView";
import { PwaInstallButton } from "./PwaInstall";
import type { CardDef, Content, GameState } from "../engine/types";
import { ALL_TAGS, TAG_LABELS } from "../engine/types";
import { effectiveCost, playCostOf } from "../engine/effects";
import { CAPS, CYCLE_TURNS, EVAL_TARGETS } from "../engine/caps";
import {
  computeSettlement,
  computeRerollTickets,
  ownedCards,
  tagCounts,
  tagLabelCounts,
  previewHandCardSettlementValue,
  previewMarketCardSettlementValue,
} from "../engine/settlement";

function cardDef(content: Content, id: string): CardDef {
  return content.cards.get(id)!;
}

function comboPreview(card: CardDef, state: GameState, content: Content): number | undefined {
  const effects = card.onPlay ?? [];
  let total = 0;
  let has = false;
  for (const e of effects) {
    if (e.kind === "comboScore") {
      total += Math.min(e.cap, (state.playedTagCounts[e.tag] ?? 0) * e.points);
      has = true;
    } else if (e.kind === "conditionalScore") {
      const owned = tagCounts(state, content)[e.tag] ?? 0;
      total += owned >= e.count ? e.ifMet : e.ifNot;
      has = true;
    }
  }
  return has ? total : undefined;
}

// 손패 기본 정렬: 액션 → 재정 → 사업 순. 턴 중 새로 드로우된 카드는 정렬에 섞이지 않고
// 뒤에 그대로 붙는다(매번 순서가 튀지 않게) — turnStartUids는 이번 턴 시작 시점의 손패를 기록.
const HAND_TYPE_ORDER: Record<CardDef["type"], number> = { action: 0, treasure: 1, score: 2 };
function sortHandForDisplay(hand: GameState["hand"], turnStartUids: Set<number>, content: Content): GameState["hand"] {
  const original = hand.filter((c) => turnStartUids.has(c.uid));
  const drawnLater = hand.filter((c) => !turnStartUids.has(c.uid));
  const sortedOriginal = [...original].sort(
    (a, b) => HAND_TYPE_ORDER[cardDef(content, a.defId).type] - HAND_TYPE_ORDER[cardDef(content, b.defId).type]
  );
  return [...sortedOriginal, ...drawnLater];
}

function Header() {
  const { seedInput, setSeed, newGame } = useGame();
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="city-seal" aria-hidden="true">市</div>
        <div>
          <div className="eyebrow">CITY HALL DECKBUILDER · v0.5</div>
          <h1>유권자가 너무해</h1>
          <p>시장을 설계하고, 공약을 엮고, 다섯 번의 평가를 버텨라.</p>
        </div>
      </div>
      <div className="run-controls">
        <PwaInstallButton />
        <label htmlFor="seed-input">도시 코드</label>
        <input id="seed-input" type="number" value={seedInput} onChange={(e) => setSeed(Number(e.target.value))} />
        <button
          className="button button-secondary"
          title="무작위 도시 코드로 새로 시작"
          onClick={() => {
            const r = Math.floor(Math.random() * 1_000_000) + 1;
            setSeed(r);
            newGame(r);
          }}
        >
          🎲 랜덤
        </button>
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
  const turnsLeft = CYCLE_TURNS[state.evalIndex] - state.turn + 1;
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
        {state.research > 0 && <Resource icon="🔬" label="연구" value={state.research} />}
        <Resource icon="⚡" label="액션" value={state.actions} />
        <Resource icon="＋" label="구매" value={state.buys} />
        <Resource icon="🎟️" label="리롤권" value={state.rerollTickets} tone="mint" />
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
    <aside className="city-profile" data-section="status">
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
    ...state.relics.map((id) => ({ ...content.relics.get(id)!, expiring: false })),
    ...state.policies.map((id) => ({ rarity: "policy" as const, role: "정책", ...content.policies.get(id)!, expiring: true })),
  ];
  if (items.length === 0) return null;
  return (
    <div className="relic-strip">
      {items.map((item) => (
        <div className={`relic-token ${item.rarity}`} key={item.id}>
          <span>{item.name}{item.expiring && <em className="policy-badge">이번 주기 한정</em>}</span>
          <small>{item.text}</small>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return <div className="section-title"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>{note && <p>{note}</p>}</div>;
}

type MobileTab = "hand" | "market" | "status";

function PlayPhase() {
  const { state, content, play, playTreasures, buy, endTurn } = useGame();

  // PlayPhase는 매 턴 phase가 'play'를 벗어났다 돌아올 때 새로 마운트되므로,
  // 이 useState는 자동으로 매 턴 초기화된다 — 그 시점 손패가 곧 "이번 턴 시작 손패".
  const [turnStartUids] = useState(() => new Set(state.hand.map((c) => c.uid)));
  const [mobileTab, setMobileTab] = useState<MobileTab>("hand");
  // 손패 소진 시 시장 탭으로 넘기는 자동 전환은 턴당 한 번만 — 이후 손패 탭으로
  // 직접 돌아오면(예: 빈 손패 확인) 다시 강제로 밀어내지 않는다.
  const [autoAdvancedToMarket, setAutoAdvancedToMarket] = useState(false);

  const hasTreasure = state.hand.some((c) => cardDef(content, c.defId).type === "treasure");
  const displayHand = useMemo(() => sortHandForDisplay(state.hand, turnStartUids, content), [state.hand, turnStartUids, content]);
  const projection = useMemo(() => computeSettlement(state, content), [state, content]);
  const affordableCards = state.market.filter((entry) => {
    const card = cardDef(content, entry.defId);
    const payable = card.costResearch ? state.research >= card.costResearch : state.budget >= effectiveCost(state, content, card);
    return entry.stock > 0 && payable;
  }).length;
  const marketStatus = state.buys <= 0 ? "이번 턴 구매 완료" : affordableCards > 0 ? `${affordableCards}종 구매 가능` : "예산 부족";

  // 손패를 다 쓰면 자동으로 시장 탭으로 — 턴당 한 번만.
  useEffect(() => {
    if (state.hand.length === 0 && mobileTab === "hand" && !autoAdvancedToMarket) {
      setMobileTab("market");
      setAutoAdvancedToMarket(true);
    }
  }, [state.hand.length, mobileTab, autoAdvancedToMarket]);

  // 시장 탭에서 구매를 다 쓰거나 살 수 있는 카드가 없으면(손패도 이미 빈 상태) 자동으로 턴 마감.
  useEffect(() => {
    if (mobileTab !== "market" || state.hand.length > 0) return;
    if (state.buys <= 0 || affordableCards === 0) endTurn();
  }, [mobileTab, state.hand.length, state.buys, affordableCards, endTurn]);

  return (
    <div className="game-grid" data-tab={mobileTab}>
      <div className="game-main">
        <div data-section="hand">
          <section className="panel hand-panel">
            <SectionTitle kicker={`TURN ${state.turn} · COUNCIL DESK`} title={`손에 든 안건 ${state.hand.length}장`} note="카드 순서를 바꾸면 연계 점수가 달라집니다." />
            <div className="card-grid hand-grid">
              {displayHand.map((instance) => {
                const card = cardDef(content, instance.defId);
                const playCost = playCostOf(card);
                const dead = card.deadInHand;
                return <CardView key={instance.uid} card={card} onClick={() => play(instance.uid)} disabled={dead || state.actions < playCost} badge={dead ? "처리 불가" : state.actions < playCost ? "액션 부족" : "사용"} comboPreview={comboPreview(card, state, content)} settlementPreview={card.settlement?.length ? previewHandCardSettlementValue(state, content, instance.uid) : undefined} />;
              })}
              {state.hand.length === 0 && <EmptyState>처리할 안건이 없습니다. 시장에서 카드를 구매하거나 턴을 마감하세요.</EmptyState>}
            </div>
            <div className="action-row">
              <button className="button button-secondary" disabled={!hasTreasure} onClick={playTreasures}>재정 카드 모두 사용</button>
              <button className="button button-primary" onClick={endTurn}>턴 마감 <span>→</span></button>
            </div>
          </section>

          <section className="panel inplay-panel">
            <SectionTitle kicker="TODAY'S RECORD" title={`이번 턴 처리 완료 ${state.inPlay.length}장`} />
            <div className="mini-card-row">
              {state.inPlay.map((instance) => {
                const card = cardDef(content, instance.defId);
                return <div className={`mini-card tone-${card.tags[0]}`} key={instance.uid}><strong>{card.name}</strong><span>{card.tags.map((tag) => TAG_LABELS[tag]).join(" · ")}</span>{(instance.persistLeft ?? 0) > 1 && <em className="persist-badge">지속 {instance.persistLeft! - 1}턴 남음</em>}</div>;
              })}
              {state.inPlay.length === 0 && <span className="muted">아직 처리한 카드가 없습니다.</span>}
            </div>
          </section>
        </div>

        <section className="panel market-panel" data-section="market">
          <div className="market-wallet" role="status" aria-live="polite" aria-label={`상점 지갑, 예산 ${state.budget}, 구매 ${state.buys}, ${marketStatus}`}>
            <div className="wallet-title"><span className="eyebrow">MARKET WALLET</span><strong>상점 지갑</strong></div>
            <div className="wallet-stat wallet-budget"><span aria-hidden="true">₩</span><small>예산</small><strong>{state.budget.toLocaleString()}</strong></div>
            <div className="wallet-stat"><span aria-hidden="true">＋</span><small>구매</small><strong>{state.buys}</strong></div>
            <div className={`wallet-status ${state.buys > 0 && affordableCards > 0 ? "is-ready" : ""}`}><span aria-hidden="true">●</span>{marketStatus}</div>
          </div>
          <SectionTitle kicker="CITY SUPPLY" title={`정책 시장 ${state.market.length}/${state.marketSlots}`} note="예산으로 매입하면 버린 더미에 들어갑니다." />
          <div className="card-grid market-grid">
            {state.market.map((entry) => {
              const card = cardDef(content, entry.defId);
              const cost = effectiveCost(state, content, card);
              const payable = card.costResearch ? state.research >= card.costResearch : state.budget >= cost;
              const canBuy = state.buys > 0 && payable && entry.stock > 0;
              return <CardView compact key={entry.defId} card={card} cost={cost} onClick={() => buy(entry.defId)} disabled={!canBuy} badge={entry.stock > 0 ? `재고 ${entry.stock}` : "품절"} settlementPreview={card.settlement?.length ? previewMarketCardSettlementValue(state, content, entry.defId) : undefined} />;
            })}
          </div>
        </section>
      </div>
      <div className="status-dashboard" data-section="status">
        <Dashboard state={state} content={content} />
      </div>
      <CityProfile state={state} content={content} />

      <div className="mobile-bottombar">
        <nav className="mobile-tabbar" role="tablist" aria-label="화면 전환">
          <button type="button" role="tab" aria-selected={mobileTab === "hand"} className={mobileTab === "hand" ? "is-active" : ""} onClick={() => setMobileTab("hand")}>
            손패{state.hand.length > 0 && <em>{state.hand.length}</em>}
          </button>
          <button type="button" role="tab" aria-selected={mobileTab === "market"} className={mobileTab === "market" ? "is-active" : ""} onClick={() => setMobileTab("market")}>
            시장{affordableCards > 0 && <em>{affordableCards}</em>}
          </button>
          <button type="button" role="tab" aria-selected={mobileTab === "status"} className={mobileTab === "status" ? "is-active" : ""} onClick={() => setMobileTab("status")}>
            현황
          </button>
        </nav>
        <div className="mobile-actionbar" role="toolbar" aria-label="빠른 조작">
          <div className="mab-stats">
            <span className={projection.finalScore >= projection.target ? "mint" : ""}>🎯 {projection.finalScore.toLocaleString()}<small>/{projection.target.toLocaleString()}</small></span>
            <span>⏳ {CYCLE_TURNS[state.evalIndex] - state.turn + 1}턴</span>
            <span>★ {state.cycleScore.toLocaleString()}</span>
            <span className="gold">₩ {state.budget.toLocaleString()}</span>
            <span>⚡ {state.actions}</span>
            <span>＋ {state.buys}</span>
            {state.research > 0 && <span>🔬 {state.research}</span>}
          </div>
          <button className="button button-primary" onClick={endTurn}>턴 마감 →</button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

const CHOICE_EFFECT_KINDS: string[] = [
  "discardThenDraw",
  "trashFromHand",
  "playTwice",
  "discardForScore",
  "discardForBudget",
  "trashForScore",
  "trashForDraw",
  "trashForBudget",
  "topDeckGamble",
];

const CHOICE_META = {
  discardThenDraw: { kicker: "FILTER", title: "버릴 카드를 고르세요", desc: "고른 카드를 버리고 그 수만큼 새로 뽑습니다.", confirm: "버리고 뽑기" },
  trashFromHand: { kicker: "URBAN RENEWAL", title: "폐기할 카드를 고르세요", desc: "고른 카드는 게임에서 영구히 제거됩니다 (덱 압축).", confirm: "폐기" },
  playTwice: { kicker: "DOUBLE STAMP", title: "두 번 사용할 카드를 고르세요", desc: "고른 카드 1장을 액션 소모 없이 두 번 발동합니다.", confirm: "두 번 사용" },
  discardForScore: { kicker: "AUSTERITY", title: "버릴 카드를 고르세요", desc: "고른 카드를 버리고(재드로우 없음), 버린 수만큼 점수를 얻습니다.", confirm: "버리고 점수 획득" },
  discardForBudget: { kicker: "FIRE SALE", title: "버릴 카드를 고르세요", desc: "고른 카드를 버리고(재드로우 없음), 버린 수만큼 예산을 얻습니다.", confirm: "버리고 예산 획득" },
  trashForScore: { kicker: "LIQUIDATION", title: "폐기할 카드 1장을 고르세요", desc: "고른 카드를 영구 제거하고, 그 카드의 비용만큼 점수를 얻습니다.", confirm: "폐기하고 점수 획득" },
  trashForDraw: { kicker: "ASSET SWAP", title: "폐기할 카드 1장을 고르세요", desc: "고른 카드를 영구 제거하고, 그 카드의 비용만큼 드로우합니다.", confirm: "폐기하고 드로우" },
  trashForBudget: { kicker: "REAL ESTATE", title: "폐기할 카드 1장을 고르세요", desc: "고른 카드를 영구 제거하고, 그 카드의 비용만큼 예산을 얻습니다.", confirm: "폐기하고 예산 획득" },
  topDeckGamble: { kicker: "GAMBLE", title: "덱 위로 되돌릴 카드 1장을 고르세요", desc: "고른 카드를 덱 맨 위로 되돌립니다.", confirm: "베팅" },
} as const;

function ChoiceModal() {
  const { state, content, resolveChoice } = useGame();
  const [picked, setPicked] = useState<number[]>([]);
  const pending = state.pendingChoice!;
  const meta = CHOICE_META[pending.kind];
  const desc = pending.kind === "topDeckGamble" ? `${meta.desc} 그 카드가 ${TAG_LABELS[pending.tag]} 태그면 즉시 +${pending.bonus}점(아니면 없음).` : meta.desc;
  const toggle = (uid: number) => {
    setPicked((prev) => {
      if (prev.includes(uid)) return prev.filter((u) => u !== uid);
      if (pending.max === 1) return [uid]; // 단일 선택
      if (prev.length >= pending.max) return prev;
      return [...prev, uid];
    });
  };
  const commit = (uids: number[]) => { resolveChoice(uids); setPicked([]); };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal choice-modal" role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <span className="modal-kicker">{meta.kicker}</span>
        <h2 id="choice-title">{meta.title}</h2>
        <p>{desc} {pending.max > 1 && `(최대 ${Math.min(pending.max, state.hand.length)}장)`}</p>
        <div className="card-grid choice-grid">
          {state.hand.map((instance) => {
            const card = cardDef(content, instance.defId);
            // 두 번 사용: 사용 불가 카드·선택형 카드는 대상이 될 수 없다
            const invalid = pending.kind === "playTwice" && (card.deadInHand || (card.onPlay ?? []).some((e) => CHOICE_EFFECT_KINDS.includes(e.kind)));
            return <CardView compact key={instance.uid} card={card} highlight={picked.includes(instance.uid)} disabled={invalid} onClick={() => toggle(instance.uid)} badge={picked.includes(instance.uid) ? "선택됨" : undefined} />;
          })}
          {state.hand.length === 0 && <EmptyState>선택할 카드가 없습니다.</EmptyState>}
        </div>
        <div className="action-row">
          <button className="button button-secondary" onClick={() => commit([])}>선택 안 함</button>
          <button className="button button-primary" disabled={picked.length === 0} onClick={() => commit(picked)}>{meta.confirm} ({picked.length})</button>
        </div>
      </section>
    </div>
  );
}

function CandidateModal() {
  const { state, content, chooseCandidate, chooseCandidateTag, rerollCandidates } = useGame();
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const full = state.market.length >= state.marketSlots;
  const commit = (addId: string, removeId?: string) => { chooseCandidate(addId, removeId); setPendingAdd(null); };

  if (state.tagChoices.length > 0) {
    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal candidate-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-title">
          <span className="modal-kicker">MARKET EVOLUTION</span>
          <h2 id="candidate-title">이번엔 어느 분야에 집중할까요?</h2>
          <p>태그 하나를 고르면, 그 태그가 있는 카드 중에서만 후보가 나옵니다.</p>
          <div className="reroll-row">
            <span>🎟️ 리롤권 {state.rerollTickets}</span>
            <button className="button button-secondary" disabled={state.rerollTickets <= 0} onClick={rerollCandidates}>태그 다시 뽑기</button>
          </div>
          <div className="choice-label"><span>1</span> 태그 선택</div>
          <div className="tag-choice-grid">
            {state.tagChoices.map((tag) => (
              <button key={tag} className={`tag-choice-item tone-${tag}`} onClick={() => chooseCandidateTag(tag)}>
                {TAG_LABELS[tag]}
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal candidate-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-title">
        <span className="modal-kicker">MARKET EVOLUTION</span>
        <h2 id="candidate-title">도시에 새 정책이 들어옵니다</h2>
        <p>
          {state.candidateTagFilter
            ? `${TAG_LABELS[state.candidateTagFilter]} 태그 카드 중에서 골라 시장의 방향을 결정하세요.`
            : "세 후보 중 하나를 골라 시장의 방향을 결정하세요. 거부할 수는 없습니다."}
          {full && " 추가할 카드를 고른 뒤 시장에서 내보낼 카드를 선택하세요."}
        </p>
        <div className="reroll-row">
          <span>🎟️ 리롤권 {state.rerollTickets}</span>
          <button className="button button-secondary" disabled={state.rerollTickets <= 0} onClick={rerollCandidates}>후보 다시 뽑기</button>
        </div>
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
  const ticketsGained = computeRerollTickets(result);
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
        {result.passed && <div className="fund-reward">점수 보상 리롤권 <strong>+{ticketsGained}장</strong></div>}
        <button className="button button-primary button-wide" onClick={confirmEvaluation}>{result.passed && state.evalIndex < 4 ? "보상 받으러 가기" : "결과 확인"} →</button>
      </section>
    </div>
  );
}

function ResultLine({ label, value, negative = false }: { label: string; value: number | string; negative?: boolean }) {
  return <div><span>{label}</span><strong className={negative ? "negative" : ""}>{typeof value === "number" && value > 0 ? "+" : ""}{typeof value === "number" ? value.toLocaleString() : value}</strong></div>;
}

/** 평가 통과 후 보상 단계: 유물뽑기(3중1) → 정책뽑기(3중1) → 카드 정비(선택) → 다음 평가. 자금/구매 없음 — 전부 무료 선택. */
function RewardPhase() {
  const { state, content, pickRelic, pickPolicy, pickPolicyTag, removeCard, skipRemoval, rerollRelics, rerollPolicies, nextCycle } = useGame();
  const owned = ownedCards(state);
  const counts = useMemo(() => { const map = new Map<string, number>(); for (const card of owned) map.set(card.defId, (map.get(card.defId) ?? 0) + 1); return map; }, [owned]);

  const step: "relic" | "policy" | "policyTag" | "removal" | "done" =
    state.rewardRelicChoices.length > 0 ? "relic" :
    state.rewardPolicyChoices.length > 0 ? "policy" :
    state.rewardPolicyTagChoicePending ? "policyTag" :
    !state.rewardRemovalDone ? "removal" : "done";

  const RerollRow = ({ onClick }: { onClick: () => void }) => (
    <div className="reroll-row">
      <span>🎟️ 리롤권 {state.rerollTickets}</span>
      <button className="button button-secondary" disabled={state.rerollTickets <= 0} onClick={onClick}>다른 후보 보기</button>
    </div>
  );

  return (
    <div className="reward-layout">
      <section className="panel reward-main">
        <SectionTitle
          kicker={`BETWEEN EVALUATIONS · STEP ${step === "relic" ? 1 : step === "policy" ? 2 : step === "policyTag" ? 2 : step === "removal" ? 3 : 4}/3`}
          title={step === "relic" ? "유물을 선택하세요" : step === "policy" ? "정책을 선택하세요" : step === "policyTag" ? "정책이 적용될 태그를 고르세요" : step === "removal" ? "카드를 정비하세요" : "준비 완료"}
          note={step === "relic" || step === "policy" ? "3개 중 하나, 영구 효과 (거부 불가)" : step === "policyTag" ? "이번 주기 동안만 적용됩니다" : step === "removal" ? "원하는 카드 한 장을 골라 덱에서 완전히 제거합니다 (선택 사항)" : undefined}
        />

        {step === "relic" && <>
          <RerollRow onClick={rerollRelics} />
          <div className="shop-grid">
            {state.rewardRelicChoices.map((id) => {
              const item = content.relics.get(id)!;
              return (
                <button type="button" className={`shop-item is-pickable ${item.rarity}`} key={id} onClick={() => pickRelic(id)}>
                  <span className="shop-role">{item.role}</span><h4>{item.name}</h4><p>{item.text}</p>
                </button>
              );
            })}
          </div>
        </>}

        {step === "policy" && <>
          <RerollRow onClick={rerollPolicies} />
          <div className="shop-grid">
            {state.rewardPolicyChoices.map((id) => {
              const item = content.policies.get(id)!;
              return (
                <button type="button" className="shop-item policy is-pickable" key={id} onClick={() => pickPolicy(id)}>
                  <span className="shop-role">정책</span><h4>{item.name}</h4><p>{item.text}</p>
                </button>
              );
            })}
          </div>
        </>}

        {step === "policyTag" && <>
          <div className="tag-choice-grid">
            {ALL_TAGS.map((tag) => (
              <button key={tag} className={`tag-choice-item tone-${tag}`} onClick={() => pickPolicyTag(tag)}>
                {TAG_LABELS[tag]}
              </button>
            ))}
          </div>
        </>}

        {step === "removal" && <>
          <div className="deck-list">
            {[...counts.entries()].map(([id, count]) => {
              const instance = owned.find((card) => card.defId === id)!;
              const card = cardDef(content, id);
              return (
                <button key={id} onClick={() => removeCard(instance.uid)}>
                  <span className={`deck-dot tone-${card.tags[0]}`} />
                  <span><strong>{card.name}</strong><small>{card.tags.map((tag) => TAG_LABELS[tag]).join(" · ")}</small></span>
                  <b>×{count}</b>
                </button>
              );
            })}
          </div>
          <div className="action-row"><button className="button button-secondary" onClick={skipRemoval}>건너뛰기</button></div>
        </>}

        {step === "done" && <div className="action-row"><button className="button button-primary button-wide" onClick={nextCycle}>다음 평가 시작 →</button></div>}
      </section>
    </div>
  );
}

function EndModal({ win }: { win: boolean }) {
  const { state, newGame } = useGame();
  return <div className="modal-backdrop"><section className={`modal end-modal ${win ? "passed" : "failed"}`} role="dialog" aria-modal="true"><div className="result-mark">{win ? "★" : "×"}</div><span className="modal-kicker">FINAL REPORT</span><h2>{win ? "도시는 전설이 되었습니다" : "새로운 시장을 기다립니다"}</h2><p>{state.evalIndex + 1}차 평가 도달 · 보유 유물 {state.relics.length} · 시행한 정책 {state.policyHistory.length}</p><button className="button button-primary button-wide" onClick={() => newGame()}>같은 코드로 다시 시작</button></section></div>;
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
      {state.phase === "play" && state.pendingChoice && <ChoiceModal />}
      {state.phase === "reward" && <RewardPhase />}
      {state.phase === "candidate" && <CandidateModal />}
      {state.phase === "evaluation" && <EvaluationModal />}
      {state.phase === "win" && <EndModal win />}
      {state.phase === "gameover" && <EndModal win={false} />}
      <footer><span>유권자가 너무해 · playable prototype v0.5</span><span>시장 진화형 도시 덱빌더</span></footer>
    </div>
  );
}
