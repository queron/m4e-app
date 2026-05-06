import { describe, expect, it } from "vitest";
import { getCatalog, getHireDetails } from "@/lib/card-data";
import { buildCrewByScore, validateCrew } from "@/lib/crew-validation";
import { getMandatoryCrewEntries } from "@/lib/mandatory-crew";
import { analyzeMatchup, evaluateModelMatchup } from "@/lib/matchup-engine";
import type { ModelCard } from "@/lib/types";

const catalog = getCatalog();

function modelByName(name: string): ModelCard {
  const model = catalog.models.find((candidate) => candidate.name === name);
  if (!model) throw new Error(`Missing model fixture: ${name}`);
  return model;
}

function masterByName(name: string): ModelCard {
  const master = catalog.masters.find((candidate) => candidate.name === name);
  if (!master) throw new Error(`Missing master fixture: ${name}`);
  return master;
}

describe("crew legality", () => {
  it("treats Pandora hiring Ronin as an illegal cross-faction hire", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const ronin = modelByName("Ronin");

    const hire = getHireDetails(pandora, ronin);
    const validation = validateCrew(pandora, [ronin], 50, 99);

    expect(hire.legal).toBe(false);
    expect(hire.kind).toBe("illegal");
    expect(validation.legal).toBe(false);
    expect(validation.issues.join(" ")).toContain("not a legal hire");
  });

  it("validates keyword hires and copy limits", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const sorrow = modelByName("Sorrow");

    expect(getHireDetails(pandora, sorrow).legal).toBe(true);

    const validation = validateCrew(pandora, [sorrow, sorrow, sorrow, sorrow], 50, 99);
    expect(validation.legal).toBe(false);
    expect(validation.issues.join(" ")).toContain("copy limit");
  });
});

describe("mandatory crew rules", () => {
  it("uses required twin-master count for Viktoria Chambers, Ashes And Blood", () => {
    const viktoria = masterByName("Viktoria Chambers, Ashes And Blood");
    const mandatory = getMandatoryCrewEntries(viktoria, catalog.models);

    expect(mandatory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: expect.objectContaining({ id: viktoria.id }),
          quantity: 2
        })
      ])
    );
  });

  it("selects title-specific totems for Toni Ironsides titles", () => {
    const troubleshooter = masterByName("Toni Ironsides, Troubleshooter");
    const unionPresident = masterByName("Toni Ironsides, Union President");

    const troubleshooterTotems = getMandatoryCrewEntries(troubleshooter, catalog.models).map((entry) => entry.model.name);
    const unionPresidentTotems = getMandatoryCrewEntries(unionPresident, catalog.models).map((entry) => entry.model.name);

    expect(troubleshooterTotems).toContain("M&Su, Mouse");
    expect(unionPresidentTotems).toContain("M&Su, Fitzsimmons");
  });
});

describe("recommendation scoring", () => {
  it("builds a legal analyzed path with normalized owned duplicates", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const opponent = masterByName("The Dreamer, Insomniac");
    const sorrow = modelByName("Sorrow");

    const analysis = analyzeMatchup({
      playerFaction: pandora.faction,
      playerMasterId: pandora.id,
      opponentFaction: opponent.faction,
      opponentMasterId: opponent.id,
      ownedModelIds: [sorrow.id, sorrow.id],
      opponentModelIds: [],
      pointLimit: 50,
      modelLimit: 99,
      strategyPoolId: "gg-zero",
      strategyId: "plant-explosives",
      schemePoolId: "gg-zero"
    });

    expect(analysis.playerCrew.master?.id).toBe(pandora.id);
    expect(analysis.paths.available.validation.legal).toBe(true);
    expect(analysis.paths.available.models.map((recommendation) => recommendation.model.id)).toEqual([sorrow.id]);
  });

  it("evaluates a model matchup with fit details", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const opponent = masterByName("The Dreamer, Insomniac");
    const sorrow = modelByName("Sorrow");

    const evaluation = evaluateModelMatchup({
      playerMasterId: pandora.id,
      opponentMasterId: opponent.id,
      modelId: sorrow.id,
      opponentModelIds: []
    });

    expect(evaluation.legal).toBe(true);
    expect(evaluation.fit?.role).toBeTruthy();
    expect(evaluation.whyHelps.length).toBeGreaterThan(0);
  });

  it("adds role versatility to recommendations", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const opponent = masterByName("The Dreamer, Insomniac");

    const analysis = analyzeMatchup({
      playerFaction: pandora.faction,
      playerMasterId: pandora.id,
      opponentFaction: opponent.faction,
      opponentMasterId: opponent.id,
      ownedModelIds: [],
      opponentModelIds: [],
      pointLimit: 50,
      modelLimit: 99,
      strategyPoolId: "gg-zero",
      strategyId: "plant-explosives",
      schemePoolId: "gg-zero"
    });
    const flexiblePick = analysis.paths.optimal.models.find((recommendation) =>
      (recommendation.versatility?.jobs.length ?? 0) >= 2
    );

    expect(flexiblePick?.versatility?.band).toMatch(/High|Medium/);
    expect(flexiblePick?.versatility?.evidence.length).toBeGreaterThan(0);
  });

  it("adds terrain and mobility guidance to crew analysis", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const opponent = masterByName("The Dreamer, Insomniac");

    const analysis = analyzeMatchup({
      playerFaction: pandora.faction,
      playerMasterId: pandora.id,
      opponentFaction: opponent.faction,
      opponentMasterId: opponent.id,
      ownedModelIds: [],
      opponentModelIds: [],
      pointLimit: 50,
      modelLimit: 99,
      strategyPoolId: "gg-zero",
      strategyId: "plant-explosives",
      schemePoolId: "gg-zero"
    });

    expect(analysis.playerCrew.terrainMobilityProfile.boardFit).toMatch(/Open|Dense|Vertical|Flexible|Data-limited/);
    expect(analysis.playerCrew.terrainMobilityProfile.mobilityBand).toMatch(/High|Medium|Low/);
    expect(analysis.playerCrew.terrainMobilityProfile.recommendedTablePlan.length).toBeGreaterThan(0);
    expect(analysis.paths.optimal.models.every((recommendation) => Array.isArray(recommendation.terrainTools))).toBe(true);
  });

  it("flags low-Wp risk into Pandora-style pressure", () => {
    const player = masterByName("Toni Ironsides, Union President");
    const opponent = masterByName("Pandora, Tyrant-Torn");
    const lowWillpowerHire = modelByName("Elemental Boxer");
    const wpPressureModel = modelByName("Candy");

    const evaluation = evaluateModelMatchup({
      playerMasterId: player.id,
      opponentMasterId: opponent.id,
      modelId: lowWillpowerHire.id,
      opponentModelIds: [wpPressureModel.id]
    });

    expect(evaluation.vulnerabilityFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "lowWp"
        })
      ])
    );
  });

  it("buildCrewByScore respects point limits", () => {
    const pandora = masterByName("Pandora, Tyrant-Torn");
    const candy = modelByName("Candy");
    const sorrow = modelByName("Sorrow");

    const selected = buildCrewByScore(
      pandora,
      [
        { model: candy, score: 100 },
        { model: sorrow, score: 10 }
      ],
      5,
      99
    );

    expect(selected.map((model) => model.id)).toEqual([sorrow.id]);
  });
});
