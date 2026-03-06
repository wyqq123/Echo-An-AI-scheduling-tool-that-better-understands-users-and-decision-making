import { GoogleGenAI, Type } from "@google/genai";
import { Task, TaskCategory, FunnelStep, TaskStatus, LeafNode, TaskIntent } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface FunnelScript {
  q1: { suggestedId: string; question: string; isStale?: boolean };
  q2: { suggestedId: string; oldDefenderId?: string; question: string; isMerged?: boolean; mergedTaskId?: string };
  q3: { suggestedId?: string; question: string };
  q4: { question: string; isStale?: boolean };
}

export const parseBrainDump = async (text: string, focusThemes: string[] = [], iceboxTasks: Task[] = []): Promise<Partial<Task>[]> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key provided, returning mock data");
    return mockParse(text);
  }

  try {
    const model = ai.models;
    const iceboxContext = iceboxTasks.length > 0 
      ? `Existing Icebox Tasks (Frozen): ${JSON.stringify(iceboxTasks.map(t => ({ id: t.id, title: t.title, intent: t.intent })))}` 
      : "No Icebox Tasks.";

    const prompt = `
      You are an AI assistant for a productivity app called "Echo".
      User Input: "${text}"
      Current Focus Themes: ${focusThemes.join(", ")}
      ${iceboxContext}

      Instructions:
      1. Aggregate actions pointing to the same deliverable or workflow into a single COMPOSITE task.
      2. Keep the main title concise and action-oriented.
      3. List specific execution steps in logical order in the 'workflowNote' field (use numbered list format).
      4. Assign an intent strictly from: [${Object.values(TaskIntent).join(", ")}].
      5. Estimate duration in minutes (default 30 if unknown).
      6. **Semantic Deduplication**: Check if any new task is semantically identical to an Existing Icebox Task.
         - If HIGHLY similar, return the Existing Icebox Task's ID in the 'id' field and set 'isRevived' to true.
         - Update the title if the new input adds detail, otherwise keep existing.
         - If not similar, generate a new UUID.
    `;

    const response = await model.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, description: "New UUID or Existing Icebox ID if revived" },
              title: { type: Type.STRING },
              intent: { type: Type.STRING, enum: Object.values(TaskIntent) },
              workflowNote: { type: Type.STRING },
              duration: { type: Type.INTEGER },
              isRevived: { type: Type.BOOLEAN }
            },
            required: ["title", "intent", "duration"]
          }
        }
      }
    });

    const rawTasks = JSON.parse(response.text || "[]");
    return rawTasks.map((t: any) => ({
      id: t.id || crypto.randomUUID(),
      title: t.title,
      intent: t.intent as TaskIntent,
      category: mapIntentToCategory(t.intent as TaskIntent),
      workflowNote: t.workflowNote,
      duration: t.duration,
      status: TaskStatus.CANDIDATE, // Initial state
      isAnchor: false,
      isFrozen: false, // Revived tasks are un-frozen
      isRevived: t.isRevived || false,
      completed: false
    }));

  } catch (error) {
    console.error("Gemini API Error:", error);
    return mockParse(text);
  }
};

// ... mapIntentToCategory ...

export const generateFunnelScript = async (
  isSubsequent: boolean,
  candidateTasks: Task[],
  existingAnchors: Task[],
  focusThemes: string[],
  currentTime: string,
  iceboxTasks: Task[] = []
): Promise<FunnelScript> => {
  if (!process.env.API_KEY) return mockFunnelScript(isSubsequent, candidateTasks, existingAnchors);

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
    const themeString = focusThemes.map(t => `【${t}】`).join('、');
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
export const getCanonicalTaskName = async (newTaskTitle: string, existingLeaves: LeafNode[]): Promise<string> => {
  if (!process.env.API_KEY || existingLeaves.length === 0) {
    return newTaskTitle; // Fallback or cold start
  }

  try {
    const existingTitles = existingLeaves.map(l => l.canonicalTitle).join(", ");
    const prompt = `
      You are a task management expert organizing a "Task Forest".
      
      Existing Leaf Nodes: [${existingTitles}]
      New Task: "${newTaskTitle}"
      
      Instructions:
      1. Determine if the New Task's core intent is highly similar to any Existing Leaf Node.
         (e.g., "Design AI UI" == "Design AI Interface" -> "AI Design")
      2. If highly similar, return the EXACT existing Leaf Node name.
      3. If it is a new concept, return a concise, normalized name (2-5 words max).
      4. Return ONLY the string name. No JSON, no punctuation.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text?.trim() || newTaskTitle;

  } catch (error) {
    console.error("AI Semantic Match Error:", error);
    return newTaskTitle;
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
