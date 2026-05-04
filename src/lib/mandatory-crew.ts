import masterCrewRules from "@/data/master_crew_rules.json";
import type { ModelCard } from "./types";
import { cleanText, slugify } from "./strategy-tags";

type SyntheticMasterRule = {
  id: string;
  faction: string;
  sourceModelName: string;
  requiredCopies: number;
  suppressTotems: boolean;
  note?: string;
};

type TitleTotemRule = {
  faction: string;
  masterName: string;
  totemNames: string[];
};

type MasterCrewRules = {
  syntheticMasters: SyntheticMasterRule[];
  titleTotems: TitleTotemRule[];
};

const RULES = masterCrewRules as MasterCrewRules;

export function getSyntheticMasterRules(): SyntheticMasterRule[] {
  return RULES.syntheticMasters;
}

export function getTitleTotemRules(): TitleTotemRule[] {
  return RULES.titleTotems;
}

export function getMandatoryCrewEntries(master: ModelCard | undefined, pool: ModelCard[]): Array<{ model: ModelCard; quantity: number }> {
  if (!master) return [];

  const syntheticRule = findSyntheticRuleForMaster(master);
  const requiredCopies = syntheticRule?.requiredCopies ?? master.leaderModelCount ?? 1;
  const mandatory = [{ model: master, quantity: requiredCopies }];

  if (syntheticRule?.suppressTotems) {
    return mandatory;
  }

  const candidateTotems = getTotemCandidates(master, pool);
  const selectedTotems = selectTotemsForTitle(master, candidateTotems);

  return [...mandatory, ...selectedTotems.map((model) => ({ model, quantity: 1 }))];
}

export function getMandatoryCrewDiagnostics(masters: ModelCard[], pool: ModelCard[]): string[] {
  const issues: string[] = [];

  for (const rule of RULES.syntheticMasters) {
    const source = pool.find((model) => sameText(model.faction, rule.faction) && sameText(model.name, rule.sourceModelName));
    if (!source) {
      issues.push(`Synthetic master rule ${rule.id} references missing source model: ${rule.faction} - ${rule.sourceModelName}.`);
    }
    if (!rule.requiredCopies || rule.requiredCopies < 1) {
      issues.push(`Synthetic master rule ${rule.id} must define requiredCopies >= 1.`);
    }
  }

  for (const rule of RULES.titleTotems) {
    const master = masters.find((candidate) => sameText(candidate.faction, rule.faction) && sameText(candidate.name, rule.masterName));
    if (!master) {
      issues.push(`Master crew rule references missing master: ${rule.faction} - ${rule.masterName}.`);
      continue;
    }

    for (const totemName of rule.totemNames) {
      const matches = pool.filter((model) => model.isTotem && sameText(model.faction, rule.faction) && sameText(model.name, totemName));
      if (matches.length === 0) {
        issues.push(`Master crew rule for ${rule.masterName} references missing totem: ${totemName}.`);
      }
      if (matches.length > 1) {
        issues.push(`Master crew rule for ${rule.masterName} matches multiple totems named ${totemName}.`);
      }
    }
  }

  for (const master of masters) {
    const syntheticRule = findSyntheticRuleForMaster(master);
    if (syntheticRule?.suppressTotems) continue;

    const candidates = getTotemCandidates(master, pool);
    if (candidates.length <= 1) continue;

    const selected = selectTotemsForTitle(master, candidates);
    if (selected.length !== 1) {
      issues.push(
        `${master.name} has ambiguous totems: ${candidates.map((model) => model.name).join(", ")}. Add a titleTotems rule.`
      );
    }
  }

  return issues;
}

export function findSyntheticRuleForMaster(master: Pick<ModelCard, "id">): SyntheticMasterRule | undefined {
  return RULES.syntheticMasters.find((rule) => rule.id === master.id);
}

function getTotemCandidates(master: ModelCard, pool: ModelCard[]): ModelCard[] {
  const masterKeywords = new Set(master.strategicKeywords.map((keyword) => keyword.toLowerCase()));

  return pool
    .filter((model) => model.isTotem && model.faction === master.faction)
    .filter((model) => model.strategicKeywords.some((keyword) => masterKeywords.has(keyword.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name) || a.cost - b.cost);
}

function selectTotemsForTitle(master: ModelCard, candidates: ModelCard[]): ModelCard[] {
  if (candidates.length <= 1) return candidates;

  const configured = RULES.titleTotems.find((rule) => sameText(rule.faction, master.faction) && sameText(rule.masterName, master.name));
  if (configured) {
    const configuredNames = new Set(configured.totemNames.map((name) => slugify(name)));
    return candidates.filter((model) => configuredNames.has(slugify(model.name)));
  }

  const directMatches = candidates.filter((totem) => cardTextContainsTotem(master, totem));

  return directMatches.length > 0 ? directMatches : candidates;
}

function cardTextContainsTotem(master: ModelCard, totem: ModelCard): boolean {
  const masterText = compactSlug(`${master.name} ${master.sourceFile} ${master.rulesText} ${master.textIndex}`);
  return masterText.includes(compactSlug(totem.name));
}

function sameText(left: string, right: string): boolean {
  return slugify(left) === slugify(right);
}

function compactSlug(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}
