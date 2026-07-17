import type { CardDef, Tag } from "../engine/types";
import { TAG_LABELS } from "../engine/types";
import { playCostOf } from "../engine/effects";

const TYPE_META: Record<CardDef["type"], { label: string; icon: string }> = {
  treasure: { label: "재정", icon: "◆" },
  action: { label: "액션", icon: "⚡" },
  score: { label: "사업", icon: "★" },
};

const TAG_GLYPH: Record<Tag, string> = {
  commerce: "₩",
  industry: "⚙",
  science: "✦",
  residential: "▦",
  transport: "⇄",
  admin: "§",
  culture: "♪",
  tourism: "◇",
  education: "✎",
  welfare: "♥",
  environment: "♧",
  pr: "◉",
  politics: "⚑",
  corruption: "⛓",
  populism: "!",
};

export function CardView({
  card,
  cost,
  onClick,
  disabled,
  badge,
  highlight,
  comboPreview,
  compact = false,
}: {
  card: CardDef;
  cost?: number;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  highlight?: boolean;
  comboPreview?: number;
  compact?: boolean;
}) {
  const meta = TYPE_META[card.type];
  const primaryTag = card.tags[0];

  return (
    <button
      type="button"
      className={`card type-${card.type} tone-${primaryTag} ${highlight ? "is-selected" : ""} ${compact ? "is-compact" : ""} ${onClick ? "is-interactive" : "is-static"}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={highlight || undefined}
      tabIndex={onClick ? 0 : -1}
      title={card.text}
    >
      <span className="card-accent" aria-hidden="true" />
      <div className="card-head">
        <span className="card-name">{card.name}</span>
        {card.costResearch
          ? <span className="card-cost cost-research" title="구매에 필요한 연구지수">🔬{card.costResearch}</span>
          : cost !== undefined && <span className="card-cost" title="구매 예산">{cost}</span>}
      </div>
      <div className="card-art" aria-hidden="true">
        <span className="art-grid" />
        <span className="art-glyph">{TAG_GLYPH[primaryTag]}</span>
        <span className="art-label">{TAG_LABELS[primaryTag]} 도시</span>
        <span className="art-skyline" />
      </div>
      <div className="card-meta">
        <span className={`type-chip type-chip-${card.type}`}><span aria-hidden="true">{meta.icon}</span> {meta.label}</span>
        {playCostOf(card) > 0 && <span className="playcost" title="사용할 때 필요한 액션">⚡ {playCostOf(card)}</span>}
        {card.deadInHand && <span className="dead-chip" title="손에서는 사용할 수 없고, 평가 정산 때만 계산됩니다">정산 전용</span>}
        <span className="tier">{card.tier === "start" ? "기본" : `${card.tier}급`}</span>
      </div>
      <div className="card-tags">
        {card.tags.map((tag) => <span key={tag} className={`tag tag-${tag}`}>{TAG_LABELS[tag]}</span>)}
      </div>
      <div className="card-rules"><span className="rules-mark" aria-hidden="true">◆</span><div className="card-text">{card.text}</div></div>
      <div className="card-footer">
        {comboPreview !== undefined && comboPreview > 0 && <span className="combo-preview">연계 +{comboPreview}</span>}
        {badge && <span className="card-badge">{badge}</span>}
      </div>
    </button>
  );
}
