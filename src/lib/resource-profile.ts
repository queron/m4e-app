import type { CrewCard, ModelCard, ModelRecommendation, ResourceDimension, ResourceDimensionId, ResourceProfile } from "./types";
import { cleanText } from "./strategy-tags";

const DIMENSION_LABELS: Record<ResourceDimensionId, string> = {
  hand: "Hand",
  suits: "Suits",
  soulstones: "Soulstones",
  setup: "Setup"
};

const MITIGATIONS: Record<ResourceDimensionId, string> = {
  hand: "Bring card smoothing or keep a simple scoring lane that does not require repeated cheats.",
  suits: "Reserve stones, focus, or alternate lines for turns where key suits are missing.",
  soulstones: "Budget stones for prevention and key turns before spending them on aggressive triggers.",
  setup: "Include at least one independent scorer and cap first-turn engine setup."
};

export function buildResourceProfile(
  master: ModelCard | undefined,
  crewCard: CrewCard | undefined,
  recommendations: ModelRecommendation[]
): ResourceProfile {
  const sources = [master, crewCard, ...recommendations.slice(0, 6).map((recommendation) => recommendation.model)].filter(Boolean) as Array<ModelCard | CrewCard>;
  const dimensions: ResourceDimension[] = (Object.keys(DIMENSION_LABELS) as ResourceDimensionId[]).map((id) =>
    dimensionRead(id, sources)
  );
  const overall = highestRating(dimensions);
  const dataLimited = sources.length === 0 || dimensions.every((dimension) => dimension.evidence.length === 0);

  return {
    overall,
    dimensions: dataLimited
      ? dimensions.map((dimension) => ({
          ...dimension,
          evidence: [`Parsed card text shows limited ${dimension.label.toLowerCase()} pressure evidence.`]
        }))
      : dimensions,
    dataLimited
  };
}

export function modelResourceTags(model: ModelCard): string[] {
  const text = cleanText(model.textIndex);
  const tags: string[] = [];

  if (model.tacticalTags.includes("cardPressure") || /draw|discard|cheat fate|control hand/i.test(text)) tags.push("Resource fit: hand support");
  if (model.tacticalTags.includes("soulstone") || /soulstone|drain a s|infuse/i.test(text)) tags.push("Resource fit: stones");
  if (model.tacticalTags.includes("healing") || model.tacticalTags.includes("control")) tags.push("Resource fit: stabilizer");
  if (model.tacticalTags.includes("scheme") || model.tacticalTags.includes("mobility")) tags.push("Resource fit: independent scorer");

  return Array.from(new Set(tags)).slice(0, 2);
}

function dimensionRead(id: ResourceDimensionId, sources: Array<ModelCard | CrewCard>): ResourceDimension {
  const evidence = sources.flatMap((source) => evidenceFor(id, source)).slice(0, 4);
  const rating = evidence.length >= 3 ? "High" : evidence.length >= 1 ? "Medium" : "Low";

  return {
    id,
    label: DIMENSION_LABELS[id],
    rating,
    evidence,
    mitigation: MITIGATIONS[id]
  };
}

function evidenceFor(id: ResourceDimensionId, source: ModelCard | CrewCard): string[] {
  const text = cleanText("textIndex" in source ? source.textIndex : source.rulesText);
  const tags = "tacticalTags" in source ? source.tacticalTags : [];
  const name = source.name;

  if (id === "hand") {
    return [
      tags.includes("cardPressure") ? `${name}: card pressure or card smoothing tag detected.` : "",
      /draw|discard|cheat fate|control hand|look at the top/i.test(text) ? `${name}: rules text references draw, discard, cheat, or hand control effects.` : "",
      /tn\s?\d+|target number|opposed duel/i.test(text) ? `${name}: repeated TN or duel language may demand hand quality.` : ""
    ].filter(Boolean);
  }

  if (id === "suits") {
    const suitMentions = (text.match(/trigger|ram|mask|crow|tome|raise|suit/g) ?? []).length;
    return [
      suitMentions >= 4 ? `${name}: multiple trigger, raise, or suit references detected.` : "",
      /declare.*trigger|receives? a \+|built.?in/i.test(text) ? `${name}: trigger access appears relevant to output.` : ""
    ].filter(Boolean);
  }

  if (id === "soulstones") {
    return [
      tags.includes("soulstone") ? `${name}: soulstone tactical tag detected.` : "",
      /soulstone|drain a s|infuse|reduce damage|prevent/i.test(text) ? `${name}: rules text references stones, infusion, or prevention-style resource spend.` : ""
    ].filter(Boolean);
  }

  return [
    tags.includes("summon") || tags.includes("marker") ? `${name}: summon or marker setup tag detected.` : "",
    /summon|marker|condition|token|friendly model|within \d+" of/i.test(text) ? `${name}: engine text references markers, conditions, tokens, or positioning dependencies.` : ""
  ].filter(Boolean);
}

function highestRating(dimensions: ResourceDimension[]): ResourceProfile["overall"] {
  if (dimensions.some((dimension) => dimension.rating === "High")) return "High";
  if (dimensions.some((dimension) => dimension.rating === "Medium")) return "Medium";
  return "Low";
}
