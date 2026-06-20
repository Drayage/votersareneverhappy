import { z } from "zod";
import { ALL_TAGS } from "../engine/types";

const tagSchema = z.enum(ALL_TAGS as [string, ...string[]]);
const cardType = z.enum(["treasure", "action", "score"]);
const resource = z.enum(["budget", "draw", "action", "buy"]);

// Effect 판별 유니온 — 새 kind 추가 시 여기에 한 줄 추가하면 검증된다.
const effectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gainBudget"), amount: z.number() }),
  z.object({ kind: z.literal("gainScore"), amount: z.number() }),
  z.object({ kind: z.literal("gainDraw"), amount: z.number() }),
  z.object({ kind: z.literal("gainAction"), amount: z.number() }),
  z.object({ kind: z.literal("gainBuy"), amount: z.number() }),
  z.object({ kind: z.literal("onPlayTag"), tag: tagSchema, score: z.number() }),
  z.object({ kind: z.literal("onBuyScore"), score: z.number() }),
  z.object({ kind: z.literal("settlementPerTag"), tag: tagSchema, points: z.number() }),
  z.object({ kind: z.literal("settlementPerDeck"), points: z.number() }),
  z.object({ kind: z.literal("settlementTagCountMult"), tag: tagSchema, mult: z.number() }),
  z.object({
    kind: z.literal("settlementFormula"),
    formula: z.literal("squareTags"),
    tags: z.array(tagSchema),
    divide: z.number(),
    cap: z.number(),
  }),
  z.object({ kind: z.literal("multiplyTagScore"), tag: tagSchema, mult: z.number() }),
  z.object({ kind: z.literal("pollution"), amount: z.number() }),
  z.object({ kind: z.literal("corruption"), amount: z.number() }),
  z.object({ kind: z.literal("populismDebuff"), amount: z.number() }),
  z.object({ kind: z.literal("passivePerTurn"), resource, amount: z.number() }),
  z.object({ kind: z.literal("costReduction"), cardType: z.union([cardType, z.literal("all")]), amount: z.number() }),
  z.object({ kind: z.literal("globalScoreMult"), mult: z.number() }),
  z.object({ kind: z.literal("extraMarketSlot"), amount: z.number() }),
  z.object({ kind: z.literal("removeScorePenalty") }),
  z.object({ kind: z.literal("triggerBonusTag"), tag: tagSchema, score: z.number() }),
  z.object({ kind: z.literal("settlementMultTag"), tag: tagSchema, mult: z.number() }),
]);

export const cardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: cardType,
  tags: z.array(tagSchema).min(1).max(3),
  cost: z.number().min(0),
  tier: z.enum(["start", "B", "A", "S"]),
  text: z.string(),
  onPlay: z.array(effectSchema).optional(),
  trigger: z.array(effectSchema).optional(),
  settlement: z.array(effectSchema).optional(),
  deadInHand: z.boolean().optional(),
});

export const relicSchema = z.object({
  id: z.string(),
  name: z.string(),
  rarity: z.enum(["common", "rare", "legendary"]),
  role: z.string(),
  text: z.string(),
  price: z.number().min(0),
  passive: z.array(effectSchema).optional(),
  trigger: z.array(effectSchema).optional(),
  settlement: z.array(effectSchema).optional(),
});

export const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  text: z.string(),
  price: z.number().min(0),
  passive: z.array(effectSchema).optional(),
});

export const cardsFileSchema = z.array(cardSchema);
export const relicsFileSchema = z.array(relicSchema);
export const policiesFileSchema = z.array(policySchema);
