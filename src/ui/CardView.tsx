import type { CardDef } from "../engine/types";
import { TAG_LABELS } from "../engine/types";

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
        {cost !== undefined && <span className="card-cost">{cost}</span>}
      </div>
      <div className="card-type">{TYPE_LABEL[card.type]}</div>
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
