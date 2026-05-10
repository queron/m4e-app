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
  instructions?: string[];
  sourceVersion?: string;
};

export type StrategyPool = {
  id: string;
  name: string;
  source: string;
  schemePoolId: string;
  strategies: Strategy[];
};

export const STRATEGY_POOLS: StrategyPool[] = [
  {
    id: "gg-zero",
    name: "Gaining Grounds Zero",
    source: "M4E current Gaining Grounds packet",
    schemePoolId: "gg-zero",
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
    schemePoolId: "m3e-gg1-incomplete",
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
    schemePoolId: "m3e-gg2-incomplete",
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
    schemePoolId: "m3e-gg3-incomplete",
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
    schemePoolId: "gg4-legacy",
    strategies: [
      {
        id: "plant-explosives-gg4",
        name: "Plant Explosives",
        tags: ["interact", "markers", "enemyHalf", "mobility", "scheme"],
        summary: "Rewards mobile carrier models, safe marker placement, and pressure into the opponent's half.",
        sourceVersion: "Gaining Grounds Season Four strategy card image attached to issue #319; subject to change.",
        instructions: [
          "After Deployment, starting with the player with Initiative, each player alternates placing Explosive Tokens on their deployed models until each player has placed a total of five Explosive Tokens on their models.",
          "Minions can have a maximum of one Explosive Token placed on them during Deployment, while non-Minions can have a maximum of two Explosive Tokens placed on them during Deployment. Models can surpass these limits during the game.",
          "A friendly-controlled model with one or more Explosive Token can take the Interact Action to discard an Explosive Token and Drop a Strategy Marker into base contact with itself. Strategy Markers cannot be Dropped within 6\" of another Strategy Marker. This Action cannot be taken if a Marker cannot be Dropped in this way.",
          "A friendly-controlled model in base contact with a Strategy Marker can take the Interact Action to discard the Strategy Marker and gain an Explosive Token.",
          "If a model with one or more Explosive Tokens is killed, a model (without Summon Upgrades) in the opposing Crew that is within 3\" of the killed model may gain the killed model's Explosive Tokens. Otherwise, they are discarded.",
          "At the end of each Turn, a Crew gains 1 VP if there are more Strategy Markers on the opponent's table half than this Crew has earned VP from this Strategy. Strategy Markers on the Centerline count as being in both table halves."
        ]
      },
      {
        id: "raid-the-vaults",
        name: "Raid The Vaults",
        tags: ["markers", "control", "durability", "center", "enemyHalf"],
        summary: "Rewards controlling central and enemy-half vault markers with durable or numerous pieces.",
        sourceVersion: "Gaining Grounds Season Four strategy card image attached to issue #319; subject to change.",
        instructions: [
          "After Deployment Zones are chosen, Drop two Strategy Markers centered on the Centerline, each 4\" to the right and left of the Centerpoint respectively. Then, Drop a Strategy Marker centered in the Center of each Table Quarter.",
          "Strategy Markers are Ht 5, Blocking, and Impassable.",
          "At the end of each Turn, a Crew earns 1 VP if Strategy Markers it controls are worth more points than VP it has gained from this Strategy. A Crew is controlling a Strategy Marker if it has more models without Summon Upgrades within 2\" and LoS of the Marker than the opposing player.",
          "Strategy Markers completely on your table half are worth 0 points.",
          "Strategy Markers on the Centerline are worth 1 point.",
          "Strategy Markers completely on the enemy table half are worth 2 points."
        ]
      },
      {
        id: "cloak-and-dagger",
        name: "Cloak and Dagger",
        tags: ["interact", "markers", "mobility", "control", "denial"],
        summary: "Rewards grabbing and stealing Intel tokens while repositioning around centerline markers.",
        sourceVersion: "Gaining Grounds Season Four strategy card image attached to issue #319; subject to change.",
        instructions: [
          "After Deployment Zones are chosen, starting with the Defending player, each player alternates Creating Strategy Markers centered on the Centerline, not within 6\" of another Strategy Marker until there are a total of 4 Strategy Markers on the Centerline.",
          "Strategy Markers are Concealing.",
          "Friendly-controlled models within 1\" of a Strategy Marker may take the Interact Action targeting that Marker, ignoring LoS, to gain 1 Intel Token. After doing so, the opposing player may Place the Strategy Marker anywhere within 4\" of its current position.",
          "Friendly-controlled models within 1\" and LoS of an enemy model with an Intel Token may take the Interact Action targeting an enemy model to take one of the target's Intel Token(s) ignoring that model's engagement range. Until the End Phase, the target may not take an Intel Token from this model.",
          "At the end of each Turn, a Crew may discard all Intel Tokens from any number of friendly models (without Insignificant) on the table. A Crew gains 1 VP if it discards more Intel Tokens this Turn in this way than it has scored VP for this Strategy."
        ]
      },
      {
        id: "stuff-the-ballots",
        name: "Stuff The Ballots",
        tags: ["interact", "markers", "spread", "control", "antiScheme"],
        summary: "Rewards repeated interact actions across many markers and the ability to deny enemy votes.",
        sourceVersion: "Gaining Grounds Season Four strategy card image attached to issue #319; subject to change.",
        instructions: [
          "After Deployment Zones are chosen, Create seven Strategy Markers:",
          "Two centered on the Centerline, each touching a different table edge.",
          "One in the center of each Table Quarter.",
          "One centered on the Centerpoint.",
          "Strategy Markers are Ht 5, Blocking, Impassable.",
          "On every Turn after the first, models within 1\" of a Strategy Marker may take the Interact Action to place a Vote Token friendly to the model's controller on the Strategy Marker. A Crew is controlling a Strategy Marker if it has more friendly Vote Tokens on the Marker than the opposing player.",
          "If at any point a Strategy Marker has a total of 6 Vote Tokens (friendly and enemy), remove all Vote Tokens from that Strategy Marker.",
          "At the end of each Turn, a Crew gains 1 VP if it is controlling more Strategy Markers, not completely on its own table half, than VP it has scored from this Strategy."
        ]
      }
    ]
  }
];

export const DEFAULT_STRATEGY_POOL_ID = "gg4-legacy";
export const DEFAULT_STRATEGY_POOL = STRATEGY_POOLS.find((pool) => pool.id === DEFAULT_STRATEGY_POOL_ID) ?? STRATEGY_POOLS[0];
export const DEFAULT_STRATEGY_ID = DEFAULT_STRATEGY_POOL.strategies[0]?.id ?? STRATEGY_POOLS[0].strategies[0].id;

export function getStrategy(poolId?: string, strategyId?: string): Strategy | undefined {
  const pool = STRATEGY_POOLS.find((candidate) => candidate.id === poolId) ?? DEFAULT_STRATEGY_POOL;
  if (!strategyId) return undefined;
  return pool.strategies.find((strategy) => strategy.id === strategyId);
}
