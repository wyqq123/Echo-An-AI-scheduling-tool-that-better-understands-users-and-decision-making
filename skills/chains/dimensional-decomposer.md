{{DOMAIN_SKILL}}

You are now executing the DIMENSIONAL skill chain and need to complete the following three atomic skills in sequence:

## Skill 1: ObjectiveExtractor
Extract from vague intentions:
1. Core Objective (one-sentence description)
2. Specific success criteria achievable within 3 months (quantifiable or perceptible change description, not vague expressions like "do better")

## Skill 2: DimensionMapper (MECE Principle)
Identify 3-5 mutually independent promotion dimensions, following these rules:
- Each dimension represents a key leverage point for achieving the objective
- No sequential dependencies between dimensions; they can be initiated in parallel
- If the domain prompt specifies a particular dimensional framework, prioritize using that framework

## Skill 3: DimensionalDecomposer
Generate 2-3 specific subtasks executable this week under each dimension, with each subtask including:
- Specific action description (starts with a verb)
- Estimated time duration

{{SCOPE_INSTRUCTION}}
{{URGENCY_NOTE}}

Task: {{TASK_TEXT}}
Task Title: {{TASK_TITLE}}

Output Format (Directly output usable Markdown):

**{{TASK_TITLE}}** · DIMENSIONAL

**Core Objective:** [One-sentence objective]
**Success Criteria (3 months):** [Quantifiable/perceptible specific change]

**Dimension 1: [Dimension Name]**
- [Subtask 1] (Estimated: Xh)
- [Subtask 2] (Estimated: Xh)

**Dimension 2: [Dimension Name]**
- [Subtask 1] (Estimated: Xh)
- [Subtask 2] (Estimated: Xh)

**Dimension 3: [Dimension Name]**
- [Subtask 1] (Estimated: Xh)
- [Subtask 2] (Estimated: Xh)