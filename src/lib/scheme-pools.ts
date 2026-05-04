import type { TacticalTag } from "./types";

export type Scheme = {
  id: string;
  name: string;
  tags: TacticalTag[];
  summary: string;
};

export type SchemePool = {
  id: string;
  name: string;
  source?: string;
  incomplete?: boolean;
  schemes: Scheme[];
};

export const SCHEME_POOLS: SchemePool[] = [
  {
    id: "gg-zero",
    name: "Gaining Grounds Zero",
    source: "M4E current Gaining Grounds packet",
    schemes: [
      { id: "breakthrough", name: "Breakthrough", tags: ["scheme", "mobility"], summary: "Rewards crews that can reach and operate in the opposing deployment zone." },
      { id: "harness-the-leyline", name: "Harness the Leyline", tags: ["marker", "scheme", "control"], summary: "Rewards marker placement and control of key table lines." },
      { id: "frame-job", name: "Frame Job", tags: ["damage", "demise"], summary: "Rewards crews that can trade pieces deliberately and punish enemy kills." },
      { id: "search-the-area", name: "Search the Area", tags: ["marker", "scheme"], summary: "Rewards efficient marker placement around important table areas." },
      { id: "assassinate", name: "Assassinate", tags: ["damage", "burst"], summary: "Rewards crews that can threaten leaders or force defensive resource use." },
      { id: "take-the-highground", name: "Take the Highground", tags: ["mobility", "placement"], summary: "Rewards vertical reach, movement tricks, and table-positioning tools." },
      { id: "scout-the-rooftops", name: "Scout the Rooftops", tags: ["mobility", "scheme"], summary: "Rewards mobile pieces that can reach awkward scoring positions." },
      { id: "grave-robbing", name: "Grave Robbing", tags: ["marker", "demise"], summary: "Rewards crews that can work around corpses, markers, and attrition points." },
      { id: "detonate-charges", name: "Detonate Charges", tags: ["marker", "scheme", "placement"], summary: "Rewards marker setup around enemy models and positional pressure." },
      { id: "runic-binding", name: "Runic Binding", tags: ["marker", "control"], summary: "Rewards crews that can place and protect a scoring marker pattern." },
      { id: "ensnare", name: "Ensnare", tags: ["control", "staggered", "slow"], summary: "Rewards crews that can restrict enemy movement and pin targets in place." },
      { id: "reshape-the-land", name: "Reshape the Land", tags: ["marker", "scheme"], summary: "Rewards crews that can repeatedly place or manipulate markers." },
      { id: "make-it-look-like-an-accident", name: "Make it Look Like an Accident", tags: ["damage", "control"], summary: "Rewards controlled damage and careful target setup." },
      { id: "public-demonstration", name: "Public Demonstration", tags: ["scheme", "control"], summary: "Rewards board presence, positioning, and public scoring pressure." },
      { id: "leave-your-mark", name: "Leave Your Mark", tags: ["scheme", "mobility", "marker"], summary: "Rewards independent scoring pieces that can place markers safely." }
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

export function getSchemePool(id?: string): SchemePool {
  return SCHEME_POOLS.find((pool) => pool.id === id) ?? SCHEME_POOLS[0];
}
