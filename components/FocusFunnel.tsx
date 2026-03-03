import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, Sparkles, ArrowRight, Zap, Edit2, 
  Check, AlertCircle, TrendingUp, Clock, Snowflake, ChevronDown 
} from 'lucide-react';
import { parseBrainDump, generateFunnelScript, FunnelScript } from '../services/geminiService';
import { Task, TaskCategory, TaskStatus, FunnelStep } from '../types';
import { format } from 'date-fns';
import { useUserStore } from '../store/useUserStore';
import TaskCard from './TaskCard';

interface Props {
  onTasksGenerated: (tasks: Task[]) => void;
  existingTasks?: Task[]; // To detect subsequent mode and existing anchors
}

const FocusFunnel: React.FC<Props> = ({ onTasksGenerated, existingTasks = [] }) => {
  // Input State
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Store Hooks
  const { focusThemes } = useUserStore();
  
  // Flow State
  const [stage, setStage] = useState<'input' | 'preview' | 'decision'>('input');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [useFunnel, setUseFunnel] = useState(false);
  
  // Data State
  const [generatedTasks, setGeneratedTasks] = useState<Task[]>([]);
  const [isSubsequentMode, setIsSubsequentMode] = useState(false);
  
  // Decision Matrix State
  const [currentStep, setCurrentStep] = useState<FunnelStep>(FunnelStep.STEP_1_ALIGNMENT);
  const [funnelScript, setFunnelScript] = useState<FunnelScript | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Logic Tracking
  const [anchorsNeeded, setAnchorsNeeded] = useState<number>(0);

  // --- Handlers ---

  const handleProcess = async () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    
    const tasks = await parseBrainDump(input, focusThemes);
    
    const fullTasks = tasks.map(t => ({
      ...t,
      id: t.id || crypto.randomUUID(),
      status: TaskStatus.CANDIDATE, // Start as Candidate
      isAnchor: false,
      isFrozen: false,
      startTime: undefined
    })) as Task[];

    setGeneratedTasks(fullTasks);
    setIsProcessing(false);
    setStage('preview');

    // Trigger Logic
    const existingAnchors = existingTasks.filter(t => t.status === TaskStatus.ANCHOR || t.status === TaskStatus.ICEBREAKER);
    const unfinishedAnchors = existingAnchors.filter(t => !t.completed);
    
    // Check if subsequent (if we have existing tasks passed in, assume subsequent check logic applies)
    // Actually, simple check: do we have existing anchors?
    const isSubsequent = existingTasks.length > 0; 
    setIsSubsequentMode(isSubsequent);

    const totalCount = fullTasks.length + (isSubsequent ? unfinishedAnchors.length : 0);

    if (totalCount >= 4) {
      setShowFilterModal(true);
    } else {
      setUseFunnel(false);
    }
  };

  const handleTaskUpdate = (id: string, updates: Partial<Task>) => {
    setGeneratedTasks(prev => prev.map(t => 
      t.id === id ? { ...t, ...updates } : t
    ));
  };

  const handleProceed = () => {
    // If < 4 tasks (and user didn't opt in or wasn't prompted), auto-assign
    if (!useFunnel) {
      const finalized = generatedTasks.map((t, idx) => ({
        ...t,
        status: idx === 0 ? TaskStatus.ICEBREAKER : TaskStatus.ANCHOR,
        isAnchor: true, 
        startTime: idx === 0 ? '09:00' : undefined 
      }));
      assignFinalTimes(finalized);
      return;
    }

    // Start AI Funnel
    setStage('decision');
    setCurrentStep(FunnelStep.STEP_1_ALIGNMENT);
    fetchScript();
  };

  const fetchScript = async () => {
    setIsAiThinking(true);
    
    const existingAnchors = existingTasks.filter(t => t.status === TaskStatus.ANCHOR || t.status === TaskStatus.ICEBREAKER);
    const unfinishedAnchors = existingAnchors.filter(t => !t.completed);
    
    const script = await generateFunnelScript(
      isSubsequentMode,
      generatedTasks, // Candidates
      unfinishedAnchors,
      focusThemes,
      format(new Date(), 'HH:mm')
    );
    
    setFunnelScript(script);
    setIsAiThinking(false);
    
    // Pre-select for Q1
    if (script.q1.suggestedId) {
      setSelectedIds([script.q1.suggestedId]);
    }
  };

  const handleStepConfirm = () => {
    if (!funnelScript) return;

    let nextTasks = [...generatedTasks];
    let nextStep: FunnelStep | null = null;
    
    // We also need to update existing tasks if in subsequent mode (e.g. swapping anchors)
    // But existingTasks prop is read-only. We should probably emit updates to parent.
    // For now, let's assume we return a merged list or handle it via callback.
    // The onTasksGenerated callback expects a list of tasks to ADD/UPDATE.
    // If we modify existing tasks, we should include them in the output.
    
    // Let's track modified existing tasks locally to merge at the end
    // But wait, existingTasks are not in generatedTasks state.
    // We need a way to track changes to existing tasks (like demoting an anchor).
    // Let's keep a separate state for "modifiedExistingTasks" or just merge them into generatedTasks temporarily?
    // Better: generatedTasks only tracks NEW tasks. We will emit everything at the end.
    
    // Actually, for Q2 PK in subsequent mode, we might need to modify an existing task.
    // Let's handle that logic.

    switch (currentStep) {
      case FunnelStep.STEP_1_ALIGNMENT:
        // Q1: Subtraction
        // If selected, move to PENDING (Drawer)
        nextTasks = nextTasks.map(t => selectedIds.includes(t.id) ? { ...t, status: TaskStatus.PENDING } : t);
        
        nextStep = FunnelStep.STEP_2_LEVERAGE;
        // Pre-select for Q2
        setSelectedIds([]);
        if (isSubsequentMode) {
             if (funnelScript.q2.suggestedId) setSelectedIds([funnelScript.q2.suggestedId]);
        } else {
             if (funnelScript.q2.suggestedId) setSelectedIds([funnelScript.q2.suggestedId]);
        }
        break;

      case FunnelStep.STEP_2_LEVERAGE:
        // Q2: Leverage (First) or PK (Subsequent)
        if (isSubsequentMode) {
           // PK Logic
           // If user selected the NEW task (challenger), it becomes ANCHOR.
           // The OLD task (defender) becomes PENDING.
           const challengerId = funnelScript.q2.suggestedId;
           const defenderId = funnelScript.q2.oldDefenderId;
           
           if (selectedIds.includes(challengerId)) {
               // Swap confirmed
               nextTasks = nextTasks.map(t => t.id === challengerId ? { ...t, status: TaskStatus.ANCHOR } : t);
               // We need to signal that defenderId is now PENDING.
               // Since defenderId is in existingTasks, we can't modify it here directly.
               // We'll handle this in the final emit.
           } else {
               // Swap rejected. Challenger goes to PENDING.
               nextTasks = nextTasks.map(t => t.id === challengerId ? { ...t, status: TaskStatus.PENDING } : t);
           }
        } else {
           // First Time Logic: Selected -> ANCHOR
           nextTasks = nextTasks.map(t => selectedIds.includes(t.id) ? { ...t, status: TaskStatus.ANCHOR } : t);
        }

        nextStep = FunnelStep.STEP_3_FRICTION;
        setSelectedIds([]);
        if (!isSubsequentMode && funnelScript.q3.suggestedId) {
             setSelectedIds([funnelScript.q3.suggestedId]);
        }
        break;

      case FunnelStep.STEP_3_FRICTION:
        // Q3: Icebreaker (First) or Energy (Subsequent)
        if (isSubsequentMode) {
            // Energy Check
            // If user selects a task, it becomes ANCHOR.
            // Remaining CANDIDATES -> PENDING
            if (selectedIds.length > 0) {
                nextTasks = nextTasks.map(t => selectedIds.includes(t.id) ? { ...t, status: TaskStatus.ANCHOR } : t);
            }
            // All remaining Candidates -> PENDING
            nextTasks = nextTasks.map(t => t.status === TaskStatus.CANDIDATE ? { ...t, status: TaskStatus.PENDING } : t);
            
            nextStep = FunnelStep.STEP_4_SACRIFICE; // Go to confirmation
        } else {
            // First Time: Icebreaker
            if (selectedIds.length > 0) {
                const icebreakerId = selectedIds[0];
                // If it was already ANCHOR, just change to ICEBREAKER.
                // If it was CANDIDATE, change to ICEBREAKER.
                nextTasks = nextTasks.map(t => t.id === icebreakerId ? { ...t, status: TaskStatus.ICEBREAKER } : t);
            }
            nextStep = FunnelStep.STEP_4_SACRIFICE;
        }
        setSelectedIds([]);
        break;

      case FunnelStep.STEP_4_SACRIFICE:
        // Q4: Final (First) or Confirmation (Subsequent)
        if (!isSubsequentMode) {
             // First Time: Pick 1 last anchor
             if (selectedIds.length > 0) {
                 nextTasks = nextTasks.map(t => selectedIds.includes(t.id) ? { ...t, status: TaskStatus.ANCHOR } : t);
             }
             // Remaining Candidates -> PENDING
             nextTasks = nextTasks.map(t => t.status === TaskStatus.CANDIDATE ? { ...t, status: TaskStatus.PENDING } : t);
        }
        // For subsequent, it's just a confirmation step, no logic needed usually unless we allow final tweaks.
        
        nextStep = null; // Finish
        break;
    }

    setGeneratedTasks(nextTasks);

    if (nextStep) {
      setCurrentStep(nextStep);
    } else {
      // Finalize
      finalizeAndEmit(nextTasks);
    }
  };

  const finalizeAndEmit = (finalTasks: Task[]) => {
      // Logic to handle "PK" swap for existing tasks
      let tasksToEmit = [...finalTasks];
      
      if (isSubsequentMode && funnelScript?.q2.oldDefenderId) {
          const challengerId = funnelScript.q2.suggestedId;
          const defenderId = funnelScript.q2.oldDefenderId;
          
          // Check if challenger became ANCHOR (meaning swap happened)
          const challenger = finalTasks.find(t => t.id === challengerId);
          if (challenger && challenger.status === TaskStatus.ANCHOR) {
              // We need to emit an update for the defender to become PENDING
              const defender = existingTasks.find(t => t.id === defenderId);
              if (defender) {
                  tasksToEmit.push({ ...defender, status: TaskStatus.PENDING, isAnchor: false, startTime: undefined });
              }
          }
      }

      assignFinalTimes(tasksToEmit);
  };

  const assignFinalTimes = (tasks: Task[]) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. Determine start time based on existing anchors
    let startMinutes = 9 * 60; // Default 9:00 AM

    // Check if we are swapping out a defender
    let defenderId: string | undefined;
    if (isSubsequentMode && funnelScript?.q2.oldDefenderId) {
        // If the defender is in the tasks list with PENDING status, it means it was swapped out
        const defender = tasks.find(t => t.id === funnelScript.q2.oldDefenderId);
        if (defender && defender.status === TaskStatus.PENDING) {
            defenderId = defender.id;
        }
    }

    // Filter existing anchors to find the latest end time, excluding the swapped defender
    const activeExistingAnchors = existingTasks.filter(t => 
        (t.status === TaskStatus.ANCHOR || t.status === TaskStatus.ICEBREAKER) && 
        t.id !== defenderId
    );

    if (activeExistingAnchors.length > 0) {
        activeExistingAnchors.forEach(t => {
            if (t.startTime && t.duration) {
                const [h, m] = t.startTime.split(':').map(Number);
                const end = h * 60 + m + t.duration;
                if (end > startMinutes) startMinutes = end;
            }
        });
    }

    // 2. Identify New Icebreaker/Anchors to schedule
    const anchorsToSchedule = tasks.filter(t => t.status === TaskStatus.ANCHOR || t.status === TaskStatus.ICEBREAKER);
    
    // 3. Apply times sequentially
    let currentMinutes = startMinutes;
    const timeMap = new Map<string, string>();

    const formatTime = (totalMins: number) => {
       const h = Math.floor(totalMins / 60);
       const m = totalMins % 60;
       return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    anchorsToSchedule.forEach(t => {
       timeMap.set(t.id, formatTime(currentMinutes));
       currentMinutes += (t.duration || 30);
    });

    const finalized = tasks.map(t => {
      // If it's scheduled (Icebreaker or Anchor)
      if (timeMap.has(t.id)) {
        return { 
            ...t, 
            startTime: timeMap.get(t.id),
            dateStr: todayStr, // Default to today
            isAnchor: true 
        };
      }
      
      // If it's DRAWER or PENDING (Pool tasks)
      return { 
          ...t, 
          startTime: undefined,
          dateStr: undefined, 
          isAnchor: false,
          status: t.status === TaskStatus.PENDING ? TaskStatus.DRAWER : t.status 
      };
    });

    onTasksGenerated(finalized);
  };

  // --- Renderers ---

  if (stage === 'input') {
    return (
      <div className="flex flex-col h-full p-6 relative overflow-hidden">
        {/* Background FX */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 right-0 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl -z-10" 
        />
        <div className="mt-12 mb-8">
          <h1 className="text-3xl font-light text-white mb-2">Cognitive Offloading</h1>
          <p className="text-slate-400">Pour your mind out. We'll catch it.</p>
        </div>
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="I need to finish the Q3 report..."
            className="w-full h-64 bg-slate-800/50 backdrop-blur-md rounded-2xl p-6 text-lg text-slate-100 placeholder-slate-500 border border-slate-700/50 focus:outline-none focus:border-purple-500/50 resize-none shadow-inner"
          />
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleProcess}
          disabled={!input || isProcessing}
          className={`w-full py-4 rounded-xl font-medium text-lg shadow-lg flex items-center justify-center gap-2 mt-4
            ${!input ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'fluid-gradient text-white'}`}
        >
          {isProcessing ? <Loader2 className="animate-spin" /> : <><Sparkles size={20}/> Generate Tasks</>}
        </motion.button>
      </div>
    );
  }

  if (stage === 'preview') {
    return (
      <div className="flex flex-col h-full p-6 relative">
        <div className="flex justify-between items-end mb-6">
          <h2 className="text-xl font-medium text-white">Structured Thoughts</h2>
          <span className="text-xs text-slate-500 flex items-center gap-1"><Edit2 size={12} /> Edit available</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar pb-20">
          {generatedTasks.map((task, idx) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onUpdate={handleTaskUpdate} 
            />
          ))}
        </div>
        <button
          onClick={handleProceed}
          className="w-full py-4 rounded-xl bg-slate-100 text-slate-900 font-bold text-lg shadow-lg mt-4 flex items-center justify-center gap-2"
        >
          {generatedTasks.length >= 4 && useFunnel ? (
            <>Start Decision Matrix <ArrowRight size={20} /></>
          ) : (
            <>Save to Timeline <Check size={20} /></>
          )}
        </button>

        {/* Modal for >= 4 tasks */}
        <AnimatePresence>
          {showFilterModal && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 rounded-3xl">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-sm text-center"
              >
                <div className="w-12 h-12 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Optimize Your Day?</h3>
                <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                  Detected that you have more than four things to do today. Do you need Echo to help you filter out the core three things?
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setUseFunnel(false); setShowFilterModal(false); }}
                    className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
                  >
                    No
                  </button>
                  <button 
                    onClick={() => { setUseFunnel(true); setShowFilterModal(false); }}
                    className="flex-1 py-3 rounded-xl bg-white text-black font-bold hover:bg-slate-200 transition-colors"
                  >
                    Yes
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black/95 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-900/20 via-black to-black pointer-events-none" />
      
      <div className="relative z-10 flex flex-col h-full p-6">
        {/* Steps Indicator */}
        <div className="mb-8 flex justify-center gap-2">
           {Object.values(FunnelStep).map((s, i) => (
               <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${s === currentStep ? 'w-8 bg-white' : 'w-1.5 bg-slate-800'}`} />
           ))}
        </div>

        {isAiThinking || !funnelScript ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 size={48} className="text-purple-500 animate-spin mb-4" />
            <p className="text-slate-400 animate-pulse">Consulting the Oracle...</p>
          </div>
        ) : (
          <motion.div 
            key={currentStep}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col h-full"
          >
            {/* AI Question Header */}
            <div className="text-center mb-8">
              <div className="inline-block p-3 rounded-full bg-purple-500/20 text-purple-400 mb-4">
                {currentStep === FunnelStep.STEP_1_ALIGNMENT && <AlertCircle size={32} />}
                {currentStep === FunnelStep.STEP_2_LEVERAGE && <TrendingUp size={32} />}
                {currentStep === FunnelStep.STEP_3_FRICTION && <Clock size={32} />}
                {currentStep === FunnelStep.STEP_4_SACRIFICE && <Snowflake size={32} />}
              </div>
              <h2 className="text-xl font-bold text-white mb-2 leading-relaxed">
                {currentStep === FunnelStep.STEP_1_ALIGNMENT && funnelScript.q1.question}
                {currentStep === FunnelStep.STEP_2_LEVERAGE && funnelScript.q2.question}
                {currentStep === FunnelStep.STEP_3_FRICTION && funnelScript.q3.question}
                {currentStep === FunnelStep.STEP_4_SACRIFICE && funnelScript.q4.question}
              </h2>
            </div>

            {/* Task Options */}
            <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar mb-4">
               {/* Logic to show correct tasks based on step */}
               {(() => {
                 let tasksToShow: Task[] = [];
                 
                 if (currentStep === FunnelStep.STEP_1_ALIGNMENT) {
                    // Show all Candidates
                    tasksToShow = generatedTasks.filter(t => t.status === TaskStatus.CANDIDATE);
                 } else if (currentStep === FunnelStep.STEP_2_LEVERAGE) {
                    if (isSubsequentMode) {
                        // Show Challenger vs Defender
                        const challenger = generatedTasks.find(t => t.id === funnelScript.q2.suggestedId);
                        const defender = existingTasks.find(t => t.id === funnelScript.q2.oldDefenderId);
                        if (challenger) tasksToShow.push(challenger);
                        // Note: Defender is not in generatedTasks, so we might need to render it specially or mock it here for display
                        // For simplicity, let's just show the challenger and ask if they want to swap.
                        // Actually, the UI needs to show both.
                        // Let's add defender to the list just for display if not present.
                        if (defender && !tasksToShow.find(t => t.id === defender.id)) tasksToShow.push(defender);
                    } else {
                        // Show remaining Candidates
                        tasksToShow = generatedTasks.filter(t => t.status === TaskStatus.CANDIDATE);
                    }
                 } else if (currentStep === FunnelStep.STEP_3_FRICTION) {
                     // Show remaining Candidates
                     tasksToShow = generatedTasks.filter(t => t.status === TaskStatus.CANDIDATE);
                 } else {
                     // Step 4: Show remaining Candidates
                     tasksToShow = generatedTasks.filter(t => t.status === TaskStatus.CANDIDATE);
                 }

                 return tasksToShow.map(task => {
                   const isSelected = selectedIds.includes(task.id);
                   // Highlight suggestion logic
                   let isSuggested = false;
                   if (currentStep === FunnelStep.STEP_1_ALIGNMENT && task.id === funnelScript.q1.suggestedId) isSuggested = true;
                   if (currentStep === FunnelStep.STEP_2_LEVERAGE && !isSubsequentMode && task.id === funnelScript.q2.suggestedId) isSuggested = true;
                   if (currentStep === FunnelStep.STEP_2_LEVERAGE && isSubsequentMode && task.id === funnelScript.q2.suggestedId) isSuggested = true; // Challenger
                   if (currentStep === FunnelStep.STEP_3_FRICTION && !isSubsequentMode && task.id === funnelScript.q3.suggestedId) isSuggested = true;

                   return (
                    <div 
                      key={task.id}
                      onClick={() => {
                        // Selection Logic
                        if (currentStep === FunnelStep.STEP_1_ALIGNMENT) {
                            // Multi-select for deletion/drawer
                            setSelectedIds(prev => isSelected ? prev.filter(id => id !== task.id) : [...prev, task.id]);
                        } else if (currentStep === FunnelStep.STEP_2_LEVERAGE) {
                            // Single select (Anchor or Swap)
                            setSelectedIds([task.id]);
                        } else if (currentStep === FunnelStep.STEP_3_FRICTION) {
                            // Single select (Icebreaker or Energy)
                            if (isSelected) setSelectedIds([]);
                            else setSelectedIds([task.id]);
                        } else if (currentStep === FunnelStep.STEP_4_SACRIFICE) {
                             // Single select (Final Anchor)
                             if (isSelected) setSelectedIds([]);
                             else setSelectedIds([task.id]);
                        }
                      }}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 relative overflow-hidden
                        ${isSelected 
                          ? 'bg-purple-500/20 border-purple-500' 
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                    >
                      {isSuggested && !isSelected && (
                         <div className="absolute top-0 right-0 p-1 bg-purple-500/20 rounded-bl-lg">
                           <Sparkles size={10} className="text-purple-400" />
                         </div>
                      )}
                      
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center
                         ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-600'}`}>
                         {isSelected && <Check size={12} className="text-white" />}
                      </div>
                      <span className={isSelected ? 'text-white' : 'text-slate-400'}>{task.title}</span>
                      {/* Show status tag if it's an existing anchor */}
                      {task.status === TaskStatus.ANCHOR && <span className="text-xs bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded ml-auto">Anchor</span>}
                    </div>
                   )
                 });
               })()}
            </div>

            {/* Action Button */}
            <button
              onClick={handleStepConfirm}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-colors bg-white text-black hover:bg-slate-200`}
            >
              {currentStep === FunnelStep.STEP_1_ALIGNMENT && "Move Selected to Drawer"}
              {currentStep === FunnelStep.STEP_2_LEVERAGE && (isSubsequentMode ? "Confirm Swap" : "Confirm Keystone")}
              {currentStep === FunnelStep.STEP_3_FRICTION && (isSubsequentMode ? "Confirm Challenge" : "Set Icebreaker")}
              {currentStep === FunnelStep.STEP_4_SACRIFICE && (isSubsequentMode ? "Confirm Lineup" : "Lock Final Anchor")}
            </button>
            
            {currentStep === FunnelStep.STEP_1_ALIGNMENT && (
                 <button onClick={() => { setSelectedIds([]); handleStepConfirm(); }} className="mt-2 text-xs text-slate-500 py-2">Keep All</button>
            )}
            {currentStep === FunnelStep.STEP_2_LEVERAGE && isSubsequentMode && (
                 <button onClick={() => { setSelectedIds([]); handleStepConfirm(); }} className="mt-2 text-xs text-slate-500 py-2">Keep Original (No Swap)</button>
            )}
             {currentStep === FunnelStep.STEP_3_FRICTION && isSubsequentMode && (
                 <button onClick={() => { setSelectedIds([]); handleStepConfirm(); }} className="mt-2 text-xs text-slate-500 py-2">No, Too Tired</button>
            )}
             {currentStep === FunnelStep.STEP_4_SACRIFICE && !isSubsequentMode && (
                 <button onClick={() => { setSelectedIds([]); handleStepConfirm(); }} className="mt-2 text-xs text-slate-500 py-2">Skip (Enough for today)</button>
            )}

          </motion.div>
        )}
      </div>
    </div>
  );
};

export default FocusFunnel;