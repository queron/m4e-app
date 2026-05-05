"use client";

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
import { findSyntheticRuleForMaster, getMandatoryCrewEntries, getTitleTotemRules } from "@/lib/mandatory-crew";
import type { Strategy } from "@/lib/strategy-pools";
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
type ActiveResultTab = "picks" | "matchup" | "draft";

const DEFAULT_POINT_LIMIT = 50;
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
  const canAnalyze = Boolean(playerMasterId && opponentMasterId);
  const analyzeButtonLabel = isAnalyzing ? "Analyzing..." : analysis ? "Analyze again" : "Analyze";
  const analyzeReadiness = buildAnalyzeReadiness({
    hasPlayerMaster: Boolean(playerMasterId),
    hasOpponentMaster: Boolean(opponentMasterId),
    collectionCount: ownedModelIds.length
  });
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
        <div>
          <p className="eyebrow">Malifaux 4E</p>
          <h1>
            <RulesIcon iconKey="soulstone" /> Crew Optimizer
          </h1>
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
            <select value={schemePoolId} onChange={(event) => setSchemePoolId(event.target.value)}>
              {SCHEME_POOLS.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.incomplete ? `${pool.name} - incomplete` : pool.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Soulstones
            <input value={pointLimit} min={1} max={150} type="number" onChange={(event) => setPointLimit(Number(event.target.value))} />
          </label>
        </div>
        <div className="actionBar">
          <button className="subtleButton" type="button" onClick={shareSetup}>Copy share link</button>
          <button className="subtleButton" type="button" onClick={printPlan}>Print view</button>
          <button className="subtleButton" type="button" onClick={clearCollection}>Clear collection</button>
        </div>
        <p className="matchSummary">{strategy.summary}</p>
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
            </div>
            <button className="subtleButton" type="button" onClick={() => setSetupCollapsed(false)}>
              Edit setup
            </button>
          </div>
          <MatchupBriefPanel brief={analysis.matchupBrief} />
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
              className={activeResultTab === "draft" ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeResultTab === "draft"}
              onClick={() => setActiveResultTab("draft")}
            >
              Draft Crew
            </button>
          </div>
          {analysis.schemeWatchlist ? <SchemeWatchlistPanel watchlist={analysis.schemeWatchlist} pairings={analysis.recommendedSchemePairs ?? []} /> : null}
          {activeResultTab === "picks" ? (
            <>
              <div className="analysisColumn">
                <RecommendationPanel
                  pathKind={pathKind}
                  setPathKind={setPathKind}
                  selectedPath={selectedPath}
                  usedFullPool={pathKind === "available" && analyzedCollectionCount === 0}
                  strategyName={analysis.match.strategy?.name}
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
  const sections = groupModelsForMaster(
    filteredPool,
    props.master,
    props.faction,
    mandatoryModels,
    modelSort
  );

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
      {!isPlayerPanel && props.master ? (
        <ExpectedModelGuide
          selectedCount={props.selectedIds.length}
          selectedIds={selected}
          suggestions={suggestedExpectedModels}
          onAddTopSuggestions={() => {
            const nextIds = Array.from(new Set([
              ...props.selectedIds,
              ...suggestedExpectedModels
                .filter((suggestion) => !selected.has(suggestion.model.id))
                .slice(0, 3)
                .map((suggestion) => suggestion.model.id)
            ]));
            props.setSelectedIds(nextIds);
          }}
          onClear={() => props.setSelectedIds([])}
          onAddModel={(model) => props.setSelectedIds(Array.from(new Set([...props.selectedIds, model.id])))}
          onOpenModel={props.onOpenModel}
        />
      ) : null}
      <div className="spendSummary">
        <span>
          Required models: {requiredCount}
          <InlineHelp label="Required model help" text="Leader and required totem models are included automatically." />
        </span>
        <span>
          {selectedMetricLabel}: {props.selectedIds.length}
          <InlineHelp label={`${selectedMetricLabel} help`} text={selectedMetricHelp} />
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
            <strong>{titleVariants.length} title variants available</strong>
            <p>Compare title plans before committing to this leader package.</p>
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
      <MasterProfileDisclosure profile={props.profile} />
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
      <HelpDisclosure className="helperText" label="Required models" text="Leader and associated totem models are included automatically and cannot be removed from this crew setup." />
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
              <span>{section.models.length}</span>
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
      <span className="comboLabel">Master</span>
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
              <TitleComparisonBlock title="Core tags" items={[formatVisibleTags(topTacticalTags(variant.tacticalTags))]} />
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

function ExpectedModelGuide({
  selectedCount,
  selectedIds,
  suggestions,
  onAddTopSuggestions,
  onClear,
  onAddModel,
  onOpenModel
}: {
  selectedCount: number;
  selectedIds: Set<string>;
  suggestions: SuggestedThreatModel[];
  onAddTopSuggestions: () => void;
  onClear: () => void;
  onAddModel: (model: ModelCard) => void;
  onOpenModel: (model: ModelCard) => void;
}) {
  const unmarkedSuggestions = suggestions.filter((suggestion) => !selectedIds.has(suggestion.model.id));

  return (
    <div className="expectedGuide">
      <div className="expectedGuideHeader">
        <div>
          <strong>Suggested opponent threats</strong>
          <p>Suggested from legal pool and role fit; not confirmed meta frequency.</p>
        </div>
        <span>{selectedCount === 0 ? "No expected models marked" : `${selectedCount} expected model${selectedCount === 1 ? "" : "s"} marked`}</span>
      </div>
      <div className="expectedGuideIntro">
        <strong>{selectedCount === 0 ? "Not sure what they bring?" : "Refine expected models"}</strong>
        <p>Expected models are likely or known enemy picks. They sharpen opponent analysis without claiming the list is confirmed.</p>
      </div>
      <div className="expectedGuideActions">
        <button className="subtleButton" type="button" onClick={onAddTopSuggestions} disabled={unmarkedSuggestions.length === 0}>
          Mark top 3 suggestions
        </button>
        {selectedCount > 0 ? (
          <button className="subtleButton" type="button" onClick={onClear}>
            Clear expected
          </button>
        ) : null}
      </div>
      <div className="expectedSuggestions">
        {suggestions.length > 0 ? (
          suggestions.slice(0, 5).map((suggestion) => {
            const marked = selectedIds.has(suggestion.model.id);

            return (
              <article key={suggestion.model.id} className={marked ? "markedSuggestion" : ""}>
                <div className="suggestionMain">
                  <button className="modelNameButton" type="button" onClick={() => onOpenModel(suggestion.model)}>
                    {suggestion.model.name}
                  </button>
                  <span><RulesIcon iconKey="soulstone" /> {suggestion.model.cost}ss - {suggestion.role}</span>
                  <p>{suggestion.why}</p>
                </div>
                <div className="suggestionBadges">
                  {suggestion.badges.map((badge) => (
                    <span className="expectedBadge" key={badge}>{badge}</span>
                  ))}
                </div>
                <button className="subtleButton" type="button" onClick={() => onAddModel(suggestion.model)} disabled={marked}>
                  {marked ? "Marked" : "Mark Expected"}
                </button>
              </article>
            );
          })
        ) : (
          <p>No suggested opponent threats can be generated for this master yet.</p>
        )}
      </div>
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
    <details className="schemeWatchlist">
      <summary>Scheme Watchlist</summary>
      <div className="schemeWatchlistGrid">
        <SchemeWatchlistColumn title="Good for your crew" items={watchlist.goodForPlayer} />
        <SchemeWatchlistColumn title="Watch opponent for" items={watchlist.opponentThreats} />
      </div>
      <SchemePairingIdeas pairings={pairings} />
    </details>
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
      <summary>Master profile</summary>
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
  pathKind,
  setPathKind,
  selectedPath,
  usedFullPool,
  strategyName,
  onUsePlan,
  onSavePlan,
  onExportPlan,
  onOpenModel
}: {
  pathKind: PathKind;
  setPathKind: (value: PathKind) => void;
  selectedPath?: RecommendationPath;
  usedFullPool: boolean;
  strategyName?: string;
  onUsePlan: (path: RecommendationPath) => void;
  onSavePlan: (path: RecommendationPath) => void;
  onExportPlan: (path: RecommendationPath) => void;
  onOpenModel: (model: ModelCard) => void;
}) {
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [recommendationSort, setRecommendationSort] = useState<RecommendationSortMode>("fit");
  if (!selectedPath) return null;
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

      <div className="recommendationList">
        {sortedRecommendations.map((recommendation) => {
          const modelIssues = selectedPath.validation.modelIssues[recommendation.model.id] ?? [];
          const chips = recommendationChips(recommendation);
          const fitPercent = normalizedScorePercent(recommendation.score, maxRecommendationScore);
          const plan = recommendationPlan(recommendation, strategyName);

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
                  <span className={`confidenceBadge confidence-${recommendation.confidence.toLowerCase()}`}>
                    {recommendation.confidence}
                  </span>
                </span>
              </div>
              {modelIssues.length > 0 ? <InlineIssues issues={modelIssues} /> : null}
              <div className="recChipRow" aria-label={`${recommendation.model.name} tactical summary`}>
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
                  <RecSection title="How to Use" items={modelUseNotes(recommendation, strategyName, plan)} />
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
                <span className={`confidenceBadge confidence-${recommendation.confidence.toLowerCase()}`}>
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
  if (title.includes("Keyword")) return "keyword";
  if (title.includes("Versatile")) return "versatile";
  return "collection";
}

function triggerIcons(condition?: string) {
  return (condition?.toLowerCase().match(/ss|[rmcts]/g) ?? [])
    .map((item) => (item === "ss" ? "s" : item))
    .filter((item) => TRIGGER_SUIT_ICONS[item])
    .map((item, index) => <RulesIcon key={`${item}-${index}`} iconKey={TRIGGER_SUIT_ICONS[item]} />);
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
};

function groupModelsForMaster(
  pool: ModelCard[],
  master: ModelCard | undefined,
  faction: string,
  mandatoryModels: Array<{ model: ModelCard; quantity: number }>,
  sortMode: ModelSortMode = "name"
) {
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

