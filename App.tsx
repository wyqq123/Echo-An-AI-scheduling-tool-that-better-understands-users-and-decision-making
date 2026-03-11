import React, { useReducer, useEffect } from 'react';
import { Tab, AppState, Action, Task, LeafNode, TaskCategory, UserProfile, TaskStatus } from './types';
import FocusFunnel from './components/FocusFunnel';
import FluidTimeline from './components/FluidTimeline';
import CommutePod from './components/CommutePod';
import EchoCompass from './components/EchoCompass';
import BottomNav from './components/BottomNav';
import Sidebar from './components/Sidebar';
import EchoOnboarding from './components/EchoOnboarding';
import { semanticLeafMerge, generateQuarterlyReview } from './services/geminiService';
import { useUserStore } from './store/useUserStore';
import { getCurrentQuarterId } from './utils/dateUtils';

// Initial State
const initialState: AppState = {
  forest: [], // Initialize empty forest
  synergyLinks: [], // Initialize empty links
  quarterlyGoal: "Learn React Native & Get Promoted",
  activeTab: Tab.FUNNEL,
  loading: false,
  showDecisionMatrix: false,
  pendingTasks: [],
  onboardingCompleted: false
};

// Reducer
const reducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    
    // Forest Actions
    case 'ADD_LEAF':
      return { ...state, forest: [...state.forest, action.payload] };
    case 'GROW_LEAF':
      return {
        ...state,
        forest: state.forest.map(leaf => 
          leaf.id === action.payload.id 
            ? { 
                ...leaf, 
                count: leaf.count + 1, 
                isFruit: (leaf.count + 1) >= 10,
                completedTasks: [...(leaf.completedTasks || []), { taskId: action.payload.taskId, completedAt: action.payload.completedAt }]
              } 
            : leaf
        )
      };
    case 'ADD_SYNERGY_LINK':
      return { ...state, synergyLinks: [...state.synergyLinks, action.payload] };
    
    // Onboarding
    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        onboardingCompleted: true,
        userProfile: action.payload,
        // Update quarterly goal if themes are set, just taking the first one as a placeholder or combining them
        quarterlyGoal: action.payload.quarterlyThemes.length > 0 
          ? action.payload.quarterlyThemes.map(t => t.intent).join(', ')
          : state.quarterlyGoal
      };

    default:
      return state;
  }
};

const App: React.FC = () => {
  // Load initial state from localStorage if available
  const savedState = localStorage.getItem('echoAppState');
  // Filter out tasks from savedState if it exists (migration)
  const parsedSavedState = savedState ? JSON.parse(savedState) : {};
  if (parsedSavedState.tasks) delete parsedSavedState.tasks;
  
  const initial = savedState ? { ...initialState, ...parsedSavedState } : initialState;

  const [state, dispatch] = useReducer(reducer, initial);

  // Store Hooks
  const { tasks, setTasks, checkAndResetDailyState, incrementDailyAnchors, focusThemes, setFocusThemes, setAiReport } = useUserStore();

  // Migration: Sync userProfile themes to store if store is empty
  useEffect(() => {
    if (state.userProfile?.quarterlyThemes && state.userProfile.quarterlyThemes.length > 0 && focusThemes.length === 0) {
      setFocusThemes(state.userProfile.quarterlyThemes);
    }
  }, [state.userProfile, focusThemes.length, setFocusThemes]);

  // Daily Reset Effect
  useEffect(() => {
    // 1. Check on mount
    checkAndResetDailyState();

    // 2. Check every minute
    const interval = setInterval(() => {
      checkAndResetDailyState();
    }, 60000);

    // 3. Check on focus
    const handleFocus = () => checkAndResetDailyState();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkAndResetDailyState]);

  // Persist state changes (excluding tasks which are in Zustand)
  useEffect(() => {
    localStorage.setItem('echoAppState', JSON.stringify({
      onboardingCompleted: state.onboardingCompleted,
      userProfile: state.userProfile,
      forest: state.forest
    }));
  }, [state.onboardingCompleted, state.userProfile, state.forest]);

  // Helper: Process new tasks for the Forest
  const processNewForestTasks = async (newTasks: Task[]) => {
    // We no longer process tasks into the forest when they are generated.
    // They only enter the forest when they are COMPLETED.
  };

  const handleTasksGenerated = (newTasks: Task[]) => {
    // Merge logic: Remove tasks from state that are present in payload, then add payload
    const payloadIds = new Set(newTasks.map((t: Task) => t.id));
    const keptTasks = tasks.filter(t => !payloadIds.has(t.id));
    const updatedTasks = [...keptTasks, ...newTasks];
    
    setTasks(updatedTasks);
    dispatch({ type: 'SET_TAB', payload: Tab.TIMELINE });
  };

  const handleTabChange = (tab: Tab) => {
    dispatch({ type: 'SET_TAB', payload: tab });
  };

  const handleToggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    const wasCompleted = task.completed;
    const updatedTasks = tasks.map(t => 
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    
    setTasks(updatedTasks);

    // If we just completed it (was false, now true)
    if (!wasCompleted) {
       if (task.status === TaskStatus.ANCHOR || task.status === TaskStatus.ICEBREAKER) {
         incrementDailyAnchors(); // Increment stars in store
       }
       
       // ✅ FIX #1: Check if the task's intent is in the current quarterly focus themes
       const isRelevantToCurrentQuarter = task.intent && focusThemes.some(theme => theme.intent === task.intent);
       
       if (!isRelevantToCurrentQuarter) {
         console.log(`Task "${task.title}" completed but intent "${task.intent}" is not in current quarterly themes. Skipping forest update.`);
         return;
       }
       
       const quarterId = getCurrentQuarterId();
       
       // Semantic Merge Logic
       const result = await semanticLeafMerge(task.title, task.intent, state.forest, focusThemes, quarterId);
       
       let updatedForest = [...state.forest];

       if (result.action === 'MERGE' && result.targetLeafId) {
         dispatch({ type: 'GROW_LEAF', payload: { id: result.targetLeafId, taskId: task.id, completedAt: new Date().toISOString() } });
         updatedForest = updatedForest.map(leaf => 
           leaf.id === result.targetLeafId 
             ? { 
                 ...leaf, 
                 count: leaf.count + 1, 
                 isFruit: (leaf.count + 1) >= 10,
                 completedTasks: [...(leaf.completedTasks || []), { taskId: task.id, completedAt: new Date().toISOString() }]
               } 
             : leaf
         );
       } else {
         const newLeaf: LeafNode = {
           id: `leaf-${Date.now()}-${Math.random()}`,
           canonicalTitle: result.canonicalTitle || task.title.substring(0, 4),
           originalTitles: [task.title],
           count: 1, // Start at 1 since it's completed
           category: task.category || TaskCategory.WORK,
           level: 1,
           isFruit: false,
           intent: task.intent,
           quarterId: quarterId,
           completedTasks: [{ taskId: task.id, completedAt: new Date().toISOString() }]
         };
         dispatch({ type: 'ADD_LEAF', payload: newLeaf });
         updatedForest.push(newLeaf);
       }
       
       // Trigger AI Report Generation in the background after a task is completed
       if (focusThemes.length > 0) {
         // We don't await this to avoid blocking the UI
         generateQuarterlyReview(updatedForest, state.synergyLinks, focusThemes)
           .then(report => setAiReport(report))
           .catch(err => console.error("Failed to generate report", err));
       }
    }
  };

  const handleUpdateTasks = (updatedTasks: Task[]) => {
    setTasks(updatedTasks);
  };

  const handleOnboardingComplete = (profile: UserProfile) => {
    dispatch({ type: 'COMPLETE_ONBOARDING', payload: profile });
  };

  const visibleTasks = tasks.filter(t => !t.isArchived);

  const renderContent = () => {
    switch (state.activeTab) {
      case Tab.FUNNEL:
        return (
          <FocusFunnel 
            onTasksGenerated={handleTasksGenerated} 
            existingTasks={visibleTasks}
          />
        );
      case Tab.TIMELINE:
        return (
          <FluidTimeline 
            tasks={visibleTasks} 
            onToggleTask={handleToggleTask} 
            onUpdateTasks={handleUpdateTasks} 
          />
        );
      case Tab.PODS:
        return <CommutePod />;
      case Tab.COMPASS:
        return <EchoCompass 
          themes={focusThemes} 
          onUpdateThemes={setFocusThemes} 
          forest={state.forest}
          synergyLinks={state.synergyLinks}
          onAddSynergyLink={(link) => dispatch({ type: 'ADD_SYNERGY_LINK', payload: link })}
        />;
      default:
        return (
          <FocusFunnel 
            onTasksGenerated={handleTasksGenerated} 
            existingTasks={visibleTasks}
          />
        );
    }
  };

  if (!state.onboardingCompleted) {
    return <EchoOnboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="flex h-screen w-full bg-black text-white overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block h-full">
        <Sidebar activeTab={state.activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <div className="flex-1 overflow-hidden w-full h-full relative">
          {/* Content Wrapper for max-width on large screens if desired, or full width */}
          <div className="w-full h-full max-w-7xl mx-auto">
             {renderContent()}
          </div>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-50">
          <BottomNav activeTab={state.activeTab} onTabChange={handleTabChange} />
        </div>
      </main>
    </div>
  );
};

export default App;
