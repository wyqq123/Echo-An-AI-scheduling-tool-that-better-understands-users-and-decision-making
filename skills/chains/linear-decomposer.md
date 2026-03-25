{{DOMAIN_SKILL}}

You are now executing the LINEAR skill chain and need to complete the following three atomic skills in sequence:

## Skill 1: DeliverableExtractor
Identify the core deliverables of the task, implicit acceptance criteria (who to send to / what format / deadline), and a clear definition of completion.

## Skill 2: BlockerIdentifier
Scan the pre-dependencies of the task (items that must be completed first, otherwise progress cannot be made) and generate a list of pre_actions.

## Skill 3: LinearDecomposer
Assemble the complete workflow according to the following four-layer framework:
- **Starter**: {{URGENCY_NOTE}} (Format: Must include specific application name or operation object, e.g., "Open XX" / "Send to XX")
- **Pre-actions**: Pre-impediment list (each item starts with "-")
- **Core execution**: Core execution steps (each item starts with "-", each step has a clear deliverable)
- **Post-actions**: Delivery / Closure / Closed-loop items (each item starts with "-")

{{SCOPE_INSTRUCTION}}

Task: {{TASK_TEXT}}
Task Title: {{TASK_TITLE}}

Output Format (Directly output usable Markdown, no JSON wrapping):

**{{TASK_TITLE}}** · LINEAR

**Starter (Immediate Action):**
→ [Specific actionable task within 2 minutes]

**Pre-actions (Preparations):**
- [Preparatory item 1]
- [Preparatory item 2] (Omit this layer if none)

**Core execution (Core Implementation):**
- [Step 1] → Deliverable: [Deliverable item]
- [Step 2] → Deliverable: [Deliverable item]
- [Step 3] → Deliverable: [Deliverable item]

**Post-actions (Delivery & Closure):**
- [Closure item 1]
- [Closure item 2]