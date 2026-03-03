import React, { useReducer, useEffect } from 'react';
import { Tab, AppState, Action, Task, LeafNode, TaskCategory, UserProfile } from './types';
import FocusFunnel from './components/FocusFunnel';
import FluidTimeline from './components/FluidTimeline';
import CommutePod from './components/CommutePod';
import EchoCompass from './components/EchoCompass';
import BottomNav from './components/BottomNav';
import EchoOnboarding from './components/EchoOnboarding';
import { getCanonicalTaskName } from './services/geminiService';

// Initial State
const initialState: AppState = {
  tasks: [],
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
    case 'ADD_TASKS':
      // Merge logic: Remove tasks from state that are present in payload, then add payload
      const payloadIds = new Set(action.payload.map((t: Task) => t.id));
      const keptTasks = state.tasks.filter(t => !payloadIds.has(t.id));
      return { ...state, tasks: [...keptTasks, ...action.payload] };
    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(t => 
          t.id === action.payload ? { ...t, completed: !t.completed } : t
        )
      };
    case 'UNFREEZE_TASKS':
      return {
        ...state,
        tasks: state.tasks.map(t => t.isFrozen ? { ...t, isFrozen: false } : t)
      };
    case 'DELETE_FROZEN_TASKS':
      return {
        ...state,
        tasks: state.tasks.filter(t => !t.isFrozen)
      };
    case 'UPDATE_TASKS':
      return { ...state, tasks: action.payload };
    
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
  const initial = savedState ? { ...initialState, ...JSON.parse(savedState) } : initialState;

  const [state, dispatch] = useReducer(reducer, initial);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('echoAppState', JSON.stringify({
      onboardingCompleted: state.onboardingCompleted,
      userProfile: state.userProfile,
      forest: state.forest,
      tasks: state.tasks
    }));
  }, [state.onboardingCompleted, state.userProfile, state.forest, state.tasks]);

  // Helper: Process new tasks for the Forest
  const processNewForestTasks = async (newTasks: Task[]) => {
    // We access the *current* forest from state in the reducer if we were inside, 
    // but here in the component we rely on the closure or state passed to render.
    // Ideally we pass current forest to the service.
    
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
      // Note: If leaf exists, we do nothing until completion.
    }
  };

  const handleTasksGenerated = (tasks: Task[]) => {
    dispatch({ type: 'ADD_TASKS', payload: tasks });
    dispatch({ type: 'SET_TAB', payload: Tab.TIMELINE });
    
    // Process for Forest
    processNewForestTasks(tasks);
  };

  const handleTabChange = (tab: Tab) => {
    dispatch({ type: 'SET_TAB', payload: tab });
  };

  const handleToggleTask = async (id: string) => {
    const task = state.tasks.find(t => t.id === id);
    const wasCompleted = task?.completed;
    
    dispatch({ type: 'TOGGLE_TASK', payload: id });

    // If we just completed it (was false, now true)
    if (task && !wasCompleted) {
       // Find which leaf this belongs to via AI or simple title match
       // For better UX responsiveness, we assume title match first, but we should use the canonical logic ideally.
       // Here we re-verify canonical name to be safe or just match string if simplistic.
       // Let's use the service to find the canonical match based on the title.
       const canonicalName = await getCanonicalTaskName(task.title, state.forest);
       dispatch({ type: 'GROW_LEAF', payload: { canonicalTitle: canonicalName } });
    }
  };

  const handleUpdateTasks = (updatedTasks: Task[]) => {
    // Detect new tasks created manually in Timeline
    const newTasks = updatedTasks.filter(u => !state.tasks.find(existing => existing.id === u.id));
    
    dispatch({ type: 'UPDATE_TASKS', payload: updatedTasks });
    
    if (newTasks.length > 0) {
      processNewForestTasks(newTasks);
    }
  };

  const handleOnboardingComplete = (profile: UserProfile) => {
    dispatch({ type: 'COMPLETE_ONBOARDING', payload: profile });
  };

  const renderContent = () => {
    switch (state.activeTab) {
      case Tab.FUNNEL:
        return (
          <FocusFunnel 
            onTasksGenerated={handleTasksGenerated} 
            existingTasks={state.tasks}
          />
        );
      case Tab.TIMELINE:
        return (
          <FluidTimeline 
            tasks={state.tasks} 
            onToggleTask={handleToggleTask} 
            onUpdateTasks={handleUpdateTasks} 
          />
        );
      case Tab.PODS:
        return <CommutePod />;
      case Tab.COMPASS:
        return <EchoCompass tasks={state.tasks} forest={state.forest} />;
      default:
        return (
          <FocusFunnel 
            onTasksGenerated={handleTasksGenerated} 
            existingTasks={state.tasks}
          />
        );
    }
  };

  if (!state.onboardingCompleted) {
    return <EchoOnboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="h-screen w-full flex items-center justify-center bg-black">
      {/* Mobile container wrapper */}
      <div className="w-full max-w-md h-full max-h-[900px] bg-slate-900 relative shadow-2xl overflow-hidden flex flex-col sm:rounded-[3rem] sm:border-[8px] sm:border-slate-800">
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative">
          {renderContent()}
        </main>

        {/* Bottom Navigation */}
        <BottomNav activeTab={state.activeTab} onTabChange={handleTabChange} />
        
        {/* iOS Home Indicator simulated */}
        <div className="h-1 bg-transparent w-full absolute bottom-1 flex justify-center pointer-events-none">
          <div className="w-1/3 h-1 bg-slate-700/50 rounded-full mb-1" />
        </div>
      </div>
    </div>
  );
};

export default App;
