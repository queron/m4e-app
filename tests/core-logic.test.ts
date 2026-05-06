import { describe, expect, it } from "vitest";
import { getCatalog, getHireDetails } from "@/lib/card-data";
import { buildCrewByScore, validateCrew } from "@/lib/crew-validation";
import { getMandatoryCrewEntries } from "@/lib/mandatory-crew";
import { analyzeMatchup, evaluateModelMatchup } from "@/lib/matchup-engine";
import { STRATEGY_POOLS } from "@/lib/strategy-pools";
import { buildTempoProfile, modelTempoTags } from "@/lib/tempo-profile";
import { proxyAvailabilityForCatalog, proxyTargetIdsForKeys } from "@/lib/proxy-data";
import { buildResourceProfile, modelResourceTags } from "@/lib/resource-profile";
import { SCHEME_POOLS, getReachableSchemes, getSchemeBranches, validateSchemeGraph } from "@/lib/scheme-pools";
import type { ModelCard, ModelRecommendation, TacticalTag } from "@/lib/types";

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

function tempoFixture(name: string, tacticalTags: TacticalTag[], speed: number, textIndex = "", cost = 6): ModelCard {
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    cardType: "unit",
    name,
    faction: "Test",
    sourceFile: "test",
    keywords: [],
    traits: [],
    strategicKeywords: [],
    cost,
    isFree: false,
    isMaster: false,
    isTotem: false,
    isUnique: false,
    maxCopies: 3,
    leaderModelCount: 1,
    statBlock: { defense: 5, speed, willpower: 5, size: 2 },
    abilities: [],
    actions: [],
    rulesText: textIndex,
    textIndex,
    tacticalTags
  };
}

function tempoRecommendation(model: ModelCard): ModelRecommendation {
  return {
    model,
    owned: true,
    hireCost: model.cost,
    printedCost: model.cost,
    hireTax: 0,
    hireKind: "keyword",
    hireReason: "Test hire",
    confidence: "Medium",
    trace: [],
    curatedNotes: [],
    score: 10,
    role: "test",
    scoreBreakdown: { masterAbilities: 0, crewSynergy: 0, compositionMatchup: 0 },
    why: [],
    relevantTech: [],
    priorityTargets: [],
    alliedSynergies: [],
    terrainTools: [],
    tempoTags: modelTempoTags(model),
    resourceTags: modelResourceTags(model),
    vulnerabilityFlags: []
  };
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

describe("legacy proxy data", () => {
  it("maps legacy proxy ownership to the current legal model id", () => {
    const availabilities = proxyAvailabilityForCatalog(catalog);
    const rottenBelle = availabilities.find((entry) => entry.proxyName === "Rotten Belle");
    const deadDoxy = modelByName("Dead Doxy");

    expect(rottenBelle).toMatchObject({
      modelId: deadDoxy.id,
      targetName: "Dead Doxy"
    });
    expect(proxyTargetIdsForKeys(availabilities, [rottenBelle?.key ?? ""])).toEqual([deadDoxy.id]);
  });

  it("deduplicates multiple proxies for the same current model", () => {
    const availabilities = proxyAvailabilityForCatalog(catalog);
    const bayouProxyKeys = availabilities
      .filter((entry) => entry.targetName === "Bayou Gremlin")
      .map((entry) => entry.key);
    const bayouGremlin = modelByName("Bayou Gremlin");

    expect(bayouProxyKeys.length).toBeGreaterThanOrEqual(2);
    expect(proxyTargetIdsForKeys(availabilities, bayouProxyKeys)).toEqual([bayouGremlin.id]);
  });
});

describe("scheme graph data", () => {
  const ggZeroSchemePool = SCHEME_POOLS.find((pool) => pool.id === "gg-zero") ?? SCHEME_POOLS[0];

  it("builds explicit Next Available branches for GG Zero", () => {
    const scoutBranch = getSchemeBranches(ggZeroSchemePool).find((branch) => branch.scheme.id === "scout-the-rooftops");

    expect(validateSchemeGraph(ggZeroSchemePool)).toEqual([]);
    expect(scoutBranch?.next.map((scheme) => scheme.id)).toEqual(expect.arrayContaining(["detonate-charges", "leave-your-mark"]));
  });

  it("caps reachable scheme traversal by depth", () => {
    const reachableOneStep = getReachableSchemes(ggZeroSchemePool, "breakthrough", 1).map((scheme) => scheme.id);
    const reachableTwoSteps = getReachableSchemes(ggZeroSchemePool, "breakthrough", 2).map((scheme) => scheme.id);

    expect(reachableOneStep).toEqual(expect.arrayContaining(["assassinate", "public-demonstration", "frame-job"]));
    expect(reachableTwoSteps.length).toBeGreaterThan(reachableOneStep.length);
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

  it("adds resource intensity to crew analysis", () => {
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

    expect(analysis.playerCrew.resourceProfile.overall).toMatch(/Low|Medium|High/);
    expect(analysis.playerCrew.resourceProfile.dimensions).toHaveLength(4);
    expect(analysis.paths.optimal.models.every((recommendation) => Array.isArray(recommendation.resourceTags))).toBe(true);
  });

  it("rates high and low resource profiles from parsed text", () => {
    const hungryMaster = tempoFixture(
      "Hungry Master",
      ["cardPressure", "soulstone", "marker", "summon"],
      5,
      "Discard a card. Draw a card. Drain a soulstone. Declare a trigger with a mask. Place a marker and summon a model with a token."
    );
    const simpleModel = tempoFixture("Simple Runner", ["mobility", "scheme"], 6, "Walk and interact.");

    const highProfile = buildResourceProfile(hungryMaster, undefined, [tempoRecommendation(hungryMaster)]);
    const lowProfile = buildResourceProfile(simpleModel, undefined, []);

    expect(highProfile.overall).toBe("High");
    expect(lowProfile.overall).toMatch(/Low|Medium/);
  });

  it("adds Turn 2 tempo profiles and model tempo tags", () => {
    const boundaryDispute = STRATEGY_POOLS[0].strategies.find((strategy) => strategy.id === "boundary-dispute");
    const recommendations = [
      tempoRecommendation(tempoFixture("Fast Schemer", ["scheme", "mobility"], 6, "Leap into position.")),
      tempoRecommendation(tempoFixture("Mobile Marker", ["placement", "marker"], 5, "Place this model within 3\".")),
      tempoRecommendation(tempoFixture("Center Anchor", ["armor", "control"], 4, "Armor and Staggered pressure."))
    ];

    const profile = buildTempoProfile(recommendations, boundaryDispute);

    expect(profile.turnTwoReadiness.find((readiness) => readiness.job === "score")?.band).toMatch(/Adequate|Strong/);
    expect(profile.turnTwoReadiness.find((readiness) => readiness.job === "contest")?.evidence.join(" ")).toContain("center-weighted");
    expect(recommendations.flatMap((recommendation) => recommendation.tempoTags)).toEqual(expect.arrayContaining(["T2 scorer", "Early contest"]));
  });

  it("flags setup-heavy tempo without selected strategy", () => {
    const recommendations = [
      tempoRecommendation(tempoFixture("Ritual Support", ["summon", "healing"], 4, "Summon from a corpse marker.")),
      tempoRecommendation(tempoFixture("Marker Engine", ["cardPressure"], 4, "Friendly model gains a condition from this marker.")),
      tempoRecommendation(tempoFixture("Late Battery", ["healing"], 4, "Support a friendly model after setup."))
    ];

    const profile = buildTempoProfile(recommendations);

    expect(profile.overall).toBe("Setup-heavy");
    expect(profile.risks.join(" ")).toContain("avoid spending the first two turns only preparing");
    expect(profile.turnOnePlan.join(" ")).not.toContain("undefined");
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
