import type { CrewValidation, ModelCard } from "./types";
import { getMandatoryCrewModelCount, getPrimaryKeywords, legalModelsForMaster } from "./card-data";

export function validateCrew(
  master: ModelCard | undefined,
  hiredModels: ModelCard[],
  pointLimit: number,
  modelLimit: number
): CrewValidation {
  const issues: string[] = [];
  const totalCost = hiredModels.reduce((sum, model) => sum + model.cost, 0);
  const legalIds = new Set(legalModelsForMaster(master).map((model) => model.id));
  const counts = new Map<string, number>();

  for (const model of hiredModels) {
    counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
    if (!legalIds.has(model.id)) {
      const keywords = getPrimaryKeywords(master).join(", ") || "the master's keyword";
      issues.push(`${model.name} is outside ${master?.faction ?? "the selected faction"} and does not share ${keywords}.`);
    }
  }

  for (const model of hiredModels) {
    const count = counts.get(model.id) ?? 0;
    if (model.isUnique && count > 1) {
      issues.push(`${model.name} is Unique and can only be hired once.`);
    }
    if (count > model.maxCopies) {
      issues.push(`${model.name} exceeds its copy limit of ${model.maxCopies}.`);
    }
  }

  if (!master) issues.push("Select a player master.");
  if (totalCost > pointLimit) issues.push(`Crew spends ${totalCost}ss, which exceeds the ${pointLimit}ss limit.`);
  const mandatoryModelCount = getMandatoryCrewModelCount(master);
  if (Number.isFinite(modelLimit) && hiredModels.length + mandatoryModelCount > modelLimit) {
    issues.push(`Crew has ${hiredModels.length + mandatoryModelCount} models, above the ${modelLimit} model limit.`);
  }

  return {
    legal: issues.length === 0,
    totalCost,
    pointLimit,
    modelCount: hiredModels.length + mandatoryModelCount,
    modelLimit,
    issues
  };
}

export function buildCrewByScore(
  master: ModelCard | undefined,
  scoredModels: Array<{ model: ModelCard; score: number }>,
  pointLimit: number,
  modelLimit: number
): ModelCard[] {
  const selected: ModelCard[] = [];
  let spent = 0;
  const remainingSlots = Math.max(0, modelLimit - getMandatoryCrewModelCount(master));

  for (const scored of scoredModels.sort((a, b) => b.score - a.score || b.model.cost - a.model.cost)) {
    if (selected.length >= remainingSlots) break;
    if (scored.model.cost <= 0) continue;
    if (spent + scored.model.cost > pointLimit) continue;
    selected.push(scored.model);
    spent += scored.model.cost;
  }

  if (selected.length === 0) {
    const cheapest = scoredModels
      .map((item) => item.model)
      .filter((model) => model.cost > 0 && model.cost <= pointLimit)
      .sort((a, b) => a.cost - b.cost)[0];
    if (cheapest) selected.push(cheapest);
  }

  return selected;
}
