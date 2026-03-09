import React, { useReducer, useEffect } from 'react';
import { Tab, AppState, Action, Task, LeafNode, TaskCategory, UserProfile } from './types';
import FocusFunnel from './components/FocusFunnel';
import FluidTimeline from './components/FluidTimeline';
import CommutePod from './components/CommutePod';
import EchoCompass from './components/EchoCompass';
import BottomNav from './components/BottomNav';
import Sidebar from './components/Sidebar';
import EchoOnboarding from './components/EchoOnboarding';
import { getCanonicalTaskName } from './services/geminiService';
import { useUserStore } from './store/useUserStore';

// Initial State
const initialState: AppState = {
  forest: [], // Initialize empty forest
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
          leaf.canonicalTitle === action.payload.canonicalTitle 
            ? { ...leaf, count: leaf.count + 1 } 
            : leaf
        )
      };
    
    // Onboarding
    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        onboardingCompleted: true,
        userProfile: action.payload,
        // Update quarterly goal if themes are set, just taking the first one as a placeholder or combining them
        quarterlyGoal: action.payload.quarterlyThemes.length > 0 
          ? action.payload.quarterlyThemes.map(t => t.title).join(', ')
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
  const { tasks, setTasks, checkAndResetDailyState, incrementDailyAnchors, focusThemes, setFocusThemes } = useUserStore();

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
    for (const task of newTasks) {
      // Semantic check
      const canonicalName = await getCanonicalTaskName(task.title, state.forest);
      
      const existingLeaf = state.forest.find(l => l.canonicalTitle === canonicalName);
      
      if (!existingLeaf) {
        // Create Seed
        const newLeaf: LeafNode = {
          id: `leaf-${Date.now()}-${Math.random()}`,
          canonicalTitle: canonicalName,
          originalTitles: [task.title],
          count: 0, // Seeds start at 0
          category: task.category || TaskCategory.WORK,
          level: 1
        };
        dispatch({ type: 'ADD_LEAF', payload: newLeaf });
      }
    }
  };

  const handleTasksGenerated = (newTasks: Task[]) => {
    // Merge logic: Remove tasks from state that are present in payload, then add payload
    const payloadIds = new Set(newTasks.map((t: Task) => t.id));
    const keptTasks = tasks.filter(t => !payloadIds.has(t.id));
    const updatedTasks = [...keptTasks, ...newTasks];
    
    setTasks(updatedTasks);
    dispatch({ type: 'SET_TAB', payload: Tab.TIMELINE });
    
    // Process for Forest
    processNewForestTasks(newTasks);
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
       incrementDailyAnchors(); // Increment stars in store
       const canonicalName = await getCanonicalTaskName(task.title, state.forest);
       dispatch({ type: 'GROW_LEAF', payload: { canonicalTitle: canonicalName } });
    }
  };

  const handleUpdateTasks = (updatedTasks: Task[]) => {
    // Detect new tasks created manually in Timeline
    const newTasks = updatedTasks.filter(u => !tasks.find(existing => existing.id === u.id));
    
    setTasks(updatedTasks);
    
    if (newTasks.length > 0) {
      processNewForestTasks(newTasks);
    }
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
        return <EchoCompass themes={focusThemes} onUpdateThemes={setFocusThemes} />;
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
