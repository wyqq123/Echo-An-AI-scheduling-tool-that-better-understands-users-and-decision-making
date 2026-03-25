import { GoogleGenAI, Type } from "@google/genai";
import { Task, TaskCategory, FunnelStep, TaskStatus, LeafNode, TaskIntent, FocusTheme, SynergyLink, UserProfile } from "../types";
import { generateId } from "../utils/helpers";
import { SKILL, fillTemplate } from "../utils/skillLoader";

// Initialize Gemini
// Important: the @google/genai web client throws if no API key is provided.
// We must avoid constructing the client at module-load time when running in browser without a key,
// otherwise it will crash the whole React app before the UI can render.
const isBrowser = typeof window !== 'undefined';
const GEMINI_API_KEY =
  !isBrowser && typeof process !== 'undefined'
    ? process.env.GEMINI_API_KEY
    : undefined;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : (null as unknown as GoogleGenAI);

async function generateViaProxyOrDirect(params: {
  model: string;
  contents: string | string[];
  config?: any;
}): Promise<{ text?: string }> {
  if (isBrowser) {
    const res = await fetch("/api/gemini/generate-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Proxy generate-content failed: ${res.status} ${errText}`);
    }
    return (await res.json()) as { text?: string };
  }

  const response = await ai.models.generateContent(params as any);
  return { text: response.text };
}

async function embedViaProxyOrDirect(params: {
  model: string;
  contents: string[];
}): Promise<{ embeddings: { values: number[] }[] }> {
  if (isBrowser) {
    const res = await fetch("/api/gemini/embed-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Proxy embed-content failed: ${res.status} ${errText}`);
    }
    return (await res.json()) as { embeddings: { values: number[] }[] };
  }

  const response = await ai.models.embedContent(params as any);
  return { embeddings: (response.embeddings || []) as { values: number[] }[] };
}

const PRIMARY_EMBEDDING_MODEL = "text-embedding-004";
const FALLBACK_EMBEDDING_MODEL = "gemini-embedding-2-preview";

async function embedWithFallback(contents: string[]): Promise<{ values: number[] }[]> {
  try {
    const r = await embedViaProxyOrDirect({ model: PRIMARY_EMBEDDING_MODEL, contents });
    return r.embeddings;
  } catch (e) {
    console.warn(`[embedding] primary model failed (${PRIMARY_EMBEDDING_MODEL}), falling back`, e);
    const r = await embedViaProxyOrDirect({ model: FALLBACK_EMBEDDING_MODEL, contents });
    return r.embeddings;
  }
}

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

  const prompt = fillTemplate(SKILL.misc.featureExtraction, {
    TASK_TEXT: taskText,
    INTENT_VALUES: intentValues,
  });

  try {
    const response = await generateViaProxyOrDirect({
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

const DOMAIN_SKILLS: Record<TaskIntent, string> = {
  [TaskIntent.CAREER_BREAK]: SKILL.domains.careerBreak,
  [TaskIntent.WEALTH_CONTROL]: SKILL.domains.wealthControl,
  [TaskIntent.BODY_MIND]: SKILL.domains.bodyMind,
  [TaskIntent.ACADEMIC_SPRINT]: SKILL.domains.academicSprint,
  [TaskIntent.DEEP_CONNECT]: SKILL.domains.deepConnect,
  [TaskIntent.INNER_WILD]: SKILL.domains.innerWild,
};

const SCOPE_INSTRUCTIONS: Record<TaskScope, string> = {
  small: "Small Task Scope (1-2 hours): Compress Pre-actions to a maximum of 1 item, strengthen the ultra-fast Starter (must be an action that can start within 30 seconds), and control the total steps to 3-4.",
  medium: "Medium Task Scope (half a day): Standard decomposition depth, consisting of Starter + 2-3 Pre-actions + 2-3 Core steps + 1-2 Post-actions.",
  large: "Large Task Scope (multiple days/rounds): Increase decomposition levels, generate a list of 2-3 sub-steps under each Core step, and mark the estimated time consumption and milestone nodes.",
};

export function skillsRouter(features: TaskFeatures): SkillChainConfig {
  const path: DecompositionType = features.has_deliverable ? "LINEAR" : "DIMENSIONAL";
  const domainPrompt = DOMAIN_SKILLS[features.domain] || DOMAIN_SKILLS[TaskIntent.CAREER_BREAK];
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

  const prompt = fillTemplate(SKILL.chains.linearDecomposer, {
    DOMAIN_SKILL: config.domainPrompt,
    URGENCY_NOTE: urgencyNote,
    SCOPE_INSTRUCTION: config.scopeInstruction,
    TASK_TEXT: taskText,
    TASK_TITLE: features.title,
  });

  const response = await generateViaProxyOrDirect({
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

  const prompt = fillTemplate(SKILL.chains.dimensionalDecomposer, {
    DOMAIN_SKILL: config.domainPrompt,
    SCOPE_INSTRUCTION: config.scopeInstruction,
    URGENCY_NOTE: urgencyNote,
    TASK_TEXT: taskText,
    TASK_TITLE: features.title,
  });

  const response = await generateViaProxyOrDirect({
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
      
      const embedResult = await embedViaProxyOrDirect({
        model: 'gemini-embedding-2-preview',
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
  if (!isBrowser && !GEMINI_API_KEY) {
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
  // If no quarterly themes, keep the previous lightweight fallback behavior.
  // (Relevance scoring requires a target vector.)
  if (focusThemes.length === 0) {
    return mockFunnelScript(isSubsequent, candidateTasks, existingAnchors);
  }

  const themeString = focusThemes
    .map(t => `【${t.intent}: ${(t.tags || []).join(', ')}】`)
    .join('; ');
  const themeEmbeddingText = `Quarterly focus themes: ${themeString}`;

  const taskToEmbeddingText = (t: Task) => {
    const parts = [
      `title: ${t.title}`,
      t.intent ? `intent: ${t.intent}` : '',
      typeof t.duration === 'number' ? `duration_min: ${t.duration}` : '',
      t.decomposition_type ? `decomposition_type: ${t.decomposition_type}` : '',
      t.workflowNote ? `workflow: ${t.workflowNote}` : '',
    ].filter(Boolean);
    return parts.join('\n');
  };

  const allTasks = [...candidateTasks, ...iceboxTasks, ...existingAnchors];
  const embedInputs = [themeEmbeddingText, ...allTasks.map(taskToEmbeddingText)];

  try {
    const embeddings = await embedWithFallback(embedInputs);
    const themeVec = embeddings[0]?.values;
    if (!themeVec) return mockFunnelScript(isSubsequent, candidateTasks, existingAnchors);

    const scoreById = new Map<string, number>();
    allTasks.forEach((t, idx) => {
      const vec = embeddings[idx + 1]?.values;
      if (!vec) return;
      scoreById.set(t.id, cosineSimilarity(themeVec, vec));
    });

    const scored = <T extends Task>(arr: T[]) =>
      arr
        .map(t => ({ t, score: scoreById.get(t.id) ?? 0 }))
        .sort((a, b) => b.score - a.score);

    const scoredCandidates = scored(candidateTasks);
    const scoredIcebox = scored(iceboxTasks);
    const scoredAnchors = scored(existingAnchors);

    const leastCandidate = scoredCandidates[scoredCandidates.length - 1]?.t;
    const bestCandidate = scoredCandidates[0]?.t;
    const bestIcebox = scoredIcebox[0]?.t;
    const bestOverall = scored([...(candidateTasks || []), ...(iceboxTasks || [])])[0]?.t;

    const easiestCandidate = [...candidateTasks].sort((a, b) => (a.duration || 999) - (b.duration || 999))[0];

    const hasIcebox = iceboxTasks.length > 0;

    if (!isSubsequent) {
      if (hasIcebox) {
        const newPick = bestCandidate;
        const icePick = bestIcebox;
        const overallPick = bestOverall || bestCandidate || bestIcebox || candidateTasks[0];

        return {
          q1: {
            suggestedId: (leastCandidate || candidateTasks[0])?.id,
            question: `Subtraction: "${(leastCandidate || candidateTasks[0])?.title}" is least aligned with your quarterly themes. Move it to drawer?`,
          },
          q2: {
            suggestedId: overallPick?.id,
            mergedTaskId: undefined,
            isMerged: false,
            question: `Leverage: Best-aligned new task is "${newPick?.title}". Best-aligned icebox task is "${icePick?.title}". Which should be your Keystone today?`,
          },
          q3: {
            suggestedId: easiestCandidate?.id,
            question: `Icebreaker: "${easiestCandidate?.title}" looks easiest to start. Make it your Icebreaker?`,
          },
          q4: {
            question: "Final slot: choose one last Anchor from the remaining items that best supports your quarterly themes.",
          },
        };
      }

      return {
        q1: {
          suggestedId: (leastCandidate || candidateTasks[0])?.id,
          question: `Subtraction: "${(leastCandidate || candidateTasks[0])?.title}" is least aligned with your quarterly themes. Move it to drawer?`,
        },
        q2: {
          suggestedId: (bestCandidate || candidateTasks[0])?.id,
          question: `Leverage: "${(bestCandidate || candidateTasks[0])?.title}" is most aligned with your quarterly themes. Make it your Keystone?`,
        },
        q3: {
          suggestedId: easiestCandidate?.id,
          question: `Icebreaker: "${easiestCandidate?.title}" looks easiest to start. Make it your Icebreaker?`,
        },
        q4: {
          question: "Final slot: choose one last Anchor from the remaining items that best supports your quarterly themes.",
        },
      };
    }

    // Subsequent mode (PK): challenger = best new candidate, defender = least aligned existing anchor
    const challenger = bestCandidate || candidateTasks[0];
    const defender = scoredAnchors[scoredAnchors.length - 1]?.t || existingAnchors[0];

    return {
      q1: {
        suggestedId: (leastCandidate || candidateTasks[0])?.id,
        question: `Subtraction: "${(leastCandidate || candidateTasks[0])?.title}" is least aligned with your quarterly themes. Move it to drawer?`,
      },
      q2: {
        suggestedId: challenger?.id,
        oldDefenderId: defender?.id,
        question: `PK: "${challenger?.title}" aligns better with your themes than "${defender?.title}". Swap the defender to drawer?`,
      },
      q3: {
        question: `Energy check (${currentTime}): adding a new core task might increase workload. Continue?`,
      },
      q4: {
        question: "Confirm final lineup based on quarterly alignment and today's energy.",
      },
    };
  } catch (e) {
    console.error("Funnel relevance scoring failed:", e);
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
      q4: { question: "This is the final formation after adjustments. If these few tasks are completed tonight, will you still be able to get that sense of 'security'?" }
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
  if (!isBrowser && !GEMINI_API_KEY) {
    return { action: 'CREATE', canonicalTitle: completedTaskTitle.substring(0, 4) };
  }

  try {
    const existingLeafData = existingLeaves
      .filter(l => l.intent === currentIntent && (!quarterId || l.quarterId === quarterId))
      .map(l => ({ id: l.id, title: l.canonicalTitle }));
      
    const existingLeafJson = JSON.stringify(existingLeafData);
    const themesString = focusThemes.map(t => `${t.intent}: ${(t.tags || []).join(', ')}`).join('; ');

    const prompt = fillTemplate(SKILL.misc.leafMerge, {
      EXISTING_LEAVES: existingLeafJson,
      TASK_TITLE: completedTaskTitle,
      INTENT: currentIntent || 'Uncategorized',
      THEMES_CONTEXT: themesString,
    });

    const response = await generateViaProxyOrDirect({
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
  if (!isBrowser && !GEMINI_API_KEY) {
    return "Your \"Career Breakthrough\" has borne fruit this quarter, but the ecosystem is slightly unbalanced. I noticed you connected \"Architectural Design\" to \"Physical and Mental Restoration\" – this high-quality deep work has indeed brought you greater inner peace. Next month, try watering the Tree of Wealth a little more.";
  }

  try {
    const forestContext = forest.map(l => `${l.canonicalTitle} (${l.intent}): ${l.count} times`).join(', ');
    const linksContext = synergyLinks.map(l => {
      const source = forest.find(f => f.id === l.sourceLeafId);
      return source ? `${source.canonicalTitle} -> ${l.targetIntent}` : '';
    }).filter(Boolean).join(', ');
    const themesContext = focusThemes.map(t => t.intent).join(', ');

    const prompt = fillTemplate(SKILL.misc.quarterlyReview, {
      THEMES_CONTEXT: themesContext,
      FOREST_CONTEXT: forestContext,
      LINKS_CONTEXT: linksContext,
    });

    const response = await generateViaProxyOrDirect({
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
  if (!isBrowser && !GEMINI_API_KEY) {
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

    const response = await generateViaProxyOrDirect({
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
  if (!isBrowser && !GEMINI_API_KEY) return [];

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

    const response = await generateViaProxyOrDirect({
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
