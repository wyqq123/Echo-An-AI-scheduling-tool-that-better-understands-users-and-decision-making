import { GoogleGenAI, Type } from "@google/genai";
import { Task, TaskCategory, FunnelStep, TaskStatus, LeafNode, TaskIntent, FocusTheme, SynergyLink, UserProfile } from "../types";
import { generateId } from "../utils/helpers";

// Initialize Gemini
// Important: the @google/genai web client throws if no API key is provided.
// We must avoid constructing the client at module-load time when running in browser without a key,
// otherwise it will crash the whole React app before the UI can render.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : (null as unknown as GoogleGenAI);

export interface FunnelScript {
  q1: { suggestedId: string; question: string; isStale?: boolean };
  q2: { suggestedId: string; oldDefenderId?: string; question: string; isMerged?: boolean; mergedTaskId?: string };
  q3: { suggestedId?: string; question: string };
  q4: { question: string; isStale?: boolean };
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type DecompositionType = "LINEAR" | "DIMENSIONAL";
export type TaskScope = "small" | "medium" | "large";
export type TaskUrgency = "today" | "this_week" | "open";

export interface TaskFeatures {
  has_deliverable: boolean;
  scope: TaskScope;
  domain: TaskIntent;           // maps directly to TaskIntent enum
  urgency: TaskUrgency;
  estimated_duration: number;   // minutes
  title: string;                // cleaned canonical title
}

export interface SkillsResult {
  title: string;
  intent: TaskIntent;
  duration: number;
  decomposition_type: DecompositionType;
  workflowNote: string;
}

// ─────────────────────────────────────────────
// Stage 1: Input Preprocessing (pure rules, no LLM)
// ─────────────────────────────────────────────

const FILLER_WORDS = [
  "help me", "give me a hand", "I want to", "I need to", "need to do", "need to", "need to make a",
  "make a", "write a", "put together a", "create a", "can I", "can", "please",
  "trouble you to", "do me a favor to", "while you're at it"
];

const SYNONYM_MAP: Record<string, string> = {
  "Competitor Research": "Competitor Analysis",
  "Competitor Benchmarking": "Competitor Analysis",
  "Benchmarking Analysis": "Competitor Analysis",
  "Requirements Document": "PRD",
  "Product Requirements Document": "PRD",
  "Debrief Summary": "Debrief Report",
  "Weekly Summary": "Weekly Report",
  "Daily Summary": "Daily Report",
  "Sort Out": "Organize",
  "Go Through": "Sort Out",
  "Brainstorm Ideas": "Creative Planning",
  "Idea": "Plan",
  "Check Out": "Research",
};

// Multi-task split signals: "顺便", "，", "另外", "还有", "以及"
const MULTI_TASK_SPLITS = /,|;||in addition|also|as well as|then|after that/;

export function preprocessInput(rawText: string): string[] {
  // Step 1: Remove filler words
  let cleaned = rawText;
  for (const filler of FILLER_WORDS) {
    cleaned = cleaned.replace(new RegExp(filler, "g"), "");
  }

  // Step 2: Apply synonym normalization
  for (const [src, tgt] of Object.entries(SYNONYM_MAP)) {
    cleaned = cleaned.replace(new RegExp(src, "g"), tgt);
  }

  // Step 3: Split multi-tasks
  const parts = cleaned.split(MULTI_TASK_SPLITS)
    .map(p => p.trim())
    .filter(p => p.length > 2);

  return parts.length > 0 ? parts : [cleaned.trim()];
}

// ─────────────────────────────────────────────
// Stage 2: Feature Extraction (single LLM call)
// ─────────────────────────────────────────────

export async function extractFeatures(taskText: string): Promise<TaskFeatures> {
  const intentValues = Object.values(TaskIntent).join(", ");

  const prompt = `
    You are a task analysis expert. Please analyze the following task text, extract 4 structured features, and return them as JSON in one go.

    Task Text: "${taskText}"

    Field Definitions:
    - has_deliverable: Whether there is a clear deliverable output (specific outputs such as documents/reports/emails/code/PPT, etc.). true means there is a deliverable, false means it is a vague goal/broad direction.
    - scope: Task scale —— "small"(1-2 hours), "medium"(half a day), "large"(multiple days/rounds)
    - domain: The intent domain to which the task belongs, must be selected exactly from the following enumeration values: ${intentValues}
    - urgency: Time urgency —— "today", "this_week", "open"
    - estimated_duration: Estimated completion time (minutes), integer
    - title: Refined standardized task title (4-12 words, remove colloquial expressions)

    Judgment Rules (has_deliverable):
    - Examples of true: "Write a competitor analysis report", "Send an email to Manager Zhang", "Update resume", "Submit code PR", "Prepare debrief PPT"
    - Examples of false: "Improve workplace influence", "Learn English well", "Improve intimate relationships", "Prepare for postgraduate entrance exams", "Enhance physical fitness"
    `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            has_deliverable: { type: Type.BOOLEAN },
            scope: { type: Type.STRING, description: "small, medium, or large" },
            domain: { type: Type.STRING, description: `One of: ${Object.values(TaskIntent).join(', ')}` },
            urgency: { type: Type.STRING, description: "today, this_week, or open" },
            estimated_duration: { type: Type.INTEGER },
            title: { type: Type.STRING },
          },
          required: ["has_deliverable", "scope", "domain", "urgency", "estimated_duration", "title"],
        },
      },
    });

    return JSON.parse(response.text || "{}") as TaskFeatures;
  } catch (e) {
    console.error("Feature extraction failed:", e);
    // Fallback defaults
    return {
      has_deliverable: true,
      scope: "medium",
      domain: TaskIntent.CAREER_BREAK,
      urgency: "this_week",
      estimated_duration: 60,
      title: taskText.substring(0, 15),
    };
  }
}

// ─────────────────────────────────────────────
// Stage 3: Skills Router (pure logic, zero latency)
// ─────────────────────────────────────────────

export interface SkillChainConfig {
  path: DecompositionType;
  domainPrompt: string;
  scopeInstruction: string;
}

// Domain-specific prompt templates (from PRD)
const DOMAIN_PROMPTS: Record<TaskIntent, string> = {
  [TaskIntent.CAREER_BREAK]: `
# Role: Expert-level Workplace Coach at Top Tech Companies
# Domain Logic (Career):
- Decomposition Focus: Emphasize the "Impact" and "Closure" of tasks
- Linear Mode: Pre-action must include "Align Requirements/Obtain Data"; Post-action must include "Sync Progress/Document Results"
- Dimensional Mode: Expand from three dimensions: "Business Contribution", "Self-Growth", "Workplace Relationships"
# Tone: Extremely concise and result-driven`,

  [TaskIntent.WEALTH_CONTROL]: `
# Role: Senior Financial Planner
# Domain Logic (Wealth):
- Decomposition Focus: Emphasize "Objective Facts" over "Subjective Feelings"
- Linear Mode: Pre-action must include "Reconcile Accounts/Obtain Current Prices"; Core must include "Logical Verification/Risk Assessment"
- Dimensional Mode: Decompose from three dimensions: "Income & Expense Control", "Asset Allocation", "Risk Prevention"
# Tone: Prudent, objective, and data-driven`,

  [TaskIntent.BODY_MIND]: `
# Role: Psychological Mediator & Energy Healer
# Domain Logic (Body & Mind):
- Decomposition Focus: Minimize Pre-action drastically and convert all steps into "Physical Actions"
- Linear Mode: Starter must not involve electronic products (except for white noise); Core must emphasize breathing or physical movements
- Dimensional Mode: Approach from three dimensions: "Environment Adjustment (Light/Sound)", "Physical Relaxation", "Mental Unloading"
# Tone: Gentle, minimalist, and stress-free`,

  [TaskIntent.ACADEMIC_SPRINT]: `
# Role: Expert in Efficient Learning Strategies
# Domain Logic (Academic):
- Decomposition Focus: Lower the "Initiation Barrier" and materialize abstract knowledge
- Linear Mode: Starter must be "Open a specific document/software"; Core must include the closed loop of "Understand - Internalize - Produce"
- Dimensional Mode: Decompose from three dimensions: "Basic Input (Reading/Listening)", "In-depth Digestion (Practice/Writing)", "Review & Assessment"
# Tone: Rigorous, structured, and highly guiding`,

  [TaskIntent.DEEP_CONNECT]: `
# Role: Interpersonal Relationship & Emotional Counselor
# Domain Logic (Connection):
- Decomposition Focus: Focus not only on "tasks" but also on "the other party's experience"
- Linear Mode: Pre-action must include "Prepare Environment/Confirm the Other Party's Preferences"; Post-action must include "Emotional Feedback/Schedule Next Meeting"
- Dimensional Mode: Expand from three dimensions: "Physical Environment Setup", "Communication Topic Design", "Emotional Value Provision"
# Tone: Delicate, warm, and empathetic`,

  [TaskIntent.INNER_WILD]: `
# Role: Creative Director & Travel Explorer
# Domain Logic (Spiritual):
- Decomposition Focus: Abandon KPI-oriented approach and emphasize "Serendipity" and "Inspiration"
- Linear Mode: Starter must be a "small observation that sparks curiosity"; Core emphasizes "Immersive Experience"
- Dimensional Mode: Expand from three dimensions: "Sensory Exploration", "Creative Output", "Self-dialogue"
# Tone: Romantic, divergent, and full of curiosity`,
};

const SCOPE_INSTRUCTIONS: Record<TaskScope, string> = {
  small: "Small Task Scope (1-2 hours): Compress Pre-actions to a maximum of 1 item, strengthen the ultra-fast Starter (must be an action that can start within 30 seconds), and control the total steps to 3-4.",
  medium: "Medium Task Scope (half a day): Standard decomposition depth, consisting of Starter + 2-3 Pre-actions + 2-3 Core steps + 1-2 Post-actions.",
  large: "Large Task Scope (multiple days/rounds): Increase decomposition levels, generate a list of 2-3 sub-steps under each Core step, and mark the estimated time consumption and milestone nodes.",
};

export function skillsRouter(features: TaskFeatures): SkillChainConfig {
  const path: DecompositionType = features.has_deliverable ? "LINEAR" : "DIMENSIONAL";
  const domainPrompt = DOMAIN_PROMPTS[features.domain] || DOMAIN_PROMPTS[TaskIntent.CAREER_BREAK];
  const scopeInstruction = SCOPE_INSTRUCTIONS[features.scope];

  return { path, domainPrompt, scopeInstruction };
}

// ─────────────────────────────────────────────
// Stage 4a: LINEAR Skill Chain Execution
// Chain: DeliverableExtractor → BlockerIdentifier → LinearDecomposer
// ─────────────────────────────────────────────

async function executeLinearChain(
  taskText: string,
  features: TaskFeatures,
  config: SkillChainConfig
): Promise<string> {
  const urgencyNote =
    features.urgency === "today"
      ? "Urgent Note: Must be completed today. The Starter must be the smallest physical action that can be immediately initiated within 2 minutes, with extremely low friction."
      : features.urgency === "this_week"
      ? "To be completed within this week. Arrange the pace reasonably."
      : "Flexible timeline, allowing for in-depth planning.";

  const prompt = `
${config.domainPrompt}

You are now executing the LINEAR skill chain and need to complete the following three atomic skills in sequence:

## Skill 1: DeliverableExtractor
Identify the core deliverables of the task, implicit acceptance criteria (who to send to/what format/deadline), and a clear definition of completion.

## Skill 2: BlockerIdentifier  
Scan the pre-dependencies of the task (items that must be completed first, otherwise progress cannot be made) and generate a list of pre_actions.

## Skill 3: LinearDecomposer
Assemble the complete workflow according to the following four-layer framework:
- Starter: ${urgencyNote} (Format: Must include specific application name or operation object, e.g., "Open XX"/"Send to XX")
- Pre-actions: Pre-impediment list (each item starts with "-")
- Core execution: Core execution steps (each item starts with "-", each step has a clear deliverable)
- Post-actions: Delivery/Closure/Closed-loop items (each item starts with "-")

${config.scopeInstruction}

Task: ${taskText}
Task Title: ${features.title}

Output Format (Directly output usable Markdown, no JSON wrapping):

**${features.title}** · LINEAR

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
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text?.trim() || "Workflow generation failed, please try again.";
}

// ─────────────────────────────────────────────
// Stage 4b: DIMENSIONAL Skill Chain Execution
// Chain: ObjectiveExtractor → DimensionMapper → DimensionalDecomposer
// ─────────────────────────────────────────────

async function executeDimensionalChain(
  taskText: string,
  features: TaskFeatures,
  config: SkillChainConfig
): Promise<string> {
  const urgencyNote =
    features.urgency === "today"
      ? "Although initiated today, this is a long-term goal. The focus is to design the entry point for the first step this week."
      : features.urgency === "this_week"
      ? "Substantial progress must be made within this week, and the subtasks under each dimension must be executable this week."
      : "Adequate time is available for comprehensive planning and in-depth expansion of each dimension.";

  const prompt = `
${config.domainPrompt}

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

${config.scopeInstruction}
${urgencyNote}

Task: ${taskText}
Task Title: ${features.title}

Output Format (Directly output usable Markdown):

**${features.title}** · DIMENSIONAL

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
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text?.trim() || "Dimensional decomposition generation failed, please try again.";
}

// ─────────────────────────────────────────────
// Main Entry: processTaskWithSkills
// Runs the complete pipeline for a single task text
// ─────────────────────────────────────────────

export async function processTaskWithSkills(
  taskText: string,
  focusThemes: FocusTheme[] = []
): Promise<SkillsResult> {
  // Stage 2: Feature extraction (single LLM call)
  const features = await extractFeatures(taskText);

  // Override domain with focus themes if alignment is strong
  if (focusThemes.length > 0) {
    try {
      const targetStrings = focusThemes.map(theme => 
        `[${theme.intent}] The core foucs dimensions：${(theme.tags || []).join(', ')}`
      );
      const taskString = `task：${features.title}。`;
      const allStrings = [...targetStrings, taskString];
      
      const embedResult = await ai.models.embedContent({
        model: 'gemini-embedding-3-preview',
        contents: allStrings,
      });
      
      const embeddings = embedResult.embeddings;
      if (embeddings && embeddings.length === allStrings.length) {
        const targetEmbeddings = embeddings.slice(0, targetStrings.length).map(e => e.values);
        const taskVec = embeddings[embeddings.length - 1].values;
        
        let bestScore = -1;
        let bestThemeIdx = -1;

        targetEmbeddings.forEach((targetVec, tIdx) => {
          if (taskVec && targetVec) {
            const score = cosineSimilarity(taskVec, targetVec);
            if (score > bestScore) {
              bestScore = score;
              bestThemeIdx = tIdx;
            }
          }
        });

        if (bestScore >= 0.45 && bestThemeIdx !== -1) {
          features.domain = focusThemes[bestThemeIdx].intent;
        }
      }
    } catch (e) {
      console.error("Embedding alignment failed", e);
    }
  }

  // Stage 3: Route (zero latency)
  const config = skillsRouter(features);

  // Stage 4: Execute skill chain
  let workflowNote: string;
  if (config.path === "LINEAR") {
    workflowNote = await executeLinearChain(taskText, features, config);
  } else {
    workflowNote = await executeDimensionalChain(taskText, features, config);
  }

  return {
    title: features.title,
    intent: features.domain,
    duration: features.estimated_duration,
    decomposition_type: config.path,
    workflowNote,
  };
}

export const parseBrainDump = async (text: string, focusThemes: FocusTheme[] = [], iceboxTasks: Task[] = [], userProfile?: UserProfile): Promise<Partial<Task>[]> => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("No API Key provided, returning mock data");
    return mockParse(text);
  }

  try {
    // Stage 1: Preprocess input
    const taskTexts = preprocessInput(text);
    
    // Process all tasks in parallel
    const skillsResults = await Promise.all(
      taskTexts.map(taskText => processTaskWithSkills(taskText, focusThemes))
    );

    // Map to Partial<Task>
    return skillsResults.map(result => {
      // Basic deduplication against icebox (can be enhanced later)
      let isRevived = false;
      let id = generateId();
      
      const similarIceboxTask = iceboxTasks.find(t => 
        t.title.toLowerCase().includes(result.title.toLowerCase()) || 
        result.title.toLowerCase().includes(t.title.toLowerCase())
      );
      
      if (similarIceboxTask) {
        id = similarIceboxTask.id;
        isRevived = true;
      }

      return {
        id,
        title: result.title,
        intent: result.intent,
        category: mapIntentToCategory(result.intent),
        workflowNote: result.workflowNote,
        duration: result.duration,
        decomposition_type: result.decomposition_type,
        status: TaskStatus.CANDIDATE,
        isAnchor: false,
        isFrozen: false,
        isRevived,
        completed: false
      };
    });

  } catch (error) {
    console.error("Gemini API Error:", error);
    return mockParse(text);
  }
};

// ... mapIntentToCategory ...

const mapIntentToCategory = (intent: TaskIntent): TaskCategory => {
  switch (intent) {
    case TaskIntent.CAREER_BREAK:
    case TaskIntent.WEALTH_CONTROL:
      return TaskCategory.WORK;
    case TaskIntent.ACADEMIC_SPRINT:
      return TaskCategory.STUDY;
    case TaskIntent.INNER_WILD:
      return TaskCategory.GROWTH;
    case TaskIntent.BODY_MIND:
    case TaskIntent.DEEP_CONNECT:
    default:
      return TaskCategory.LIFE;
  }
};


export const generateFunnelScript = async (
  isSubsequent: boolean,
  candidateTasks: Task[],
  existingAnchors: Task[],
  focusThemes: FocusTheme[],
  currentTime: string,
  iceboxTasks: Task[] = []
): Promise<FunnelScript> => {
  if (!process.env.GEMINI_API_KEY) return mockFunnelScript(isSubsequent, candidateTasks, existingAnchors);

  const candidateJson = JSON.stringify(candidateTasks.map(t => ({ id: t.id, title: t.title, isRevived: t.isRevived })));
  const anchorJson = JSON.stringify(existingAnchors.map(t => ({ id: t.id, title: t.title })));
  const iceboxJson = JSON.stringify(iceboxTasks.map(t => ({ 
    id: t.id, 
    title: t.title, 
    frozenSince: t.frozenSince 
  })));
  
  // 3. Construct Dynamic Prompt Context
  let themeContext = '';
  let fallbackInstruction = '';
  const hasThemes = focusThemes.length > 0;

  if (hasThemes) {
    const themeString = focusThemes.map(t => `【${t.intent}: ${(t.tags || []).join(', ')}】`).join('; ');
    themeContext = `Current user's quarterly focus themes are: ${themeString}.`;
    fallbackInstruction = `When evaluating task value, strictly refer to the above focus themes.`;
  } else {
    themeContext = `User currently has not set quarterly long-term goals.`;
    fallbackInstruction = `When evaluating task value, please degrade to evaluating its [Daily Sense of Accomplishment].`;
  }

  let prompt = "";
  
  // Determine Scenario
  const hasIcebox = iceboxTasks.length > 0;

  if (!isSubsequent && hasIcebox) {
    // --- NEW SCENARIO: First Time + Icebox ---
    prompt = `
      [System]
      You are a top-tier GTD efficiency coach.
      ${themeContext}
      ${fallbackInstruction}
      
      New Candidates (some might be revived): ${candidateJson}
      Icebox Tasks: ${iceboxJson}
      
      [Instructions]
      Strictly output the following JSON structure:
      {
        "q1_subtraction": {
          "suggestedId": "ID of task to move to drawer",
          "question": "If no icebox task > 3 days old: Suggest moving a trivial NEW task to drawer. If icebox task > 3 days old exists: Ask if we should keep freezing it or move to drawer.",
          "isStale": "boolean, true if referring to an icebox task > 3 days old"
        },
        "q2_leverage": {
          "suggestedId": "ID of the best task (New or Icebox) matching themes",
          "mergedTaskId": "If a new task matches an icebox task semantically, return the ID here",
          "question": "If merged: 'Detected duplicate intent, revived [Task]...'. If not merged: 'I see [New Task], but [Icebox Task] fits your theme better. Revive old or stick to new?'",
          "isMerged": "boolean"
        },
        "q3_icebreaker": {
          "suggestedId": "ID of easiest task to start",
          "question": "Starting is hard. [Task Name] seems easiest. Make it Icebreaker?"
        },
        "q4_confirmation": {
          "question": "Energy balance check. Pick one last Anchor from remaining or Icebox. (If icebox task > 5 days, suggest deleting it).",
          "isStale": "boolean, true if referring to icebox task > 5 days"
        }
      }
    `;
  } else if (!isSubsequent) {
    // --- First Time (No Icebox) ---
    prompt = `
      [System]
      You are a top-tier GTD efficiency coach.
      ${themeContext}
      ${fallbackInstruction}
      
      Analyze the following candidate tasks: ${candidateJson}.
      
      [Instructions]
      Strictly output the following JSON structure:
      {
        "q1_trivial": {
          "suggestedId": "ID of the task with lowest relevance or most trivial",
          "question": "I noticed [Task Name] seems unrelated to your core themes. Shall we move it to the drawer?"
        },
        "q2_leverage": {
          "suggestedId": "ID of the task best fitting quarterly goals",
          "question": "AI calculates [Task Name] contributes most to [Goal]. Is it your first domino?"
        },
        "q3_icebreaker": {
          "suggestedId": "ID of the task with shortest duration or lowest friction",
          "question": "Starting is hard. [Task Name] seems easiest to start. Shall we make it your Icebreaker?"
        },
        "q4_final": {
          "question": "Only 1 slot left. Which of the remaining tasks will make you feel most accomplished tonight?"
        }
      }
    `;
  } else {
    // --- Subsequent ---
    prompt = `
      [System]
      Current Time: ${currentTime}.
      ${themeContext}
      ${fallbackInstruction}
      
      User has unfinished anchors: ${anchorJson}.
      User entered new tasks: ${candidateJson}.
      
      [Instructions]
      Strictly output the following JSON structure:
      {
        "q1_trivial": {
          "suggestedId": "ID of a trivial task from new tasks",
          "question": "Caught new ideas. [Task Name] seems executable without much thought. Shall we put it in the drawer?"
        },
        "q2_pk": {
          "newChallengerId": "ID of the highest value new task",
          "oldDefenderId": "ID of the lowest value/urgency existing anchor",
          "question": "Unexpected! [New Task] looks more impactful than [Old Anchor]. Willing to swap [Old Anchor] to drawer?"
        },
        "q3_energy": {
          "question": "It is ${currentTime}. Adding a core task might mean overtime. Are you sure you want to challenge the following items?"
        }
      }
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    const raw = JSON.parse(response.text || "{}");
    
    // Map raw response to FunnelScript
    if (!isSubsequent && hasIcebox) {
         return {
            q1: { ...raw.q1_subtraction },
            q2: { ...raw.q2_leverage },
            q3: { ...raw.q3_icebreaker },
            q4: { ...raw.q4_confirmation }
         };
    } else if (!isSubsequent) {
      return {
        q1: raw.q1_trivial,
        q2: raw.q2_leverage,
        q3: raw.q3_icebreaker,
        q4: raw.q4_final
      };
    } else {
      return {
        q1: raw.q1_trivial,
        q2: { 
          suggestedId: raw.q2_pk?.newChallengerId, 
          oldDefenderId: raw.q2_pk?.oldDefenderId, 
          question: raw.q2_pk?.question 
        },
        q3: { question: raw.q3_energy?.question },
        q4: { question: "This is the final lineup. Confirm?" }
      };
    }

  } catch (e) {
    console.error(e);
    return mockFunnelScript(isSubsequent, candidateTasks, existingAnchors);
  }
};

const mockFunnelScript = (isSubsequent: boolean, candidates: Task[], anchors: Task[]): FunnelScript => {
  if (!isSubsequent) {
    return {
      q1: { suggestedId: candidates[0]?.id, question: "Skip trivial task?" },
      q2: { suggestedId: candidates[1]?.id || candidates[0]?.id, question: "Is this the keystone?" },
      q3: { suggestedId: candidates[2]?.id || candidates[0]?.id, question: "Icebreaker?" },
      q4: { question: "Final pick?" }
    };
  } else {
    return {
      q1: { suggestedId: candidates[0]?.id, question: "Skip new trivial?" },
      q2: { suggestedId: candidates[0]?.id, oldDefenderId: anchors[0]?.id, question: "Swap?" },
      q3: { question: "Energy check?" },
      q4: { question: "Confirm?" }
    };
  }
};

/**
 * Semantic Normalization for Task Forest
 * Checks if a new task belongs to an existing leaf or needs a new one.
 */
export const semanticLeafMerge = async (
  completedTaskTitle: string,
  currentIntent: TaskIntent | undefined,
  existingLeaves: LeafNode[],
  focusThemes: FocusTheme[],
  quarterId?: string
): Promise<{ action: 'MERGE' | 'CREATE'; targetLeafId?: string; canonicalTitle?: string }> => {
  if (!process.env.GEMINI_API_KEY) {
    return { action: 'CREATE', canonicalTitle: completedTaskTitle.substring(0, 4) };
  }

  try {
    const existingLeafData = existingLeaves
      .filter(l => l.intent === currentIntent && (!quarterId || l.quarterId === quarterId))
      .map(l => ({ id: l.id, title: l.canonicalTitle }));
      
    const existingLeafJson = JSON.stringify(existingLeafData);
    const themesString = focusThemes.map(t => `${t.intent}: ${(t.tags || []).join(', ')}`).join('; ');

    const prompt = `
# Role
You are a "Forest Gardener" proficient in semantic analysis and personal productivity management. Your task is to receive the new task completed by the user and decide whether it should be merged into an existing "task leaf" or grown as a new leaf.

### Input
- Existing leaf node list: ${existingLeafJson}
- New completed task title: "${completedTaskTitle}"
- Associated intent category: ${currentIntent || 'Uncategorized'}

# Rules
- Merge determination: If the new task is a [sub-step], [different stage] (e.g., first draft vs. final version), or [semantic synonym] of an existing leaf, execute MERGE.
- Differentiation determination: If the task belongs to the same project but is completely different in nature (e.g., writing code vs. recruiting testers), execute CREATE.
- Naming convention: For CREATE, generate an abstract and aesthetically pleasing "leaf name" with 2-4 characters.
- Output JSON:
   {
     "action": "MERGE" | "CREATE",
     "targetLeafId": "string (required if MERGE)",
     "canonicalTitle": "string (provide a concise 2-4 character name if CREATE)"
   }

# Intent Context
User's current 3 key focus intents: ${themesString}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["MERGE", "CREATE"] },
            targetLeafId: { type: Type.STRING },
            canonicalTitle: { type: Type.STRING }
          },
          required: ["action"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      action: result.action || 'CREATE',
      targetLeafId: result.targetLeafId,
      canonicalTitle: result.canonicalTitle || completedTaskTitle.substring(0, 4)
    };

  } catch (error) {
    console.error("AI Semantic Merge Error:", error);
    return { action: 'CREATE', canonicalTitle: completedTaskTitle.substring(0, 4) };
  }
};


export const generateQuarterlyReview = async (
  forest: LeafNode[],
  synergyLinks: SynergyLink[],
  focusThemes: FocusTheme[]
): Promise<string> => {
  if (!process.env.GEMINI_API_KEY) {
    return "Your \"Career Breakthrough\" has borne fruit this quarter, but the ecosystem is slightly unbalanced. I noticed you connected \"Architectural Design\" to \"Physical and Mental Restoration\" – this high-quality deep work has indeed brought you greater inner peace. Next month, try watering the Tree of Wealth a little more.";
  }

  try {
    const forestContext = forest.map(l => `${l.canonicalTitle} (${l.intent}): ${l.count} times`).join(', ');
    const linksContext = synergyLinks.map(l => {
      const source = forest.find(f => f.id === l.sourceLeafId);
      return source ? `${source.canonicalTitle} -> ${l.targetIntent}` : '';
    }).filter(Boolean).join(', ');
    const themesContext = focusThemes.map(t => t.intent).join(', ');

    const prompt = `
# Role
You are a "Life Coach" with philosophical depth and a background in behavioral psychology. Based on the ecological data of the user's "Intent Forest" for the quarter, write a highly insightful "Quarterly Ecological Audit Report".

# Data
- Focus Themes: ${themesContext}
- Forest Leaves (tasks and completion counts): ${forestContext}
- Cross-Tree Links (compound effect): ${linksContext}

# Analysis Dimensions
1. Ecological Diversity: Is the growth ratio of the three core intent trees unbalanced?
2. Compound Effect: Analyze the [cross-intent links] manually established by the user and identify which behaviors have produced positive cross-domain impacts.
3. Entropy Increase Warning: Analyze the data to identify the user's psychological obstacles or areas that need improvement.

# Tone
The tone should be warm, wise, and insightful, avoiding a cold, rigid report-like feel. Keep the word count around 150 words.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text?.trim() || "No report available";
  } catch (error) {
    console.error("AI Quarterly Review Error:", error);
    return "AI quarterly report generation failed, please try again later.";
  }
};

export const generateDomainsForRole = async (roleLabel: string): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) {
    return ['Product Manager', 'Software Engineer', 'Designer', 'Data Analyst', 'Marketing'];
  }

  try {
    const prompt = `
      You are an expert career advisor.
      The user has selected the role: "${roleLabel}".
      Please generate a list of 6-8 popular, specific job titles or domains associated with this role.
      Output ONLY a JSON array of strings. Do not include markdown formatting or any other text.
      Example: ["Growth PM", "Operations", "Marketing", "Data Analyst"]
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const domains = JSON.parse(response.text || "[]");
    return domains.length > 0 ? domains : ['Product Manager', 'Software Engineer', 'Designer', 'Data Analyst', 'Marketing'];
  } catch (error) {
    console.error("Gemini API Error (generateDomainsForRole):", error);
    return ['Product Manager', 'Software Engineer', 'Designer', 'Data Analyst', 'Marketing'];
  }
};

export const generateFocusTags = async (intent: TaskIntent, recentTasks: Task[]): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) return [];

  try {
    const taskContext = recentTasks.length > 0 
      ? `Recent User Tasks: ${recentTasks.map(t => t.title).join(', ')}` 
      : "No recent tasks available.";

    const prompt = `
      You are an AI assistant helping a user define their quarterly focus themes.
      The user has selected the broad category: "${intent}".
      ${taskContext}

      Based on the user's recent tasks (if any) and the chosen category, generate exactly 3 specific, actionable, and concise focus directions (tags) for this quarter.
      Each tag should be 2-5 words long.
      Return the result as a JSON array of 3 strings.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const tags = JSON.parse(response.text || "[]");
    return Array.isArray(tags) && tags.length === 3 ? tags : [];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [];
  }
};

const mockParse = (text: string): Partial<Task>[] => {
  const parts = text.split(/,|\n/).filter(s => s.trim().length > 0);
  return parts.map((part, index) => ({
    id: `mock-${Date.now()}-${index}`,
    title: part.trim(),
    category: index % 2 === 0 ? TaskCategory.WORK : TaskCategory.LIFE,
    intent: index % 2 === 0 ? TaskIntent.CAREER_BREAK : TaskIntent.BODY_MIND,
    workflowNote: "1. Step one\n2. Step two",
    duration: 30,
    status: TaskStatus.CANDIDATE,
    isAnchor: false,
    isFrozen: false,
    completed: false
  }));
};
