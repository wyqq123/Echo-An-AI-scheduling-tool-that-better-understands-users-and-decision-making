import { GoogleGenAI, Type } from "@google/genai";
import { Task, TaskCategory, FunnelStep, TaskStatus, LeafNode, TaskIntent, FocusTheme } from "../types";
import { generateId } from "../utils/helpers";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

function formatWorkflowNote(task: any): string {
  const path = task.intent_analysis?.chosen_path;
  let note = "";
  if (path === "LINEAR" && task.linear_flow) {
    const flow = task.linear_flow;
    note += `**Linear Flow**\n`;
    if (flow.starter) note += `1. **Starter**: ${flow.starter}\n`;
    if (flow.pre_actions?.length) note += `2. **Pre-actions**:\n   - ${flow.pre_actions.join('\n   - ')}\n`;
    if (flow.core_execution?.length) note += `3. **Core Execution**:\n   - ${flow.core_execution.join('\n   - ')}\n`;
    if (flow.post_actions?.length) note += `4. **Post-actions**:\n   - ${flow.post_actions.join('\n   - ')}\n`;
  } else if (path === "DIMENSIONAL" && task.dimensional_flow) {
    note += `**Dimensional Flow**\n`;
    task.dimensional_flow.forEach((d: any) => {
      note += `* **${d.dimension_name}**\n`;
      if (d.sub_tasks?.length) {
        note += `  - ${d.sub_tasks.join('\n  - ')}\n`;
      }
    });
  } else {
    note = "No detailed workflow generated.";
  }
  return note.trim();
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

    const prompt = `
      # Role
      You are a senior efficiency expert, skilled at transforming vague intentions into highly certain execution paths. You are proficient in managing OKRs in large companies and in the growth pathways of senior students (job seeking/graduate school preparation).

      # Task
      Analyze the user's raw task input (Brain Dump) and complete the following:
      1. **Task Aggregation**: Combine actions pointing to the same deliverable or workflow into a comprehensive task (COMPOSITE task). If the input contains multiple independent tasks, extract them separately.
      2. **Entity Recognition**: Identify the core verbs, deliverables, collaborators, and deadlines present in the task.
      3. **Path Selection Logic**:
      - Path A (LINEAR): Choose this path if the task is a **definite deliverable** (e.g., writing a document, updating a resume, sending an email) with a clear sequential execution logic. The decomposition rules for Path A:
        1. Must include a Starter that can be initiated within 2 minutes (extremely low friction).
        2. Identify all necessary Pre-actions (blocking items that must be completed first).
        3. Extract the Core action (main execution step).
        4. Define Post-actions (delivery/closure items).
      - Path B (DIMENSIONAL): Choose this path if the task is a **broad objective/area** (e.g., preparing for graduate school, autumn job hunt, leadership improvement) that requires effort across multiple independent dimensions.
      4. **Semantic Deduplication**: Check whether the new task semantically matches existing Icebox tasks.
      - If highly similar, return the existing Icebox task's ID in the 'id' field and set 'isRevived' to true.
      - If the new input adds details, update the title; otherwise, keep it unchanged.
      - If not similar, generate a new UUID.
      5. **Assign Intent**: Assign the most relevant intent from [${Object.values(TaskIntent).join(", ")}] as a fallback.
      6. **Estimated Duration**: Estimate task duration in minutes (default 30).

      # Rules
      - Starter must be an extremely low-friction action that can be started within 2 minutes.
      - Avoid empty talk; action descriptions must be as specific as 'open XX, send XX, check XX'.
      - Language style: concise, professional.

      User Input: "${text}"
      ${iceboxContext}
      `;

    const response = await model.generateContent({
      model: 'gemini-3.1-flash-preview',
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
              duration: { type: Type.INTEGER },
              isRevived: { type: Type.BOOLEAN },
              intent_analysis: {
                type: Type.OBJECT,
                properties: {
                  entities: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Identified collaborators, tools, deadlines" },
                  chosen_path: { type: Type.STRING, enum: ["LINEAR", "DIMENSIONAL"], description: "Determine whether the task belongs to a linear flow or a dimensional flow" },
                  reason: { type: Type.STRING, description: "The logical basis for choosing this path" }
                },
                required: ["chosen_path"]
              },
              linear_flow: {
                type: Type.OBJECT,
                properties: {
                  starter: { type: Type.STRING, description: "Startup items within 2 minutes" },
                  pre_actions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Prerequisite dependency" },
                  core_execution: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Core execution step" },
                  post_actions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "后续闭环项" }
                }
              },
              dimensional_flow: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dimension_name: { type: Type.STRING, description: "When the user's input intention is vague and abstract, you need to break it down into different sub-dimensions that are related to this task or can achieve the outcomes of this task." },
                    sub_tasks: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                }
              }
            },
            required: ["title", "intent", "duration", "intent_analysis"]
          }
        }
      }
    });

    const rawTasks = JSON.parse(response.text || "[]");

    // --- Target Alignment using Embeddings ---
    if (focusThemes.length > 0 && rawTasks.length > 0) {
      try {
        const targetStrings = focusThemes.map(theme => 
          `[${theme.intent}] The core foucs dimensions：${(theme.tags || []).join(', ')}`
        );
        
        const taskStrings = rawTasks.map((t: any) => {
          const path = t.intent_analysis?.chosen_path;
          let coreActionsStr = "";
          if (path === "LINEAR" && t.linear_flow?.core_execution) {
            coreActionsStr = t.linear_flow.core_execution.join("；");
          } else if (path === "DIMENSIONAL" && t.dimensional_flow) {
            coreActionsStr = t.dimensional_flow.map((d: any) => d.sub_tasks?.join("；")).join("；");
          }
          return `task：${t.title}。actions：${coreActionsStr}`;
        });

        const allStrings = [...targetStrings, ...taskStrings];
        const embedResult = await ai.models.embedContent({
          model: 'gemini-embedding-2-preview',
          contents: allStrings,
        });
        
        const embeddings = embedResult.embeddings;
        if (embeddings && embeddings.length === allStrings.length) {
          const targetEmbeddings = embeddings.slice(0, targetStrings.length).map(e => e.values);
          const taskEmbeddings = embeddings.slice(targetStrings.length).map(e => e.values);

          rawTasks.forEach((t: any, idx: number) => {
            const taskVec = taskEmbeddings[idx];
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

            // If alignment score is high enough, override the fallback intent
            if (bestScore >= 0.45 && bestThemeIdx !== -1) {
              t.intent = focusThemes[bestThemeIdx].intent;
            }
          });
        }
      } catch (e) {
        console.error("Embedding alignment failed", e);
      }
    }

    return rawTasks.map((t: any) => ({
      id: t.id || generateId(),
      title: t.title,
      intent: t.intent as TaskIntent,
      category: mapIntentToCategory(t.intent as TaskIntent),
      workflowNote: formatWorkflowNote(t),
      duration: t.duration,
      status: TaskStatus.CANDIDATE,
      isAnchor: false,
      isFrozen: false,
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
  if (!process.env.API_KEY) {
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
