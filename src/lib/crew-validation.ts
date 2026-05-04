import type { CrewValidation, ModelCard } from "./types";
import { getHireDetails, getMandatoryCrewModelCount } from "./card-data";

export function validateCrew(
  master: ModelCard | undefined,
  hiredModels: ModelCard[],
  pointLimit: number,
  modelLimit: number
): CrewValidation {
  const issues: string[] = [];
  const modelIssues: Record<string, string[]> = {};
  const hiredModelCosts = hiredModels.map((model) => {
    const details = getHireDetails(master, model);
    return {
      ...details,
      modelId: model.id,
      modelName: model.name
    };
  });
  const totalCost = hiredModelCosts.reduce((sum, model) => sum + model.hireCost, 0);
  const counts = new Map<string, number>();

  function addIssue(issue: string, model?: ModelCard) {
    issues.push(issue);
    if (!model) return;
    modelIssues[model.id] = [...(modelIssues[model.id] ?? []), issue];
  }

  for (const model of hiredModels) {
    counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
    const details = getHireDetails(master, model);
    if (!details.legal) {
      addIssue(`${model.name} is not a legal hire: ${details.reason}`, model);
    }
  }

  for (const model of hiredModels) {
    const count = counts.get(model.id) ?? 0;
    if (model.isUnique && count > 1) {
      addIssue(`${model.name} is Unique and can only be hired once.`, model);
    }
    if (count > model.maxCopies) {
      addIssue(`${model.name} exceeds its copy limit of ${model.maxCopies}.`, model);
    }
  }

  if (!master) addIssue("Select a player master.");
  if (totalCost > pointLimit) addIssue(`Crew spends ${totalCost}ss, which exceeds the ${pointLimit}ss limit.`);
  const mandatoryModelCount = getMandatoryCrewModelCount(master);
  if (Number.isFinite(modelLimit) && hiredModels.length + mandatoryModelCount > modelLimit) {
    addIssue(`Crew has ${hiredModels.length + mandatoryModelCount} models, above the ${modelLimit} model limit.`);
  }

  return {
    legal: issues.length === 0,
    totalCost,
    pointLimit,
    modelCount: hiredModels.length + mandatoryModelCount,
    modelLimit,
    issues,
    modelIssues,
    hiredModelCosts
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
    const hireDetails = getHireDetails(master, scored.model);
    if (!hireDetails.legal || hireDetails.hireCost <= 0) continue;
    if (spent + hireDetails.hireCost > pointLimit) continue;
    selected.push(scored.model);
    spent += hireDetails.hireCost;
  }

  if (selected.length === 0) {
    const cheapest = scoredModels
      .map((item) => item.model)
      .filter((model) => {
        const hireDetails = getHireDetails(master, model);
        return hireDetails.legal && hireDetails.hireCost > 0 && hireDetails.hireCost <= pointLimit;
      })
      .sort((a, b) => getHireDetails(master, a).hireCost - getHireDetails(master, b).hireCost)[0];
    if (cheapest) selected.push(cheapest);
  }

  return selected;
}
