"use client";

import { useEffect, useMemo, useState } from "react";
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
type SavedDraft = {
  id: string;
  name: string;
  createdAt: string;
  totalCost: number;
  modelIds: string[];
  summary: string;
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [error, setError] = useState("");

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
      .catch(() => setError("Card data could not be loaded."));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedModel) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedModel(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedModel]);

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
      setSetupCollapsed(true);
      setStatusMessage("Analysis ready. Setup panels collapsed for comparison.");
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
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
    const summary = buildDraftSummary(playerRequiredModels, path, pointLimit);
    const draft: SavedDraft = {
      id: `${Date.now()}`,
      name: `${playerMaster?.name ?? "Crew"} into ${opponentMaster?.name ?? "opponent"}`,
      createdAt: new Date().toISOString(),
      totalCost,
      modelIds: path.models.map((recommendation) => recommendation.model.id),
      summary
    };
    setSavedDrafts((drafts) => [draft, ...drafts].slice(0, 12));
    setStatusMessage("Draft saved locally.");
  }

  async function exportDraft(path: RecommendationPath) {
    await navigator.clipboard.writeText(buildDraftSummary(playerRequiredModels, path, pointLimit));
    setStatusMessage("Draft export copied.");
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
            {isAnalyzing ? "Analyzing" : "Analyze"}
          </button>
        </div>
        <div className="actionBar">
          <button className="subtleButton" type="button" onClick={shareSetup}>Copy share link</button>
          <button className="subtleButton" type="button" onClick={printPlan}>Print view</button>
          <button className="subtleButton" type="button" onClick={clearCollection}>Clear collection</button>
        </div>
        <p className="matchSummary">{strategy.summary}</p>
        <p className="matchHint">You can analyze with only both masters selected, then refine the results by marking models in your collection.</p>
      </section>

      <section className="plannerGrid">
        <CrewPanel
          title="Player"
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
          helperText="Select models you own. Draft crews are created separately from recommendations."
          selectedCountLabel="collection"
          collapsed={setupCollapsed}
          setCollapsed={setSetupCollapsed}
          onOpenModel={setSelectedModel}
        />
        <CrewPanel
          title="Opponent"
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
          selectionLabel="Seen"
          helperText="Mark opposing models you know or expect. Leave empty to predict from their legal pool."
          selectedCountLabel="known"
          collapsed={setupCollapsed}
          setCollapsed={setSetupCollapsed}
          onOpenModel={setSelectedModel}
        />
      </section>

      {analysis ? (
        <section className="analysisGrid">
          <div className="strategyContext">
            <div>
              <h2>
                <RulesIcon iconKey="strategy" /> {analysis.match.strategy?.name ?? strategy.name}
              </h2>
              <p>{analysis.match.strategy?.summary ?? strategy.summary}</p>
            </div>
            <span>{strategyPool.name}</span>
          </div>
          <div className="analysisColumn">
            <CrewAnalysisCard
              title="My Crew"
              subtitle={`${analysis.playerCrew.primaryKeywords.join(", ")} - ${analysis.match.strategy?.name ?? "No strategy"}`}
              playstyle={analysis.playerCrew.playstyle}
              strengths={analysis.playerCrew.strengths}
              vulnerabilities={analysis.playerCrew.vulnerabilities}
            />
            <RecommendationPanel
              pathKind={pathKind}
              setPathKind={setPathKind}
              selectedPath={selectedPath}
              usedFullPool={pathKind === "available" && analyzedCollectionCount === 0}
              strategyName={analysis.match.strategy?.name}
              onUsePlan={(path) => setDraftPath(path)}
              onSavePlan={saveDraft}
              onExportPlan={exportDraft}
              onOpenModel={setSelectedModel}
            />
            {draftPath ? (
              <DraftCrewPanel requiredModels={playerRequiredModels} path={draftPath} pointLimit={pointLimit} onOpenModel={setSelectedModel} />
            ) : null}
            <SavedDraftsPanel drafts={savedDrafts} setDrafts={setSavedDrafts} />
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
            <LikelyCrewPanel models={analysis.opponentCrew.likelyModels} onOpenModel={setSelectedModel} />
          </div>
        </section>
      ) : (
        <section className="emptyState">
          Pick both masters, mark the models you own, add known opposing models, then run the matchup.
        </section>
      )}

      {selectedModel ? <StatCardModal model={selectedModel} onClose={() => setSelectedModel(null)} /> : null}
    </main>
  );
}

function CrewPanel(props: {
  title: string;
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
          <RulesIcon iconKey={props.title === "Player" ? "collection" : "prediction"} /> {props.title}
        </h2>
        <span>
          {mandatoryModels.reduce((sum, entry) => sum + entry.quantity, 0)} required / {props.selectedIds.length} {props.selectedCountLabel} / {totalSoulstones}ss
        </span>
      </div>
      <p className="panelHelper">{props.title === "Player" ? "Choose your collection, inspect cards, then compare recommended hires." : "Mark known enemy models or leave empty for predicted picks."}</p>
      <div className="spendSummary">
        <span><SpendIcon iconKey="soulstone" /> Required models {requiredSoulstones}</span>
        <span><SpendIcon iconKey="collection" /> {props.selectionLabel} {selectedSoulstones}ss</span>
        <strong><SpendIcon iconKey="soulstone" /> Displayed total {totalSoulstones}</strong>
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
      <p className="helperText">{props.helperText}</p>
      <p className="requiredHelper">Leader and associated totem models are included automatically and cannot be removed from this crew setup.</p>
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
  onToggle,
  onQuantityChange,
  onOpenModel,
  forced = false
}: {
  model: ModelCard;
  selected: boolean;
  selectedQuantity: number;
  selectionLabel: string;
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
          aria-label={`${selected ? "Remove" : "Add"} ${model.name} ${selectionLabel.toLowerCase()}`}
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
        <span className="actionPreview">{model.actions.slice(0, 2).map((action) => <ActionChip key={`${model.id}-${action.name}`} action={action} />)}</span>
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
  if (!selectedPath) return null;

  return (
    <section className="panel recommendationPanel">
      <div className="panelHeader">
        <div>
          <h2>Recommendations</h2>
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
        <RulesIcon iconKey="draft" /> Use this recommendation set
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
        {selectedPath.models.map((recommendation) => (
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
              <span className={recommendation.owned ? "ownedBadge" : "missingBadge"}>
                <RulesIcon iconKey={recommendation.owned ? "collection" : "prediction"} /> {recommendation.owned ? "Owned" : "Not owned"}
              </span>
            </div>
            {recommendation.why[0] ? <p className="topReason">Top reason: {recommendation.why[0]}</p> : null}
            <div className="scoreGrid">
              <span title="How directly this pick addresses the opposing master and master-specific pressure.">
                <RulesIcon iconKey="master" /> Master Counter {recommendation.scoreBreakdown.masterAbilities}
              </span>
              <span title="How well this pick works with your leader, keyword, and available allied models.">
                <RulesIcon iconKey="keyword" /> Crew Synergy {recommendation.scoreBreakdown.crewSynergy}
              </span>
              <span title="How well this pick addresses the strategy, opponent composition, roles, and table demands.">
                <RulesIcon iconKey="strategy" /> Strategy/Matchup Fit {recommendation.scoreBreakdown.compositionMatchup}
              </span>
            </div>
            <RecSection title="Right Pick" items={recommendation.why} />
            <RecSection title="Strategy Fit" items={strategyReasons(recommendation.why, strategyName)} />
            <RecSection title="Why This Ranked Here" items={recommendation.trace} />
            <RecSection title="Curated Notes" items={recommendation.curatedNotes} />
            <RecSection title="Relevant Skills, Abilities, Triggers" items={recommendation.relevantTech} />
            <RecSection title="Priority Targets" items={recommendation.priorityTargets} />
            <RecSection title="Allied Synergies" items={recommendation.alliedSynergies} />
          </article>
        ))}
      </div>
    </section>
  );
}

function DraftCrewPanel({
  requiredModels,
  path,
  pointLimit,
  onOpenModel
}: {
  requiredModels: Array<{ model: ModelCard; quantity: number }>;
  path: RecommendationPath;
  pointLimit: number;
  onOpenModel: (model: ModelCard) => void;
}) {
  const [copied, setCopied] = useState(false);
  const requiredCost = requiredModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
  const hiredCost = path.models.reduce((sum, recommendation) => sum + recommendation.hireCost, 0);
  const totalCost = requiredCost + hiredCost;
  const remaining = pointLimit - totalCost;

  async function copyDraft() {
    const lines = [
      `Draft crew - ${totalCost}/${pointLimit}ss`,
      "",
      "Required:",
      ...requiredModels.map((entry) => `${entry.quantity}x ${entry.model.name} (${entry.model.cost}ss)`),
      "",
      "Recommended hires:",
      ...path.models.map((recommendation) => `${recommendation.model.name} (${formatRecommendationCost(recommendation)}) - ${recommendation.role}`)
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
  }

  return (
    <section className="panel draftPanel">
      <div className="panelHeader">
        <div>
          <h2>
            <RulesIcon iconKey="draft" /> Draft Crew
          </h2>
          <span>
            <RulesIcon iconKey="soulstone" /> {totalCost} used / {remaining}ss open
          </span>
        </div>
        <button className="subtleButton" type="button" onClick={copyDraft}>
          <RulesIcon iconKey="draft" /> {copied ? "Copied" : "Copy summary"}
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
        <h3>Recommended Hires</h3>
        {path.models.map((recommendation) => (
          <div className="draftRow" key={recommendation.model.id}>
            <button className="draftModelButton" type="button" onClick={() => onOpenModel(recommendation.model)}>
              {recommendation.model.name}
            </button>
            <strong title={recommendation.hireReason}><RulesIcon iconKey="soulstone" /> {formatRecommendationCost(recommendation)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SavedDraftsPanel({
  drafts,
  setDrafts
}: {
  drafts: SavedDraft[];
  setDrafts: (drafts: SavedDraft[] | ((drafts: SavedDraft[]) => SavedDraft[])) => void;
}) {
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
        <span>{drafts.length} local</span>
      </div>
      <div className="draftList">
        {drafts.map((draft) => (
          <div className="draftRow" key={draft.id}>
            <span>
              <strong>{draft.name}</strong>
              <small>{draft.totalCost}ss - {new Date(draft.createdAt).toLocaleDateString()}</small>
            </span>
            <button className="subtleButton" type="button" onClick={() => copyDraft(draft)}>Copy</button>
            <button className="subtleButton" type="button" onClick={() => setDrafts(drafts.filter((item) => item.id !== draft.id))}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function LikelyCrewPanel({
  models,
  onOpenModel
}: {
  models: MatchupAnalysis["opponentCrew"]["likelyModels"];
  onOpenModel: (model: ModelCard) => void;
}) {
  return (
    <section className="panel recommendationPanel">
      <div className="panelHeader">
        <div>
          <h2>
            <RulesIcon iconKey="prediction" /> Likely Crew Members
          </h2>
          <span><RulesIcon iconKey="soulstone" /> {models.reduce((sum, recommendation) => sum + recommendation.hireCost, 0)} likely package</span>
        </div>
      </div>
      <p className="panelHint">
        Predictions are estimates based on keyword fit, role coverage, strategy needs, and point efficiency. They are not confirmed opponent selections.
      </p>

      <div className="recommendationList">
        {models.map((recommendation) => (
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
              <span className="ownedBadge"><RulesIcon iconKey="prediction" /> Predicted</span>
            </div>
            <p className="confidenceBand">{recommendation.confidence} confidence prediction</p>
            <div className="scoreGrid twoScores">
              <span><RulesIcon iconKey="keyword" /> Synergy {recommendation.scoreBreakdown.crewSynergy}</span>
              <span><RulesIcon iconKey="score" /> Role {recommendation.scoreBreakdown.compositionMatchup}</span>
            </div>
            <RecSection title="Why They Are Likely" items={recommendation.why} />
            <RecSection title="Confidence Basis" items={recommendation.trace} />
            <RecSection title="Relevant Tech" items={recommendation.relevantTech} />
            <RecSection title="Crew Synergies" items={recommendation.alliedSynergies} />
          </article>
        ))}
      </div>
    </section>
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

function StatCardModal({ model, onClose }: { model: ModelCard; onClose: () => void }) {
  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section className="statCardModal" role="dialog" aria-modal="true" aria-labelledby="stat-card-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="statCardTopline">
          <span>{model.faction}</span>
          <span className="modalHint">Esc closes</span>
          <button className="iconButton" type="button" onClick={onClose} aria-label="Close stat card" autoFocus>
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

function SpendIcon({ iconKey }: { iconKey: Extract<RulesIconKey, "soulstone" | "collection"> }) {
  const Icon = iconKey === "collection" ? Library : Gem;

  return <Icon className="spendIcon" aria-hidden="true" strokeWidth={2.8} />;
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
  pointLimit: number
): string {
  const requiredCost = requiredModels.reduce((sum, entry) => sum + entry.model.cost * entry.quantity, 0);
  const totalCost = requiredCost + path.totalCost;
  return [
    `Draft crew - ${totalCost}/${pointLimit}ss`,
    "",
    "Required:",
    ...requiredModels.map((entry) => `${entry.quantity}x ${entry.model.name} (${entry.model.cost}ss)`),
    "",
    "Recommended hires:",
    ...path.models.map((recommendation) => `${recommendation.model.name} (${formatRecommendationCost(recommendation)}) - ${recommendation.role}`),
    "",
    "Planning notes:",
    ...path.models.slice(0, 5).map((recommendation) => `- ${recommendation.model.name}: ${recommendation.why[0] ?? recommendation.hireReason}`)
  ].join("\n");
}
