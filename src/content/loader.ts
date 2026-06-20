import type { CardDef, RelicDef, PolicyDef, Content } from "../engine/types";
import { cardsFileSchema, relicsFileSchema, policiesFileSchema } from "./schema";

import cardsRaw from "../../data/cards.json";
import relicsRaw from "../../data/relics.json";
import policiesRaw from "../../data/policies.json";

/**
 * JSON 콘텐츠를 zod로 검증해 Content로 로드한다.
 * 잘못된 카드/유물 추가 시 명확한 에러를 던져 확장 안전성을 보장한다.
 */
export function loadContent(): Content {
  const cards = cardsFileSchema.parse(cardsRaw) as CardDef[];
  const relics = relicsFileSchema.parse(relicsRaw) as RelicDef[];
  const policies = policiesFileSchema.parse(policiesRaw) as PolicyDef[];

  assertUniqueIds(cards.map((c) => c.id), "cards");
  assertUniqueIds(relics.map((r) => r.id), "relics");
  assertUniqueIds(policies.map((p) => p.id), "policies");

  return {
    cards: new Map(cards.map((c) => [c.id, c])),
    relics: new Map(relics.map((r) => [r.id, r])),
    policies: new Map(policies.map((p) => [p.id, p])),
    cardList: cards,
    relicList: relics,
    policyList: policies,
  };
}

function assertUniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`[content] 중복 id in ${label}: ${id}`);
    seen.add(id);
  }
}
