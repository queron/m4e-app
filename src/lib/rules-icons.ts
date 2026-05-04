export type RulesIconKey =
  | "soulstone"
  | "ram"
  | "mask"
  | "tome"
  | "crow"
  | "positive"
  | "negative"
  | "melee"
  | "missile"
  | "magic"
  | "pulse"
  | "aura"
  | "signature"
  | "fortitude"
  | "defense"
  | "willpower"
  | "speed"
  | "size"
  | "keyword"
  | "versatile"
  | "unique"
  | "master"
  | "totem"
  | "strategy"
  | "collection"
  | "prediction"
  | "draft"
  | "score";

export type RulesIcon = {
  key: RulesIconKey;
  label: string;
  meaning: string;
};

export const RULES_ICONS: Record<RulesIconKey, RulesIcon> = {
  soulstone: {
    key: "soulstone",
    label: "Soulstone",
    meaning: "Soulstone cost, pool, drain, or infusion."
  },
  ram: {
    key: "ram",
    label: "Ram",
    meaning: "Rams suit, equivalent to hearts in the Fate Deck."
  },
  mask: {
    key: "mask",
    label: "Mask",
    meaning: "Masks suit, equivalent to diamonds in the Fate Deck."
  },
  tome: {
    key: "tome",
    label: "Tome",
    meaning: "Tomes suit, equivalent to clubs in the Fate Deck."
  },
  crow: {
    key: "crow",
    label: "Crow",
    meaning: "Crows suit, equivalent to spades in the Fate Deck."
  },
  positive: {
    key: "positive",
    label: "Positive flip",
    meaning: "Positive fate modifier."
  },
  negative: {
    key: "negative",
    label: "Negative flip",
    meaning: "Negative fate modifier."
  },
  melee: {
    key: "melee",
    label: "Melee",
    meaning: "Melee attack action type."
  },
  missile: {
    key: "missile",
    label: "Missile",
    meaning: "Missile attack action type."
  },
  magic: {
    key: "magic",
    label: "Magic",
    meaning: "Magic attack action type."
  },
  pulse: {
    key: "pulse",
    label: "Pulse",
    meaning: "Pulse range or area effect."
  },
  aura: {
    key: "aura",
    label: "Aura",
    meaning: "Aura range or area effect."
  },
  signature: {
    key: "signature",
    label: "Signature action",
    meaning: "Signature action marker."
  },
  fortitude: {
    key: "fortitude",
    label: "Fortitude",
    meaning: "Defensive ability category marker."
  },
  defense: {
    key: "defense",
    label: "Defense",
    meaning: "Defense stat."
  },
  willpower: {
    key: "willpower",
    label: "Willpower",
    meaning: "Willpower stat."
  },
  speed: {
    key: "speed",
    label: "Speed",
    meaning: "Speed stat."
  },
  size: {
    key: "size",
    label: "Size",
    meaning: "Size stat."
  },
  keyword: {
    key: "keyword",
    label: "Keyword",
    meaning: "Crew keyword or hiring keyword."
  },
  versatile: {
    key: "versatile",
    label: "Versatile",
    meaning: "Versatile model."
  },
  unique: {
    key: "unique",
    label: "Unique",
    meaning: "Unique model."
  },
  master: {
    key: "master",
    label: "Master",
    meaning: "Master station."
  },
  totem: {
    key: "totem",
    label: "Totem",
    meaning: "Totem station."
  },
  strategy: {
    key: "strategy",
    label: "Strategy",
    meaning: "Selected strategy or strategy fit."
  },
  collection: {
    key: "collection",
    label: "Collection",
    meaning: "Models available in the player's collection."
  },
  prediction: {
    key: "prediction",
    label: "Prediction",
    meaning: "Predicted opponent pick."
  },
  draft: {
    key: "draft",
    label: "Draft",
    meaning: "Draft crew planning output."
  },
  score: {
    key: "score",
    label: "Score",
    meaning: "Recommendation score dimension."
  }
};

export const TRIGGER_SUIT_ICONS: Record<string, RulesIconKey> = {
  r: "ram",
  m: "mask",
  t: "tome",
  c: "crow",
  s: "soulstone"
};

export const RANGE_ICON_PREFIXES: Record<string, RulesIconKey> = {
  y: "melee",
  q: "missile",
  z: "magic",
  p: "pulse",
  a: "aura"
};

export const ACTION_NAME_PREFIXES: Record<string, RulesIconKey> = {
  f: "signature",
  s: "soulstone"
};

export function iconForKeyword(keyword: string): RulesIconKey | undefined {
  const normalized = keyword.toLowerCase();
  if (normalized === "master") return "master";
  if (normalized === "totem") return "totem";
  if (normalized === "unique") return "unique";
  if (normalized === "versatile") return "versatile";
  return undefined;
}

export function actionPrefixIcon(name: string): RulesIconKey | undefined {
  const prefix = name.trim().match(/^([fs])\s+/i)?.[1]?.toLowerCase();
  return prefix ? ACTION_NAME_PREFIXES[prefix] : undefined;
}

export function cleanActionName(name: string): string {
  return name.replace(/^[fs]\s+/i, "");
}

export function rangeIcon(range?: string): RulesIconKey | undefined {
  if (!range) return undefined;
  return RANGE_ICON_PREFIXES[range.trim()[0]?.toLowerCase()];
}

export function cleanRange(range?: string): string {
  if (!range) return "";
  return range.replace(/^[yqzpa]/i, "");
}
