"use client";

import Image from "next/image";
import { Component, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BadgeQuestionMark,
  AlertTriangle,
  BookOpen,
  Brain,
  CircleDot,
  CirclePlus,
  CircleMinus,
  Crosshair,
  Crown,
  Dumbbell,
  Feather,
  FileText,
  Footprints,
  Gem,
  Hexagon,
  KeyRound,
  Library,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Target,
  Waves,
  X
} from "lucide-react";
import type { CardCatalog, CatalogSummary, CrewCard, MatchupAnalysis, ModelCard, ModelMatchupEvaluation, ModelRecommendation, RecommendationPath, SynergyGroup, TacticalTag, VulnerabilityFlag } from "@/lib/types";
import masterPlaystyleNotes from "@/data/master_playstyle_notes.json";
import { SCHEME_POOLS } from "@/lib/scheme-pools";
import { STRATEGY_POOLS } from "@/lib/strategy-pools";
import { glossaryText } from "@/lib/glossary";
import { findSyntheticRuleForMaster, getMandatoryCrewEntries, getTitleTotemRules } from "@/lib/mandatory-crew";
import type { Strategy, StrategyTag } from "@/lib/strategy-pools";
import {
  actionPrefixIcon,
  cleanActionName,
  cleanRange,
  iconForKeyword,
  rangeIcon,
  RULES_ICONS,
  TRIGGER_SUIT_ICONS,
  type RulesIconKey
} from "@/lib/rules-icons";
import {
  COLLECTION_STORAGE_KEY,
  DRAFT_STORAGE_KEY,
  SHARE_PARAM,
  buildDraftSummary,
  encodeSharePayload,
  readSharedSetup,
  readStoredDrafts,
  readStoredIds,
  type DraftSummaryContext,
  type SavedDraft
} from "@/lib/client-persistence";

type PathKind = "available" | "optimal";
type ActiveResultTab = "picks" | "matchup" | "schemes" | "draft";
type MatchIntent = "core" | "tournament" | "casual" | "learning" | "narrative";
type CrewModifierId = "needMobility" | "needConditionRemoval" | "expectSummons" | "needMarkerPlan";
type MatchupDriver = {
  id: string;
  label: string;
  evidence: string[];
  sentence: string;
  strength: number;
};
type ResultsConfidence = {
  label: "High" | "Medium" | "Low";
  evidence: string;
  explanation: string;
};

const DEFAULT_POINT_LIMIT = 50;
const DEFAULT_MATCH_INTENT: MatchIntent = "core";
const INTERNAL_MODEL_LIMIT = 99;
type ModelSortMode = "name" | "costAsc" | "costDesc" | "role";
type RoleFilter = "all" | "beater" | "scheme" | "support" | "anchor" | "control";
type RecommendationSortMode = "fit" | "cost" | "role" | "name" | "owned";
type ModelDensity = "compact" | "detailed";
type SuggestedThreatModel = {
  model: ModelCard;
  role: string;
  why: string;
  badges: string[];
};
type AnalyzeReadiness = {
  status: string;
  detail: string;
  emptyState: string;
  disabledButtonLabel: string;
};

const MATCH_INTENTS: Array<{ value: MatchIntent; label: string; summary: string; recommendationLead: string }> = [
  {
    value: "core",
    label: "Balanced prep",
    summary: "Use the standard crew-planning view with neutral matchup advice.",
    recommendationLead: "Optimise the list while keeping the matchup plan readable."
  },
  {
    value: "tournament",
    label: "Tournament prep",
    summary: "Emphasise efficient counters, risk, and confidence for competitive preparation.",
    recommendationLead: "Prioritise the highest-impact hires and verify the evidence behind each risk."
  },
  {
    value: "casual",
    label: "Casual balance",
    summary: "Frame the matchup around fair, playable games and avoid harsh win/loss language.",
    recommendationLead: "Look for a balanced plan that avoids creating a frustrating table experience."
  },
  {
    value: "learning",
    label: "Learning mode",
    summary: "Surface plain-language guidance and next steps for newer or returning players.",
    recommendationLead: "Start with clear table jobs and use details to learn why each pick matters."
  },
  {
    value: "narrative",
    label: "Narrative/fun",
    summary: "Respect theme and model preference while keeping the list playable.",
    recommendationLead: "Keep the crew's theme intact, then patch the most important matchup gap."
  }
];

function intentProfile(intent: MatchIntent) {
  return MATCH_INTENTS.find((candidate) => candidate.value === intent) ?? MATCH_INTENTS[0];
}

const CREW_MODIFIERS: Array<{ id: CrewModifierId; label: string; summary: string; tags: TacticalTag[] }> = [
  {
    id: "needMobility",
    label: "I need mobility",
    summary: "Prioritise models that can reach scoring lanes, reposition, or solve spread-out scoring.",
    tags: ["mobility", "placement", "scheme"]
  },
  {
    id: "needConditionRemoval",
    label: "I need condition answers",
    summary: "Watch for Stunned, Slow, Staggered, Injured, Burning, and Poison pressure.",
    tags: ["healing", "control", "cardPressure"]
  },
  {
    id: "expectSummons",
    label: "I expect summons",
    summary: "Prioritise burst damage, denial, and scheme pressure into extra enemy bodies.",
    tags: ["burst", "damage", "scheme", "control"]
  },
  {
    id: "needMarkerPlan",
    label: "I need marker play",
    summary: "Prioritise marker, scheme, and placement tools for scoring or denial.",
    tags: ["marker", "scheme", "placement"]
  }
];
type MasterProfile = {
  gamePlan: string;
  tableJobs: string[];
  pressureVectors: TacticalTag[];
  commonRisks: string[];
};
type MasterProfileNoteMap = Record<string, Partial<MasterProfile>>;

const ROLE_FILTERS: Array<{ label: string; value: RoleFilter }> = [
  { label: "All roles", value: "all" },
  { label: "Beater", value: "beater" },
  { label: "Scheme", value: "scheme" },
  { label: "Support", value: "support" },
  { label: "Anchor", value: "anchor" },
  { label: "Control", value: "control" }
];

function buildAnalyzeReadiness({
  hasPlayerMaster,
  hasOpponentMaster,
  collectionCount
}: {
  hasPlayerMaster: boolean;
  hasOpponentMaster: boolean;
  collectionCount: number;
}): AnalyzeReadiness {
  if (!hasPlayerMaster && !hasOpponentMaster) {
    return {
      status: "Choose both masters",
      detail: "Select your master and the opposing master to enable matchup analysis.",
      emptyState: "Choose both masters to analyze. Marking collection models is optional and only constrains Available recommendations.",
      disabledButtonLabel: "Choose both masters"
    };
  }

  if (!hasPlayerMaster) {
    return {
      status: "Choose your master",
      detail: "Select your master to enable matchup analysis.",
      emptyState: "Choose your master to analyze. Opponent intel can stay limited to faction and master.",
      disabledButtonLabel: "Choose your master"
    };
  }

  if (!hasOpponentMaster) {
    return {
      status: "Choose opponent master",
      detail: "Select the opposing master to enable matchup analysis.",
      emptyState: "Choose the opponent master to analyze. Expected opposing models can be added later.",
      disabledButtonLabel: "Choose opponent master"
    };
  }

  if (collectionCount === 0) {
    return {
      status: "Ready: masters only",
      detail: "Ready: using full legal pool because no collection models are marked.",
      emptyState: "Ready to analyze with masters only. Available recommendations will use the full legal pool.",
      disabledButtonLabel: "Analyze"
    };
  }

  return {
    status: "Ready: collection marked",
    detail: "Ready: Available recommendations use your marked collection.",
    emptyState: "Ready to analyze. Available recommendations will use your marked collection.",
    disabledButtonLabel: "Analyze"
  };
}

function buildResultsConfidence({
  hasStrategy,
  opponentModelCount,
  playerModelCount,
  recommendationCount
}: {
  hasStrategy: boolean;
  opponentModelCount: number;
  playerModelCount: number;
  recommendationCount: number;
}): ResultsConfidence {
  const score = Number(hasStrategy) + Number(playerModelCount > 0) + Number(opponentModelCount > 0) + Number(recommendationCount > 0);
  const label: ResultsConfidence["label"] = score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  const evidenceParts = [
    "master profiles",
    playerModelCount > 0 ? "selected player models" : "player legal pool inferred",
    opponentModelCount > 0 ? "known opponent models" : "opponent legal pool inferred",
    hasStrategy ? "selected strategy" : "no strategy"
  ];

  return {
    label,
    evidence: evidenceParts.join(" + "),
    explanation: `${label} confidence reflects evidence completeness only. It is not a win-rate prediction.`
  };
}

function findCrewCardForSelectedMaster(master: ModelCard | undefined, catalog: CardCatalog | null): CrewCard | undefined {
  if (!master || !catalog) return undefined;
  const normalizedMaster = slugifyForMatch(master.name);
  const masterFamily = slugifyForMatch(master.name.split(",")[0] ?? master.name);
  return catalog.crewCards.find((crewCard) => {
    const source = slugifyForMatch(crewCard.sourceFile);
    return source.includes(normalizedMaster) || source.includes(masterFamily);
  });
}

function buildMasterProfile(master: ModelCard | undefined, crewCard?: CrewCard): MasterProfile {
  if (!master) {
    return {
      gamePlan: "Choose a master to see its game plan.",
      tableJobs: ["Select a faction and master"],
      pressureVectors: [],
      commonRisks: ["No master selected"]
    };
  }

  const curated = (masterPlaystyleNotes as MasterProfileNoteMap)[master.name] ?? {};
  const tags = Array.from(new Set([...master.tacticalTags, ...(crewCard?.tacticalTags ?? [])]));
  const primaryTags = tags.slice(0, 4);
  const role = modelRole({ tacticalTags: tags });

  return {
    gamePlan: curated.gamePlan ?? `${master.name} usually starts from a ${role} posture built around ${formatVisibleTags(primaryTags)}.`,
    tableJobs: curated.tableJobs ?? [
      `Lead with ${role} pieces`,
      `Hire support that reinforces ${formatVisibleTags(primaryTags.slice(0, 3))}`,
      "Keep one model free for scenario work"
    ],
    pressureVectors: curated.pressureVectors ?? primaryTags,
    commonRisks: curated.commonRisks ?? [
      "Can become predictable if every hire doubles down on the same tags",
      "Needs at least one independent scorer or denial piece",
      crewCard ? `Crew card leans ${formatVisibleTags(crewCard.tacticalTags.slice(0, 3))}; protect that plan from direct counters.` : "Crew-card data is limited, so verify table roles before finalizing."
    ]
  };
}

export default function MalifauxWorkbench() {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [playerFaction, setPlayerFaction] = useState("");
  const [opponentFaction, setOpponentFaction] = useState("");
  const [playerMasterId, setPlayerMasterId] = useState("");
  const [opponentMasterId, setOpponentMasterId] = useState("");
  const [ownedModelIds, setOwnedModelIds] = useState<string[]>([]);
  const [opponentModelIds, setOpponentModelIds] = useState<string[]>([]);
  const [pointLimit, setPointLimit] = useState(DEFAULT_POINT_LIMIT);
  const [strategyPoolId, setStrategyPoolId] = useState(STRATEGY_POOLS[0].id);
  const [strategyId, setStrategyId] = useState(STRATEGY_POOLS[0].strategies[0].id);
  const [schemePoolId, setSchemePoolId] = useState(SCHEME_POOLS[0].id);
  const [matchIntent, setMatchIntent] = useState<MatchIntent>(DEFAULT_MATCH_INTENT);
  const [crewModifierIds, setCrewModifierIds] = useState<CrewModifierId[]>([]);
  const [pathKind, setPathKind] = useState<PathKind>("available");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [opponentSearch, setOpponentSearch] = useState("");
  const [analysis, setAnalysis] = useState<MatchupAnalysis | null>(null);
  const [analyzedCollectionCount, setAnalyzedCollectionCount] = useState(0);
  const [draftPath, setDraftPath] = useState<RecommendationPath | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelCard | null>(null);
  const [selectedModelDetailLoading, setSelectedModelDetailLoading] = useState(false);
  const [selectedModelDetailError, setSelectedModelDetailError] = useState("");
  const [selectedModelEvaluation, setSelectedModelEvaluation] = useState<ModelMatchupEvaluation | null>(null);
  const [selectedModelEvaluationLoading, setSelectedModelEvaluationLoading] = useState(false);
  const [selectedModelEvaluationError, setSelectedModelEvaluationError] = useState("");
  const modelOpenerRef = useRef<HTMLElement | null>(null);
  const selectedModelRequestRef = useRef(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState<ActiveResultTab>("picks");
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const refreshingForUpdateRef = useRef(false);

  useEffect(() => {
    fetch("/api/cards")
      .then((response) => response.json())
      .then((data: CatalogSummary) => {
        setCatalog(data);
        const restored = readSharedSetup(data);
        if (restored.warnings.length > 0) {
          setStatusMessage(restored.warnings.slice(0, 3).join(" "));
        }
        const restoredSetup = restored.setup;
        setPlayerFaction(restoredSetup?.playerFaction ?? "");
        setOpponentFaction(restoredSetup?.opponentFaction ?? "");
        if (restoredSetup?.playerMasterId) setPlayerMasterId(restoredSetup.playerMasterId);
        if (restoredSetup?.opponentMasterId) setOpponentMasterId(restoredSetup.opponentMasterId);
        if (restoredSetup?.ownedModelIds) setOwnedModelIds(restoredSetup.ownedModelIds);
        if (restoredSetup?.opponentModelIds) setOpponentModelIds(restoredSetup.opponentModelIds);
        if (restoredSetup?.pointLimit) setPointLimit(restoredSetup.pointLimit);
        if (restoredSetup?.strategyPoolId) setStrategyPoolId(restoredSetup.strategyPoolId);
        if (restoredSetup?.strategyId) setStrategyId(restoredSetup.strategyId);
        if (restoredSetup?.schemePoolId) setSchemePoolId(restoredSetup.schemePoolId);
        if (!restoredSetup?.ownedModelIds) setOwnedModelIds(readStoredIds(COLLECTION_STORAGE_KEY, data));
        setSavedDrafts(readStoredDrafts(data));
      })
      .catch((currentError) => {
        console.error("Card data load failed.", { currentError });
        setError("Card data could not be loaded. Refresh the app or check your connection.");
      });
  }, []);

  useEffect(() => {
    setIsOffline(!navigator.onLine);

    function updateOnlineStatus() {
      setIsOffline(!navigator.onLine);
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    if (!("serviceWorker" in navigator)) {
      return () => {
        window.removeEventListener("online", updateOnlineStatus);
        window.removeEventListener("offline", updateOnlineStatus);
      };
    }

    function markUpdateReady(worker: ServiceWorker | null) {
      if (!worker) return;
      waitingWorkerRef.current = worker;
      setUpdateAvailable(true);
    }

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      markUpdateReady(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            markUpdateReady(installingWorker);
          }
        });
      });
    }).catch(() => undefined);

    function reloadWhenUpdated() {
      if (!refreshingForUpdateRef.current) return;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", reloadWhenUpdated);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadWhenUpdated);
    };
  }, []);

  function refreshForUpdate() {
    refreshingForUpdateRef.current = true;
    waitingWorkerRef.current?.postMessage({ type: "SKIP_WAITING" });
  }

  useEffect(() => {
    if (!selectedModel) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeSelectedModel();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedModel]);

  useEffect(() => {
    if (!selectedModel || !playerMasterId || !opponentMasterId) {
      setSelectedModelEvaluation(null);
      setSelectedModelEvaluationLoading(false);
      setSelectedModelEvaluationError("");
      return;
    }

    const controller = new AbortController();
    setSelectedModelEvaluationLoading(true);
    setSelectedModelEvaluationError("");

    fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        playerMasterId,
        opponentMasterId,
        modelId: selectedModel.id,
        opponentModelIds,
        strategyPoolId,
        strategyId
      })
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Model evaluation failed.");
        setSelectedModelEvaluation(payload);
      })
      .catch((currentError) => {
        if (controller.signal.aborted) return;
        setSelectedModelEvaluation(null);
        setSelectedModelEvaluationError(currentError instanceof Error ? currentError.message : "Model evaluation failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectedModelEvaluationLoading(false);
      });

    return () => controller.abort();
  }, [selectedModel, playerMasterId, opponentMasterId, opponentModelIds, strategyPoolId, strategyId]);

  function openModel(model: ModelCard) {
    modelOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestId = selectedModelRequestRef.current + 1;
    selectedModelRequestRef.current = requestId;
    setSelectedModel(model);
    setSelectedModelDetailError("");

    if (hasFullModelDetails(model)) {
      setSelectedModelDetailLoading(false);
      return;
    }

    setSelectedModelDetailLoading(true);
    fetch(`/api/cards/${encodeURIComponent(model.id)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Stat card detail could not be loaded.");
        if (selectedModelRequestRef.current === requestId) setSelectedModel(payload);
      })
      .catch((currentError) => {
        if (selectedModelRequestRef.current !== requestId) return;
        setSelectedModelDetailError(currentError instanceof Error ? currentError.message : "Stat card detail could not be loaded.");
      })
      .finally(() => {
        if (selectedModelRequestRef.current === requestId) setSelectedModelDetailLoading(false);
      });
  }

  function closeSelectedModel() {
    selectedModelRequestRef.current += 1;
    setSelectedModel(null);
    setSelectedModelDetailLoading(false);
    setSelectedModelDetailError("");
    requestAnimationFrame(() => modelOpenerRef.current?.focus());
  }

  const playerMasters = useMemo(
    () => catalog?.masters.filter((model) => model.faction === playerFaction) ?? [],
    [catalog, playerFaction]
  );
  const opponentMasters = useMemo(
    () => catalog?.masters.filter((model) => model.faction === opponentFaction) ?? [],
    [catalog, opponentFaction]
  );

  const playerMaster = useMemo(
    () => catalog?.models.find((model) => model.id === playerMasterId),
    [catalog, playerMasterId]
  );
  const opponentMaster = useMemo(
    () => catalog?.models.find((model) => model.id === opponentMasterId),
    [catalog, opponentMasterId]
  );
  const playerCrewCard = useMemo(
    () => findCrewCardForSelectedMaster(playerMaster, catalog),
    [catalog, playerMaster]
  );
  const opponentCrewCard = useMemo(
    () => findCrewCardForSelectedMaster(opponentMaster, catalog),
    [catalog, opponentMaster]
  );
  const selectedModelVulnerabilityFlags = useMemo(
    () => selectedModel && analysis ? analysis.vulnerabilityFlags[selectedModel.id] ?? [] : [],
    [analysis, selectedModel]
  );
  const playerMasterProfile = useMemo(
    () => buildMasterProfile(playerMaster, playerCrewCard),
    [playerMaster, playerCrewCard]
  );
  const opponentMasterProfile = useMemo(
    () => buildMasterProfile(opponentMaster, opponentCrewCard),
    [opponentMaster, opponentCrewCard]
  );

  useEffect(() => {
    if (playerMasterId && !playerMasters.some((master) => master.id === playerMasterId)) {
      setPlayerMasterId("");
    }
    setAnalysis(null);
  }, [playerMasters, playerMasterId]);

  useEffect(() => {
    if (opponentMasterId && !opponentMasters.some((master) => master.id === opponentMasterId)) {
      setOpponentMasterId("");
    }
    setAnalysis(null);
  }, [opponentMasters, opponentMasterId]);

  useEffect(() => {
    if (!catalog) return;
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(ownedModelIds));
  }, [catalog, ownedModelIds]);

  useEffect(() => {
    if (!catalog) return;
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(savedDrafts));
  }, [catalog, savedDrafts]);

  const playerPool = useMemo(() => {
    if (!catalog || !playerMaster) return [];
    const masterKeywords = new Set(playerMaster.strategicKeywords.map((keyword) => keyword.toLowerCase()));
    return catalog.models
      .filter((model) => !model.isMaster && model.cost > 0)
      .filter(
        (model) =>
          model.faction === playerFaction ||
          model.strategicKeywords.some((keyword) => masterKeywords.has(keyword.toLowerCase()))
      )
      .filter((model) => matchesSearch(model, collectionSearch));
  }, [catalog, playerFaction, playerMaster, collectionSearch]);

  const opponentPool = useMemo(() => {
    if (!catalog || !opponentMaster) return [];
    const masterKeywords = new Set(opponentMaster.strategicKeywords.map((keyword) => keyword.toLowerCase()));
    return catalog.models
      .filter((model) => !model.isMaster && model.cost > 0)
      .filter(
        (model) =>
          model.faction === opponentFaction ||
          model.strategicKeywords.some((keyword) => masterKeywords.has(keyword.toLowerCase()))
      )
      .filter((model) => matchesSearch(model, opponentSearch));
  }, [catalog, opponentFaction, opponentMaster, opponentSearch]);

  const selectedPath = analysis?.paths[pathKind];
  const strategyPool = STRATEGY_POOLS.find((pool) => pool.id === strategyPoolId) ?? STRATEGY_POOLS[0];
  const strategy = strategyPool.strategies.find((candidate) => candidate.id === strategyId) ?? strategyPool.strategies[0];
  const schemePool = SCHEME_POOLS.find((pool) => pool.id === schemePoolId) ?? SCHEME_POOLS[0];
  const selectedIntent = intentProfile(matchIntent);
  const collectionModels = useMemo(
    () => (catalog ? ownedModelIds.map((id) => catalog.models.find((model) => model.id === id)).filter(Boolean) as ModelCard[] : []),
    [catalog, ownedModelIds]
  );
  const canAnalyze = Boolean(playerMasterId && opponentMasterId);
  const analyzeButtonLabel = isAnalyzing ? "Analyzing..." : analysis ? "Analyze again" : "Analyze";
  const analyzeReadiness = buildAnalyzeReadiness({
    hasPlayerMaster: Boolean(playerMasterId),
    hasOpponentMaster: Boolean(opponentMasterId),
    collectionCount: ownedModelIds.length
  });
  const resultsConfidence = analysis
    ? buildResultsConfidence({
        hasStrategy: Boolean(analysis.match.strategy),
        opponentModelCount: analysis.opponentCrew.expectedModels.length,
        playerModelCount: analyzedCollectionCount,
        recommendationCount: selectedPath?.models.length ?? 0
      })
    : null;
  const playerRequiredModels = useMemo(
    () => (catalog && playerMaster ? getMandatoryModelsForMaster(playerMaster, catalog.models) : []),
    [catalog, playerMaster]
  );

  async function analyze() {
    if (!playerMasterId || !opponentMasterId) return;
    setIsAnalyzing(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerFaction,
          playerMasterId,
          opponentFaction,
          opponentMasterId,
          ownedModelIds,
          opponentModelIds,
          pointLimit,
          strategyPoolId,
          strategyId,
          schemePoolId,
          modelLimit: INTERNAL_MODEL_LIMIT
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Analysis failed.");
      setAnalysis(payload);
      setAnalyzedCollectionCount(ownedModelIds.length);
      setDraftPath(null);
      setPathKind("available");
      setActiveResultTab("picks");
      setSetupCollapsed(true);
      setStatusMessage("Analysis ready. Setup panels collapsed for comparison.");
    } catch (currentError) {
      console.error("Analysis failed.", {
        currentError,
        context: {
          activeResultTab,
          hasAnalysis: Boolean(analysis),
          opponentMasterId,
          playerMasterId,
          pointLimit,
          setupCollapsed,
          strategyId,
          strategyPoolId
        }
      });
      setError(currentError instanceof Error ? `Analysis failed: ${currentError.message}` : "Analysis failed while generating matchup.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function clearAnalysisAndKeepSetup() {
    setAnalysis(null);
    setDraftPath(null);
    setSetupCollapsed(false);
    setStatusMessage("Analysis cleared. Setup selections are still available.");
  }

  function toggleCrewModifier(id: CrewModifierId) {
    setCrewModifierIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function shareSetup() {
    const payload = {
      playerFaction,
      playerMasterId,
      opponentFaction,
      opponentMasterId,
      ownedModelIds,
      opponentModelIds,
      pointLimit,
      strategyPoolId,
      strategyId,
      schemePoolId
    };
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_PARAM, encodeSharePayload(payload));
    await navigator.clipboard.writeText(url.toString());
    setStatusMessage("Share link copied.");
  }

  function printPlan() {
    window.print();
  }

  function clearCollection() {
    setOwnedModelIds([]);
    setStatusMessage("Collection selections cleared.");
  }

  function saveDraft(path: RecommendationPath) {
    const requiredCost = playerRequiredModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
    const totalCost = requiredCost + path.totalCost;
    const summary = buildDraftSummary(playerRequiredModels, path, pointLimit, draftSummaryContext());
    const draft: SavedDraft = {
      id: `${Date.now()}`,
      name: `${playerMaster?.name ?? "Crew"} into ${opponentMaster?.name ?? "opponent"}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalCost,
      modelIds: path.models.map((recommendation) => recommendation.model.id),
      playerFaction,
      playerMasterId,
      opponentFaction,
      opponentMasterId,
      pointLimit,
      strategyPoolId,
      strategyId,
      path,
      summary
    };
    setSavedDrafts((drafts) => [draft, ...drafts].slice(0, 12));
    setStatusMessage("Draft saved locally.");
  }

  function loadDraft(draft: SavedDraft) {
    if (draft.playerFaction) setPlayerFaction(draft.playerFaction);
    if (draft.playerMasterId) setPlayerMasterId(draft.playerMasterId);
    if (draft.opponentFaction) setOpponentFaction(draft.opponentFaction);
    if (draft.opponentMasterId) setOpponentMasterId(draft.opponentMasterId);
    if (draft.pointLimit) setPointLimit(draft.pointLimit);
    if (draft.strategyPoolId) setStrategyPoolId(draft.strategyPoolId);
    if (draft.strategyId) setStrategyId(draft.strategyId);
    setDraftPath(draft.path ?? null);
    setActiveResultTab("draft");
    setSetupCollapsed(false);
    setStatusMessage("Draft loaded. Review opponent intel before analyzing again.");
  }

  function duplicateDraft(draft: SavedDraft) {
    const now = new Date().toISOString();
    setSavedDrafts((drafts) => [
      {
        ...draft,
        id: `${Date.now()}`,
        name: `Copy of ${draft.name}`,
        createdAt: now,
        updatedAt: now
      },
      ...drafts
    ].slice(0, 12));
    setStatusMessage("Draft duplicated.");
  }

  function renameDraft(draftId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSavedDrafts((drafts) =>
      drafts.map((draft) => (draft.id === draftId ? { ...draft, name: trimmed, updatedAt: new Date().toISOString() } : draft))
    );
    setStatusMessage("Draft renamed.");
  }

  function deleteDraft(draftId: string) {
    setSavedDrafts((drafts) => drafts.filter((draft) => draft.id !== draftId));
    setStatusMessage("Draft deleted.");
  }

  async function exportDraft(path: RecommendationPath) {
    await navigator.clipboard.writeText(buildDraftSummary(playerRequiredModels, path, pointLimit, draftSummaryContext()));
    setStatusMessage("Draft export copied.");
  }

  function draftSummaryContext(): DraftSummaryContext {
    return {
      strategyPoolName: strategyPool.name,
      strategyName: strategy.name,
      playerMasterName: playerMaster?.name,
      opponentMasterName: opponentMaster?.name,
      schemePairings: analysis?.recommendedSchemePairs
    };
  }

  if (!catalog) {
    return (
      <main className="shell">
        <section className="loading">Loading Malifaux card pool...</section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brandLockup">
          <Image className="appLogo" src="/brand/m4e-logo-192.png" alt="" aria-hidden="true" width={56} height={56} priority />
          <div>
          <p className="eyebrow">Malifaux 4E</p>
            <h1>Crew Optimizer</h1>
          </div>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {statusMessage ? <div className="infoCallout globalStatus">{statusMessage}</div> : null}
      {isOffline ? <div className="infoCallout globalStatus">Offline mode: using cached app shell and card data when available.</div> : null}
      {updateAvailable ? (
        <div className="infoCallout globalStatus updateStatus">
          <span>New card data or app updates are available.</span>
          <button className="subtleButton" type="button" onClick={refreshForUpdate}>
            Refresh to update
          </button>
        </div>
      ) : null}

      <nav className="setupStepper" aria-label="Counter-pick setup sequence">
        <span>1. Match</span>
        <span>2. Player Collection</span>
        <span>3. Opponent Intel</span>
        <span>4. Analyze</span>
      </nav>

      <section className="panel matchPanel">
        <div className="panelHeader">
          <h2>
            <span className="stepBadge">1</span>
            <RulesIcon iconKey="strategy" /> Match
            <InlineHelp label="Match setup help" text={analyzeReadiness.detail} />
          </h2>
        </div>
        <div className="matchGrid">
          <label>
            Strategy Pool
            <InlineHelp label="Strategy help" text={glossaryText("strategy")} />
            <select
              value={strategyPoolId}
              onChange={(event) => {
                const nextPool = STRATEGY_POOLS.find((pool) => pool.id === event.target.value) ?? STRATEGY_POOLS[0];
                setStrategyPoolId(nextPool.id);
                setStrategyId(nextPool.strategies[0].id);
                setSchemePoolId(nextPool.schemePoolId);
              }}
            >
              {STRATEGY_POOLS.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Strategy
            <InlineHelp label="Strategy help" text={glossaryText("strategy")} />
            <select value={strategyId} onChange={(event) => setStrategyId(event.target.value)}>
              {strategyPool.strategies.map((poolStrategy) => (
                <option key={poolStrategy.id} value={poolStrategy.id}>
                  {poolStrategy.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Scheme Pool
            <InlineHelp label="Scheme help" text={glossaryText("scheme")} />
            <select value={schemePoolId} onChange={(event) => setSchemePoolId(event.target.value)}>
              {SCHEME_POOLS.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.incomplete ? `${pool.name} - incomplete` : pool.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Intent
            <InlineHelp label="Crew help" text={glossaryText("crew")} />
            <select value={matchIntent} onChange={(event) => setMatchIntent(event.target.value as MatchIntent)}>
              {MATCH_INTENTS.map((intent) => (
                <option key={intent.value} value={intent.value}>
                  {intent.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Soulstones
            <InlineHelp label="Soulstones help" text={glossaryText("soulstones")} />
            <input value={pointLimit} min={1} max={150} type="number" onChange={(event) => setPointLimit(Number(event.target.value))} />
          </label>
        </div>
        <div className="actionBar">
          <button className="subtleButton" type="button" onClick={shareSetup}>Copy share link</button>
          <button className="subtleButton" type="button" onClick={printPlan}>Print view</button>
          <button className="subtleButton" type="button" onClick={clearCollection}>Clear collection</button>
        </div>
        <p className="matchSummary">{strategy.summary}</p>
        <p className="intentSummary">
          <strong>{selectedIntent.label}:</strong> {selectedIntent.summary}
        </p>
        <div className="crewModifierPicker" aria-label="Crew adjustment focus">
          <span>Crew adjustments</span>
          <div>
            {CREW_MODIFIERS.map((modifier) => (
              <button
                className={crewModifierIds.includes(modifier.id) ? "active" : ""}
                key={modifier.id}
                type="button"
                aria-pressed={crewModifierIds.includes(modifier.id)}
                onClick={() => toggleCrewModifier(modifier.id)}
                title={modifier.summary}
              >
                {modifier.label}
              </button>
            ))}
          </div>
        </div>
        {schemePool.incomplete ? (
          <div className="warning">Scheme data for {schemePool.name} is incomplete, so scheme pairings are intentionally limited.</div>
        ) : null}
      </section>

      <section className="plannerGrid">
        <CrewPanel
          title="Player"
          displayTitle="Player Collection"
          stepNumber={2}
          factions={catalog.factions}
          faction={playerFaction}
          setFaction={setPlayerFaction}
          masters={playerMasters}
          master={playerMaster}
          allModels={catalog.models}
          matchupMaster={opponentMaster}
          profile={playerMasterProfile}
          masterId={playerMasterId}
          setMasterId={setPlayerMasterId}
          pool={playerPool}
          selectedIds={ownedModelIds}
          setSelectedIds={setOwnedModelIds}
          search={collectionSearch}
          setSearch={setCollectionSearch}
          selectionLabel="In Collection"
          selectedSummaryLabel="Collection marked"
          totalSummaryLabel="Displayed total"
          helperText="Then mark models in your collection. This builds the Available recommendation pool, not your hired crew."
          strategy={strategy}
          selectedCountLabel="in collection"
          collapsed={setupCollapsed}
          setCollapsed={setSetupCollapsed}
          onOpenModel={openModel}
        />
        <CrewPanel
          title="Opponent"
          displayTitle="Opponent Intel"
          stepNumber={3}
          factions={catalog.factions}
          faction={opponentFaction}
          setFaction={setOpponentFaction}
          masters={opponentMasters}
          master={opponentMaster}
          allModels={catalog.models}
          matchupMaster={playerMaster}
          profile={opponentMasterProfile}
          masterId={opponentMasterId}
          setMasterId={setOpponentMasterId}
          pool={opponentPool}
          selectedIds={opponentModelIds}
          setSelectedIds={setOpponentModelIds}
          search={opponentSearch}
          setSearch={setOpponentSearch}
          selectionLabel="Expected"
          helperText="Choose the opposing master, then mark enemy models you know or expect. Leave empty to predict from their legal pool."
          strategy={strategy}
          selectedCountLabel="known"
          collapsed={setupCollapsed}
          setCollapsed={setSetupCollapsed}
          onOpenModel={openModel}
        />
      </section>

      {analysis ? (
        <ResultsErrorBoundary
          context={{
            activeResultTab,
            hasAnalysis: Boolean(analysis),
            opponentMasterId,
            playerMasterId,
            setupCollapsed,
            strategyId,
            strategyPoolId
          }}
          onClearAnalysis={clearAnalysisAndKeepSetup}
          resetKey={`${analysis.match.strategy?.id ?? strategyId}-${activeResultTab}-${setupCollapsed}`}
        >
        <section className="analysisGrid">
          <div className="postAnalyzeSummary">
            <div>
              <h2>
                {analysis.playerCrew.master?.name ?? "Player"} vs {analysis.opponentCrew.master?.name ?? "Opponent"}
              </h2>
              <p>{analysis.match.strategy?.name ?? strategy.name} - {strategyPool.name} - {analysis.match.pointLimit}ss</p>
              <p className="intentResultSummary">{selectedIntent.label}: {selectedIntent.summary}</p>
            </div>
            <button className="subtleButton" type="button" onClick={() => setSetupCollapsed(false)}>
              Edit setup
            </button>
          </div>
          {resultsConfidence ? (
            <ResultsContextBar
              cardCount={catalog?.models.length ?? 0}
              confidence={resultsConfidence}
              pointLimit={analysis.match.pointLimit}
              strategy={analysis.match.strategy}
              strategyPoolName={strategyPool.name}
            />
          ) : null}
          <MatchupBriefPanel brief={analysis.matchupBrief} />
          <NextStepsPanel
            brief={analysis.matchupBrief}
            opponentPressure={analysis.opponentCrew.pressurePoints}
            path={selectedPath}
            strategy={analysis.match.strategy}
          />
          <MatchupDriversPanel brief={analysis.matchupBrief} path={selectedPath} strategy={analysis.match.strategy} />
          <StrategyImpactPanel
            opponentCrew={analysis.opponentCrew.expectedModels.length > 0 ? analysis.opponentCrew.expectedModels : analysis.opponentCrew.likelyModels.map((recommendation) => recommendation.model)}
            path={selectedPath}
            strategy={analysis.match.strategy}
          />
          <CrewAdjustmentPanel collectionModels={collectionModels} modifierIds={crewModifierIds} />
          <div className="resultTabs" role="tablist" aria-label="Analysis views">
            <button
              className={activeResultTab === "picks" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeResultTab === "picks"}
              onClick={() => setActiveResultTab("picks")}
            >
              Pick Models
            </button>
            <button
              className={activeResultTab === "matchup" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeResultTab === "matchup"}
              onClick={() => setActiveResultTab("matchup")}
            >
              Understand Matchup
            </button>
            <button
              className={activeResultTab === "schemes" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeResultTab === "schemes"}
              onClick={() => setActiveResultTab("schemes")}
            >
              Schemes
            </button>
            <button
              className={activeResultTab === "draft" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeResultTab === "draft"}
              onClick={() => setActiveResultTab("draft")}
            >
              Draft Crew
            </button>
          </div>
          {activeResultTab === "picks" ? (
            <>
              <div className="analysisColumn">
                <RecommendationPanel
                  pathKind={pathKind}
                  setPathKind={setPathKind}
                  selectedPath={selectedPath}
                  usedFullPool={pathKind === "available" && analyzedCollectionCount === 0}
                  intent={matchIntent}
                  crewModifierIds={crewModifierIds}
                  strategy={analysis.match.strategy}
                  onUsePlan={(path) => {
                    setDraftPath(path);
                    setActiveResultTab("draft");
                  }}
                  onSavePlan={saveDraft}
                  onExportPlan={exportDraft}
                  onOpenModel={openModel}
                />
              </div>
              <div className="analysisColumn">
                <LikelyCrewPanel
                  expectedModels={analysis.opponentCrew.expectedModels}
                  models={analysis.opponentCrew.likelyModels}
                  onOpenModel={openModel}
                />
              </div>
            </>
          ) : null}
          {activeResultTab === "matchup" ? (
            <>
              <MasterProfilePair
                playerProfile={buildMasterProfile(analysis.playerCrew.master, analysis.playerCrew.crewCard)}
                opponentProfile={buildMasterProfile(analysis.opponentCrew.master, analysis.opponentCrew.crewCard)}
              />
              <div className="analysisColumn">
                <CrewAnalysisCard
                  title="My Crew"
                  subtitle={`${analysis.playerCrew.primaryKeywords.join(", ")} - ${analysis.match.strategy?.name ?? "No strategy"}`}
                  playstyle={analysis.playerCrew.playstyle}
                  strengths={analysis.playerCrew.strengths}
                  vulnerabilities={analysis.playerCrew.vulnerabilities}
                />
              </div>
              <div className="analysisColumn">
                <CrewAnalysisCard
                  title="Opponent Crew"
                  subtitle={`${analysis.opponentCrew.primaryKeywords.join(", ")} - ${analysis.match.strategy?.name ?? "No strategy"}`}
                  playstyle={analysis.opponentCrew.plan}
                  strengths={analysis.opponentCrew.pressurePoints}
                  vulnerabilities={analysis.playerCrew.vulnerabilities}
                  strengthTitle="Likely Pressure"
                  vulnerabilityTitle="Your Pressure Points"
                />
                <LikelyCrewPanel
                  expectedModels={analysis.opponentCrew.expectedModels}
                  models={analysis.opponentCrew.likelyModels}
                  onOpenModel={openModel}
                />
              </div>
            </>
          ) : null}
          {activeResultTab === "schemes" && analysis.schemeWatchlist ? (
            <SchemeWatchlistPanel watchlist={analysis.schemeWatchlist} pairings={analysis.recommendedSchemePairs ?? []} />
          ) : null}
          {activeResultTab === "draft" ? (
            <div className="draftResults">
              {draftPath ? (
                <DraftCrewPanel
                  requiredModels={playerRequiredModels}
                  path={draftPath}
                  pointLimit={pointLimit}
                  summaryContext={draftSummaryContext()}
                  onOpenModel={openModel}
                />
              ) : (
                <DraftEmptyState />
              )}
              <SavedDraftsPanel
                drafts={savedDrafts}
                onLoad={loadDraft}
                onDuplicate={duplicateDraft}
                onRename={renameDraft}
                onDelete={deleteDraft}
              />
            </div>
          ) : null}
        </section>
        </ResultsErrorBoundary>
      ) : (
        <section className="emptyState">
          {analyzeReadiness.emptyState}
        </section>
      )}

      <aside className="stickyAnalyzeBar" aria-label="Analysis actions">
        <div>
          <strong><span className="stepBadge">4</span>{analyzeReadiness.status}</strong>
          <span>
            {canAnalyze
              ? analyzeReadiness.detail
              : `${playerMaster?.name ?? "No player master"} vs ${opponentMaster?.name ?? "no opponent master"} - ${strategy.name}`}
          </span>
        </div>
        <div className="stickyAnalyzeActions">
          {analysis && setupCollapsed ? (
            <button className="subtleButton" type="button" onClick={() => setSetupCollapsed(false)}>
              Edit setup
            </button>
          ) : null}
          <button className="primary" type="button" onClick={analyze} disabled={isAnalyzing || !canAnalyze}>
            {canAnalyze ? analyzeButtonLabel : analyzeReadiness.disabledButtonLabel}
          </button>
        </div>
      </aside>

      {selectedModel ? (
        <StatCardModal
          detailError={selectedModelDetailError}
          detailLoading={selectedModelDetailLoading}
          evaluation={selectedModelEvaluation}
          evaluationError={selectedModelEvaluationError}
          evaluationLoading={selectedModelEvaluationLoading}
          model={selectedModel}
          vulnerabilityFlags={selectedModelVulnerabilityFlags}
          onClose={closeSelectedModel}
        />
      ) : null}
    </main>
  );
}

type ResultsErrorBoundaryProps = {
  children: ReactNode;
  context: Record<string, unknown>;
  onClearAnalysis: () => void;
  resetKey: string;
};

type ResultsErrorBoundaryState = {
  error: Error | null;
};

class ResultsErrorBoundary extends Component<ResultsErrorBoundaryProps, ResultsErrorBoundaryState> {
  state: ResultsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ResultsErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Analysis render failed.", {
      context: this.props.context,
      error,
      errorInfo
    });
  }

  componentDidUpdate(previousProps: ResultsErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="emptyState recoveryState" role="alert">
        <h2>Something went wrong while showing this plan.</h2>
        <p>Reload the app, or clear the analysis and keep the current setup selections.</p>
        <div className="recoveryActions">
          <button className="primary" type="button" onClick={() => window.location.reload()}>
            Reload app
          </button>
          <button className="subtleButton" type="button" onClick={this.props.onClearAnalysis}>
            Clear analysis and keep setup
          </button>
        </div>
      </section>
    );
  }
}

export function CrewPanel(props: {
  title: string;
  displayTitle: string;
  stepNumber: number;
  factions: string[];
  faction: string;
  setFaction: (value: string) => void;
  masters: ModelCard[];
  master?: ModelCard;
  allModels: ModelCard[];
  profile: MasterProfile;
  matchupMaster?: ModelCard;
  masterId: string;
  setMasterId: (value: string) => void;
  pool: ModelCard[];
  selectedIds: string[];
  setSelectedIds: (value: string[]) => void;
  search: string;
  setSearch: (value: string) => void;
  selectionLabel: string;
  selectedSummaryLabel?: string;
  totalSummaryLabel?: string;
  helperText: string;
  strategy?: Strategy;
  selectedCountLabel: string;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  onOpenModel: (model: ModelCard) => void;
}) {
  const [modelSort, setModelSort] = useState<ModelSortMode>("name");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [modelDensity, setModelDensity] = useState<ModelDensity>("compact");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [showTitleComparison, setShowTitleComparison] = useState(false);
  const selected = new Set(props.selectedIds);
  const selectedCounts = countSelectedIds(props.selectedIds);
  const mandatoryModels = getMandatoryModelsForMaster(props.master, props.allModels);
  const mandatoryIds = new Set(mandatoryModels.map((entry) => entry.model.id));
  const selectedModels = props.selectedIds
    .map((id) => props.allModels.find((model) => model.id === id))
    .filter(Boolean) as ModelCard[];
  const requiredSoulstones = mandatoryModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
  const selectedSoulstones = selectedModels.reduce((sum, model) => sum + model.cost, 0);
  const totalSoulstones = requiredSoulstones + selectedSoulstones;
  const requiredCount = mandatoryModels.reduce((sum, entry) => sum + entry.quantity, 0);
  const isPlayerPanel = props.title === "Player";
  const selectedMetricLabel = props.selectedSummaryLabel ?? props.selectionLabel;
  const selectedMetricHelp = isPlayerPanel
    ? "Limits Available recommendations; this does not mean the model is hired."
    : "Marks likely or known opposing models; this does not confirm the opponent's final crew.";
  const setupBlankState = !props.faction
    ? {
        title: "Pick a faction to begin.",
        text: isPlayerPanel
          ? "Choose your faction first, then pick a master to view collection and crew options."
          : "Choose the opposing faction first, then pick their master to view likely crew options."
      }
    : !props.masterId
      ? {
          title: "Choose a master to view crew options",
          text: isPlayerPanel
            ? "Your master determines keyword, required models, and legal hiring options."
            : "The opposing master determines likely crew options and prediction context."
        }
      : null;
  const suggestedExpectedModels = isPlayerPanel ? [] : suggestedThreatModels(props.allModels, props.faction, props.master);
  const titleVariants = titleVariantsForMaster(props.master, props.masters);
  const filteredPool = props.pool
    .filter((model) => !mandatoryIds.has(model.id))
    .filter((model) => modelMatchesRoleFilter(model, roleFilter));
  const baseSections = groupModelsForMaster(
    filteredPool,
    props.master,
    props.faction,
    mandatoryModels,
    modelSort
  );
  const suggestedModelIds = new Set(suggestedExpectedModels.map((suggestion) => suggestion.model.id));
  const suggestedSection: ModelSection[] = suggestedExpectedModels.length > 0
    ? [
        {
          title: "Suggested Threats",
          models: suggestedExpectedModels.map((suggestion) => ({
            model: suggestion.model,
            quantity: 1,
            forced: false,
            note: suggestion.why,
            badges: [suggestion.role, ...suggestion.badges]
          })),
          action: (
            <button
              className="subtleButton"
              type="button"
              onClick={() => {
                const nextIds = Array.from(new Set([
                  ...props.selectedIds,
                  ...suggestedExpectedModels
                    .filter((suggestion) => !selected.has(suggestion.model.id))
                    .slice(0, 3)
                    .map((suggestion) => suggestion.model.id)
                ]));
                props.setSelectedIds(nextIds);
              }}
              disabled={suggestedExpectedModels.every((suggestion) => selected.has(suggestion.model.id))}
            >
              Mark top 3 suggestions
            </button>
          )
        }
      ]
    : [];
  const sections: ModelSection[] = [
    baseSections[0],
    ...suggestedSection,
    ...baseSections.slice(1).map((section) => ({
      ...section,
      models: section.models.filter((entry) => !suggestedModelIds.has(entry.model.id))
    }))
  ];

  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 720px)").matches;
    if (!compactViewport) {
      setCollapsedSections({});
      return;
    }
    setCollapsedSections({
      "Versatile Models": true,
      "Faction Models": true
    });
  }, [props.faction, props.masterId]);

  function isSectionCollapsed(title: string) {
    if (props.search.trim()) return false;
    return Boolean(collapsedSections[title]);
  }

  function toggleSection(title: string) {
    setCollapsedSections((current) => ({ ...current, [title]: !current[title] }));
  }

  function toggle(id: string) {
    props.setSelectedIds(selected.has(id) ? props.selectedIds.filter((item) => item !== id) : [...props.selectedIds, id]);
  }

  function setModelQuantity(model: ModelCard, quantity: number) {
    const clampedQuantity = Math.max(1, Math.min(model.maxCopies, quantity));
    const withoutModel = props.selectedIds.filter((id) => id !== model.id);
    props.setSelectedIds([...withoutModel, ...Array.from({ length: clampedQuantity }, () => model.id)]);
  }

  function chooseMaster(masterId: string) {
    props.setMasterId(masterId);
    props.setSelectedIds([]);
    setShowTitleComparison(false);
  }

  return (
    <section className={`panel faction-${slugifyForMatch(props.faction)} ${props.collapsed ? "collapsedPanel" : ""}`}>
      <div className="panelHeader">
        <h2>
          <span className="stepBadge">{props.stepNumber}</span>
          <RulesIcon iconKey={isPlayerPanel ? "collection" : "prediction"} /> {props.displayTitle}
          {!props.collapsed ? (
            <InlineHelp
              label={isPlayerPanel ? "Collection help" : "Opponent intel help"}
              text={props.helperText}
            />
          ) : null}
        </h2>
      </div>
      <div className="spendSummary">
        <span>
          Required models: {requiredCount}
          <InlineHelp label="Required model help" text={`${glossaryText("requiredModel")} ${glossaryText("totem")}`} />
        </span>
        <span>
          {selectedMetricLabel}: {props.selectedIds.length}
          <InlineHelp
            label={`${selectedMetricLabel} help`}
            text={isPlayerPanel ? `${selectedMetricHelp} ${glossaryText("keyword")}` : `${selectedMetricHelp} ${glossaryText("expectedModel")}`}
          />
        </span>
        <strong>{props.totalSummaryLabel ?? "Displayed cost"}: {totalSoulstones}ss</strong>
        {props.collapsed ? (
          <button className="subtleButton" type="button" onClick={() => props.setCollapsed(false)}>
            Edit
          </button>
        ) : null}
      </div>
      {props.collapsed ? (
        <div className="collapsedSummary">
          <strong>{props.faction}</strong>
          <span>{props.master?.name ?? "No master selected"}</span>
        </div>
      ) : (
        <>
      <div className="formGrid">
        <label>
          Faction
          <select
            value={props.faction}
            onChange={(event) => {
              props.setFaction(event.target.value);
              props.setMasterId("");
              props.setSelectedIds([]);
            }}
          >
            <option value="">Pick a faction</option>
            {props.factions.map((faction) => (
              <option key={faction} value={faction}>
                {faction}
              </option>
            ))}
          </select>
        </label>
        <MasterCombobox
          disabled={!props.faction}
          masters={props.masters}
          value={props.masterId}
          onChange={chooseMaster}
        />
      </div>
      {setupBlankState ? (
        <CrewPanelBlankState iconKey={isPlayerPanel ? "collection" : "prediction"} title={setupBlankState.title} text={setupBlankState.text} />
      ) : (
        <>
      {titleVariants.length > 1 ? (
        <div className="titleCompareCallout">
          <div>
            <strong>Master Plan</strong>
            <p>{titleVariants.length} title variants available. Compare game plan, crew construction, and matchup fit in one place.</p>
          </div>
            <button className="subtleButton" type="button" onClick={() => setShowTitleComparison((current) => !current)}>
              {showTitleComparison ? "Hide comparison" : "Compare titles"}
            </button>
        </div>
      ) : null}
      {showTitleComparison && props.master ? (
        <MasterTitleComparison
          allModels={props.allModels}
          matchupMaster={props.matchupMaster}
          onChoose={chooseMaster}
          onOpenModel={props.onOpenModel}
          selectedMasterId={props.masterId}
          strategy={props.strategy}
          variants={titleVariants}
        />
      ) : null}
      {titleVariants.length <= 1 ? <MasterProfileDisclosure profile={props.profile} /> : null}
      <input
        className="search"
        value={props.search}
        placeholder="Search models, abilities, actions, rules, keywords"
        onChange={(event) => props.setSearch(event.target.value)}
      />
      <div className="listControls">
        <label>
          Sort
          <select value={modelSort} onChange={(event) => setModelSort(event.target.value as ModelSortMode)}>
            <option value="name">Name</option>
            <option value="costAsc">Cost low</option>
            <option value="costDesc">Cost high</option>
            <option value="role">Role</option>
          </select>
        </label>
        <label>
          Role
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
            {ROLE_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Density
          <select value={modelDensity} onChange={(event) => setModelDensity(event.target.value as ModelDensity)}>
            <option value="compact">Compact</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>
      <HelpDisclosure className="helperText" label="Required models" text={`${glossaryText("requiredModel")} ${glossaryText("totem")}`} />
      <div className="modelList">
        {sections.map((section) => (
          <div className="modelSection" key={section.title}>
            <div className="modelSectionHeader">
              <button
                aria-expanded={!isSectionCollapsed(section.title)}
                className="sectionToggle"
                type="button"
                onClick={() => toggleSection(section.title)}
              >
                <RulesIcon iconKey={sectionIcon(section.title)} /> {section.title}
              </button>
              {sectionGlossaryText(section.title) ? (
                <InlineHelp label={`${section.title} help`} text={sectionGlossaryText(section.title)} />
              ) : null}
              <span className="modelSectionMeta">
                <span>{section.models.length}</span>
                {section.action}
              </span>
            </div>
            {isSectionCollapsed(section.title) ? (
              <div className="modelSectionCollapsed">{section.models.length} models hidden</div>
            ) : section.models.length > 0 ? (
              expandSectionEntries(section.models).map((entry, index) => (
                <ModelRow
                  key={`${section.title}-${entry.model.id}-${index}`}
                  model={entry.model}
                  selected={entry.forced || selected.has(entry.model.id)}
                  selectedQuantity={entry.forced ? 1 : selectedCounts.get(entry.model.id) ?? 0}
                  selectionLabel={entry.forced ? "Required" : props.selectionLabel}
                  checkboxLabel={entry.forced ? undefined : selectionCheckboxLabel(entry.model, selected.has(entry.model.id), isPlayerPanel)}
                  onToggle={entry.forced ? undefined : () => toggle(entry.model.id)}
                  onQuantityChange={entry.forced ? undefined : (quantity) => setModelQuantity(entry.model, quantity)}
                  onOpenModel={() => props.onOpenModel(entry.model)}
                  searchSnippet={searchMatchSnippet(entry.model, props.search)}
                  note={entry.note}
                  badges={entry.badges}
                  density={modelDensity}
                  forced={entry.forced}
                />
              ))
            ) : (
              <div className="modelSectionEmpty">No matching models, abilities, actions, rules, or keywords</div>
            )}
          </div>
        ))}
      </div>
        </>
      )}
        </>
      )}
    </section>
  );
}

function MasterCombobox({
  disabled = false,
  masters,
  value,
  onChange
}: {
  disabled?: boolean;
  masters: ModelCard[];
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  const listId = `${fieldId}-listbox`;
  const selectedMaster = masters.find((master) => master.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const filteredMasters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return masters;
    return masters.filter((master) =>
      [master.name, master.faction, master.strategicKeywords.join(" "), master.keywords.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [masters, query]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setQuery("");
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, value]);

  const activeMaster = filteredMasters[activeIndex];
  const activeOptionId = activeMaster ? `${listId}-${activeMaster.id}` : undefined;

  function choose(master: ModelCard) {
    onChange(master.id);
    setOpen(false);
    setQuery("");
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredMasters.length === 0) return;
      setActiveIndex((current) => Math.min(current + 1, filteredMasters.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredMasters.length === 0) return;
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter" && filteredMasters[activeIndex]) {
      event.preventDefault();
      choose(filteredMasters[activeIndex]);
    }
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="comboField" ref={wrapperRef}>
      <span className="comboLabel">
        Master
        <InlineHelp label="Master help" text={`${glossaryText("master")} ${glossaryText("title")}`} />
      </span>
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="comboButton"
        disabled={disabled}
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
      >
        {disabled ? "Pick a faction first" : selectedMaster?.name ?? "Pick a master"}
      </button>
      {open ? (
        <div className="comboPopover">
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoFocus
            className="comboSearch"
            placeholder="Search by master, title, or keyword"
            role="combobox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <span className="comboHint">Search by master, title, or keyword.</span>
          <div className="comboList" id={listId} role="listbox" aria-label="Master options">
            {filteredMasters.length > 0 ? (
              filteredMasters.map((master, index) => (
                <button
                  aria-selected={master.id === value}
                  className={`comboOption ${index === activeIndex ? "active" : ""}`}
                  id={`${listId}-${master.id}`}
                  key={master.id}
                  role="option"
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(master)}
                >
                  <span>{master.name}</span>
                  <small>{master.strategicKeywords.join(", ") || master.keywords.slice(0, 3).join(", ") || "Master"}</small>
                </button>
              ))
            ) : (
              <div className="comboEmpty">No masters match.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MasterTitleComparison({
  allModels,
  matchupMaster,
  onChoose,
  onOpenModel,
  selectedMasterId,
  strategy,
  variants
}: {
  allModels: ModelCard[];
  matchupMaster?: ModelCard;
  onChoose: (masterId: string) => void;
  onOpenModel: (model: ModelCard) => void;
  selectedMasterId: string;
  strategy?: Strategy;
  variants: ModelCard[];
}) {
  return (
    <section className="titleComparison" aria-label="Master title comparison">
      <div className="titleComparisonHeader">
        <div>
          <h3>Title comparison</h3>
          <p>Compare leader packages, core tags, and matchup fit before choosing a title.</p>
        </div>
      </div>
      <div className="titleComparisonGrid">
        {variants.map((variant) => {
          const mandatory = getMandatoryModelsForMaster(variant, allModels);
          const requiredNames = mandatory.map((entry) => `${entry.quantity > 1 ? `${entry.quantity}x ` : ""}${entry.model.name}`);
          const crewNotes = titleCrewRuleNotes(variant);
          const fit = titleFitSummary(variant, matchupMaster, strategy);
          const profile = buildMasterProfile(variant);
          const selected = variant.id === selectedMasterId;

          return (
            <article className={`titleComparisonCard ${selected ? "selectedTitleCard" : ""}`} key={variant.id}>
              <div className="titleCardTopline">
                <span className="expectedBadge">{fit.badge}</span>
                {selected ? <span className="ownedBadge">Selected</span> : null}
              </div>
              <button className="modelNameButton" type="button" onClick={() => onOpenModel(variant)}>
                {variant.name}
              </button>
              <span className="titleNamePart">{titleNamePart(variant)}</span>
              <div className="titleStats">
                <StatChip iconKey="defense" value={variant.statBlock.defense} />
                <StatChip iconKey="willpower" value={variant.statBlock.willpower} />
                <StatChip iconKey="speed" value={variant.statBlock.speed} />
              </div>
              <div className="chipWrap">
                {variant.strategicKeywords.slice(0, 4).map((keyword) => (
                  <RulesChip iconKey="keyword" key={keyword} label={keyword} />
                ))}
              </div>
              <TitleComparisonBlock title="Game plan" items={[profile.gamePlan]} />
              <TitleComparisonBlock title="Table jobs" items={profile.tableJobs} />
              <TitleComparisonBlock title="Pressure vectors" items={profile.pressureVectors.map(tacticalTagLabel)} />
              <TitleComparisonBlock title="Common risks" items={profile.commonRisks} />
              <TitleComparisonBlock title="Crew construction" items={[requiredNames.join(", "), ...crewNotes]} />
              <TitleComparisonBlock title="Strategy and matchup fit" items={fit.notes} />
              <button className="subtleButton" type="button" onClick={() => onChoose(variant.id)} disabled={selected}>
                {selected ? "Current title" : "Choose title"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TitleComparisonBlock({ title, items }: { title: string; items: string[] }) {
  const cleanItems = items.filter(Boolean);
  if (cleanItems.length === 0) return null;

  return (
    <div className="titleComparisonBlock">
      <strong>{title}</strong>
      <ul>{cleanItems.map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}</ul>
    </div>
  );
}

function CrewPanelBlankState({ iconKey, title, text }: { iconKey: RulesIconKey; title: string; text: string }) {
  return (
    <div className="crewPanelBlankState">
      <RulesIcon iconKey={iconKey} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ModelRow({
  model,
  selected,
  selectedQuantity,
  selectionLabel,
  checkboxLabel,
  onToggle,
  onQuantityChange,
  onOpenModel,
  searchSnippet,
  note,
  badges,
  density,
  forced = false
}: {
  model: ModelCard;
  selected: boolean;
  selectedQuantity: number;
  selectionLabel: string;
  checkboxLabel?: string;
  onToggle?: () => void;
  onQuantityChange?: (quantity: number) => void;
  onOpenModel: () => void;
  searchSnippet?: string;
  note?: string;
  badges?: string[];
  density: ModelDensity;
  forced?: boolean;
}) {
  const canSetQuantity = selected && !forced && model.maxCopies > 1;
  const showAbilityPreview = density === "detailed" || Boolean(searchSnippet);

  return (
    <div className={`modelRow ${selected ? "selected" : ""} ${forced ? "forced" : ""} density-${density}`}>
      {forced ? (
        <span className="check forcedCheck">Req</span>
      ) : (
        <button
          className="check"
          onClick={onToggle}
          type="button"
          aria-pressed={selected}
          aria-label={checkboxLabel ?? `${selected ? "Remove" : "Add"} ${model.name} ${selectionLabel.toLowerCase()}`}
        >
          {selected ? "x" : ""}
        </button>
      )}
      <span className="modelMain">
        <button className="modelNameButton" type="button" onClick={onOpenModel}>
          {model.name}
        </button>
        <small>
          <RulesIcon iconKey="soulstone" /> {model.cost} - {renderKeywordSummary(model)}
        </small>
        {showAbilityPreview ? <small>{model.abilities.slice(0, 2).map((ability) => ability.name).join("; ") || "No parsed abilities"}</small> : null}
        {searchSnippet ? <small className="searchMatchSnippet">{searchSnippet}</small> : null}
        {note ? <small className="modelRowNote">{note}</small> : null}
        {badges?.length ? (
          <span className="modelRowBadges">
            {badges.map((badge) => (
              <span className="expectedBadge" key={badge}>{badge}</span>
            ))}
          </span>
        ) : null}
      </span>
      <span className="stats statChips">
        <StatChip iconKey="defense" value={model.statBlock.defense} />
        <StatChip iconKey="willpower" value={model.statBlock.willpower} />
        <StatChip iconKey="speed" value={model.statBlock.speed} />
      </span>
      {canSetQuantity ? (
        <span className="quantityControl">
          <button type="button" onClick={() => onQuantityChange?.(selectedQuantity - 1)} disabled={selectedQuantity <= 1} aria-label={`Reduce ${model.name} quantity`}>
            -
          </button>
          <label>
            Qty
            <input
              type="number"
              min={1}
              max={model.maxCopies}
              value={selectedQuantity}
              onChange={(event) => onQuantityChange?.(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => onQuantityChange?.(selectedQuantity + 1)} disabled={selectedQuantity >= model.maxCopies} aria-label={`Increase ${model.name} quantity`}>
            +
          </button>
        </span>
      ) : null}
      <span className="pill">{selectionLabel}</span>
    </div>
  );
}

function CrewAnalysisCard({
  title,
  subtitle,
  playstyle,
  strengths,
  vulnerabilities,
  strengthTitle = "Effective Into",
  vulnerabilityTitle = "Vulnerable To"
}: {
  title: string;
  subtitle: string;
  playstyle: string;
  strengths: string[];
  vulnerabilities: string[];
  strengthTitle?: string;
  vulnerabilityTitle?: string;
}) {
  return (
    <section className="panel analysisPanel">
      <div className="panelHeader">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
      <article className="summaryBlock">
        <h3>Playstyle</h3>
        <p>{playstyle}</p>
      </article>
      <article className="summaryBlock">
        <h3>{strengthTitle}</h3>
        <ul>{strengths.map((item, index) => <li key={`${strengthTitle}-${index}-${item}`}>{item}</li>)}</ul>
      </article>
      <article className="summaryBlock">
        <h3>{vulnerabilityTitle}</h3>
        <ul>{vulnerabilities.map((item, index) => <li key={`${vulnerabilityTitle}-${index}-${item}`}>{item}</li>)}</ul>
      </article>
    </section>
  );
}

function SchemeWatchlistPanel({
  watchlist,
  pairings
}: {
  watchlist: NonNullable<MatchupAnalysis["schemeWatchlist"]>;
  pairings: NonNullable<MatchupAnalysis["recommendedSchemePairs"]>;
}) {
  return (
    <section className="schemeWatchlist panel">
      <div className="panelHeader">
        <h2>Scheme Watchlist</h2>
        <span>Scheme planning</span>
      </div>
      <div className="schemeWatchlistGrid">
        <SchemeWatchlistColumn title="Good for your crew" items={watchlist.goodForPlayer} />
        <SchemeWatchlistColumn title="Watch opponent for" items={watchlist.opponentThreats} />
      </div>
      <SchemePairingIdeas pairings={pairings} />
    </section>
  );
}

function SchemeWatchlistColumn({ title, items }: { title: string; items: NonNullable<MatchupAnalysis["schemeWatchlist"]>["goodForPlayer"] }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.scheme.id}>
              <strong>{item.scheme.name}</strong>
              <span>{item.rationale}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No strong scheme lane identified from current crew tags.</p>
      )}
    </section>
  );
}

function SchemePairingIdeas({ pairings }: { pairings: NonNullable<MatchupAnalysis["recommendedSchemePairs"]> }) {
  return (
    <div className="schemePairings">
      <h3>Scheme Pairing Ideas</h3>
      {pairings.length > 0 ? (
        <div className="schemePairingGrid">
          {pairings.map((pairing) => (
            <article key={`${pairing.schemes[0].id}-${pairing.schemes[1].id}`}>
              <strong>{pairing.schemes[0].name} + {pairing.schemes[1].name}</strong>
              <span>{pairing.confidence} confidence advisory</span>
              <p>{pairing.rationale}</p>
              <small>Jobs: {pairing.requiredJobs.slice(0, 2).join(" ")}</small>
              <small>Watchout: {pairing.opponentWatchout}</small>
            </article>
          ))}
        </div>
      ) : (
        <p>No confident scheme pair is available from the selected pool and current crew evidence.</p>
      )}
    </div>
  );
}

function MatchupBriefPanel({ brief }: { brief: MatchupAnalysis["matchupBrief"] }) {
  return (
    <section className="panel matchupBrief">
      <div className="panelHeader">
        <h2>
          <RulesIcon iconKey="strategy" /> Matchup Brief
        </h2>
        <span>Scan first</span>
      </div>
      <div className="briefGrid">
        <BriefColumn title="Watch for" items={brief.watchFor} />
        <BriefColumn title="Answer with" items={brief.answerWith} />
        <BriefColumn title="Priority hires" items={brief.priorityHires} />
        {brief.matchupRisks.length > 0 ? <BriefColumn title="Matchup risks" items={brief.matchupRisks} /> : null}
      </div>
    </section>
  );
}

function NextStepsPanel({
  brief,
  opponentPressure,
  path,
  strategy
}: {
  brief: MatchupAnalysis["matchupBrief"];
  opponentPressure: string[];
  path?: RecommendationPath;
  strategy?: Strategy;
}) {
  const steps = buildNextSteps({ brief, opponentPressure, path, strategy });

  return (
    <section className="panel nextStepsPanel">
      <div className="panelHeader">
        <h2>What to Do Next</h2>
        <span>Prep checklist</span>
      </div>
      <div className="nextStepList">
        {steps.map((step) => (
          <article key={step.label}>
            <strong>{step.label}</strong>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ResultsContextBar({
  cardCount,
  confidence,
  pointLimit,
  strategy,
  strategyPoolName
}: {
  cardCount: number;
  confidence: ResultsConfidence;
  pointLimit: number;
  strategy?: Strategy;
  strategyPoolName: string;
}) {
  const dataContext = `Local card data (${cardCount} models) | ${strategyPoolName} | ${strategy?.name ?? "No strategy selected"} | ${pointLimit}ss`;

  return (
    <section className="resultsContextBar" aria-label="Analysis confidence and data context">
      <span
        className={`confidenceContext confidence-${confidence.label.toLowerCase()}`}
        tabIndex={0}
        title={`${glossaryText("confidence")} ${confidence.explanation}`}
        aria-label={`Confidence ${confidence.label}. ${glossaryText("confidence")} ${confidence.explanation}`}
      >
        Confidence: {confidence.label}
      </span>
      <span title="The app uses the local card data included with this build, not a live meta feed.">
        Data: {dataContext}
      </span>
      <span title={confidence.explanation}>Evidence: {confidence.evidence}</span>
    </section>
  );
}

function MatchupDriversPanel({
  brief,
  path,
  strategy
}: {
  brief: MatchupAnalysis["matchupBrief"];
  path?: RecommendationPath;
  strategy?: Strategy;
}) {
  if (!path) return null;
  const topDrivers = summarizePathDrivers(path, strategy);
  const risks = summarizePathRisks(path, brief);
  const evidenceNote = path.models.length > 0
    ? "Built from recommendation reasons, tactical tags, score breakdowns, and current strategy tags."
    : "Limited evidence: no recommended models are available for this path.";

  return (
    <section className="panel matchupDrivers">
      <div className="panelHeader">
        <h2>Matchup Drivers</h2>
        <span>Why these picks trend up</span>
      </div>
      <p className="panelHint">{evidenceNote}</p>
      <div className="briefGrid">
        <BriefColumn title="Positive Drivers" items={topDrivers} />
        <BriefColumn title="Top Risks" items={risks} />
      </div>
    </section>
  );
}

function StrategyImpactPanel({
  opponentCrew,
  path,
  strategy
}: {
  opponentCrew: ModelCard[];
  path?: RecommendationPath;
  strategy?: Strategy;
}) {
  const recommendations = path?.models ?? [];
  const topFits = recommendations
    .map((recommendation) => ({
      modelName: recommendation.model.name,
      tags: strategyFitTags(recommendation.model, strategy)
    }))
    .filter((entry) => entry.tags.length > 0)
    .slice(0, 3);
  const opponentPressure = strategy ? strategyRelevantModels(opponentCrew, strategy).slice(0, 3) : [];
  const bullets = strategy
    ? [
        `${strategy.name} rewards ${strategyRewardText(strategy)}.`,
        topFits.length > 0
          ? `Your recommended hires lean toward ${topFits.map((entry) => `${entry.modelName} (${formatVisibleTags(entry.tags)})`).join("; ")}.`
          : "No current recommendation has a clear direct strategy-tag overlap, so confirm your scoring roles before locking the list.",
        opponentPressure.length > 0
          ? `Watch opposing strategy pressure from ${opponentPressure.map((entry) => `${entry.model.name} (${formatVisibleTags(entry.tags)})`).join("; ")}.`
          : "No expected opponent model has an obvious strategy-tag overlap yet; mark likely enemy models to sharpen this read."
      ]
    : ["Choose a strategy to see strategy impact."];

  return (
    <section className="panel strategyImpact">
      <div className="panelHeader">
        <h2>Strategy Impact</h2>
        <span>{strategy?.name ?? "No strategy selected"}</span>
      </div>
      <ul>
        {bullets.map((bullet, index) => (
          <li key={`${strategy?.id ?? "none"}-${index}`}>{bullet}</li>
        ))}
      </ul>
    </section>
  );
}

function CrewAdjustmentPanel({
  collectionModels,
  modifierIds
}: {
  collectionModels: ModelCard[];
  modifierIds: CrewModifierId[];
}) {
  const collectionTags = topTacticalTags(collectionModels.flatMap((model) => model.tacticalTags));
  const collectionTagSet = new Set(collectionModels.flatMap((model) => model.tacticalTags));
  const hasAnyTag = (tags: TacticalTag[]) => tags.some((tag) => collectionTagSet.has(tag));
  const selectedModifiers = CREW_MODIFIERS.filter((modifier) => modifierIds.includes(modifier.id));
  const detectedStrengths = collectionTags.length > 0
    ? [
        `Mobility ${hasAnyTag(["mobility", "placement"]) ? "present" : "not marked"} in collection signals.`,
        `Condition answers ${hasAnyTag(["healing", "control", "cardPressure"]) ? "present" : "not marked"} in collection signals.`,
        `Anti-summon pressure ${hasAnyTag(["burst", "damage", "scheme", "control"]) ? "present" : "not marked"} in collection signals.`,
        `Marker plan ${hasAnyTag(["marker", "scheme", "placement"]) ? "present" : "not marked"} in collection signals.`
      ]
    : ["No optional collection models are marked, so analysis stays close to master and legal-pool assumptions."];
  const modifierNotes = selectedModifiers.length > 0
    ? selectedModifiers.map((modifier) => {
        const alreadyCovered = modifier.tags.some((tag) => collectionTags.includes(tag));
        return alreadyCovered
          ? `${modifier.label}: your marked collection already shows ${formatVisibleTags(modifier.tags.filter((tag) => collectionTags.includes(tag)))} coverage.`
          : `${modifier.label}: ${modifier.summary}`;
      })
    : ["No manual crew adjustment focus is selected."];

  return (
    <section className="panel crewAdjustmentPanel">
      <div className="panelHeader">
        <h2>Crew Adjustments</h2>
        <span>{collectionModels.length} collection models marked</span>
      </div>
      <div className="crewAdjustmentGrid">
        <BriefColumn title="Detected Signals" items={detectedStrengths} />
        <BriefColumn title="Manual Focus" items={modifierNotes} />
      </div>
    </section>
  );
}

function BriefColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.slice(0, 4).map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MasterProfilePair({ playerProfile, opponentProfile }: { playerProfile: MasterProfile; opponentProfile: MasterProfile }) {
  return (
    <section className="masterProfilePair">
      <MasterProfileCard title="My master plan" profile={playerProfile} />
      <MasterProfileCard title="Opponent master plan" profile={opponentProfile} />
    </section>
  );
}

function MasterProfileDisclosure({ profile }: { profile: MasterProfile }) {
  return (
    <details className="masterProfileDisclosure">
      <summary>Master Plan</summary>
      <MasterProfileBody profile={profile} />
    </details>
  );
}

function MasterProfileCard({ title, profile }: { title: string; profile: MasterProfile }) {
  return (
    <section className="panel masterProfileCard">
      <div className="panelHeader">
        <h2>{title}</h2>
        <span>{profile.pressureVectors.slice(0, 2).join(", ")}</span>
      </div>
      <MasterProfileBody profile={profile} />
    </section>
  );
}

function MasterProfileBody({ profile }: { profile: MasterProfile }) {
  return (
    <div className="masterProfileBody">
      <p><strong>Game plan:</strong> {profile.gamePlan}</p>
      <ProfileList title="Table jobs" items={profile.tableJobs} />
      <ProfileList title="Pressure vectors" items={profile.pressureVectors.map(tacticalTagLabel)} />
      <ProfileList title="Common risks" items={profile.commonRisks} />
    </div>
  );
}

function ProfileList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {items.slice(0, 4).map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function RecommendationPanel({
  crewModifierIds,
  intent,
  pathKind,
  setPathKind,
  selectedPath,
  usedFullPool,
  strategy,
  onUsePlan,
  onSavePlan,
  onExportPlan,
  onOpenModel
}: {
  crewModifierIds: CrewModifierId[];
  intent: MatchIntent;
  pathKind: PathKind;
  setPathKind: (value: PathKind) => void;
  selectedPath?: RecommendationPath;
  usedFullPool: boolean;
  strategy?: Strategy;
  onUsePlan: (path: RecommendationPath) => void;
  onSavePlan: (path: RecommendationPath) => void;
  onExportPlan: (path: RecommendationPath) => void;
  onOpenModel: (model: ModelCard) => void;
}) {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [recommendationSort, setRecommendationSort] = useState<RecommendationSortMode>("fit");
  if (!selectedPath) return null;
  const intentCopy = intentProfile(intent);
  const modifierCopy = recommendationModifierCopy(crewModifierIds);
  const sortedRecommendations = sortRecommendations(selectedPath.models, recommendationSort);
  const maxRecommendationScore = Math.max(0, ...selectedPath.models.map((recommendation) => recommendation.score));
  const maxBreakdownScore = Math.max(
    1,
    ...selectedPath.models.flatMap((recommendation) => [
      recommendation.scoreBreakdown.masterAbilities,
      recommendation.scoreBreakdown.crewSynergy,
      recommendation.scoreBreakdown.compositionMatchup
    ])
  );

  return (
    <section className="panel recommendationPanel">
      <div className="panelHeader">
        <div>
          <h2>Recommendations</h2>
          <small>What the app suggests</small>
          <p className="panelHint">{intentCopy.recommendationLead}</p>
          <span>
            <RulesIcon iconKey="soulstone" /> {selectedPath.totalCost} hired / {selectedPath.remainingPoints}ss open
          </span>
        </div>
        <div className="segment">
          <button className={pathKind === "available" ? "active" : ""} onClick={() => setPathKind("available")}>
            Available
          </button>
          <button className={pathKind === "optimal" ? "active" : ""} onClick={() => setPathKind("optimal")}>
            Optimal
          </button>
        </div>
      </div>
      <button className="planButton" type="button" onClick={() => onUsePlan(selectedPath)}>
        Build draft crew from this set
      </button>
      <div className="actionBar compactActions">
        <button className="subtleButton" type="button" onClick={() => onSavePlan(selectedPath)}>
          Save draft
        </button>
        <button className="subtleButton" type="button" onClick={() => onExportPlan(selectedPath)}>
          Copy export
        </button>
      </div>
      <div className="listControls compactListControls">
        <label>
          Sort recommendations
          <select value={recommendationSort} onChange={(event) => setRecommendationSort(event.target.value as RecommendationSortMode)}>
            <option value="fit">Fit</option>
            <option value="cost">Cost</option>
            <option value="role">Role</option>
            <option value="name">Name</option>
            <option value="owned">Owned</option>
          </select>
        </label>
      </div>

      {!selectedPath.validation.legal ? (
        <div className="warning">{selectedPath.validation.issues.join(" ")}</div>
      ) : null}

      {usedFullPool ? (
        <div className="infoCallout">No collection models were selected, so Available is using the full legal model pool.</div>
      ) : null}
      {modifierCopy ? <div className="infoCallout">{modifierCopy}</div> : null}

      <div className="recommendationList">
        {sortedRecommendations.map((recommendation) => {
          const modelIssues = selectedPath.validation.modelIssues[recommendation.model.id] ?? [];
          const chips = recommendationChips(recommendation);
          const fitTags = strategyFitTags(recommendation.model, strategy);
          const fitPercent = normalizedScorePercent(recommendation.score, maxRecommendationScore);
          const plan = recommendationPlan(recommendation, strategy?.name);
          const driverRows = recommendationDrivers(recommendation, strategy);

          return (
            <article className="recommendation" key={recommendation.model.id}>
              <div className="recHeader">
                <div>
                  <h3>
                    <button className="modelNameButton recNameButton" type="button" onClick={() => onOpenModel(recommendation.model)}>
                      {recommendation.model.name}
                    </button>
                  </h3>
                  <p>
                    <RulesIcon iconKey="soulstone" /> {formatRecommendationCost(recommendation)} - {recommendation.role}
                  </p>
                </div>
                <span className="badgeGroup">
                  {recommendation.vulnerabilityFlags.length > 0 ? (
                    <span className="riskBadge" title={riskTitle(recommendation.vulnerabilityFlags)}>
                      <AlertTriangle aria-hidden="true" /> Risk
                    </span>
                  ) : null}
                  <span className={recommendation.owned ? "ownedBadge" : "missingBadge"}>
                    {recommendation.owned ? "Owned" : "Not owned"}
                  </span>
                  <span
                    className={`confidenceBadge confidence-${recommendation.confidence.toLowerCase()}`}
                    tabIndex={0}
                    title={recommendationConfidenceExplanation(recommendation.confidence)}
                    aria-label={`${recommendation.confidence} recommendation confidence. ${recommendationConfidenceExplanation(recommendation.confidence)}`}
                  >
                    {recommendation.confidence}
                  </span>
                </span>
              </div>
              {modelIssues.length > 0 ? <InlineIssues issues={modelIssues} /> : null}
              <div className="recChipRow" aria-label={`${recommendation.model.name} tactical summary`}>
                {fitTags.length > 0 ? (
                  <span className="recChip strategyFitChip" title={`${recommendation.model.name} directly supports ${strategy?.name} through ${formatVisibleTags(fitTags)}.`}>
                    Strategy fit: {formatVisibleTags(fitTags.slice(0, 2))}
                  </span>
                ) : null}
                {chips.map((chip) => (
                  <span className="recChip" key={chip.label} title={chip.title}>
                    {chip.label}
                  </span>
                ))}
              </div>
              <div className="fitSummary" aria-label={`Overall fit ${overallFitBand(fitPercent)}. Raw score ${recommendation.score}.`}>
                <div>
                  <span>Overall fit: <strong>{overallFitBand(fitPercent)}</strong></span>
                  <small>Raw score {recommendation.score}</small>
                </div>
                <div className="fitBar" aria-hidden="true">
                  <span style={{ width: `${fitPercent}%` }} />
                </div>
              </div>
              <div className="recPlan">
                <p><strong>Why this pick:</strong> {plan.why}</p>
                <p><strong>Table job:</strong> {plan.tableJob}</p>
                {plan.tradeoff ? <p><strong>Risk/tradeoff:</strong> {plan.tradeoff}</p> : null}
              </div>
              <RecommendationDriverDisclosure modelName={recommendation.model.name} rows={driverRows} />
              <div className="scoreGrid">
                <ScoreContribution
                  label="Master Counter"
                  max={maxBreakdownScore}
                  title="How directly this pick addresses the opposing master and master-specific pressure."
                  value={recommendation.scoreBreakdown.masterAbilities}
                />
                <ScoreContribution
                  label="Crew Synergy"
                  max={maxBreakdownScore}
                  title="How well this pick works with your leader, keyword, and available allied models."
                  value={recommendation.scoreBreakdown.crewSynergy}
                />
                <ScoreContribution
                  label="Strategy/Matchup Fit"
                  max={maxBreakdownScore}
                  title="How well this pick addresses the strategy, opponent composition, roles, and table demands."
                  value={recommendation.scoreBreakdown.compositionMatchup}
                />
              </div>
              <button
                className="detailsButton"
                type="button"
                aria-expanded={expandedModelId === recommendation.model.id}
                onClick={() => setExpandedModelId((current) => (current === recommendation.model.id ? null : recommendation.model.id))}
              >
                {expandedModelId === recommendation.model.id ? "Hide details" : "Details"}
              </button>
              {expandedModelId === recommendation.model.id ? (
                <>
                  <RecSection title="How to Use" items={modelUseNotes(recommendation, strategy?.name, plan)} />
                  <RecSection title="Matchup Risks" items={riskFlagNotes(recommendation.vulnerabilityFlags)} />
                  <RecSection title="Key Tech" items={recommendation.relevantTech} />
                  <RecSection title="Targets" items={recommendation.priorityTargets} />
                  <RecSection title="Synergy" items={recommendation.alliedSynergies} />
                  <RecSection title="Score Trace" items={recommendation.trace} />
                  <RecSection title="Notes" items={recommendation.curatedNotes} />
                </>
              ) : null}
            </article>
          );
        })}
      </div>
      <SynergyGroupsPanel groups={selectedPath.synergyGroups} onOpenModel={onOpenModel} />
    </section>
  );
}

function SynergyGroupsPanel({ groups, onOpenModel }: { groups: SynergyGroup[]; onOpenModel: (model: ModelCard) => void }) {
  if (groups.length === 0) {
    return (
      <section className="synergyGroups">
        <h3>Synergy Groups</h3>
        <p>No clear package identified; use these picks independently.</p>
      </section>
    );
  }

  return (
    <section className="synergyGroups">
      <h3>Synergy Groups</h3>
      <div className="synergyGroupList">
        {groups.map((group) => (
          <article className="synergyGroup" key={group.name}>
            <div>
              <h4>{group.name}</h4>
              <p>{group.job}</p>
            </div>
            <div className="synergyModels">
              {group.models.map((model) => (
                <button className="subtleButton" key={model.id} type="button" onClick={() => onOpenModel(model)}>
                  {model.name}
                </button>
              ))}
            </div>
            <p>{group.rationale}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecommendationDriverDisclosure({ modelName, rows }: { modelName: string; rows: MatchupDriver[] }) {
  return (
    <details className="driverDisclosure">
      <summary>Why this pick?</summary>
      {rows.length > 0 ? (
        <div className="driverRows" aria-label={`${modelName} matchup drivers`}>
          {rows.map((row) => (
            <article className="driverRow" key={row.id}>
              <div>
                <strong>{row.label}</strong>
                <p>{row.sentence}</p>
              </div>
              <div className="driverEvidence">
                {row.evidence.slice(0, 3).map((item, index) => (
                  <span key={`${row.id}-${index}-${item}`}>{item}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="limitedEvidence">Limited evidence: this recommendation is mostly based on broad legal-pool and matchup fit.</p>
      )}
      {rows.length > 0 && rows.length < 3 ? (
        <p className="limitedEvidence">Limited evidence: only the strongest visible drivers are shown.</p>
      ) : null}
    </details>
  );
}

export function DraftCrewPanel({
  requiredModels,
  path,
  pointLimit,
  summaryContext,
  onOpenModel
}: {
  requiredModels: Array<{ model: ModelCard; quantity: number }>;
  path: RecommendationPath;
  pointLimit: number;
  summaryContext: DraftSummaryContext;
  onOpenModel: (model: ModelCard) => void;
}) {
  const [copied, setCopied] = useState(false);
  const requiredCost = requiredModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
  const hiredCost = path.models.reduce((sum, recommendation) => sum + recommendation.hireCost, 0);
  const totalCost = requiredCost + hiredCost;
  const remaining = pointLimit - totalCost;

  async function copyDraft() {
    await navigator.clipboard.writeText(buildDraftSummary(requiredModels, path, pointLimit, summaryContext));
    setCopied(true);
  }

  return (
    <section className="panel draftPanel">
      <div className="panelHeader">
        <div>
          <h2>
            <RulesIcon iconKey="draft" /> Draft Crew
          </h2>
          <small>What I am taking</small>
          <span>
            <RulesIcon iconKey="soulstone" /> {totalCost} used / {remaining}ss open
          </span>
        </div>
        <button className="subtleButton" type="button" onClick={copyDraft}>
          {copied ? "Copied" : "Copy summary"}
        </button>
      </div>
      <div className="draftList">
        <h3>Required</h3>
        {requiredModels.map((entry, index) => (
          <div className="draftRow" key={`${entry.model.id}-${index}`}>
            <button className="draftModelButton" type="button" onClick={() => onOpenModel(entry.model)}>
              {entry.quantity}x {entry.model.name}
            </button>
            <strong><RulesIcon iconKey="soulstone" /> {entry.model.cost * entry.quantity}</strong>
          </div>
        ))}
        <h3>Draft Hires</h3>
        {path.models.map((recommendation) => (
          <div className="draftRow" key={recommendation.model.id}>
            <span>
              <button className="draftModelButton" type="button" onClick={() => onOpenModel(recommendation.model)}>
                {recommendation.model.name}
              </button>
              <InlineIssues issues={path.validation.modelIssues[recommendation.model.id] ?? []} />
            </span>
            <strong title={recommendation.hireReason}>
              <RulesIcon iconKey="soulstone" /> {formatRecommendationCost(recommendation)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function InlineIssues({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="inlineIssues">
      {issues.map((issue, index) => (
        <li key={`${issue}-${index}`}>{issue}</li>
      ))}
    </ul>
  );
}

function DraftEmptyState() {
  return (
    <section className="panel draftPanel draftEmptyState">
      <div className="panelHeader">
        <h2>
          <RulesIcon iconKey="draft" /> Draft Crew
        </h2>
        <span>No active draft</span>
      </div>
      <p>Use a recommendation set from Pick Models to create a draft crew here.</p>
    </section>
  );
}

function ScoreContribution({ label, max, title, value }: { label: string; max: number; title: string; value: number }) {
  const percent = normalizedScorePercent(value, max);

  return (
    <span className="scoreContribution" title={title} aria-label={`${label} ${value} of ${max}`}>
      <span className="scoreContributionHeader">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
      <span className="miniFitBar" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

function SavedDraftsPanel({
  drafts,
  onLoad,
  onDuplicate,
  onRename,
  onDelete
}: {
  drafts: SavedDraft[];
  onLoad: (draft: SavedDraft) => void;
  onDuplicate: (draft: SavedDraft) => void;
  onRename: (draftId: string, name: string) => void;
  onDelete: (draftId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (drafts.length === 0) return null;

  async function copyDraft(draft: SavedDraft) {
    await navigator.clipboard.writeText(draft.summary);
  }

  return (
    <section className="panel draftPanel savedDraftsPanel">
      <div className="panelHeader">
        <h2>
          <RulesIcon iconKey="draft" /> Saved Drafts
        </h2>
        <button className="subtleButton" type="button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Hide" : `Show ${drafts.length}`}
        </button>
      </div>
      {expanded ? (
        <div className="draftList">
          {drafts.map((draft) => (
            <div className="draftRow" key={draft.id}>
              <span>
                {renamingId === draft.id ? (
                  <input
                    aria-label={`Rename ${draft.name}`}
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onRename(draft.id, draftName);
                        setRenamingId(null);
                      }
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <strong>{draft.name}</strong>
                )}
                <small>{draft.totalCost}ss - {new Date(draft.createdAt).toLocaleDateString()}</small>
              </span>
              <button className="subtleButton" type="button" onClick={() => onLoad(draft)}>Load</button>
              <button className="subtleButton" type="button" onClick={() => onDuplicate(draft)}>Duplicate</button>
              {renamingId === draft.id ? (
                <>
                  <button
                    className="subtleButton"
                    type="button"
                    onClick={() => {
                      onRename(draft.id, draftName);
                      setRenamingId(null);
                    }}
                  >
                    Save
                  </button>
                  <button className="subtleButton" type="button" onClick={() => setRenamingId(null)}>Cancel</button>
                </>
              ) : (
                <button
                  className="subtleButton"
                  type="button"
                  onClick={() => {
                    setDraftName(draft.name);
                    setRenamingId(draft.id);
                  }}
                >
                  Rename
                </button>
              )}
              <button className="subtleButton" type="button" onClick={() => copyDraft(draft)}>Copy</button>
              <button className="subtleButton" type="button" onClick={() => onDelete(draft.id)}>Delete</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="panelHint">Saved locally for later planning. Expand only when you need an older draft.</p>
      )}
    </section>
  );
}

function LikelyCrewPanel({
  expectedModels,
  models,
  onOpenModel
}: {
  expectedModels: MatchupAnalysis["opponentCrew"]["expectedModels"];
  models: MatchupAnalysis["opponentCrew"]["likelyModels"];
  onOpenModel: (model: ModelCard) => void;
}) {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [predictionSort, setPredictionSort] = useState<RecommendationSortMode>("fit");
  const expectedEntries = countExpectedModels(expectedModels);
  const expectedCount = expectedEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const expectedIds = new Set(expectedEntries.map((entry) => entry.model.id));
  const predictedModels = sortRecommendations(
    models.filter((recommendation) => !expectedIds.has(recommendation.model.id)),
    predictionSort
  );
  const predictedCost = predictedModels.reduce((sum, recommendation) => sum + recommendation.hireCost, 0);

  return (
    <section className="panel recommendationPanel">
      <div className="panelHeader">
        <div>
          <h2>
            <RulesIcon iconKey="prediction" /> Opponent Picks
          </h2>
          <span>
            {expectedCount > 0
              ? `${expectedCount} expected / ${predictedModels.length} predicted`
              : <><RulesIcon iconKey="soulstone" /> {predictedCost} likely package</>}
          </span>
        </div>
      </div>
      {expectedEntries.length > 0 ? (
        <div className="opponentIntelBlock">
          <h3>Expected from Intel</h3>
          <div className="recommendationList compactRecommendationList">
            {expectedEntries.map(({ model, quantity }) => (
              <article className="recommendation" key={model.id}>
                <div className="recHeader">
                  <div>
                    <h3>
                      <button className="modelNameButton recNameButton" type="button" onClick={() => onOpenModel(model)}>
                        {model.name}{quantity > 1 ? ` x${quantity}` : ""}
                      </button>
                    </h3>
                    <p>
                      <RulesIcon iconKey="soulstone" /> {model.cost * quantity}ss - expected opponent model
                    </p>
                  </div>
                  <span className="expectedBadge">Expected</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <HelpDisclosure
        className="panelHint"
        label="Predicted by App"
        text="Estimated from legal pool, keyword fit, table job coverage, strategy needs, and hire cost. These are not confirmed opponent selections."
      />
      <div className="listControls compactListControls">
        <label>
          Sort predictions
          <select value={predictionSort} onChange={(event) => setPredictionSort(event.target.value as RecommendationSortMode)}>
            <option value="fit">Likelihood</option>
            <option value="cost">Cost</option>
            <option value="role">Role</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      <div className="recommendationList">
        {predictedModels.length === 0 ? (
          <div className="infoCallout">No additional predicted models beyond your opponent intel.</div>
        ) : null}
        {predictedModels.map((recommendation) => (
          <article className="recommendation" key={recommendation.model.id}>
            <div className="recHeader">
              <div>
                <h3>
                  <button className="modelNameButton recNameButton" type="button" onClick={() => onOpenModel(recommendation.model)}>
                    {recommendation.model.name}
                  </button>
                </h3>
                <p>
                  <RulesIcon iconKey="soulstone" /> {formatRecommendationCost(recommendation)} - {recommendation.role} - likelihood {recommendation.score}
                </p>
              </div>
              <span className="badgeGroup">
                <span className="ownedBadge">Predicted</span>
                <span
                  className={`confidenceBadge confidence-${recommendation.confidence.toLowerCase()}`}
                  tabIndex={0}
                  title={recommendationConfidenceExplanation(recommendation.confidence)}
                  aria-label={`${recommendation.confidence} prediction confidence. ${recommendationConfidenceExplanation(recommendation.confidence)}`}
                >
                  {recommendation.confidence}
                </span>
              </span>
            </div>
            <div className="scoreGrid twoScores">
              <span>Synergy {recommendation.scoreBreakdown.crewSynergy}</span>
              <span>Role {recommendation.scoreBreakdown.compositionMatchup}</span>
            </div>
            <button
              className="detailsButton"
              type="button"
              aria-expanded={expandedModelId === recommendation.model.id}
              onClick={() => setExpandedModelId((current) => (current === recommendation.model.id ? null : recommendation.model.id))}
            >
              {expandedModelId === recommendation.model.id ? "Hide details" : "Details"}
            </button>
            {expandedModelId === recommendation.model.id ? (
              <>
                <RecSection title="How to Use" items={recommendation.why} />
                <RecSection title="Key Tech" items={recommendation.relevantTech} />
                <RecSection title="Synergy" items={recommendation.alliedSynergies} />
                <RecSection title="Score Trace" items={recommendation.trace} />
                <RecSection title="Notes" items={recommendation.curatedNotes} />
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function HelpDisclosure({ label, text, className }: { label: string; text: string; className?: string }) {
  return (
    <details className={`helpDisclosure ${className ?? ""}`}>
      <summary>{label}</summary>
      <p>{text}</p>
    </details>
  );
}

function InlineHelp({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span className="inlineHelp" ref={wrapperRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={label}
        className="inlineHelpButton"
        type="button"
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;
          if (nextFocus instanceof Node && event.currentTarget.parentElement?.contains(nextFocus)) return;
          setOpen(false);
        }}
        onClick={() => setOpen((current) => !current)}
      >
        <BadgeQuestionMark aria-hidden="true" />
      </button>
      {open ? (
        <span className="inlineHelpPopover" id={popoverId} role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}

function formatRecommendationCost(recommendation: ModelRecommendation): string {
  if (recommendation.hireTax <= 0) return `${recommendation.hireCost}ss`;
  return `${recommendation.hireCost}ss (${recommendation.printedCost}+${recommendation.hireTax})`;
}

function sortRecommendations(recommendations: ModelRecommendation[], sortMode: RecommendationSortMode): ModelRecommendation[] {
  return [...recommendations].sort((a, b) => {
    if (sortMode === "cost") return a.hireCost - b.hireCost || b.score - a.score;
    if (sortMode === "role") return a.role.localeCompare(b.role) || b.score - a.score;
    if (sortMode === "name") return a.model.name.localeCompare(b.model.name);
    if (sortMode === "owned") return Number(b.owned) - Number(a.owned) || b.score - a.score;
    return b.score - a.score || a.hireCost - b.hireCost;
  });
}

function recommendationChips(recommendation: ModelRecommendation): Array<{ label: string; title: string }> {
  return [
    { label: tacticalRoleLabel(recommendation.role), title: "Recommended table role." },
    {
      label: `Strategy fit: ${fitBand(recommendation.scoreBreakdown.compositionMatchup)}`,
      title: "How strongly this pick addresses the selected strategy and matchup demands."
    },
    { label: hireKindLabel(recommendation), title: recommendation.hireReason },
    ...recommendation.vulnerabilityFlags.slice(0, 1).map((flag) => ({
      label: `Risk: ${flag.label}`,
      title: flag.summary
    })),
    ...topTacticalTags(recommendation.model.tacticalTags).map((tag) => ({
      label: tacticalTagLabel(tag),
      title: `Detected tactical tag: ${tacticalTagLabel(tag)}.`
    }))
  ];
}

function recommendationDrivers(recommendation: ModelRecommendation, strategy?: Strategy): MatchupDriver[] {
  const modelTags = new Set(recommendation.model.tacticalTags);
  const strategyTags = strategyFitTags(recommendation.model, strategy);
  const evidenceText = [
    ...recommendation.why,
    ...recommendation.relevantTech,
    ...recommendation.trace,
    ...recommendation.curatedNotes,
    recommendation.hireReason,
    recommendation.role
  ].join(" ").toLowerCase();
  const rows: MatchupDriver[] = [];

  if (strategy && strategyTags.length > 0) {
    rows.push({
      id: "strategyFit",
      label: "Strategy fit",
      evidence: ["Strategy fit", `Tags: ${formatVisibleTags(strategyTags.slice(0, 2))}`],
      sentence: `${recommendation.model.name} supports ${strategy.name} through ${formatVisibleTags(strategyTags.slice(0, 3))}.`,
      strength: 100 + recommendation.scoreBreakdown.compositionMatchup
    });
  }

  const driverDefinitions: Array<{
    id: string;
    label: string;
    tags: TacticalTag[];
    pattern: RegExp;
    score?: number;
  }> = [
    { id: "mobility", label: "Mobility / placement", tags: ["mobility", "placement", "speedAttack"], pattern: /mobility|placement|place|push|move|reposition|speed/ },
    { id: "scheme", label: "Scheme / marker play", tags: ["scheme", "marker"], pattern: /scheme|marker|interact|scoring lane/ },
    { id: "damage", label: "Damage / burst", tags: ["damage", "burst", "melee", "ranged", "antiArmor"], pattern: /damage|burst|beater|armor|kill|remove/ },
    { id: "durability", label: "Durability", tags: ["armor", "incorporeal", "demise", "healing", "soulstone"], pattern: /durable|surviv|armor|healing|demise|stone/ },
    { id: "control", label: "Control / denial", tags: ["control", "stunned", "slow", "staggered", "antiTrigger"], pattern: /control|denial|deny|slow|stagger|stunned|trigger/ },
    { id: "summon", label: "Summon / activation pressure", tags: ["summon"], pattern: /summon|activation|extra enemy bodies|wide opposing boards/ },
    { id: "resources", label: "Card / resource pressure", tags: ["cardPressure", "soulstone"], pattern: /card|resource|soulstone|hand pressure/ }
  ];

  for (const definition of driverDefinitions) {
    const tagHits = definition.tags.filter((tag) => modelTags.has(tag));
    const reasonHit = definition.pattern.test(evidenceText);
    const strategyOverlap = strategyTags.some((tag) => definition.tags.includes(tag));
    const scoreEvidence = definition.id === "control"
      ? recommendation.scoreBreakdown.masterAbilities
      : definition.id === "scheme" || definition.id === "mobility"
        ? recommendation.scoreBreakdown.compositionMatchup
        : recommendation.scoreBreakdown.crewSynergy;

    if (tagHits.length === 0 && !reasonHit && !strategyOverlap && scoreEvidence < 24) continue;

    const evidence = [
      strategyOverlap ? "Strategy fit" : "",
      tagHits.length > 0 ? `Tags: ${formatVisibleTags(topTacticalTags(tagHits).slice(0, 2))}` : "",
      reasonHit ? "Reason text" : "",
      scoreEvidence >= 24 ? "Score trace" : ""
    ].filter(Boolean);

    rows.push({
      id: definition.id,
      label: definition.label,
      evidence,
      sentence: driverSentence(definition.id, recommendation.model.name, strategy),
      strength: tagHits.length * 14 + (reasonHit ? 18 : 0) + (strategyOverlap ? 22 : 0) + scoreEvidence
    });
  }

  return rows
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);
}

function driverSentence(driverId: string, modelName: string, strategy?: Strategy): string {
  if (driverId === "mobility") return `${modelName} helps reach, reposition, or contest spread-out scoring pieces.`;
  if (driverId === "scheme") return `${modelName} adds marker, interact, or scheme-lane pressure${strategy ? ` for ${strategy.name}` : ""}.`;
  if (driverId === "damage") return `${modelName} contributes killing pressure when the matchup asks you to remove or tax key models.`;
  if (driverId === "durability") return `${modelName} helps keep important table jobs active through pressure.`;
  if (driverId === "control") return `${modelName} can constrain enemy tempo through denial, debuffs, or trigger pressure.`;
  if (driverId === "summon") return `${modelName} helps manage wider boards, summoned pieces, or activation pressure.`;
  if (driverId === "resources") return `${modelName} pressures cards, soulstones, or other resources that shape key duels.`;
  return `${modelName} has visible evidence supporting this recommendation.`;
}

function summarizePathDrivers(path: RecommendationPath, strategy?: Strategy): string[] {
  const summary = new Map<string, { label: string; count: number; strength: number }>();
  for (const recommendation of path.models) {
    for (const driver of recommendationDrivers(recommendation, strategy)) {
      const current = summary.get(driver.id) ?? { label: driver.label, count: 0, strength: 0 };
      summary.set(driver.id, {
        label: driver.label,
        count: current.count + 1,
        strength: current.strength + driver.strength
      });
    }
  }

  const items = [...summary.values()]
    .sort((a, b) => b.count - a.count || b.strength - a.strength)
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.count} recommended ${item.count === 1 ? "hire shows" : "hires show"} this driver.`);

  return items.length > 0 ? items : ["Limited evidence: recommendations are based on broad legal-pool and matchup fit."];
}

function summarizePathRisks(path: RecommendationPath, brief: MatchupAnalysis["matchupBrief"]): string[] {
  const severityRank: Record<VulnerabilityFlag["severity"], number> = { High: 3, Medium: 2, Low: 1 };
  const flags = path.models
    .flatMap((recommendation) => recommendation.vulnerabilityFlags)
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  const seen = new Set<string>();
  const riskItems = flags
    .filter((flag) => {
      if (seen.has(flag.id)) return false;
      seen.add(flag.id);
      return true;
    })
    .slice(0, 4)
    .map((flag) => `${flag.label} (${flag.severity}): ${flag.summary}`);

  if (riskItems.length > 0) return riskItems;
  if (brief.matchupRisks.length > 0) return brief.matchupRisks.slice(0, 4);
  return ["No high-confidence risk driver surfaced from the current recommendation set."];
}

function buildNextSteps({
  brief,
  opponentPressure,
  path,
  strategy
}: {
  brief: MatchupAnalysis["matchupBrief"];
  opponentPressure: string[];
  path?: RecommendationPath;
  strategy?: Strategy;
}): Array<{ label: string; text: string }> {
  const tags = new Set(strategy?.tags ?? []);
  const roleCounts = new Map<string, number>();
  for (const recommendation of path?.models ?? []) {
    roleCounts.set(recommendation.role, (roleCounts.get(recommendation.role) ?? 0) + 1);
  }
  const topRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "flexible tech piece";
  const pressureText = [...opponentPressure, ...brief.watchFor].join(" ").toLowerCase();
  const answer = brief.answerWith[0] ?? "models that directly cover the matchup gap";
  const priorityHire = brief.priorityHires[0] ?? `a ${topRole}`;
  const scoringStrategy = tags.has("spread") || tags.has("markers") || tags.has("scheme") || tags.has("interact") || tags.has("enemyHalf");
  const pressureWarning = /summon|activation|extra/.test(pressureText)
    ? "Watch for summon or activation pressure; favour picks that can remove extra bodies or keep scoring pace."
    : /control|slow|stagger|stunned|denial/.test(pressureText)
      ? "Watch for control pressure; favour models that still score while disrupted or that bring denial answers."
      : "Watch the first two turns for the opponent's main pressure lane before committing fragile pieces.";

  const steps = [
    {
      label: "Prioritise",
      text: scoringStrategy
        ? `Start by covering ${strategy?.name ?? "the strategy"} scoring: mobility, marker interaction, and models that can work in the right table zones.`
        : `Start by adding ${priorityHire} before doubling down on redundant damage.`
    },
    {
      label: "Avoid",
      text: `Avoid taking extra copies of tools your crew already covers until you have checked whether ${answer.toLowerCase()} is handled.`
    },
    {
      label: "Watch",
      text: pressureWarning
    },
    {
      label: "If unsure",
      text: `Choose the highest-fit ${topRole} recommendation, then inspect its stat card to confirm its table job fits your plan.`
    }
  ];

  if (!path || path.models.length === 0) {
    steps[0] = {
      label: "Prioritise",
      text: "Start by selecting one or two candidate models, then rerun analysis to replace legal-pool assumptions with stronger evidence."
    };
  }

  return steps;
}

function recommendationPlan(recommendation: ModelRecommendation, strategyName?: string) {
  const why = recommendation.why[0] ?? `${recommendation.model.name} fills a ${recommendation.role} slot into this matchup.`;
  const strategyLine = strategyReasons(recommendation.why, strategyName)[0];
  const tableJob = strategyLine
    ?? `Use it as ${articleFor(recommendation.role)} ${recommendation.role} to cover ${formatVisibleTags(topTacticalTags(recommendation.model.tacticalTags))}.`;
  const riskTradeoff = recommendation.vulnerabilityFlags.find((flag) => flag.severity === "High") ?? recommendation.vulnerabilityFlags[0];
  const tradeoff = riskTradeoff
    ? riskTradeoff.summary
    : recommendation.hireTax > 0
    ? recommendation.hireReason
    : !recommendation.owned
      ? "Not in the marked collection, so it only appears on the Optimal path."
      : recommendation.confidence === "Low"
        ? "Lower-confidence fit; confirm the crew still has enough support and scoring coverage."
        : undefined;

  return { why, tableJob, tradeoff };
}

function recommendationModifierCopy(modifierIds: CrewModifierId[]): string {
  if (modifierIds.length === 0) return "";
  const labels = CREW_MODIFIERS
    .filter((modifier) => modifierIds.includes(modifier.id))
    .map((modifier) => modifier.label.toLowerCase());

  return `Crew adjustment focus: ${labels.join("; ")}. Use recommendation details to confirm which hires patch those priorities without duplicating tools you already marked.`;
}

function recommendationConfidenceExplanation(confidence: ModelRecommendation["confidence"]): string {
  if (confidence === "High") return "High means this model has multiple visible evidence points in the current matchup data.";
  if (confidence === "Medium") return "Medium means this model has useful evidence, but some matchup or collection inputs are inferred.";
  return "Low means evidence is sparse or broad; verify the pick against your table plan before relying on it.";
}

function riskTitle(flags: VulnerabilityFlag[]): string {
  return flags.map((flag) => `${flag.label}: ${flag.summary}`).join(" ");
}

function riskFlagNotes(flags: VulnerabilityFlag[]): string[] {
  return flags.map((flag) => {
    const causes = flag.causedBy.length ? ` Caused by ${flag.causedBy.slice(0, 2).join("; ")}.` : "";
    return `${flag.label} (${flag.severity}): ${flag.summary}${causes}`;
  });
}

function formatVisibleTags(tags: TacticalTag[]) {
  if (tags.length === 0) return "general matchup needs";
  return tags.map(tacticalTagLabel).join(", ");
}

function tacticalRoleLabel(role: string): string {
  return role
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function fitBand(score: number): "High" | "Medium" | "Low" {
  if (score >= 30) return "High";
  if (score >= 16) return "Medium";
  return "Low";
}

function normalizedScorePercent(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.max(8, Math.min(100, Math.round((score / maxScore) * 100)));
}

function overallFitBand(percent: number): "Strong" | "Good" | "Niche" | "Low confidence" {
  if (percent >= 86) return "Strong";
  if (percent >= 68) return "Good";
  if (percent >= 42) return "Niche";
  return "Low confidence";
}

function hireKindLabel(recommendation: ModelRecommendation): string {
  if (recommendation.hireKind === "keyword") return "Keyword hire";
  if (recommendation.hireKind === "versatile") return "Versatile";
  if (recommendation.hireKind === "outOfKeyword") return recommendation.hireTax > 0 ? "Out-of-keyword +1" : "Out-of-keyword";
  return "Illegal hire";
}

function topTacticalTags(tags: TacticalTag[]): TacticalTag[] {
  const priority: TacticalTag[] = [
    "mobility",
    "placement",
    "scheme",
    "marker",
    "control",
    "damage",
    "burst",
    "healing",
    "armor",
    "ranged",
    "melee"
  ];
  const uniqueTags = [...new Set(tags)];
  return uniqueTags
    .sort((left, right) => priorityIndex(left, priority) - priorityIndex(right, priority))
    .slice(0, 3);
}

function priorityIndex(tag: TacticalTag, priority: TacticalTag[]): number {
  const index = priority.indexOf(tag);
  return index >= 0 ? index : priority.length;
}

function tacticalTagLabel(tag: TacticalTag): string {
  const labels: Partial<Record<TacticalTag, string>> = {
    antiArmor: "Anti-armor",
    antiTrigger: "Anti-trigger",
    burst: "Burst damage",
    cardPressure: "Card pressure",
    defenseAttack: "Df attack",
    mobility: "Mobility",
    placement: "Placement",
    scheme: "Scheme play",
    marker: "Marker play",
    control: "Control",
    healing: "Healing",
    armor: "Armor",
    ranged: "Ranged",
    melee: "Melee",
    willpowerAttack: "Wp attack",
    speedAttack: "Sp attack",
    sizeAttack: "Sz attack",
    soulstone: "Soulstone use"
  };
  return labels[tag] ?? tacticalRoleLabel(tag.replace(/([A-Z])/g, " $1").toLowerCase());
}

function modelUseNotes(recommendation: ModelRecommendation, strategyName: string | undefined, plan: ReturnType<typeof recommendationPlan>): string[] {
  const collapsedLines = new Set([plan.why, plan.tableJob, plan.tradeoff].filter(Boolean));
  return uniqueItems([
    ...recommendation.why,
    ...strategyReasons(recommendation.why, strategyName),
    `Use ${recommendation.model.name} as ${articleFor(recommendation.role)} ${recommendation.role}.`
  ]).filter((item) => !collapsedLines.has(item)).slice(0, 4);
}

function uniqueItems(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function countExpectedModels(models: ModelCard[]): Array<{ model: ModelCard; quantity: number }> {
  const byId = new Map<string, { model: ModelCard; quantity: number }>();
  for (const model of models) {
    const entry = byId.get(model.id);
    if (entry) {
      entry.quantity += 1;
    } else {
      byId.set(model.id, { model, quantity: 1 });
    }
  }
  return Array.from(byId.values());
}

function articleFor(value: string): "a" | "an" {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

export function StatCardModal({
  detailError,
  detailLoading,
  evaluation,
  evaluationError,
  evaluationLoading,
  model,
  vulnerabilityFlags,
  onClose
}: {
  detailError: string;
  detailLoading: boolean;
  evaluation: ModelMatchupEvaluation | null;
  evaluationError: string;
  evaluationLoading: boolean;
  model: ModelCard;
  vulnerabilityFlags: VulnerabilityFlag[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function trapFocus(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current
      ? Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), details summary, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1)
      : [];

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="statCardModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stat-card-title"
        onKeyDown={trapFocus}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="statCardTopline">
          <span>{model.faction}</span>
          <span className="modalHint">Esc closes</span>
          <button ref={closeButtonRef} className="iconButton" type="button" onClick={onClose} aria-label="Close stat card">
            <X aria-hidden="true" />
          </button>
        </div>
        <article className="statCard">
          <header className="statCardHeader">
            <div>
              <h2 id="stat-card-title">{model.name}</h2>
              <p>{model.sourceFile}</p>
            </div>
            <div className="statCardCost">
              <RulesIcon iconKey="soulstone" />
              <strong>{model.cost}</strong>
            </div>
          </header>

          <div className="statCardMeta">
            <div>
              <h3>Characteristics</h3>
              <div className="chipWrap">{model.traits.map((trait) => <RulesChip key={trait} label={trait} iconKey={iconForKeyword(trait)} />)}</div>
            </div>
            <div>
              <h3>Keywords</h3>
              <div className="chipWrap">{model.strategicKeywords.map((keyword) => <RulesChip key={keyword} label={keyword} iconKey="keyword" />)}</div>
            </div>
          </div>

          <div className="statCardStats">
            <StatBlockItem iconKey="defense" label="Defense" value={model.statBlock.defense} />
            <StatBlockItem iconKey="willpower" label="Willpower" value={model.statBlock.willpower} />
            <StatBlockItem iconKey="speed" label="Speed" value={model.statBlock.speed} />
            <StatBlockItem iconKey="size" label="Size" value={model.statBlock.size} />
          </div>

          <MatchupFitSection evaluation={evaluation} error={evaluationError} loading={evaluationLoading} model={model} />

          {detailLoading || detailError ? (
            <section className="statCardSection">
              <h3>Stat Card Detail</h3>
              <p className="emptyRulesText">{detailLoading ? `Loading full stat card for ${model.name}...` : detailError}</p>
            </section>
          ) : null}

          {!evaluation && vulnerabilityFlags.length > 0 ? (
            <section className="statCardSection riskSection">
              <h3>Matchup Risks</h3>
              <div className="rulesList">
                {vulnerabilityFlags.map((flag) => (
                  <div className="rulesEntry riskEntry" key={flag.id}>
                    <strong>
                      <AlertTriangle aria-hidden="true" /> {flag.label} <span>{flag.severity}</span>
                    </strong>
                    <p>{flag.summary}</p>
                    {flag.causedBy.length > 0 ? <p>Caused by {flag.causedBy.slice(0, 3).join("; ")}.</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="statCardSection">
            <h3>Abilities</h3>
            {model.abilities.length > 0 ? (
              <div className="rulesList">
                {model.abilities.map((ability, index) => (
                  <div className="rulesEntry" key={`${ability.name}-${index}`}>
                    <strong>{ability.name}</strong>
                    {ability.text ? <p>{ability.text}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="emptyRulesText">No parsed abilities.</p>
            )}
          </section>

          <section className="statCardSection">
            <h3>Actions</h3>
            {model.actions.length > 0 ? (
              <div className="rulesList">
                {model.actions.map((action, index) => (
                  <ActionCard action={action} key={`${action.name}-${index}`} />
                ))}
              </div>
            ) : (
              <p className="emptyRulesText">No parsed actions.</p>
            )}
          </section>
        </article>
      </section>
    </div>
  );
}

function MatchupFitSection({
  evaluation,
  error,
  loading,
  model
}: {
  evaluation: ModelMatchupEvaluation | null;
  error: string;
  loading: boolean;
  model: ModelCard;
}) {
  if (loading) {
    return (
      <section className="statCardSection matchupFitSection">
        <h3>Matchup Fit</h3>
        <p className="emptyRulesText">Evaluating {model.name} against the selected matchup...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="statCardSection matchupFitSection">
        <h3>Matchup Fit</h3>
        <p className="emptyRulesText">{error}</p>
      </section>
    );
  }

  if (!evaluation) return null;

  if (!evaluation.legal || !evaluation.fit) {
    return (
      <section className="statCardSection matchupFitSection">
        <h3>Matchup Fit</h3>
        <div className="rulesEntry matchupFitCard illegalFitCard">
          <strong>Not legal for this master</strong>
          <p>{evaluation.hireReason}</p>
          {evaluation.struggleNotes.map((note, index) => <p key={`${note}-${index}`}>{note}</p>)}
        </div>
      </section>
    );
  }

  return (
    <section className="statCardSection matchupFitSection">
      <h3>Matchup Fit</h3>
      <div className="matchupFitCard">
        <div className="matchupFitSummary">
          <span className={`fitBadge fit-${evaluation.fit.band.toLowerCase()}`}>{evaluation.fit.band} fit</span>
          <span>{evaluation.fit.role}</span>
          <span><RulesIcon iconKey="score" /> {evaluation.fit.score}</span>
          <span title={evaluation.hireReason}><RulesIcon iconKey="soulstone" /> {evaluation.hireCost}ss{evaluation.hireTax > 0 ? ` (${evaluation.printedCost}+${evaluation.hireTax})` : ""}</span>
        </div>
        <FitList title="Why it helps" items={evaluation.whyHelps} />
        <FitList title="Risks" items={evaluation.struggleNotes.length ? evaluation.struggleNotes : ["No clear matchup risks detected from the current setup."]} />
        <FitList title="Strategy contribution" items={evaluation.strategyContribution} />
        {evaluation.duplicateValue ? <p className="duplicateValue"><strong>Duplicate value:</strong> {evaluation.duplicateValue}</p> : null}
      </div>
    </section>
  );
}

function FitList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="fitList">
      <strong>{title}</strong>
      <ul>{items.map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}</ul>
    </div>
  );
}

function RulesChip({ label, iconKey }: { label: string; iconKey?: RulesIconKey }) {
  return (
    <span className="rulesChip">
      {iconKey ? <RulesIcon iconKey={iconKey} /> : null}
      {label}
    </span>
  );
}

function StatBlockItem({
  iconKey,
  label,
  value
}: {
  iconKey: Extract<RulesIconKey, "defense" | "willpower" | "speed" | "size">;
  label: string;
  value: number;
}) {
  return (
    <div className="statBlockItem">
      <RulesIcon iconKey={iconKey} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionCard({ action }: { action: ModelCard["actions"][number] }) {
  const prefixIcon = actionPrefixIcon(action.name);
  const typeIcon = rangeIcon(action.range);

  return (
    <div className="rulesEntry actionCard">
      <div className="actionCardHeader">
        <strong>
          {prefixIcon ? <RulesIcon iconKey={prefixIcon} /> : null}
          {typeIcon ? <RulesIcon iconKey={typeIcon} /> : null}
          {cleanActionName(action.name)}
        </strong>
        <span>
          {cleanRange(action.range) || "-"} / Stat {action.stat || "-"} / Resist {action.resist || "-"} / TN {action.targetNumber || "-"}
        </span>
      </div>
      {action.damage && action.damage !== "-" ? <p className="damageLine">Damage: {action.damage}</p> : null}
      {action.effect ? <p>{action.effect}</p> : null}
      {action.triggers && action.triggers.length > 0 ? (
        <div className="triggerList">
          {action.triggers.map((trigger, index) => (
            <div className="triggerEntry" key={`${trigger.name}-${index}`}>
              <span>{triggerIcons(trigger.condition)}</span>
              <strong>{trigger.name}</strong>
              {trigger.effect ? <p>{trigger.effect}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RecSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="recSection">
      <h4>{title}</h4>
      <ul>{items.map((item, index) => <li key={`${title}-${index}-${item}`}>{item}</li>)}</ul>
    </div>
  );
}

const SUIT_GLYPHS: Partial<Record<RulesIconKey, string>> = {
  ram: "♥",
  mask: "♦",
  tome: "♣",
  crow: "♠"
};

const LUCIDE_ICONS: Partial<Record<RulesIconKey, typeof Shield>> = {
  soulstone: Gem,
  positive: CirclePlus,
  negative: CircleMinus,
  melee: Swords,
  missile: Crosshair,
  magic: Sparkles,
  pulse: Waves,
  aura: CircleDot,
  signature: Feather,
  fortitude: Dumbbell,
  defense: Shield,
  willpower: Brain,
  speed: Footprints,
  size: Hexagon,
  keyword: KeyRound,
  versatile: ScrollText,
  unique: BadgeQuestionMark,
  master: Crown,
  totem: Sparkles,
  strategy: Target,
  collection: Library,
  prediction: BadgeQuestionMark,
  draft: FileText,
  score: BookOpen
};

function RulesIcon({ iconKey }: { iconKey: RulesIconKey }) {
  const icon = RULES_ICONS[iconKey];
  const Icon = LUCIDE_ICONS[iconKey];
  const suitGlyph = SUIT_GLYPHS[iconKey];

  return (
    <span className={`rulesIcon rulesIcon-${icon.key}`} title={`${icon.label}: ${icon.meaning}`} aria-label={icon.label}>
      {suitGlyph ? <span className="suitGlyph">{suitGlyph}</span> : Icon ? <Icon aria-hidden="true" strokeWidth={2.25} /> : null}
    </span>
  );
}

function StatChip({ iconKey, value }: { iconKey: Extract<RulesIconKey, "defense" | "willpower" | "speed" | "size">; value: number }) {
  return (
    <span className="statChip">
      <RulesIcon iconKey={iconKey} /> {value}
    </span>
  );
}

function renderKeywordSummary(model: ModelCard) {
  return (
    <>
      {model.keywords.slice(0, 5).map((keyword, index) => {
        const keywordIcon = iconForKeyword(keyword);
        return (
          <span className="inlineKeyword" key={`${model.id}-${keyword}`}>
            {keywordIcon ? <RulesIcon iconKey={keywordIcon} /> : index === 0 ? <RulesIcon iconKey="keyword" /> : null}
            {keyword}
          </span>
        );
      })}
    </>
  );
}

function sectionIcon(title: string): RulesIconKey {
  if (title.includes("Leader")) return "master";
  if (title.includes("Suggested")) return "prediction";
  if (title.includes("Keyword")) return "keyword";
  if (title.includes("Versatile")) return "versatile";
  return "collection";
}

function sectionGlossaryText(title: string): string {
  if (title.includes("Leader")) return `${glossaryText("master")} ${glossaryText("totem")}`;
  if (title.includes("Suggested")) return glossaryText("expectedModel");
  if (title.includes("Keyword")) return glossaryText("keyword");
  if (title.includes("Versatile")) return glossaryText("versatile");
  return "";
}

function triggerIcons(condition?: string) {
  return (condition?.toLowerCase().match(/ss|[rmcts]/g) ?? [])
    .map((item) => (item === "ss" ? "s" : item))
    .filter((item) => TRIGGER_SUIT_ICONS[item])
    .map((item, index) => <RulesIcon key={`${item}-${index}`} iconKey={TRIGGER_SUIT_ICONS[item]} />);
}

const STRATEGY_TO_TACTICAL_TAGS: Record<StrategyTag, TacticalTag[]> = {
  antiScheme: ["scheme", "marker", "control"],
  center: ["armor", "healing", "control", "demise"],
  control: ["control", "slow", "staggered", "stunned"],
  denial: ["control", "marker", "staggered", "slow"],
  durability: ["armor", "incorporeal", "healing", "demise"],
  enemyHalf: ["mobility", "placement", "scheme"],
  interact: ["scheme", "mobility", "placement"],
  killing: ["damage", "burst", "melee", "ranged"],
  markers: ["marker", "scheme", "placement"],
  mobility: ["mobility", "placement"],
  scheme: ["scheme", "marker", "mobility"],
  spread: ["mobility", "placement", "scheme"]
};

function strategyFitTags(model: ModelCard, strategy?: Strategy): TacticalTag[] {
  if (!strategy) return [];
  const desiredTags = new Set(strategy.tags.flatMap((tag) => STRATEGY_TO_TACTICAL_TAGS[tag]));
  return topTacticalTags(model.tacticalTags.filter((tag) => desiredTags.has(tag)));
}

function strategyRelevantModels(models: ModelCard[], strategy: Strategy): Array<{ model: ModelCard; tags: TacticalTag[] }> {
  return models
    .map((model) => ({ model, tags: strategyFitTags(model, strategy) }))
    .filter((entry) => entry.tags.length > 0)
    .sort((left, right) => right.tags.length - left.tags.length || right.model.cost - left.model.cost || left.model.name.localeCompare(right.model.name));
}

function strategyRewardText(strategy: Strategy): string {
  return strategy.summary.replace(/^Rewards\s+/i, "").replace(/\.$/, "").toLowerCase();
}

function strategyReasons(items: string[], strategyName?: string): string[] {
  if (!strategyName) return [];
  const strategyNeedle = strategyName.toLowerCase();
  return items.filter((item) => item.toLowerCase().includes(strategyNeedle));
}

function searchMatchSnippet(model: ModelCard, search: string): string | undefined {
  const query = search.trim().toLowerCase();
  if (!query) return undefined;

  const visibleIdentity = [model.name, model.faction, model.keywords.join(" ")].join(" ").toLowerCase();
  if (visibleIdentity.includes(query)) return undefined;

  const ability = model.abilities.find((candidate) => [candidate.name, candidate.text].join(" ").toLowerCase().includes(query));
  if (ability) return `Matched ability: ${clipMatchText([ability.name, ability.text].join(" "), query)}`;

  const action = model.actions.find((candidate) =>
    [
      candidate.name,
      candidate.effect,
      ...(candidate.triggers ?? []).map((trigger) => `${trigger.name} ${trigger.effect ?? ""}`)
    ].join(" ").toLowerCase().includes(query)
  );
  if (action) return `Matched action: ${clipMatchText([action.name, action.effect].join(" "), query)}`;

  if (model.rulesText.toLowerCase().includes(query)) {
    return `Matched rules: ${clipMatchText(model.rulesText, query)}`;
  }

  return undefined;
}

function clipMatchText(text: string, query: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const index = normalized.toLowerCase().indexOf(query);
  if (index < 0) return normalized.slice(0, 80);
  const start = Math.max(0, index - 24);
  const end = Math.min(normalized.length, index + query.length + 48);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < normalized.length ? " ..." : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function matchesSearch(model: ModelCard, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [model.name, model.faction, model.keywords.join(" "), model.textIndex].join(" ").toLowerCase().includes(query);
}

function hasFullModelDetails(model: ModelCard): boolean {
  return Boolean(
    model.rulesText ||
    model.abilities.some((ability) => ability.text) ||
    model.actions.some((action) => action.effect || (action.triggers?.length ?? 0) > 0)
  );
}

type ModelSectionEntry = {
  model: ModelCard;
  quantity: number;
  forced: boolean;
  note?: string;
  badges?: string[];
};

type ModelSection = {
  title: string;
  models: ModelSectionEntry[];
  action?: ReactNode;
};

function groupModelsForMaster(
  pool: ModelCard[],
  master: ModelCard | undefined,
  faction: string,
  mandatoryModels: Array<{ model: ModelCard; quantity: number }>,
  sortMode: ModelSortMode = "name"
): ModelSection[] {
  const masterKeywords = new Set(master?.strategicKeywords.map((keyword) => keyword.toLowerCase()) ?? []);
  const isKeywordModel = (model: ModelCard) =>
    model.strategicKeywords.some((keyword) => masterKeywords.has(keyword.toLowerCase()));
  const isVersatile = (model: ModelCard) => model.keywords.some((keyword) => keyword.toLowerCase() === "versatile");

  const keywordModels = sortModelList(pool.filter(isKeywordModel), sortMode);
  const versatileModels = sortModelList(pool.filter((model) => !isKeywordModel(model) && isVersatile(model)), sortMode);
  const factionModels = sortModelList(
    pool.filter((model) => !isKeywordModel(model) && !isVersatile(model) && model.faction === faction),
    sortMode
  );

  return [
    { title: "Leader & Totem", models: mandatoryModels.map((entry) => ({ ...entry, forced: true })) },
    { title: "Keyword Models", models: keywordModels.map(toSectionEntry) },
    { title: "Versatile Models", models: versatileModels.map(toSectionEntry) },
    { title: "Faction Models", models: factionModels.map(toSectionEntry) }
  ];
}

function getMandatoryModelsForMaster(master: ModelCard | undefined, pool: ModelCard[]) {
  return getMandatoryCrewEntries(master, pool);
}

function sortModelList(models: ModelCard[], sortMode: ModelSortMode): ModelCard[] {
  return [...models].sort((a, b) => sortModels(a, b, sortMode));
}

function sortModels(a: ModelCard, b: ModelCard, sortMode: ModelSortMode = "name"): number {
  if (sortMode === "costAsc") return a.cost - b.cost || a.name.localeCompare(b.name);
  if (sortMode === "costDesc") return b.cost - a.cost || a.name.localeCompare(b.name);
  if (sortMode === "role") return modelRole(a).localeCompare(modelRole(b)) || a.name.localeCompare(b.name);
  return a.name.localeCompare(b.name) || a.cost - b.cost;
}

function modelMatchesRoleFilter(model: ModelCard, roleFilter: RoleFilter): boolean {
  if (roleFilter === "all") return true;
  const tags = new Set(model.tacticalTags);
  if (roleFilter === "beater") return tags.has("damage") || tags.has("burst") || tags.has("melee") || tags.has("ranged");
  if (roleFilter === "scheme") return tags.has("scheme") || tags.has("mobility") || tags.has("placement") || tags.has("marker");
  if (roleFilter === "support") return tags.has("healing") || tags.has("cardPressure") || tags.has("summon");
  if (roleFilter === "anchor") return tags.has("armor") || tags.has("incorporeal") || tags.has("demise");
  if (roleFilter === "control") return tags.has("control") || tags.has("stunned") || tags.has("slow") || tags.has("staggered") || tags.has("injured");
  return true;
}

function titleVariantsForMaster(master: ModelCard | undefined, masters: ModelCard[]): ModelCard[] {
  if (!master) return [];
  const groupKey = titleGroupKey(master);
  return masters
    .filter((candidate) => titleGroupKey(candidate) === groupKey)
    .sort((left, right) => titleSortName(left).localeCompare(titleSortName(right)) || left.name.localeCompare(right.name));
}

function titleGroupKey(master: ModelCard): string {
  const primaryKeyword = master.strategicKeywords[0] ?? master.keywords.find((keyword) => keyword.toLowerCase() !== "master");
  if (primaryKeyword) return `${master.faction}:${slugifyForMatch(primaryKeyword)}`;
  return `${master.faction}:${slugifyForMatch(master.name)}`;
}

function titleSortName(master: ModelCard): string {
  return titleNamePart(master) === "Original" ? "" : titleNamePart(master);
}

function titleNamePart(master: ModelCard): string {
  const [base, ...titleParts] = master.name.split(",");
  const title = titleParts.join(",").trim();
  return title || base?.trim() || "Original";
}

function titleCrewRuleNotes(master: ModelCard): string[] {
  const notes: string[] = [];
  const syntheticRule = findSyntheticRuleForMaster(master);
  if (syntheticRule?.note) notes.push(syntheticRule.note);

  const titleTotemRule = getTitleTotemRules().find(
    (rule) => slugifyForMatch(rule.faction) === slugifyForMatch(master.faction) && slugifyForMatch(rule.masterName) === slugifyForMatch(master.name)
  );
  if (titleTotemRule) {
    notes.push(`Title-specific totem: ${titleTotemRule.totemNames.join(", ")}.`);
  }

  return notes;
}

function titleFitSummary(master: ModelCard, matchupMaster: ModelCard | undefined, strategy: Strategy | undefined): { badge: string; notes: string[] } {
  const tags = new Set(master.tacticalTags);
  const strategyTags = new Set<string>(strategy?.tags ?? []);
  const badge = titleRecommendationBadge(tags, strategyTags);
  const tagOverlap = strategy ? master.tacticalTags.filter((tag) => strategyTags.has(tag)) : [];
  const matchupTags = matchupMaster ? matchupMaster.tacticalTags.slice(0, 4) : [];
  const counterOverlap = matchupMaster ? matchupMaster.tacticalTags.flatMap((tag) => titleCounterTags(tag)).filter((tag) => tags.has(tag)) : [];

  return {
    badge,
    notes: uniqueItems([
      strategy
        ? tagOverlap.length > 0
          ? `${strategy.name}: directly supports ${formatVisibleTags(tagOverlap.slice(0, 3))}.`
          : `${strategy.name}: no direct tag overlap detected, so confirm scenario work before choosing this title.`
        : "Choose a strategy to sharpen title fit notes.",
      matchupMaster
        ? counterOverlap.length > 0
          ? `Into ${matchupMaster.name}, this title answers ${formatVisibleTags(counterOverlap.slice(0, 3))} pressure.`
          : `Into ${matchupMaster.name}, watch opposing ${formatVisibleTags(matchupTags as TacticalTag[])} pressure and hire support accordingly.`
        : "Choose the opposing master to add matchup notes.",
      `Core plan: ${formatVisibleTags(topTacticalTags(master.tacticalTags))}.`
    ])
  };
}

function titleRecommendationBadge(tags: Set<TacticalTag>, strategyTags: Set<string>): string {
  const schemeScore = Number(tags.has("scheme")) + Number(tags.has("mobility")) + Number(tags.has("placement")) + Number(tags.has("marker"));
  const aggressionScore = Number(tags.has("damage")) + Number(tags.has("burst")) + Number(tags.has("melee")) + Number(tags.has("ranged"));
  const controlScore = Number(tags.has("control")) + Number(tags.has("stunned")) + Number(tags.has("slow")) + Number(tags.has("armor")) + Number(tags.has("healing"));

  if (strategyTags.has("scheme") || strategyTags.has("mobility") || strategyTags.has("interact") || strategyTags.has("markers")) {
    if (schemeScore > 0) return "Scheme-friendly title";
  }
  if (strategyTags.has("killing") && aggressionScore > 0) return "Best aggression plan";
  if ((strategyTags.has("center") || strategyTags.has("control") || strategyTags.has("durability")) && controlScore > 0) return "Safer control plan";
  if (aggressionScore >= schemeScore && aggressionScore >= controlScore && aggressionScore > 0) return "Best aggression plan";
  if (schemeScore >= controlScore && schemeScore > 0) return "Scheme-friendly title";
  if (controlScore > 0) return "Safer control plan";
  return "Flexible title";
}

function titleCounterTags(tag: TacticalTag): TacticalTag[] {
  const counters: Partial<Record<TacticalTag, TacticalTag[]>> = {
    armor: ["antiArmor", "injured", "poison", "burning", "control"],
    incorporeal: ["damage", "antiArmor", "cardPressure"],
    healing: ["damage", "stunned", "cardPressure"],
    mobility: ["staggered", "slow", "placement", "control"],
    placement: ["staggered", "slow", "control"],
    scheme: ["mobility", "scheme", "marker", "placement"],
    marker: ["mobility", "marker", "scheme", "placement"],
    cardPressure: ["cardPressure", "summon", "damage"],
    stunned: ["antiTrigger", "cardPressure", "damage"],
    slow: ["mobility", "cardPressure"],
    staggered: ["ranged", "placement", "mobility"],
    burning: ["damage", "healing", "control"],
    poison: ["damage", "healing", "control"],
    summon: ["burst", "damage", "scheme", "cardPressure"],
    ranged: ["mobility", "placement", "melee"],
    melee: ["ranged", "mobility", "control"],
    willpowerAttack: ["willpowerAttack", "cardPressure", "stunned"],
    defenseAttack: ["injured", "control", "damage"],
    speedAttack: ["staggered", "slow", "mobility"],
    sizeAttack: ["placement", "damage"],
    soulstone: ["cardPressure", "damage", "control"]
  };
  return counters[tag] ?? [];
}

function suggestedThreatModels(pool: ModelCard[], faction: string, master: ModelCard | undefined): SuggestedThreatModel[] {
  if (!master) return [];
  const masterKeywords = new Set(master?.strategicKeywords.map((keyword) => keyword.toLowerCase()) ?? []);
  return pool
    .filter((model) => !model.isMaster && model.cost > 0)
    .filter(
      (model) =>
        model.faction === faction ||
        model.strategicKeywords.some((keyword) => masterKeywords.has(keyword.toLowerCase()))
    )
    .map((model) => {
      const sharedKeywords = model.strategicKeywords.filter((keyword) => masterKeywords.has(keyword.toLowerCase()));
      const role = modelRole(model);
      const primaryTags = topTacticalTags(model.tacticalTags);
      const keywordFit = sharedKeywords.length > 0 ? 12 : 0;
      const roleFit = primaryTags.filter((tag) => ["damage", "control", "mobility", "scheme", "marker", "healing", "summon"].includes(tag)).length * 3;
      const costFit = model.cost >= 7 ? 4 : model.cost >= 5 ? 2 : 0;
      const uniquenessFit = model.isUnique ? 2 : 0;

      return {
        model,
        role,
        score: keywordFit + roleFit + costFit + uniquenessFit,
        why: suggestedThreatReason(model, master, role, sharedKeywords, primaryTags),
        badges: ["Suggested"]
      };
    })
    .sort((left, right) => right.score - left.score || right.model.cost - left.model.cost || left.model.name.localeCompare(right.model.name))
    .slice(0, 5)
    .map(({ model, role, why, badges }) => ({ model, role, why, badges }));
}

function suggestedThreatReason(
  model: ModelCard,
  master: ModelCard,
  role: string,
  sharedKeywords: string[],
  primaryTags: TacticalTag[]
): string {
  if (sharedKeywords.length > 0) {
    return `Shares ${sharedKeywords.slice(0, 2).join(", ")} with ${master.name}, making it a plausible ${role} from the legal pool.`;
  }

  const tagText = formatVisibleTags(primaryTags.slice(0, 2));
  if (tagText !== "general matchup needs") {
    return `Brings ${tagText} as a ${role}, so it is a useful threat to consider when planning into ${master.name}.`;
  }

  return `Fits as a ${role} from ${master.name}'s available faction pool.`;
}

function modelRole(model: Pick<ModelCard, "tacticalTags">): string {
  const tags = new Set(model.tacticalTags);
  if (tags.has("damage") || tags.has("burst")) return "beater";
  if (tags.has("scheme") || tags.has("mobility") || tags.has("placement")) return "scheme runner";
  if (tags.has("control") || tags.has("stunned") || tags.has("slow") || tags.has("staggered") || tags.has("injured")) return "control";
  if (tags.has("healing") || tags.has("cardPressure") || tags.has("summon")) return "support";
  if (tags.has("armor") || tags.has("incorporeal") || tags.has("demise")) return "anchor";
  return "tech pick";
}

function toSectionEntry(model: ModelCard): ModelSectionEntry {
  return { model, quantity: 1, forced: false };
}

function countSelectedIds(ids: string[]): Map<string, number> {
  return ids.reduce((counts, id) => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function selectionCheckboxLabel(model: ModelCard, selected: boolean, isPlayerPanel: boolean): string {
  if (isPlayerPanel) {
    return `${selected ? "Remove" : "Add"} ${model.name} ${selected ? "from" : "to"} collection`;
  }

  return `${selected ? "Unmark" : "Mark"} ${model.name} as expected opponent model`;
}

function expandSectionEntries(entries: ModelSectionEntry[]): ModelSectionEntry[] {
  return entries.flatMap((entry) =>
    Array.from({ length: Math.max(1, entry.quantity) }, () => ({
      ...entry,
      quantity: 1
    }))
  );
}

function slugifyForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

