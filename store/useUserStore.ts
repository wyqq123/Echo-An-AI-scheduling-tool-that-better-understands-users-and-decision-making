import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSameDay } from 'date-fns';
import { Task, TaskStatus, FocusTheme } from '../types';

interface UserState {
  // User's focus themes
  focusThemes: FocusTheme[];
  setFocusThemes: (themes: FocusTheme[]) => void;
  clearFocusThemes: () => void;

  // Task Management & Daily Reset
  tasks: Task[];
  lastActiveDate: string;        // Last active date ISO String
  dailyAnchorsCompleted: number; // Stars lit in Echo Compass
  dailyCommuteStats: { production: number; growth: number; recovery: number }; // Seconds spent in each pod type
  aiReport: string | null;
  
  setTasks: (tasks: Task[]) => void;
  setAiReport: (report: string | null) => void;
  checkAndResetDailyState: () => void;
  incrementDailyAnchors: () => void;
  updateCommuteStats: (type: 'production' | 'growth' | 'recovery', seconds: number) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      focusThemes: [],
      setFocusThemes: (themes) => set({ focusThemes: themes }),
      clearFocusThemes: () => set({ focusThemes: [] }),

      tasks: [],
      lastActiveDate: new Date().toISOString(),
      dailyAnchorsCompleted: 0,
      dailyCommuteStats: { production: 0, growth: 0, recovery: 0 },
      aiReport: null,

      setTasks: (tasks) => set({ tasks }),
      setAiReport: (aiReport) => set({ aiReport }),

      incrementDailyAnchors: () => set((state) => ({ dailyAnchorsCompleted: (state.dailyAnchorsCompleted || 0) + 1 })),

      updateCommuteStats: (type, seconds) => set((state) => {
        const currentStats = state.dailyCommuteStats || { production: 0, growth: 0, recovery: 0 };
        return {
          dailyCommuteStats: {
            ...currentStats,
            [type]: (currentStats[type] || 0) + seconds
          }
        };
      }),

      checkAndResetDailyState: () => {
        const { lastActiveDate, tasks } = get();
        const today = new Date();
        
        // Check if day changed
        if (!isSameDay(new Date(lastActiveDate), today)) {
          console.log("🌅 New day detected, executing reset protocol...");

          const nextTasks = tasks.map(task => {
            // 1. Completed tasks: Archive them
            if (task.status === TaskStatus.COMPLETED) {
              return { ...task, isArchived: true };
            }

            // 2. Unfinished tasks (PENDING, ANCHOR, ICEBREAKER)
            // Move to "Icebox", mark as isFrozen, reset status to CANDIDATE
            if (task.status === TaskStatus.PENDING || 
                task.status === TaskStatus.ANCHOR || 
                task.status === TaskStatus.ICEBREAKER) {
              return { 
                ...task, 
                status: TaskStatus.CANDIDATE, 
                isFrozen: true,  // Enter Icebox
                frozenSince: task.frozenSince || today.toISOString(), // Set if not already set
                isAnchor: false, 
                startTime: undefined 
              };
            }

            return task;
          });

          // 3. Update state
          set({
            tasks: nextTasks,
            dailyAnchorsCompleted: 0,        // Reset stars
            dailyCommuteStats: { production: 0, growth: 0, recovery: 0 }, // Reset commute stats
            lastActiveDate: today.toISOString(), // Update last active date
          });
        }
      },
    }),
    {
      name: 'echo-user-storage',
    }
  )
);
