import type { CrewCard, MatchupWarning, ModelCard, ModelRecommendation } from "./types";
import { cleanText } from "./strategy-tags";

type WarningInput = {
  playerMaster?: ModelCard;
  playerCrewCard?: CrewCard;
  recommendations: ModelRecommendation[];
  opponentMaster?: ModelCard;
  opponentCrewCard?: CrewCard;
  opponentModels: ModelCard[];
  inferredOpponent: boolean;
};

type Signal = {
  label: string;
  evidence: string[];
};

export function buildMatchupWarnings({
  playerMaster,
  playerCrewCard,
  recommendations,
  opponentMaster,
  opponentCrewCard,
  opponentModels,
  inferredOpponent
}: WarningInput): MatchupWarning[] {
  const playerSources = [playerMaster, playerCrewCard, ...recommendations.slice(0, 6).map((recommendation) => recommendation.model)].filter(Boolean) as Array<ModelCard | CrewCard>;
  const opponentSources = [opponentMaster, opponentCrewCard, ...opponentModels].filter(Boolean) as Array<ModelCard | CrewCard>;
  const warnings = [
    warningFromSignals({
      id: "condition-bury",
      label: "Condition/token-gated delivery",
      affectedEngine: "Bury, unbury, Fast, token, or condition engine",
      player: playerSignal(playerSources, /bury|unbury|from nothing|fast token|slow token|condition|backtrack token|rift marker/i, "Player engine references condition, token, bury/unbury, or Fast-style delivery."),
      opponent: opponentSignal(opponentSources, /remove.*token|remove.*condition|condition|slow|stunned|staggered|bury|unbury|rift marker/i, "Opponent has condition, token, or movement-control counterplay.", inferredOpponent),
      recommendation: "Hire or prioritize at least one independent scorer or anchor that does not require the condition/token engine."
    }),
    warningFromSignals({
      id: "marker-denial",
      label: "Marker plan can be disrupted",
      affectedEngine: "Scheme, terrain, corpse, scrap, or setup marker engine",
      player: playerSignal(playerSources, /scheme marker|marker|corpse|scrap|pyre|hazardous terrain|summon/i, "Player plan references markers, corpse/scrap, or marker-based setup."),
      opponent: opponentSignal(opponentSources, /remove.*marker|enemy marker|scheme marker|marker.*remove|anti.?scheme|destroy.*marker/i, "Opponent has marker denial or marker manipulation text.", inferredOpponent),
      recommendation: "Keep redundant scoring angles and avoid relying on a single marker pattern for both schemes."
    }),
    warningFromSignals({
      id: "wp-terror",
      label: "Wp/Terrifying pressure may be muted",
      affectedEngine: "Wp duel, Terrifying, or control pressure",
      player: playerSignal(playerSources, /terrifying|wp duel|resist wp|willpower|misery|stunned|slow|staggered/i, "Player plan references Wp duels, Terrifying, or control conditions."),
      opponent: opponentSignal(opponentSources, /ruthless|willpower|wp|ignore.*terrifying|discard.*card|cannot cheat|stunned/i, "Opponent has Wp, Ruthless-style, discard, or control-resistance text.", inferredOpponent),
      recommendation: "Pressure non-Wp lanes first and avoid assuming the control engine will solve every priority target."
    }),
    warningFromSignals({
      id: "summon-attrition",
      label: "Summon or replace engine has denial hooks",
      affectedEngine: "Summon, replace, corpse, scrap, or attrition engine",
      player: playerSignal(playerSources, /summon|replace|corpse|scrap|killed model|remains marker/i, "Player plan references summon, replace, corpse/scrap, or attrition setup."),
      opponent: opponentSignal(opponentSources, /remove.*corpse|remove.*scrap|remove.*remains|anti.?summon|burst|blast|shockwave|hazardous/i, "Opponent has corpse/scrap denial, area damage, or anti-summon pressure.", inferredOpponent),
      recommendation: "Do not overcommit to a summon/replace engine before confirming the opponent cannot clear the setup pieces."
    })
  ].filter(Boolean) as MatchupWarning[];

  return warnings.sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
}

function playerSignal(sources: Array<ModelCard | CrewCard>, pattern: RegExp, fallback: string): Signal {
  const evidence = matchingEvidence(sources, pattern);
  return { label: fallback, evidence };
}

function opponentSignal(sources: Array<ModelCard | CrewCard>, pattern: RegExp, fallback: string, inferred: boolean): Signal {
  const evidence = matchingEvidence(sources, pattern).map((line) => inferred ? `${line} (master/crew-card inferred)` : line);
  return { label: fallback, evidence };
}

function matchingEvidence(sources: Array<ModelCard | CrewCard>, pattern: RegExp): string[] {
  return sources.flatMap((source) => {
    const text = cleanText("textIndex" in source ? source.textIndex : source.rulesText);
    return pattern.test(text) ? [`${source.name}: ${snippetFor(text, pattern)}`] : [];
  }).slice(0, 4);
}

function warningFromSignals({
  id,
  label,
  affectedEngine,
  player,
  opponent,
  recommendation
}: {
  id: string;
  label: string;
  affectedEngine: string;
  player: Signal;
  opponent: Signal;
  recommendation: string;
}): MatchupWarning | null {
  if (player.evidence.length === 0 || opponent.evidence.length === 0) return null;
  const overlapCount = player.evidence.length + opponent.evidence.length;
  const severity: MatchupWarning["severity"] = overlapCount >= 5 ? "High" : overlapCount >= 3 ? "Medium" : "Low";

  return {
    id,
    label,
    severity,
    affectedEngine,
    summary: `${player.label} ${opponent.label}`,
    evidence: [...player.evidence, ...opponent.evidence].slice(0, 6),
    recommendation
  };
}

function snippetFor(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return "relevant rules text detected.";
  const start = Math.max(0, match.index - 42);
  const end = Math.min(text.length, match.index + match[0].length + 72);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function severityRank(severity: MatchupWarning["severity"]): number {
  if (severity === "High") return 3;
  if (severity === "Medium") return 2;
  return 1;
}
