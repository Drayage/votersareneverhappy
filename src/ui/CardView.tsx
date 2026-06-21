import type { CardDef } from "../engine/types";
import { TAG_LABELS } from "../engine/types";
import { playCostOf } from "../engine/effects";

const TYPE_LABEL: Record<CardDef["type"], string> = {
  treasure: "재물",
  action: "액션",
  score: "점수",
};

export function CardView({
  card,
  cost,
  onClick,
  disabled,
  badge,
  highlight,
}: {
  card: CardDef;
  cost?: number;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  highlight?: boolean;
}) {
  return (
    <button
      className={`card type-${card.type} ${highlight ? "hl" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={card.text}
    >
      <div className="card-head">
        <span className="card-name">{card.name}</span>
        {cost !== undefined && <span className="card-cost" title="구매 코스트(예산)">예산 {cost}</span>}
      </div>
      <div className="card-type">
        {TYPE_LABEL[card.type]}
        {playCostOf(card) > 0 && (
          <span className="playcost" title="플레이 코스트(액션 소비)">⚡{playCostOf(card)}</span>
        )}
      </div>
      <div className="card-tags">
        {card.tags.map((t) => (
          <span key={t} className={`tag tag-${t}`}>
            {TAG_LABELS[t]}
          </span>
        ))}
      </div>
      <div className="card-text">{card.text}</div>
      {badge && <div className="card-foot">{badge}</div>}
    </button>
  );
}
