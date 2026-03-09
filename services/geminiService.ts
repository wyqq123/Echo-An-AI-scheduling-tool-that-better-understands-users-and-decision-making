import { GoogleGenAI, Type } from "@google/genai";
import { Task, TaskCategory, FunnelStep, TaskStatus, LeafNode, TaskIntent, FocusTheme } from "../types";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface FunnelScript {
  q1: { suggestedId: string; question: string; isStale?: boolean };
  q2: { suggestedId: string; oldDefenderId?: string; question: string; isMerged?: boolean; mergedTaskId?: string };
  q3: { suggestedId?: string; question: string };
  q4: { question: string; isStale?: boolean };
}

export const parseBrainDump = async (text: string, focusThemes: FocusTheme[] = [], iceboxTasks: Task[] = []): Promise<Partial<Task>[]> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key provided, returning mock data");
    return mockParse(text);
  }

  try {
    const model = ai.models;
    const iceboxContext = iceboxTasks.length > 0 
      ? `Existing Icebox Tasks (Frozen): ${JSON.stringify(iceboxTasks.map(t => ({ id: t.id, title: t.title, intent: t.intent })))}` 
      : "No Icebox Tasks.";

    const themeString = focusThemes.map(t => `${t.intent} (${t.tags.join(', ')})`).join("; ");

    const prompt = `
      You are an AI assistant for a productivity app called "Echo".
      User Input: "${text}"
      Current Focus Themes: ${themeString}
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
    const themeString = focusThemes.map(t => `【${t.intent}: ${t.tags.join(', ')}】`).join('; ');
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
  focusThemes: FocusTheme[]
): Promise<{ action: 'MERGE' | 'CREATE'; targetLeafId?: string; canonicalTitle?: string }> => {
  if (!process.env.API_KEY) {
    return { action: 'CREATE', canonicalTitle: completedTaskTitle.substring(0, 4) };
  }

  try {
    const existingLeafData = existingLeaves
      .filter(l => l.intent === currentIntent)
      .map(l => ({ id: l.id, title: l.canonicalTitle }));
      
    const existingLeafJson = JSON.stringify(existingLeafData);
    const themesString = focusThemes.map(t => `${t.intent}: ${t.tags.join(', ')}`).join('; ');

    const prompt = `
# Role
你是一位精通语义分析与个人效能管理的“森林园丁”。你的任务是接收用户完成的新任务，并决定它是该合并到现有的“任务叶片”中，还是作为一个新叶片生长。

### Input
- 现有叶子节点列表: ${existingLeafJson}
- 新完成任务标题: "${completedTaskTitle}"
- 所属意图类别: ${currentIntent || '未分类'}

# Rules
- 合并判定：如果新任务是现有叶片的【子步骤】、【不同阶段】（如：初稿与定稿）或【语义近义词】，则执行 MERGE。
- 区分判定：如果任务属于同一项目但性质完全不同（如：写代码与招募测试员），则执行 CREATE。
- 命名规范：对于 CREATE，生成一个 2-4 字的、抽象且具有美感的“叶片名称”。
- 输出 JSON:
   {
     "action": "MERGE" | "CREATE",
     "targetLeafId": "string (如果是MERGE)",
     "canonicalTitle": "string (如果是CREATE，提供一个2-4字的精简名称)"
   }

# Intent Context
用户当前聚焦的 3 大意图：${themesString}
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
  if (!process.env.API_KEY) {
    return "本季度你的“职业破局”已结出果实，但生态略显失衡。我注意到你将“架构设计”连接到了“身心修复”，这种高质量的深度工作确实为你换来了更好的内心平静。下个月，试着给财富之树多浇点水吧。";
  }

  try {
    const forestContext = forest.map(l => `${l.canonicalTitle} (${l.intent}): ${l.count}次`).join(', ');
    const linksContext = synergyLinks.map(l => {
      const source = forest.find(f => f.id === l.sourceLeafId);
      return source ? `${source.canonicalTitle} -> ${l.targetIntent}` : '';
    }).filter(Boolean).join(', ');
    const themesContext = focusThemes.map(t => t.intent).join(', ');

    const prompt = `
# Role
你是一位具有哲学深度和行为心理学背景的“人生教练”。请基于用户本季度的“意图森林”生态数据，撰写一份极具启发性的《季度生态审计报告》。

# Data
- 聚焦主题: ${themesContext}
- 森林叶片 (任务及完成次数): ${forestContext}
- 跨树连线 (复利效应): ${linksContext}

# Analysis Dimensions
1. 生态多样性：三棵核心意图树的生长比例是否失衡？
2. 复利效应：分析用户手动建立的【跨意图连线】，指出哪些行为产生了跨领域的正向影响。
3. 熵增预警：分析数据，指出用户的心理阻碍点或需要改进的地方。

# Tone
语气要温暖、睿智、具有洞察力，避免冷冰冰的报表感。字数控制在150字左右。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text?.trim() || "暂无报告";
  } catch (error) {
    console.error("AI Quarterly Review Error:", error);
    return "AI 季度报告生成失败，请稍后再试。";
  }
};
export const generateFocusTags = async (intent: TaskIntent, recentTasks: Task[]): Promise<string[]> => {
  if (!process.env.API_KEY) return [];

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
