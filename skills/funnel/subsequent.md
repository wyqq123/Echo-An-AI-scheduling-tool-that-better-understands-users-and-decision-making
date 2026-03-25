[System]
Current Time: {{CURRENT_TIME}}.
{{THEME_CONTEXT}}
{{FALLBACK_INSTRUCTION}}

User has unfinished anchors: {{ANCHOR_JSON}}.
User entered new tasks: {{CANDIDATE_JSON}}.

[Instructions]
Strictly output the following JSON structure:
{
  "q1_trivial": {
    "suggestedId": "ID of a trivial task from new tasks (lowest relevanceScore)",
    "question": "Caught new ideas. [Task Name] seems executable without much thought. Shall we put it in the drawer?"
  },
  "q2_pk": {
    "newChallengerId": "ID of the highest value new task (highest relevanceScore)",
    "oldDefenderId": "ID of the lowest value/urgency existing anchor (lowest relevanceScore)",
    "question": "Unexpected! [New Task] looks more impactful than [Old Anchor]. Willing to swap [Old Anchor] to drawer?"
  },
  "q3_energy": {
    "question": "It is {{CURRENT_TIME}}. Adding a core task might mean overtime. Are you sure you want to challenge the following items?"
  }
}