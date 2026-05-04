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
  schemes: Scheme[];
};

export const SCHEME_POOLS: SchemePool[] = [
  {
    id: "gg-zero",
    name: "Gaining Grounds Zero",
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
  }
];

export function getSchemePool(id?: string): SchemePool {
  return SCHEME_POOLS.find((pool) => pool.id === id) ?? SCHEME_POOLS[0];
}
