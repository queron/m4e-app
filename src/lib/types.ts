import type { Strategy } from "./strategy-pools";
import type { Scheme, SchemePool } from "./scheme-pools";

export type CardType = "unit" | "crew" | "upgrade" | "unknown";

export type RawAbility = {
  name: string;
  text?: string;
};

export type RawTrigger = {
  condition?: string;
  name: string;
  effect?: string;
};

export type RawAction = {
  name: string;
  type?: "attack" | "tactical" | string;
  range?: string;
  stat?: string;
  resist?: string;
  targetNumber?: string;
  damage?: string;
  effect?: string;
  triggers?: RawTrigger[];
};

export type RawCard = {
  sourceFile: string;
  cardType: CardType;
  faction?: string;
  copyId?: string;
  name: string;
  keywords?: string[];
  cost?: number | string;
  statBlock?: {
    defense?: number;
    speed?: number;
    willpower?: number;
    size?: number;
  };
  abilities?: RawAbility[];
  abilitiesGranted?: RawAbility[];
  actions?: RawAction[];
  rulesText?: string;
};

export type ModelCard = {
  id: string;
  cardType: "unit";
  name: string;
  faction: string;
  sourceFile: string;
  keywords: string[];
  traits: string[];
  strategicKeywords: string[];
  cost: number;
  isFree: boolean;
  isMaster: boolean;
  isTotem: boolean;
  isUnique: boolean;
  maxCopies: number;
  leaderModelCount: number;
  statBlock: {
    defense: number;
    speed: number;
    willpower: number;
    size: number;
  };
  abilities: RawAbility[];
  actions: RawAction[];
  rulesText: string;
  textIndex: string;
  tacticalTags: TacticalTag[];
};

export type CrewCard = {
  id: string;
  cardType: "crew";
  name: string;
  faction: string;
  masterHint: string;
  keywordHint: string;
  sourceFile: string;
  abilities: RawAbility[];
  actions: RawAction[];
  rulesText: string;
  tacticalTags: TacticalTag[];
};

export type UpgradeCard = {
  id: string;
  cardType: "upgrade";
  name: string;
  faction: string;
  sourceFile: string;
  abilitiesGranted: RawAbility[];
  rulesText: string;
  tacticalTags: TacticalTag[];
};

export type CardCatalog = {
  factions: string[];
  models: ModelCard[];
  masters: ModelCard[];
  crewCards: CrewCard[];
  upgrades: UpgradeCard[];
};

export type CatalogSummaryModel = Omit<ModelCard, "abilities" | "actions" | "rulesText" | "textIndex"> & {
  abilities: Array<Pick<RawAbility, "name">>;
  actions: Array<Pick<RawAction, "name" | "type" | "range" | "stat" | "resist" | "targetNumber" | "damage">>;
  rulesText: "";
  textIndex: string;
  detailLoaded: false;
};

export type CatalogSummaryCrewCard = Omit<CrewCard, "abilities" | "actions" | "rulesText"> & {
  abilities: Array<Pick<RawAbility, "name">>;
  actions: Array<Pick<RawAction, "name" | "type" | "range" | "stat" | "resist" | "targetNumber" | "damage">>;
  rulesText: "";
};

export type CatalogSummaryUpgradeCard = Omit<UpgradeCard, "abilitiesGranted" | "rulesText"> & {
  abilitiesGranted: Array<Pick<RawAbility, "name">>;
  rulesText: "";
};

export type CatalogSummary = Omit<CardCatalog, "models" | "masters" | "crewCards" | "upgrades"> & {
  models: CatalogSummaryModel[];
  masters: CatalogSummaryModel[];
  crewCards: CatalogSummaryCrewCard[];
  upgrades: CatalogSummaryUpgradeCard[];
};

export type TacticalTag =
  | "damage"
  | "burst"
  | "armor"
  | "incorporeal"
  | "healing"
  | "mobility"
  | "placement"
  | "scheme"
  | "marker"
  | "control"
  | "cardPressure"
  | "stunned"
  | "slow"
  | "staggered"
  | "injured"
  | "burning"
  | "poison"
  | "antiArmor"
  | "antiTrigger"
  | "summon"
  | "demise"
  | "ranged"
  | "melee"
  | "willpowerAttack"
  | "defenseAttack"
  | "speedAttack"
  | "sizeAttack"
  | "soulstone";

export type PlannerInput = {
  playerFaction: string;
  playerMasterId: string;
  opponentFaction: string;
  opponentMasterId: string;
  ownedModelIds: string[];
  opponentModelIds: string[];
  pointLimit: number;
  modelLimit?: number;
  strategyPoolId?: string;
  strategyId?: string;
  schemePoolId?: string;
};

export type ModelEvaluationInput = {
  playerMasterId: string;
  opponentMasterId: string;
  modelId: string;
  opponentModelIds?: string[];
  strategyPoolId?: string;
  strategyId?: string;
};

export type CrewValidation = {
  legal: boolean;
  totalCost: number;
  pointLimit: number;
  modelCount: number;
  modelLimit: number;
  issues: string[];
  modelIssues: Record<string, string[]>;
  hiredModelCosts: HiredModelCost[];
};

export type HireKind = "keyword" | "versatile" | "outOfKeyword" | "illegal";

export type HireDetails = {
  legal: boolean;
  kind: HireKind;
  printedCost: number;
  hireCost: number;
  tax: number;
  reason: string;
};

export type HiredModelCost = HireDetails & {
  modelId: string;
  modelName: string;
};

export type RecommendationPath = {
  kind: "available" | "optimal";
  totalCost: number;
  remainingPoints: number;
  validation: CrewValidation;
  models: ModelRecommendation[];
  synergyGroups: SynergyGroup[];
  tempoProfile: TempoProfile;
};

export type SynergyGroup = {
  name: string;
  job: string;
  rationale: string;
  models: ModelCard[];
};

export type ModelRecommendation = {
  model: ModelCard;
  owned: boolean;
  hireCost: number;
  printedCost: number;
  hireTax: number;
  hireKind: HireKind;
  hireReason: string;
  confidence: "High" | "Medium" | "Low";
  trace: string[];
  curatedNotes: string[];
  score: number;
  role: string;
  secondaryRoles?: string[];
  versatility?: RoleVersatility;
  scoreBreakdown: {
    masterAbilities: number;
    crewSynergy: number;
    compositionMatchup: number;
  };
  why: string[];
  relevantTech: string[];
  priorityTargets: string[];
  alliedSynergies: string[];
  terrainTools: string[];
  tempoTags: string[];
  vulnerabilityFlags: VulnerabilityFlag[];
};

export type VersatilityJob = "score" | "kill" | "control" | "support" | "contest" | "marker" | "mobility";

export type RoleVersatility = {
  band: "High" | "Medium" | "Low";
  jobs: VersatilityJob[];
  evidence: string[];
  schemeRelevance: string[];
};

export type ScoredModel = {
  model: ModelCard;
  score: number;
  role: string;
  scoreBreakdown: {
    masterAbilities: number;
    crewSynergy: number;
    compositionMatchup: number;
  };
  why: string[];
  relevantTech: string[];
  priorityTargets: string[];
  alliedSynergies: string[];
  vulnerabilityFlags: VulnerabilityFlag[];
};

export type VulnerabilityFlag = {
  id: "lowWp" | "conditionExposure" | "markerDenial" | "lowMobility";
  label: string;
  severity: "High" | "Medium" | "Low";
  summary: string;
  causedBy: string[];
};

export type ModelMatchupEvaluation = {
  modelId: string;
  legal: boolean;
  hireReason: string;
  hireCost: number;
  printedCost: number;
  hireTax: number;
  fit?: {
    band: "High" | "Medium" | "Low";
    score: number;
    role: string;
  };
  whyHelps: string[];
  struggleNotes: string[];
  strategyContribution: string[];
  duplicateValue?: string;
  vulnerabilityFlags: VulnerabilityFlag[];
};

export type MatchupAnalysis = {
  generatedAt: string;
  match: {
    strategy?: Strategy;
    strategyPoolId?: string;
    schemePool?: SchemePool;
    pointLimit: number;
  };
  schemeWatchlist?: SchemeWatchlist;
  recommendedSchemePairs?: SchemePairRecommendation[];
  matchupBrief: MatchupBrief;
  vulnerabilityFlags: Record<string, VulnerabilityFlag[]>;
  playerCrew: {
    master?: ModelCard;
    crewCard?: CrewCard;
    faction: string;
    primaryKeywords: string[];
    strengths: string[];
    vulnerabilities: string[];
    playstyle: string;
    terrainMobilityProfile: TerrainMobilityProfile;
  };
  opponentCrew: {
    master?: ModelCard;
    crewCard?: CrewCard;
    faction: string;
    primaryKeywords: string[];
    plan: string;
    pressurePoints: string[];
    expectedModels: ModelCard[];
    likelyModels: ModelRecommendation[];
  };
  paths: {
    available: RecommendationPath;
    optimal: RecommendationPath;
  };
};

export type TerrainMobilityProfile = {
  boardFit: "Open" | "Dense" | "Vertical" | "Flexible" | "Data-limited";
  mobilityBand: "High" | "Medium" | "Low";
  terrainTools: string[];
  terrainRisks: string[];
  recommendedTablePlan: string;
};

export type TempoJob = "score" | "fight" | "contest" | "support";

export type TempoReadiness = {
  job: TempoJob;
  band: "Strong" | "Adequate" | "Weak";
  evidence: string[];
};

export type TempoProfile = {
  overall: "Fast" | "Balanced" | "Slow" | "Setup-heavy";
  turnOnePlan: string[];
  turnTwoReadiness: TempoReadiness[];
  risks: string[];
};

export type MatchupBrief = {
  watchFor: string[];
  answerWith: string[];
  priorityHires: string[];
  matchupRisks: string[];
};

export type SchemeWatchlistItem = {
  scheme: Scheme;
  rationale: string;
};

export type SchemeWatchlist = {
  goodForPlayer: SchemeWatchlistItem[];
  opponentThreats: SchemeWatchlistItem[];
};

export type SchemePairRecommendation = {
  schemes: [Scheme, Scheme];
  rationale: string;
  requiredJobs: string[];
  opponentWatchout: string;
  confidence: "High" | "Medium" | "Low";
};
