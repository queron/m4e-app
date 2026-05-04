"use client";

import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BadgeQuestionMark,
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
import type { CardCatalog, MatchupAnalysis, ModelCard, ModelRecommendation, RecommendationPath } from "@/lib/types";
import { STRATEGY_POOLS } from "@/lib/strategy-pools";
import { getMandatoryCrewEntries } from "@/lib/mandatory-crew";
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

type PathKind = "available" | "optimal";
type ActiveResultTab = "picks" | "matchup" | "draft";
type SavedDraft = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  totalCost: number;
  modelIds: string[];
  summary: string;
  playerFaction?: string;
  playerMasterId?: string;
  opponentFaction?: string;
  opponentMasterId?: string;
  pointLimit?: number;
  strategyPoolId?: string;
  strategyId?: string;
  path?: RecommendationPath;
};

type DraftSummaryContext = {
  strategyPoolName: string;
  strategyName: string;
  playerMasterName?: string;
  opponentMasterName?: string;
};

const DEFAULT_POINT_LIMIT = 50;
const INTERNAL_MODEL_LIMIT = 99;
const COLLECTION_STORAGE_KEY = "m4e.collection.v1";
const DRAFT_STORAGE_KEY = "m4e.drafts.v1";
const SHARE_PARAM = "setup";

export default function Home() {
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
  const [pathKind, setPathKind] = useState<PathKind>("available");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [opponentSearch, setOpponentSearch] = useState("");
  const [analysis, setAnalysis] = useState<MatchupAnalysis | null>(null);
  const [analyzedCollectionCount, setAnalyzedCollectionCount] = useState(0);
  const [draftPath, setDraftPath] = useState<RecommendationPath | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelCard | null>(null);
  const modelOpenerRef = useRef<HTMLElement | null>(null);
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
      .then((data: CardCatalog) => {
        setCatalog(data);
        const restored = readSharedSetup();
        setPlayerFaction(restored?.playerFaction ?? data.factions[0] ?? "");
        setOpponentFaction(restored?.opponentFaction ?? data.factions[1] ?? data.factions[0] ?? "");
        if (restored?.playerMasterId) setPlayerMasterId(restored.playerMasterId);
        if (restored?.opponentMasterId) setOpponentMasterId(restored.opponentMasterId);
        if (restored?.ownedModelIds) setOwnedModelIds(restored.ownedModelIds);
        if (restored?.opponentModelIds) setOpponentModelIds(restored.opponentModelIds);
        if (restored?.pointLimit) setPointLimit(restored.pointLimit);
        if (restored?.strategyPoolId) setStrategyPoolId(restored.strategyPoolId);
        if (restored?.strategyId) setStrategyId(restored.strategyId);
        if (!restored?.ownedModelIds) setOwnedModelIds(readStoredIds(COLLECTION_STORAGE_KEY));
        setSavedDrafts(readStoredDrafts());
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

  function openModel(model: ModelCard) {
    modelOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedModel(model);
  }

  function closeSelectedModel() {
    setSelectedModel(null);
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

  useEffect(() => {
    if (playerMasters.length > 0 && !playerMasters.some((master) => master.id === playerMasterId)) {
      setPlayerMasterId(playerMasters[0]?.id ?? "");
    }
    setAnalysis(null);
  }, [playerMasters, playerMasterId]);

  useEffect(() => {
    if (opponentMasters.length > 0 && !opponentMasters.some((master) => master.id === opponentMasterId)) {
      setOpponentMasterId(opponentMasters[0]?.id ?? "");
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
  const canAnalyze = Boolean(playerMasterId && opponentMasterId);
  const analyzeButtonLabel = isAnalyzing ? "Analyzing..." : analysis ? "Analyze again" : "Analyze";
  const stickySetupStatus = !playerMasterId && !opponentMasterId
    ? "Choose both masters"
    : !playerMasterId
      ? "Choose your master"
      : !opponentMasterId
        ? "Choose opponent master"
        : `${pointLimit}ss matchup ready`;
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
      strategyId
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
      opponentMasterName: opponentMaster?.name
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

      <section className="panel matchPanel">
        <div className="panelHeader">
          <h2>
            <RulesIcon iconKey="strategy" /> Match
          </h2>
          <span>{strategy.name}</span>
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
            Soulstones
            <input value={pointLimit} min={1} max={150} type="number" onChange={(event) => setPointLimit(Number(event.target.value))} />
          </label>
          <button className="primary" onClick={analyze} disabled={isAnalyzing || !playerMasterId || !opponentMasterId}>
            {analyzeButtonLabel}
          </button>
        </div>
        <div className="actionBar">
          <button className="subtleButton" type="button" onClick={shareSetup}>Copy share link</button>
          <button className="subtleButton" type="button" onClick={printPlan}>Print view</button>
          <button className="subtleButton" type="button" onClick={clearCollection}>Clear collection</button>
        </div>
        <p className="matchSummary">{strategy.summary}</p>
        <HelpDisclosure
          className="matchHint"
          label="Analyze with masters only"
          text="You can run analysis with just both masters selected, then refine Available results by marking models in your collection."
        />
      </section>

      <nav className="setupStepper" aria-label="Counter-pick setup sequence">
        <span>1. Match</span>
        <span>2. Opponent Intel</span>
        <span>3. Player Collection</span>
        <span>4. Analyze</span>
      </nav>

      <section className="plannerGrid">
        <CrewPanel
          title="Opponent"
          displayTitle="Opponent Intel"
          factions={catalog.factions}
          faction={opponentFaction}
          setFaction={setOpponentFaction}
          masters={opponentMasters}
          master={opponentMaster}
          allModels={catalog.models}
          masterId={opponentMasterId}
          setMasterId={setOpponentMasterId}
          pool={opponentPool}
          selectedIds={opponentModelIds}
          setSelectedIds={setOpponentModelIds}
          search={opponentSearch}
          setSearch={setOpponentSearch}
          selectionLabel="Expected"
          modeLabel="What I know they may take"
          helperText="Start here for counter-planning: choose the opposing master, then mark enemy models you know or expect. Leave empty to predict from their legal pool."
          selectedCountLabel="known"
          collapsed={setupCollapsed}
          setCollapsed={setSetupCollapsed}
          onOpenModel={openModel}
        />
        <CrewPanel
          title="Player"
          displayTitle="Player Collection"
          factions={catalog.factions}
          faction={playerFaction}
          setFaction={setPlayerFaction}
          masters={playerMasters}
          master={playerMaster}
          allModels={catalog.models}
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
          modeLabel="What I own"
          helperText="Then mark models in your collection. This builds the Available recommendation pool, not your hired crew."
          selectedCountLabel="in collection"
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
          Choose match context, identify the opposing master, mark your collection if you want Available recommendations, then run the matchup.
        </section>
      )}

      <aside className="stickyAnalyzeBar" aria-label="Analysis actions">
        <div>
          <strong>{stickySetupStatus}</strong>
          <span>
            {playerMaster?.name ?? "No player master"} vs {opponentMaster?.name ?? "no opponent master"} - {strategy.name}
          </span>
        </div>
        <div className="stickyAnalyzeActions">
          {analysis && setupCollapsed ? (
            <button className="subtleButton" type="button" onClick={() => setSetupCollapsed(false)}>
              Edit setup
            </button>
          ) : null}
          <button className="primary" type="button" onClick={analyze} disabled={isAnalyzing || !canAnalyze}>
            {canAnalyze ? analyzeButtonLabel : "Choose both masters"}
          </button>
        </div>
      </aside>

      {selectedModel ? <StatCardModal model={selectedModel} onClose={closeSelectedModel} /> : null}
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

function CrewPanel(props: {
  title: string;
  displayTitle: string;
  factions: string[];
  faction: string;
  setFaction: (value: string) => void;
  masters: ModelCard[];
  master?: ModelCard;
  allModels: ModelCard[];
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
  modeLabel: string;
  helperText: string;
  selectedCountLabel: string;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  onOpenModel: (model: ModelCard) => void;
}) {
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
  const isPlayerPanel = props.title === "Player";
  const sections = groupModelsForMaster(
    props.pool.filter((model) => !mandatoryIds.has(model.id)),
    props.master,
    props.faction,
    mandatoryModels
  );

  function toggle(id: string) {
    props.setSelectedIds(selected.has(id) ? props.selectedIds.filter((item) => item !== id) : [...props.selectedIds, id]);
  }

  function setModelQuantity(model: ModelCard, quantity: number) {
    const clampedQuantity = Math.max(1, Math.min(model.maxCopies, quantity));
    const withoutModel = props.selectedIds.filter((id) => id !== model.id);
    props.setSelectedIds([...withoutModel, ...Array.from({ length: clampedQuantity }, () => model.id)]);
  }

  return (
    <section className={`panel faction-${slugifyForMatch(props.faction)} ${props.collapsed ? "collapsedPanel" : ""}`}>
      <div className="panelHeader">
        <h2>
          <RulesIcon iconKey={isPlayerPanel ? "collection" : "prediction"} /> {props.displayTitle}
        </h2>
        <span>
          {mandatoryModels.reduce((sum, entry) => sum + entry.quantity, 0)} required / {props.selectedIds.length} {props.selectedCountLabel} / {totalSoulstones}ss
        </span>
      </div>
      <HelpDisclosure
        className="panelHelper"
        label={props.modeLabel}
        text={props.helperText}
      />
      <div className="spendSummary">
        <span>Required {requiredSoulstones}ss</span>
        <span>{props.selectedSummaryLabel ?? props.selectionLabel} {selectedSoulstones}ss</span>
        <strong>{props.totalSummaryLabel ?? "Total"} {totalSoulstones}ss</strong>
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
          <select value={props.faction} onChange={(event) => props.setFaction(event.target.value)}>
            {props.factions.map((faction) => (
              <option key={faction} value={faction}>
                {faction}
              </option>
            ))}
          </select>
        </label>
        <label>
          Master
          <select
            value={props.masterId}
            onChange={(event) => {
              props.setMasterId(event.target.value);
              props.setSelectedIds([]);
            }}
          >
            {props.masters.map((master) => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        className="search"
        value={props.search}
        placeholder="Filter models, abilities, keywords"
        onChange={(event) => props.setSearch(event.target.value)}
      />
      <HelpDisclosure className="helperText" label="Required models" text="Leader and associated totem models are included automatically and cannot be removed from this crew setup." />
      <div className="modelList">
        {sections.map((section) => (
          <div className="modelSection" key={section.title}>
            <div className="modelSectionHeader">
              <h3>
                <RulesIcon iconKey={sectionIcon(section.title)} /> {section.title}
              </h3>
              <span>{section.models.length}</span>
            </div>
            {section.models.length > 0 ? (
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
                  forced={entry.forced}
                />
              ))
            ) : (
              <div className="modelSectionEmpty">No matching models</div>
            )}
          </div>
        ))}
      </div>
        </>
      )}
    </section>
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
  forced?: boolean;
}) {
  const canSetQuantity = selected && !forced && model.maxCopies > 1;

  return (
    <div className={`modelRow ${selected ? "selected" : ""} ${forced ? "forced" : ""}`}>
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
        <small>{model.abilities.slice(0, 2).map((ability) => ability.name).join("; ") || "No parsed abilities"}</small>
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

function RecommendationPanel({
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
  if (!selectedPath) return null;

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

      {!selectedPath.validation.legal ? (
        <div className="warning">{selectedPath.validation.issues.join(" ")}</div>
      ) : null}

      {usedFullPool ? (
        <div className="infoCallout">No collection models were selected, so Available is using the full legal model pool.</div>
      ) : null}

      <div className="recommendationList">
        {selectedPath.models.map((recommendation) => {
          const modelIssues = selectedPath.validation.modelIssues[recommendation.model.id] ?? [];

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
                    <RulesIcon iconKey="soulstone" /> {formatRecommendationCost(recommendation)} - {recommendation.role} - score {recommendation.score}
                  </p>
                </div>
                <span className="badgeGroup">
                  <span className={recommendation.owned ? "ownedBadge" : "missingBadge"}>
                    {recommendation.owned ? "Owned" : "Not owned"}
                  </span>
                  <span className={`confidenceBadge confidence-${recommendation.confidence.toLowerCase()}`}>
                    {recommendation.confidence}
                  </span>
                </span>
              </div>
              {modelIssues.length > 0 ? <InlineIssues issues={modelIssues} /> : null}
              {recommendation.hireTax > 0 ? <p className="topReason">Adjusted cost: {recommendation.hireReason}</p> : null}
              {recommendation.why[0] ? <p className="topReason">Top reason: {recommendation.why[0]}</p> : null}
              <div className="scoreGrid">
                <span title="How directly this pick addresses the opposing master and master-specific pressure.">
                  Master Counter {recommendation.scoreBreakdown.masterAbilities}
                </span>
                <span title="How well this pick works with your leader, keyword, and available allied models.">
                  Crew Synergy {recommendation.scoreBreakdown.crewSynergy}
                </span>
                <span title="How well this pick addresses the strategy, opponent composition, roles, and table demands.">
                  Strategy/Matchup Fit {recommendation.scoreBreakdown.compositionMatchup}
                </span>
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
                  <RecSection title="How to Use" items={modelUseNotes(recommendation, strategyName)} />
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
    </section>
  );
}

function DraftCrewPanel({
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
  const expectedEntries = countExpectedModels(expectedModels);
  const expectedCount = expectedEntries.reduce((sum, entry) => sum + entry.quantity, 0);
  const expectedIds = new Set(expectedEntries.map((entry) => entry.model.id));
  const predictedModels = models.filter((recommendation) => !expectedIds.has(recommendation.model.id));
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
        text="Estimated from legal pool, keyword fit, role coverage, strategy needs, and point efficiency. These are not confirmed opponent selections."
      />

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

function confidenceLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 12) return "High";
  if (score >= 8) return "Medium";
  return "Low";
}

function formatRecommendationCost(recommendation: ModelRecommendation): string {
  if (recommendation.hireTax <= 0) return `${recommendation.hireCost}ss`;
  return `${recommendation.hireCost}ss (${recommendation.printedCost}+${recommendation.hireTax})`;
}

function formatExportHireLine(recommendation: ModelRecommendation): string {
  const reason = recommendation.hireTax > 0 ? ` - ${recommendation.hireReason}` : "";
  return `${recommendation.model.name} (${formatRecommendationCost(recommendation)}) - ${recommendation.role}${reason}`;
}

function modelUseNotes(recommendation: ModelRecommendation, strategyName?: string): string[] {
  return uniqueItems([
    ...recommendation.why,
    ...strategyReasons(recommendation.why, strategyName),
    `${recommendation.model.name} should play as ${articleFor(recommendation.role)} ${recommendation.role}.`
  ]);
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

function StatCardModal({ model, onClose }: { model: ModelCard; onClose: () => void }) {
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

function ActionChip({ action }: { action: ModelCard["actions"][number] }) {
  const prefixIcon = actionPrefixIcon(action.name);
  const typeIcon = rangeIcon(action.range);
  const triggers = (action.triggers ?? [])
    .flatMap((trigger) => trigger.condition?.toLowerCase().match(/ss|[rmcts]/g) ?? [])
    .map((condition) => (condition === "ss" ? "s" : condition))
    .filter((condition) => TRIGGER_SUIT_ICONS[condition])
    .slice(0, 3);

  return (
    <span className="actionChip" title={cleanActionName(action.name)}>
      {prefixIcon ? <RulesIcon iconKey={prefixIcon} /> : null}
      {typeIcon ? <RulesIcon iconKey={typeIcon} /> : null}
      <span>{cleanActionName(action.name)}</span>
      {cleanRange(action.range) ? <em>{cleanRange(action.range)}</em> : null}
      {triggers.map((condition, index) => (
        <RulesIcon key={`${condition}-${index}`} iconKey={TRIGGER_SUIT_ICONS[condition]} />
      ))}
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

function matchesSearch(model: ModelCard, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [model.name, model.faction, model.keywords.join(" "), model.textIndex].join(" ").toLowerCase().includes(query);
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
  mandatoryModels: Array<{ model: ModelCard; quantity: number }>
) {
  const masterKeywords = new Set(master?.strategicKeywords.map((keyword) => keyword.toLowerCase()) ?? []);
  const isKeywordModel = (model: ModelCard) =>
    model.strategicKeywords.some((keyword) => masterKeywords.has(keyword.toLowerCase()));
  const isVersatile = (model: ModelCard) => model.keywords.some((keyword) => keyword.toLowerCase() === "versatile");

  const keywordModels = pool.filter(isKeywordModel).sort(sortModels);
  const versatileModels = pool.filter((model) => !isKeywordModel(model) && isVersatile(model)).sort(sortModels);
  const factionModels = pool
    .filter((model) => !isKeywordModel(model) && !isVersatile(model) && model.faction === faction)
    .sort(sortModels);

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

function sortModels(a: ModelCard, b: ModelCard): number {
  return a.name.localeCompare(b.name) || a.cost - b.cost;
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

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function readStoredDrafts(): SavedDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isSavedDraft) : [];
  } catch {
    return [];
  }
}

function isSavedDraft(value: unknown): value is SavedDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as SavedDraft;
  return typeof draft.id === "string" && typeof draft.name === "string" && Array.isArray(draft.modelIds);
}

function readSharedSetup(): Partial<{
  playerFaction: string;
  playerMasterId: string;
  opponentFaction: string;
  opponentMasterId: string;
  ownedModelIds: string[];
  opponentModelIds: string[];
  pointLimit: number;
  strategyPoolId: string;
  strategyId: string;
}> | null {
  if (typeof window === "undefined") return null;
  const encoded = new URL(window.location.href).searchParams.get(SHARE_PARAM);
  if (!encoded) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

function encodeSharePayload(value: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(value)));
}

function buildDraftSummary(
  requiredModels: Array<{ model: ModelCard; quantity: number }>,
  path: RecommendationPath,
  pointLimit: number,
  context: DraftSummaryContext
): string {
  const requiredCost = requiredModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
  const totalCost = requiredCost + path.totalCost;
  return [
    `Draft crew - ${totalCost}/${pointLimit}ss`,
    `Strategy: ${context.strategyName} (${context.strategyPoolName})`,
    context.playerMasterName ? `Player: ${context.playerMasterName}` : undefined,
    context.opponentMasterName ? `Opponent: ${context.opponentMasterName}` : undefined,
    "",
    "Required:",
    ...requiredModels.map((entry) => `${entry.quantity}x ${entry.model.name} (${entry.model.cost}ss)`),
    "",
    "Draft hires:",
    ...path.models.map(formatExportHireLine),
    "",
    "Planning notes:",
    ...path.models.slice(0, 5).map((recommendation) => `- ${recommendation.model.name}: ${recommendation.why[0] ?? recommendation.hireReason}`)
  ].join("\n");
}
