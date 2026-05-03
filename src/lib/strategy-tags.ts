import type { ModelCard, RawAction, RawAbility, TacticalTag } from "./types";

const TAG_PATTERNS: Array<[TacticalTag, RegExp]> = [
  ["antiArmor", /irreducible|ignores? armor|may not be reduced|reduce damage/i],
  ["armor", /armor|shielded|reduce damage|hard to kill|hard to wound/i],
  ["incorporeal", /incorporeal/i],
  ["healing", /heal|heals|healed|regain/i],
  ["mobility", /walk|charge|move this model|move up to|push|flight|leap|unimpeded|teleport/i],
  ["placement", /place|bury|unbury|reposition|switch/i],
  ["scheme", /scheme marker|interact|strategy marker|drop a marker/i],
  ["marker", /marker|terrain|aura|pulse|concealment|hazardous|bog|pyre|scrap|corpse/i],
  ["control", /stunned|slow|staggered|injured|move the target|discard a card|cannot|may not|must discard|obey|stagger/i],
  ["cardPressure", /discard a card|draw|look at the top card|cheat fate|hand|fate deck|insight/i],
  ["stunned", /stunned/i],
  ["slow", /slow/i],
  ["staggered", /staggered/i],
  ["injured", /injured/i],
  ["burning", /burning|pyre/i],
  ["poison", /poison/i],
  ["antiTrigger", /stunned|may not declare triggers|cannot declare triggers/i],
  ["summon", /summon|replace this model/i],
  ["demise", /demise|after this model is killed|when this model is killed/i],
  ["soulstone", /soulstone|drain a s|drain.*s|empower/i],
  ["burst", /pulse|aura|blast|within p|within [0-9]+" of the target|different enemy model/i],
  ["damage", /damage|dmg|attack action|kill|killed/i]
];

const RESIST_TAGS: Record<string, TacticalTag> = {
  Df: "defenseAttack",
  Wp: "willpowerAttack",
  Sp: "speedAttack",
  Sz: "sizeAttack"
};

export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, " - ")
    .replace(/\u2005/g, " ")
    .replace(/\u00e2\u20ac[\u2122\u02dc]/g, "'")
    .replace(/\u00e2\u20ac[\u0153\u009d]/g, '"')
    .replace(/\u00e2\u20ac\u00a2/g, " - ")
    .replace(/\u00c2/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function inferTags(parts: Array<string | undefined | null>, actions: RawAction[] = []): TacticalTag[] {
  const text = parts.map(cleanText).join(" ");
  const tags = new Set<TacticalTag>();

  for (const [tag, pattern] of TAG_PATTERNS) {
    if (pattern.test(text)) tags.add(tag);
  }

  for (const action of actions) {
    const range = cleanText(action.range);
    if (/q|z|[6-9]|1[0-9]/i.test(range)) tags.add("ranged");
    if (/y|1"|2"|3"/i.test(range)) tags.add("melee");
    const resist = cleanText(action.resist);
    if (RESIST_TAGS[resist]) tags.add(RESIST_TAGS[resist]);
  }

  return Array.from(tags);
}

export function modelRulesBlob(model: Pick<ModelCard, "name" | "keywords" | "abilities" | "actions" | "rulesText">): string {
  const abilities = model.abilities.map((ability: RawAbility) => `${ability.name} ${ability.text ?? ""}`);
  const actions = model.actions.map(actionToText);
  return [model.name, model.keywords.join(" "), ...abilities, ...actions, model.rulesText].map(cleanText).join(" ");
}

export function actionToText(action: RawAction): string {
  const triggers = (action.triggers ?? [])
    .map((trigger) => `${trigger.condition ?? ""} ${trigger.name} ${trigger.effect ?? ""}`)
    .join(" ");

  return [
    action.name,
    action.type,
    action.range,
    action.stat,
    action.resist,
    action.targetNumber,
    action.damage,
    action.effect,
    triggers
  ]
    .map(cleanText)
    .join(" ");
}

export function containsTag(model: Pick<ModelCard, "tacticalTags">, tag: TacticalTag): boolean {
  return model.tacticalTags.includes(tag);
}
