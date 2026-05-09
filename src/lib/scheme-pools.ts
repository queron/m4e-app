import type { TacticalTag } from "./types";

export type Scheme = {
  id: string;
  name: string;
  tags: TacticalTag[];
  summary: string;
  instructions?: string[];
  sourceVersion?: string;
  tier?: 1 | 2 | 3;
  nextAvailable?: string[];
  abandonNextAvailable?: string[];
};

export type SchemePool = {
  id: string;
  name: string;
  source?: string;
  incomplete?: boolean;
  schemes: Scheme[];
};

export type SchemeBranch = {
  scheme: Scheme;
  next: Scheme[];
  abandonNext: Scheme[];
};

export const SCHEME_POOLS: SchemePool[] = [
  {
    id: "gg-zero",
    name: "Gaining Grounds Zero",
    source: "M4E current Gaining Grounds packet",
    schemes: [
      { id: "breakthrough", name: "Breakthrough", tags: ["scheme", "mobility"], summary: "Rewards crews that can reach and operate in the opposing deployment zone.", tier: 1, nextAvailable: ["assassinate", "public-demonstration", "frame-job"] },
      { id: "harness-the-leyline", name: "Harness the Leyline", tags: ["marker", "scheme", "control"], summary: "Rewards marker placement and control of key table lines.", tier: 1, nextAvailable: ["assassinate", "scout-the-rooftops"] },
      { id: "frame-job", name: "Frame Job", tags: ["damage", "demise"], summary: "Rewards crews that can trade pieces deliberately and punish enemy kills.", tier: 1, nextAvailable: ["public-demonstration", "harness-the-leyline", "scout-the-rooftops"] },
      { id: "search-the-area", name: "Search the Area", tags: ["marker", "scheme"], summary: "Rewards efficient marker placement around important table areas.", tier: 1, nextAvailable: ["breakthrough", "frame-job", "harness-the-leyline"] },
      { id: "assassinate", name: "Assassinate", tags: ["damage", "burst"], summary: "Rewards crews that can threaten leaders or force defensive resource use.", tier: 1, nextAvailable: ["scout-the-rooftops", "detonate-charges", "runic-binding"] },
      { id: "take-the-highground", name: "Take the Highground", tags: ["mobility", "placement"], summary: "Rewards vertical reach, movement tricks, and table-positioning tools.", tier: 1, nextAvailable: ["make-it-look-like-an-accident", "ensnare", "search-the-area"] },
      { id: "scout-the-rooftops", name: "Scout the Rooftops", tags: ["mobility", "scheme"], summary: "Rewards mobile pieces that can reach awkward scoring positions.", tier: 1, nextAvailable: ["detonate-charges", "leave-your-mark"] },
      { id: "grave-robbing", name: "Grave Robbing", tags: ["marker", "demise"], summary: "Rewards crews that can work around corpses, markers, and attrition points." },
      { id: "detonate-charges", name: "Detonate Charges", tags: ["marker", "scheme", "placement"], summary: "Rewards marker setup around enemy models and positional pressure.", tier: 2, nextAvailable: ["runic-binding", "take-the-highground"] },
      { id: "runic-binding", name: "Runic Binding", tags: ["marker", "control"], summary: "Rewards crews that can place and protect a scoring marker pattern.", tier: 2, nextAvailable: ["leave-your-mark", "take-the-highground", "ensnare"] },
      { id: "ensnare", name: "Ensnare", tags: ["control", "staggered", "slow"], summary: "Rewards crews that can restrict enemy movement and pin targets in place.", tier: 2, nextAvailable: ["reshape-the-land", "search-the-area", "frame-job"] },
      { id: "reshape-the-land", name: "Reshape the Land", tags: ["marker", "scheme"], summary: "Rewards crews that can repeatedly place or manipulate markers.", tier: 2, nextAvailable: ["search-the-area", "breakthrough", "public-demonstration"] },
      { id: "make-it-look-like-an-accident", name: "Make it Look Like an Accident", tags: ["damage", "control"], summary: "Rewards controlled damage and careful target setup.", tier: 2, nextAvailable: ["ensnare", "reshape-the-land", "breakthrough"] },
      { id: "public-demonstration", name: "Public Demonstration", tags: ["scheme", "control"], summary: "Rewards board presence, positioning, and public scoring pressure.", tier: 2, nextAvailable: ["harness-the-leyline", "assassinate", "detonate-charges"] },
      { id: "leave-your-mark", name: "Leave Your Mark", tags: ["scheme", "mobility", "marker"], summary: "Rewards independent scoring pieces that can place markers safely.", tier: 2, nextAvailable: ["take-the-highground", "make-it-look-like-an-accident", "reshape-the-land"] }
    ]
  },
  {
    id: "m3e-gg1-incomplete",
    name: "Gaining Grounds Season One",
    source: "M3E Season One legacy packet",
    incomplete: true,
    schemes: []
  },
  {
    id: "m3e-gg2-incomplete",
    name: "Gaining Grounds Season Two",
    source: "M3E Season Two legacy packet",
    incomplete: true,
    schemes: []
  },
  {
    id: "m3e-gg3-incomplete",
    name: "Gaining Grounds Season Three",
    source: "M3E Season Three legacy packet",
    incomplete: true,
    schemes: []
  },
  {
    id: "gg4-legacy",
    name: "Gaining Grounds Season Four",
    source: "M3E Season Four legacy packet",
    schemes: [
      { id: "let-them-bleed-gg4", name: "Let Them Bleed", tags: ["damage", "burst"], summary: "Rewards pressuring multiple expensive enemy models below half health." },
      { id: "death-beds-gg4", name: "Death Beds", tags: ["damage", "marker", "scheme"], summary: "Rewards kills near both friendly Scheme Markers and chosen non-Scheme markers." },
      { id: "power-ritual-gg4", name: "Power Ritual", tags: ["marker", "scheme", "mobility"], summary: "Rewards reaching table corners and maintaining marker access across the board." },
      { id: "in-your-face-gg4", name: "In Your Face", tags: ["damage", "mobility", "scheme"], summary: "Rewards killing costly enemy models near leaders and projecting a high-cost piece into the enemy deployment zone." },
      { id: "deliver-a-message-gg4", name: "Deliver a Message", tags: ["mobility", "scheme", "control"], summary: "Rewards a chosen non-leader that can safely reach enemy masters or leaders." },
      { id: "outflank-gg4", name: "Outflank", tags: ["mobility", "scheme", "marker"], summary: "Rewards splitting mobile models to opposite centerline edges with friendly Scheme Marker support." },
      { id: "hold-up-their-forces-gg4", name: "Hold Up Their Forces", tags: ["control", "melee", "armor"], summary: "Rewards cheap or durable models that can engage different higher-cost enemies." },
      { id: "espionage-gg4", name: "Espionage", tags: ["marker", "scheme", "mobility"], summary: "Rewards placing Scheme Markers across your deployment zone, the centerline, and the enemy deployment zone." },
      { id: "sweating-bullets-gg4", name: "Sweating Bullets", tags: ["melee", "control"], summary: "Rewards a chosen non-leader that can contest the center and tie up enemy masters or henchmen." },
      { id: "information-overload-gg4", name: "Information Overload", tags: ["marker", "scheme", "mobility"], summary: "Rewards out-marker pressure, especially with multiple Scheme Markers in the enemy half." },
      { id: "take-prisoner-gg4", name: "Take Prisoner", tags: ["control", "melee", "staggered"], summary: "Rewards isolating a chosen enemy minion or enforcer and keeping it controlled late." },
      { id: "protected-territory-gg4", name: "Protected Territory", tags: ["marker", "scheme", "mobility"], summary: "Rewards safe, spread-out Scheme Markers in the enemy half with friendly presence." },
      { id: "ensnare-gg4", name: "Ensnare", tags: ["marker", "scheme", "control"], summary: "Rewards trapping important enemy models with nearby friendly Scheme Marker patterns." }
    ]
  }
];

export const DEFAULT_SCHEME_POOL_ID = "gg4-legacy";
export const DEFAULT_SCHEME_POOL = SCHEME_POOLS.find((pool) => pool.id === DEFAULT_SCHEME_POOL_ID) ?? SCHEME_POOLS[0];

export function getSchemePool(id?: string): SchemePool {
  return SCHEME_POOLS.find((pool) => pool.id === id) ?? DEFAULT_SCHEME_POOL;
}

export function hasSchemeGraph(pool: SchemePool): boolean {
  return !pool.incomplete && pool.schemes.some((scheme) => (scheme.nextAvailable?.length ?? 0) > 0 || (scheme.abandonNextAvailable?.length ?? 0) > 0);
}

export function getSchemeBranches(pool: SchemePool): SchemeBranch[] {
  const byId = new Map(pool.schemes.map((scheme) => [scheme.id, scheme]));
  return pool.schemes
    .filter((scheme) => (scheme.nextAvailable?.length ?? 0) > 0 || (scheme.abandonNextAvailable?.length ?? 0) > 0)
    .map((scheme) => ({
      scheme,
      next: (scheme.nextAvailable ?? []).map((id) => byId.get(id)).filter(Boolean) as Scheme[],
      abandonNext: (scheme.abandonNextAvailable ?? []).map((id) => byId.get(id)).filter(Boolean) as Scheme[]
    }));
}

export function getReachableSchemes(pool: SchemePool, startingSchemeId: string, depth = 2): Scheme[] {
  const byId = new Map(pool.schemes.map((scheme) => [scheme.id, scheme]));
  const results: Scheme[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: startingSchemeId, depth: 0 }];
  const seen = new Set<string>([startingSchemeId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= depth) continue;
    const scheme = byId.get(current.id);
    if (!scheme) continue;

    for (const nextId of [...(scheme.nextAvailable ?? []), ...(scheme.abandonNextAvailable ?? [])]) {
      if (seen.has(nextId)) continue;
      const next = byId.get(nextId);
      if (!next) continue;
      seen.add(nextId);
      results.push(next);
      queue.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  return results;
}

export function validateSchemeGraph(pool: SchemePool): string[] {
  const ids = new Set(pool.schemes.map((scheme) => scheme.id));
  return pool.schemes.flatMap((scheme) =>
    [...(scheme.nextAvailable ?? []), ...(scheme.abandonNextAvailable ?? [])]
      .filter((id) => !ids.has(id))
      .map((id) => `${pool.name}: ${scheme.name} references unknown scheme id ${id}.`)
  );
}
