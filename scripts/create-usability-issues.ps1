$ErrorActionPreference = "Stop"

$repo = "queron/m4e-app"

function Ensure-Label {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Color,
    [Parameter(Mandatory = $true)][string]$Description
  )

  gh label create $Name --repo $repo --color $Color --description $Description 2>$null
  if ($LASTEXITCODE -ne 0) {
    gh label edit $Name --repo $repo --color $Color --description $Description | Out-Null
  }
}

function New-UsabilityIssue {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Body,
    [Parameter(Mandatory = $true)][string[]]$Labels
  )

  $tempFile = New-TemporaryFile
  try {
    Set-Content -Path $tempFile -Value $Body -Encoding UTF8
    gh issue create --repo $repo --title $Title --body-file $tempFile --label ($Labels -join ",")
  } finally {
    Remove-Item -LiteralPath $tempFile -Force
  }
}

Ensure-Label "ux" "6f42c1" "User experience research and usability improvements"
Ensure-Label "crew-builder" "1d76db" "Crew selection and roster-building workflows"
Ensure-Label "priority-high" "d73a4a" "High priority usability issue"
Ensure-Label "priority-medium" "fbca04" "Medium priority usability issue"
Ensure-Label "priority-low" "c2e0c6" "Low priority usability issue"
Ensure-Label "onboarding" "bfd4f2" "Guidance for first-time and returning users"
Ensure-Label "analysis" "0e8a16" "Matchup analysis and recommendation output"
Ensure-Label "strategy" "c5def5" "Strategy pool and strategy-specific UX"
Ensure-Label "recommendations" "5319e7" "Recommendation ranking, display, and trust"
Ensure-Label "content-design" "fef2c0" "Terminology, labels, helper text, and explanations"
Ensure-Label "opponent-analysis" "d4c5f9" "Opponent prediction and matchup interpretation"
Ensure-Label "rules-clarity" "f9d0c4" "Rules-facing clarity and required crew behavior"
Ensure-Label "feature" "a2eeef" "New or expanded product capability"
Ensure-Label "planning" "7057ff" "Crew planning workflow enhancements"

New-UsabilityIssue `
  -Title "Clarify owned collection vs hired crew selections" `
  -Labels @("ux", "crew-builder", "priority-high") `
  -Body @"
## Description
Users can confuse selected model checkboxes with hired crew selections. In testing, "Owned" read as either "I own this model" or "this model is in my crew." This ambiguity affects interpretation of soulstone totals, Available recommendations, and the purpose of selecting models before analysis.

## Observed evidence
- Newer participant said they were unsure whether they were selecting collection ownership or final crew members.
- Intermediate participant initially interpreted Available as models already selected.

## Recommendation
- Rename the Player selection label from "Owned" to "In Collection" or "Available to Hire."
- Add a short helper line near the Player model list: "Select models you own. Recommendations will build a crew from this pool."
- If selected models are also intended to represent a draft crew, split the concepts into two explicit states: Collection and Current Crew.
- Rename `ownedModelIds` in UI-facing copy if it appears in future user-visible text.

## Acceptance criteria
- User can tell whether selecting a checkbox means collection ownership or crew hiring.
- Available path copy explains it is constrained by selected/owned models.
- Soulstone summary labels do not imply a finalized crew unless that is intended.
"@

New-UsabilityIssue `
  -Title "Make Analyze without models discoverable" `
  -Labels @("ux", "onboarding", "analysis", "priority-high") `
  -Body @"
## Description
The app supports analysis using only faction, master, opponent, and strategy, but users may assume model selection is required because large Player/Opponent model lists appear before results.

## Observed evidence
- Synthetic competitive participant looked for a "skip model selection" affordance.
- Newer participant expected Analyze to require at least one selected model.

## Recommendation
- Add empty-state copy above or near Analyze: "You can analyze with only masters selected, then refine with owned models."
- When no player models are selected, show a small note in recommendations: "Using full legal pool because no collection models were selected."
- Consider a mode toggle: "I know my collection" / "Suggest from all legal models."

## Acceptance criteria
- Analyze button remains enabled with only masters selected.
- The app explicitly explains what recommendation pool is used when no models are selected.
- Users do not need to infer this behavior from trial and error.
"@

New-UsabilityIssue `
  -Title "Keep selected strategy visible in analysis results" `
  -Labels @("ux", "strategy", "analysis", "priority-medium") `
  -Body @"
## Description
Strategy selection influences recommendations, but once users scroll into the lower results, the strategy context can be easy to lose. This weakens trust in matchup-specific advice.

## Observed evidence
- Intermediate participant said recommendation reasoning made more sense when strategy context was remembered.
- Participants used the top Match summary, then lost it after setup collapsed.

## Recommendation
- Add a compact strategy chip or summary banner at the top of the analysis grid.
- Include strategy-specific reasoning in each recommendation card when relevant, e.g. "Strategy Fit: supports marker/interact pressure for Plant Explosives."
- Keep the selected Strategy Pool and Strategy visible in collapsed Match state.

## Acceptance criteria
- Analysis results visibly show the current strategy without scrolling back to the Match panel.
- Recommendation cards identify at least one strategy-specific reason when strategy contributes to score.
"@

New-UsabilityIssue `
  -Title "Explain recommendation score breakdowns" `
  -Labels @("ux", "recommendations", "content-design", "priority-medium") `
  -Body @"
## Description
Score chips such as Master, Synergy, and Matchup are useful but not self-explanatory. Users want to know what the engine considered and why a model ranked highly.

## Observed evidence
- Competitive participant wanted to know whether a recommendation came from master interaction, strategy fit, or general efficiency.
- Score labels were scanned but not always understood.

## Recommendation
- Add tooltip/help text for Master, Synergy, and Matchup score chips.
- Consider renaming chips:
  - "Master Counter"
  - "Crew Synergy"
  - "Strategy/Matchup Fit"
- Add a "Top reason" line under each recommendation title.

## Acceptance criteria
- Each score dimension has a plain-language explanation.
- Users can connect score values to the text reasons in the recommendation card.
"@

New-UsabilityIssue `
  -Title "Add confidence and caveats to Likely Crew Members" `
  -Labels @("ux", "opponent-analysis", "recommendations", "priority-medium") `
  -Body @"
## Description
"Likely Crew Members" is valuable, but without confidence language it may read as a prediction certainty rather than a reasoned estimate.

## Observed evidence
- Competitive participant asked what evidence made an opponent model likely.
- Newer participant treated Likely models as something the opponent had already selected.

## Recommendation
- Rename badge from "Likely" to "Likely Pick" or "Predicted."
- Add confidence bands such as High / Medium / Low based on score thresholds.
- Add helper copy: "Predictions are based on keyword fit, role coverage, strategy needs, and point efficiency."
- If opponent selected models are provided, visually separate "Known Seen Models" from "Predicted Likely Models."

## Acceptance criteria
- Users can tell predicted models apart from known opponent selections.
- Each likely model includes a short reason for its confidence.
"@

New-UsabilityIssue `
  -Title "Improve required leader and totem explanation" `
  -Labels @("ux", "crew-builder", "rules-clarity", "priority-low") `
  -Body @"
## Description
The required Leader & Totem section correctly auto-selects mandatory models, but users may not understand why they cannot remove them or how their soulstone cost relates to the selected model total.

## Observed evidence
- Newer participant understood "Required" after inspection but hesitated over the disabled x control.
- Required / Selected / Total soulstone chips were helpful but needed clearer labels.

## Recommendation
- Replace the disabled "x" in required rows with a lock icon or non-button required marker.
- Add helper text: "Leader and associated totem are included automatically."
- Consider labeling soulstone chips as:
  - "Required models"
  - "Selected collection"
  - "Displayed total"

## Acceptance criteria
- Required rows do not look removable.
- Users understand why these models appear before manual selection.
"@

New-UsabilityIssue `
  -Title "Add lightweight result actions for planning" `
  -Labels @("feature", "ux", "planning", "priority-low") `
  -Body @"
## Description
After receiving recommendations, users need a way to turn advice into a practical crew plan. The current result cards explain picks but do not support saving or transferring a recommendation back into a draft crew.

## Observed evidence
- Participants picked models mentally but had no next action.
- Competitive participant compared Available and Optimal but wanted a way to preserve a chosen plan.

## Recommendation
- Add "Add to draft crew" or "Use this recommendation set" action.
- Show a resulting crew list with total soulstones.
- Allow copying a text summary of selected recommendations.

## Acceptance criteria
- Users can convert recommendation output into an editable draft crew.
- The draft shows total soulstones and required models.
"@
