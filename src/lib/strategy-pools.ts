export type StrategyTag =
  | "interact"
  | "markers"
  | "mobility"
  | "center"
  | "spread"
  | "enemyHalf"
  | "control"
  | "durability"
  | "scheme"
  | "denial"
  | "killing"
  | "antiScheme";

export type Strategy = {
  id: string;
  name: string;
  tags: StrategyTag[];
  summary: string;
};

export type StrategyPool = {
  id: string;
  name: string;
  source: string;
  strategies: Strategy[];
};

export const STRATEGY_POOLS: StrategyPool[] = [
  {
    id: "gg-zero",
    name: "Gaining Grounds Zero",
    source: "M4E current Gaining Grounds packet",
    strategies: [
      {
        id: "plant-explosives",
        name: "Plant Explosives",
        tags: ["interact", "markers", "enemyHalf", "mobility", "scheme"],
        summary: "Rewards crews that can carry, protect, and place scoring pressure into the opposing half."
      },
      {
        id: "boundary-dispute",
        name: "Boundary Dispute",
        tags: ["center", "control", "durability", "denial"],
        summary: "Rewards durable board control and contesting shared table space over repeated turns."
      },
      {
        id: "recover-evidence",
        name: "Recover Evidence",
        tags: ["interact", "killing", "mobility", "denial"],
        summary: "Rewards pieces that can remove or pressure enemy models, then safely recover evidence."
      },
      {
        id: "informants",
        name: "Informants",
        tags: ["interact", "mobility", "control", "spread"],
        summary: "Rewards mobile models that can reach enemy pieces and control where scoring interactions happen."
      }
    ]
  },
  {
    id: "m3e-gg1",
    name: "Gaining Grounds Season One",
    source: "M3E Season One legacy packet",
    strategies: [
      {
        id: "symbols-of-authority-gg1",
        name: "Symbols of Authority",
        tags: ["interact", "markers", "enemyHalf", "mobility", "denial"],
        summary: "Rewards fast, resilient models that can reach enemy markers and remove them under pressure."
      },
      {
        id: "recover-evidence-gg1",
        name: "Recover Evidence",
        tags: ["interact", "killing", "markers", "mobility", "denial"],
        summary: "Rewards crews that can pressure marked enemy models, then safely remove the dropped evidence markers."
      },
      {
        id: "corrupted-ley-lines-gg1",
        name: "Corrupted Ley Lines",
        tags: ["interact", "markers", "mobility", "durability", "control"],
        summary: "Rewards a protected lodestone carrier, handoff support, and enough mobility to claim multiple markers."
      },
      {
        id: "public-enemies-gg1",
        name: "Public Enemies",
        tags: ["killing", "durability", "control", "denial"],
        summary: "Rewards efficient damage, controlled kills, and durability to protect models holding bounty value."
      }
    ]
  },
  {
    id: "m3e-gg2",
    name: "Gaining Grounds Season Two",
    source: "M3E Season Two legacy packet",
    strategies: [
      {
        id: "symbols-of-authority-gg2",
        name: "Symbols of Authority",
        tags: ["interact", "markers", "enemyHalf", "mobility", "denial"],
        summary: "Rewards models that can cross the table, survive contact, and remove enemy authority markers."
      },
      {
        id: "turf-war-gg2",
        name: "Turf War",
        tags: ["center", "control", "durability", "interact", "killing"],
        summary: "Rewards crews that can convert and hold central strategy markers while picking fights in the right quarters."
      },
      {
        id: "corrupted-ley-lines-gg2",
        name: "Corrupted Ley Lines",
        tags: ["interact", "markers", "mobility", "durability", "control"],
        summary: "Rewards a durable lodestone plan, efficient handoffs, and enough reach to claim scattered markers."
      },
      {
        id: "break-the-line-gg2",
        name: "Break The Line",
        tags: ["interact", "markers", "enemyHalf", "mobility", "control"],
        summary: "Rewards crews that can move strategy markers across the centerline and keep pressure deep into enemy space."
      }
    ]
  },
  {
    id: "m3e-gg3",
    name: "Gaining Grounds Season Three",
    source: "M3E Season Three legacy packet",
    strategies: [
      {
        id: "cursed-objects-gg3",
        name: "Cursed Objects",
        tags: ["killing", "interact", "denial", "durability", "control"],
        summary: "Rewards crews that can manage cursed targets, pass tokens at the right time, and kill priority models reliably."
      },
      {
        id: "guard-the-stash-gg3",
        name: "Guard The Stash",
        tags: ["center", "control", "durability", "denial"],
        summary: "Rewards durable board control around multiple strategy markers outside your own table half."
      },
      {
        id: "carve-a-path-gg3",
        name: "Carve A Path",
        tags: ["interact", "markers", "enemyHalf", "mobility", "control"],
        summary: "Rewards models that can push strategy markers forward while resisting denial around the centerline."
      },
      {
        id: "covert-operation-gg3",
        name: "Covert Operation",
        tags: ["interact", "markers", "mobility", "spread", "denial"],
        summary: "Rewards flexible scorers that can reach different centerline markers and avoid engagement at scoring time."
      }
    ]
  },
  {
    id: "gg4-legacy",
    name: "Gaining Grounds Season Four",
    source: "M3E Season Four legacy packet",
    strategies: [
      {
        id: "plant-explosives-gg4",
        name: "Plant Explosives",
        tags: ["interact", "markers", "enemyHalf", "mobility", "scheme"],
        summary: "Rewards mobile carrier models, safe marker placement, and pressure into the opponent's half."
      },
      {
        id: "raid-the-vaults",
        name: "Raid The Vaults",
        tags: ["markers", "control", "durability", "center", "enemyHalf"],
        summary: "Rewards controlling central and enemy-half vault markers with durable or numerous pieces."
      },
      {
        id: "cloak-and-dagger",
        name: "Cloak and Dagger",
        tags: ["interact", "markers", "mobility", "control", "denial"],
        summary: "Rewards grabbing and stealing Intel tokens while repositioning around centerline markers."
      },
      {
        id: "stuff-the-ballots",
        name: "Stuff The Ballots",
        tags: ["interact", "markers", "spread", "control", "antiScheme"],
        summary: "Rewards repeated interact actions across many markers and the ability to deny enemy votes."
      }
    ]
  }
];

export function getStrategy(poolId?: string, strategyId?: string): Strategy | undefined {
  const pool = STRATEGY_POOLS.find((candidate) => candidate.id === poolId) ?? STRATEGY_POOLS[0];
  return pool.strategies.find((strategy) => strategy.id === strategyId) ?? pool.strategies[0];
}
