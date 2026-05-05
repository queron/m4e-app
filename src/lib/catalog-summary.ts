import type {
  CardCatalog,
  CatalogSummary,
  CatalogSummaryCrewCard,
  CatalogSummaryModel,
  CatalogSummaryUpgradeCard,
  CrewCard,
  ModelCard,
  RawAction,
  UpgradeCard
} from "./types";

export function toCatalogSummary(catalog: CardCatalog): CatalogSummary {
  const models = catalog.models.map(toModelSummary);
  const modelById = new Map(models.map((model) => [model.id, model]));

  return {
    factions: catalog.factions,
    models,
    masters: catalog.masters.map((master) => modelById.get(master.id) ?? toModelSummary(master)),
    crewCards: catalog.crewCards.map(toCrewCardSummary),
    upgrades: catalog.upgrades.map(toUpgradeSummary)
  };
}

function toModelSummary(model: ModelCard): CatalogSummaryModel {
  const abilities = model.abilities.map((ability) => ({ name: ability.name }));
  const actions = model.actions.map(toActionSummary);

  return {
    ...model,
    abilities,
    actions,
    rulesText: "",
    textIndex: [
      model.name,
      model.faction,
      model.sourceFile,
      model.keywords.join(" "),
      model.strategicKeywords.join(" "),
      model.traits.join(" "),
      model.tacticalTags.join(" "),
      abilities.map((ability) => ability.name).join(" "),
      actions.map((action) => action.name).join(" ")
    ].join(" "),
    detailLoaded: false
  };
}

function toCrewCardSummary(card: CrewCard): CatalogSummaryCrewCard {
  return {
    ...card,
    abilities: card.abilities.map((ability) => ({ name: ability.name })),
    actions: card.actions.map(toActionSummary),
    rulesText: ""
  };
}

function toUpgradeSummary(card: UpgradeCard): CatalogSummaryUpgradeCard {
  return {
    ...card,
    abilitiesGranted: card.abilitiesGranted.map((ability) => ({ name: ability.name })),
    rulesText: ""
  };
}

function toActionSummary(action: RawAction): CatalogSummaryModel["actions"][number] {
  return {
    name: action.name,
    type: action.type,
    range: action.range,
    stat: action.stat,
    resist: action.resist,
    targetNumber: action.targetNumber,
    damage: action.damage
  };
}
