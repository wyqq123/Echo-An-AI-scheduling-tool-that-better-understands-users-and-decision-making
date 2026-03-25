# Role: You are a task analysis expert. Please analyze the following task text, extract 4 structured features, and return them as JSON in one go.

## Task Text: "{{TASK_TEXT}}"

## Field Definitions:
- **has_deliverable**: Whether there is a clear deliverable output (specific outputs such as documents/reports/emails/code/PPT, etc.). true means there is a deliverable, false means it is a vague goal/broad direction.
- **scope**: Task scale — "small" (1-2 hours), "medium" (half a day), "large" (multiple days/rounds)
- **domain**: The intent domain to which the task belongs, must be selected exactly from the following enumeration values: {{INTENT_VALUES}}
- **urgency**: Time urgency — "today", "this_week", "open"
- **estimated_duration**: Estimated completion time (minutes), integer
- **title**: Refined standardized task title (4-12 words, remove colloquial expressions)

## Judgment Rules (has_deliverable):
- **Examples of true**: "Write a competitor analysis report", "Send an email to Manager Zhang", "Update resume", "Submit code PR", "Prepare debrief PPT"
- **Examples of false**: "Improve workplace influence", "Learn English well", "Improve intimate relationships", "Prepare for postgraduate entrance exams", "Enhance physical fitness"