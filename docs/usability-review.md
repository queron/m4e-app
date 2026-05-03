# Malifaux Crew Optimizer Usability Review

This document contains a ready-to-run usability test script, synthetic participant protocol, synthesized findings, and GitHub-formatted issues for the Malifaux crew strategy app.

Assumptions to customize before live testing:
- Replace `[PLAYER FACTION/MASTER]`, `[OPPONENT FACTION/MASTER]`, and `[STRATEGY]` with crews your target players recognize.
- Replace `[KNOWN OWNED MODELS]` with a realistic player collection.
- Replace `[SUCCESS CRITERIA]` with app-specific expectations, such as "participant identifies a legal 50ss crew and can explain why two recommended models matter."
- This review evaluates usability and decision support, not Malifaux rules accuracy.

## Session Plan

Recommended session length: 35-45 minutes.

Participants:
- Newer Malifaux player: understands basic crew building but wants guidance.
- Returning/intermediate player: knows factions and strategies, uses the app to compare choices.
- Competitive/planning-oriented player: cares about legal crew construction and matchup reasoning.

Materials:
- App open at `http://localhost:3000`
- Test scenario handout with faction, master, opponent, strategy pool, and optional owned model list
- Notes sheet using the observation template below

## Facilitation Script

### 1. Introduction

Read aloud:

"Thanks for helping test this Malifaux crew strategy tool. We are testing the app, not you. Some parts may be unfinished or rough, and that is useful for us to observe. I will ask you to think aloud as you work: what you are looking for, what you expect to happen, and what feels confusing. I may ask follow-up questions, but I will not guide you toward the right answer unless you are completely stuck."

"The goal of this app is to help a player choose models for a Malifaux matchup based on their faction, master, opponent, strategy, and available models. Please use it as naturally as you would when preparing for a game."

Consent checkpoint:
- "Is it okay if I take notes on what you say and do?"
- "Do you have any questions before we start?"

### 2. Warm-Up Questions

Ask:
- "How often do you build or revise crews before a game?"
- "What information do you usually need before deciding which models to hire?"
- "When you look for matchup advice, what makes advice feel trustworthy?"

### 3. Tasks

Do not show participants step-by-step instructions. Give the goal and observe their path.

#### Task 1: Set up a known matchup

Scenario:
"You are preparing for a game. You know your faction and master are `[PLAYER FACTION/MASTER]`. Your opponent is playing `[OPPONENT FACTION/MASTER]`. The game is using `[STRATEGY POOL]` and `[STRATEGY]`. Set up the app so it reflects this matchup."

Observe:
- Can the participant distinguish Match setup from Player/Opponent setup?
- Do they notice the strategy pool and strategy selectors?
- Do they understand soulstone total as a match setting?
- Do they expect faction/master choices to reset selected models?

Neutral follow-ups:
- "What were you looking for first?"
- "Was anything named differently than you expected?"
- "What did you think the soulstone field controlled?"

#### Task 2: Represent a personal collection

Scenario:
"Assume you own these models: `[KNOWN OWNED MODELS]`. Mark your available models, then check whether the total crew cost makes sense to you."

Observe:
- Can the participant find models using the section organization and search?
- Do they understand Leader & Totem as required?
- Do they understand Owned/Seen labels?
- Do quantity controls for multi-copy models feel discoverable?
- Does the soulstone summary answer "what have I spent?"

Neutral follow-ups:
- "How did you decide where to look for each model?"
- "What does the Required cost mean to you?"
- "Did anything make you unsure whether a model was in your crew or just in your collection?"

#### Task 3: Analyze without selected models

Scenario:
"Now imagine you only know the masters and strategy, but you have not decided what to take yet. Use the app to find out what models you should consider."

Observe:
- Does the participant know they can Analyze with no model selections?
- Do they interpret Available recommendations correctly when no owned models are selected?
- Do they understand the difference between Available and Optimal paths?
- Does the app communicate that recommendations are model selections only, not scheme/upgrades advice?

Neutral follow-ups:
- "What did you expect to happen when no models were selected?"
- "How would you explain Available versus Optimal?"
- "What information did you want before trusting the recommendations?"

#### Task 4: Interpret recommendation details

Scenario:
"Review the recommendations and pick two models you would seriously consider hiring. Explain why you picked them and what their role would be in the game."

Observe:
- Can the participant scan recommendation cards quickly?
- Are section headings clear: Right Pick, Relevant Skills, Priority Targets, Allied Synergies?
- Do score breakdowns help or distract?
- Can the participant connect recommendations to the selected strategy and opponent?

Neutral follow-ups:
- "Which section influenced your decision most?"
- "Was any recommendation too vague or too technical?"
- "What would make this advice feel more actionable?"

#### Task 5: Compare opponent expectations

Scenario:
"Look at the opponent side. Use the app to predict what opposing models you should expect and how that changes your plan."

Observe:
- Does the two-column results layout support comparison?
- Does "Likely Crew Members" read as prediction rather than certainty?
- Can the participant distinguish opponent analysis from player recommendations?
- Are opponent pressure points actionable?

Neutral follow-ups:
- "What did you learn about the opponent?"
- "What would you do differently after reading this?"
- "Was anything on the opponent side redundant with your side?"

### 4. Post-Session Debrief

Ask:
- "What was the easiest part of the app to understand?"
- "Where did you hesitate or feel unsure?"
- "What information did you wish was visible earlier?"
- "How confident would you feel using this to prepare for a game?"
- "What would make the recommendations more trustworthy?"
- "If you could change one thing before using this regularly, what would it be?"

### 5. Observation Template

Use one row per task.

| Task | Completion | Observed friction | Quotes | Severity | Notes |
| --- | --- | --- | --- | --- | --- |
| Task 1 | Completed / Partial / Failed |  |  | Low / Medium / High |  |
| Task 2 | Completed / Partial / Failed |  |  | Low / Medium / High |  |
| Task 3 | Completed / Partial / Failed |  |  | Low / Medium / High |  |
| Task 4 | Completed / Partial / Failed |  |  | Low / Medium / High |  |
| Task 5 | Completed / Partial / Failed |  |  | Low / Medium / High |  |

Severity guide:
- High: blocks task completion or causes a wrong crew planning decision.
- Medium: causes hesitation, misinterpretation, or repeated backtracking.
- Low: minor clarity, polish, or speed issue.

## Synthetic Sessions

Synthetic participants were simulated using the task flow above. These are directional findings to guide design and should be validated with real players.

### Participant A: Newer Player

Profile:
- Knows factions and masters but is not confident with counter-picking.
- Wants the app to explain "what should I take and why?"

Observed behavior:
- Started in Player setup, skipped Match until prompted by the visible Analyze area.
- Interpreted Owned as "currently in my crew," not collection availability.
- Was unsure why required master/totem cost was included separately.
- Found recommendation section headings helpful, especially Role and Priority Targets.

Key quote:
"I want to know if I am selecting models I own or models I am hiring. Those feel different."

### Participant B: Intermediate Player

Profile:
- Builds 50ss crews regularly and wants matchup-specific options.
- Understands keyword, versatile, and faction model categories.

Observed behavior:
- Appreciated the Keyword / Versatile / Faction sections.
- Expected Available path to mean "models currently selected," then later understood it as "owned pool."
- Wanted the strategy summary to appear near recommendation cards, not only above setup.
- Used search successfully but wanted section counts to update with clearer "filtered" meaning.

Key quote:
"The recommendations make more sense when I remember the strategy, but once I scroll down I lose that context."

### Participant C: Competitive Planner

Profile:
- Wants fast comparison and transparent scoring.
- Skeptical of generic strategy advice.

Observed behavior:
- Immediately compared Available and Optimal.
- Wanted stronger indication that no selected models still permits analysis.
- Wanted confidence or evidence for Likely Crew Members.
- Found score labels useful but not self-explanatory without hover/help text.

Key quote:
"I need to know whether the engine is recommending this because of the master, the strategy, or just because it is efficient."

## Synthesis

Themes:
- The setup flow is understandable, but the ownership versus selection model creates ambiguity.
- Strategy selection is useful, but its influence is not visible enough in the lower analysis area.
- Required leader/totem behavior is correct but needs a clearer mental model.
- Recommendations are structured well, but users want more traceability from recommendation to strategy, opponent, and score.
- The opponent column is valuable, but "likely" needs confidence language and caveats.

Top usability risks:
1. Users may misunderstand Owned/Available as "selected in crew" and distrust totals or recommendation paths.
2. Users may miss that analysis works with no selected models, which is an important use case.
3. Recommendations may feel generic unless strategy and scoring reasons are more explicitly surfaced.

## GitHub Issues

### Issue 1: Clarify owned collection vs hired crew selections

Labels: `ux`, `crew-builder`, `priority-high`

Priority: High

Description:
Users can confuse selected model checkboxes with hired crew selections. In testing, "Owned" read as either "I own this model" or "this model is in my crew." This ambiguity affects interpretation of soulstone totals, Available recommendations, and the purpose of selecting models before analysis.

Observed evidence:
- Newer participant said they were unsure whether they were selecting collection ownership or final crew members.
- Intermediate participant initially interpreted Available as models already selected.

Recommendation:
- Rename the Player selection label from "Owned" to "In Collection" or "Available to Hire."
- Add a short helper line near the Player model list: "Select models you own. Recommendations will build a crew from this pool."
- If selected models are also intended to represent a draft crew, split the concepts into two explicit states: Collection and Current Crew.
- Rename `ownedModelIds` in UI-facing copy if it appears in future user-visible text.

Acceptance criteria:
- User can tell whether selecting a checkbox means collection ownership or crew hiring.
- Available path copy explains it is constrained by selected/owned models.
- Soulstone summary labels do not imply a finalized crew unless that is intended.

---

### Issue 2: Make "Analyze without models" discoverable

Labels: `ux`, `onboarding`, `analysis`, `priority-high`

Priority: High

Description:
The app supports analysis using only faction, master, opponent, and strategy, but users may assume model selection is required because large Player/Opponent model lists appear before results.

Observed evidence:
- Synthetic competitive participant looked for a "skip model selection" affordance.
- Newer participant expected Analyze to require at least one selected model.

Recommendation:
- Add empty-state copy above or near Analyze: "You can analyze with only masters selected, then refine with owned models."
- When no player models are selected, show a small note in recommendations: "Using full legal pool because no collection models were selected."
- Consider a mode toggle: "I know my collection" / "Suggest from all legal models."

Acceptance criteria:
- Analyze button remains enabled with only masters selected.
- The app explicitly explains what recommendation pool is used when no models are selected.
- Users do not need to infer this behavior from trial and error.

---

### Issue 3: Keep selected strategy visible in analysis results

Labels: `ux`, `strategy`, `analysis`, `priority-medium`

Priority: Medium

Description:
Strategy selection influences recommendations, but once users scroll into the lower results, the strategy context can be easy to lose. This weakens trust in matchup-specific advice.

Observed evidence:
- Intermediate participant said recommendation reasoning made more sense when strategy context was remembered.
- Participants used the top Match summary, then lost it after setup collapsed.

Recommendation:
- Add a compact strategy chip or summary banner at the top of the analysis grid.
- Include strategy-specific reasoning in each recommendation card when relevant, e.g. "Strategy Fit: supports marker/interact pressure for Plant Explosives."
- Keep the selected Strategy Pool and Strategy visible in collapsed Match state.

Acceptance criteria:
- Analysis results visibly show the current strategy without scrolling back to the Match panel.
- Recommendation cards identify at least one strategy-specific reason when strategy contributes to score.

---

### Issue 4: Explain recommendation score breakdowns

Labels: `ux`, `recommendations`, `content-design`, `priority-medium`

Priority: Medium

Description:
Score chips such as Master, Synergy, and Matchup are useful but not self-explanatory. Users want to know what the engine considered and why a model ranked highly.

Observed evidence:
- Competitive participant wanted to know whether a recommendation came from master interaction, strategy fit, or general efficiency.
- Score labels were scanned but not always understood.

Recommendation:
- Add tooltip/help text for Master, Synergy, and Matchup score chips.
- Consider renaming chips:
  - "Master Counter"
  - "Crew Synergy"
  - "Strategy/Matchup Fit"
- Add a "Top reason" line under each recommendation title.

Acceptance criteria:
- Each score dimension has a plain-language explanation.
- Users can connect score values to the text reasons in the recommendation card.

---

### Issue 5: Add confidence and caveats to Likely Crew Members

Labels: `ux`, `opponent-analysis`, `recommendations`, `priority-medium`

Priority: Medium

Description:
"Likely Crew Members" is valuable, but without confidence language it may read as a prediction certainty rather than a reasoned estimate.

Observed evidence:
- Competitive participant asked what evidence made an opponent model likely.
- Newer participant treated Likely models as something the opponent had already selected.

Recommendation:
- Rename badge from "Likely" to "Likely Pick" or "Predicted."
- Add confidence bands such as High / Medium / Low based on score thresholds.
- Add helper copy: "Predictions are based on keyword fit, role coverage, strategy needs, and point efficiency."
- If opponent selected models are provided, visually separate "Known Seen Models" from "Predicted Likely Models."

Acceptance criteria:
- Users can tell predicted models apart from known opponent selections.
- Each likely model includes a short reason for its confidence.

---

### Issue 6: Improve required leader and totem explanation

Labels: `ux`, `crew-builder`, `rules-clarity`, `priority-low`

Priority: Low

Description:
The required Leader & Totem section correctly auto-selects mandatory models, but users may not understand why they cannot remove them or how their soulstone cost relates to the selected model total.

Observed evidence:
- Newer participant understood "Required" after inspection but hesitated over the disabled x control.
- Required / Selected / Total soulstone chips were helpful but needed clearer labels.

Recommendation:
- Replace the disabled "x" in required rows with a lock icon or non-button required marker.
- Add helper text: "Leader and associated totem are included automatically."
- Consider labeling soulstone chips as:
  - "Required models"
  - "Selected collection"
  - "Displayed total"

Acceptance criteria:
- Required rows do not look removable.
- Users understand why these models appear before manual selection.

---

### Issue 7: Add lightweight result actions for planning

Labels: `feature`, `ux`, `planning`, `priority-low`

Priority: Low

Description:
After receiving recommendations, users need a way to turn advice into a practical crew plan. The current result cards explain picks but do not support saving or transferring a recommendation back into a draft crew.

Observed evidence:
- Participants picked models mentally but had no next action.
- Competitive participant compared Available and Optimal but wanted a way to preserve a chosen plan.

Recommendation:
- Add "Add to draft crew" or "Use this recommendation set" action.
- Show a resulting crew list with total soulstones.
- Allow copying a text summary of selected recommendations.

Acceptance criteria:
- Users can convert recommendation output into an editable draft crew.
- The draft shows total soulstones and required models.

