export type GlossaryTerm =
  | "confidence"
  | "crew"
  | "expectedModel"
  | "favourable"
  | "keyword"
  | "master"
  | "requiredModel"
  | "scheme"
  | "soulstones"
  | "strategy"
  | "techPick"
  | "title"
  | "totem"
  | "versatile";

export const GLOSSARY: Record<GlossaryTerm, { label: string; text: string }> = {
  confidence: {
    label: "Confidence",
    text: "Confidence describes how complete the app evidence is. It is not a win-rate prediction."
  },
  crew: {
    label: "Crew",
    text: "Crew means the models you hire for the game, including your leader and required models."
  },
  expectedModel: {
    label: "Expected model",
    text: "An expected model is an opposing model you know or strongly suspect your opponent will bring."
  },
  favourable: {
    label: "Favourable",
    text: "Favourable means the model's tools appear useful into the matchup. Verify the table plan before locking it in."
  },
  keyword: {
    label: "Keyword",
    text: "A keyword is a shared crew identity used by many masters and models. Keyword models are usually the first place to look for synergy."
  },
  master: {
    label: "Master",
    text: "A master is your crew leader. Selecting one defines your main keyword, required models, and legal hiring pool."
  },
  requiredModel: {
    label: "Required model",
    text: "A required model is automatically included with the selected master, such as the master and associated totem."
  },
  scheme: {
    label: "Scheme",
    text: "Schemes are secondary scoring plans. This app surfaces likely model picks, not final scheme-card choices."
  },
  soulstones: {
    label: "Soulstones",
    text: "Soulstones are the crew-building points used to hire models. Standard games are commonly 50ss."
  },
  strategy: {
    label: "Strategy",
    text: "The strategy is the shared primary scoring objective for the game. It changes which roles and tools matter most."
  },
  techPick: {
    label: "Tech pick",
    text: "A tech pick is a model chosen for a specific matchup answer, even if it is not your default hire."
  },
  title: {
    label: "Title",
    text: "A title is an alternate version of a master with a different game plan and associated crew rules."
  },
  totem: {
    label: "Totem",
    text: "A totem is a required companion model tied to a specific master or title version."
  },
  versatile: {
    label: "Versatile",
    text: "Versatile models can be hired broadly within their faction and often fill flexible utility roles."
  }
};

export function glossaryText(term: GlossaryTerm): string {
  const entry = GLOSSARY[term];
  return `${entry.label}: ${entry.text}`;
}
