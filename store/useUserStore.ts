import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  // User's focus themes, e.g., ["Career Breakthrough (Core Skills)", "Mental Wilderness (Explore Unknown)"]
  focusThemes: string[];
  
  // Update themes (called by Onboarding or Echo Compass)
  setFocusThemes: (themes: string[]) => void;
  
  // Clear themes
  clearFocusThemes: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      focusThemes: [], // Default empty array
      setFocusThemes: (themes) => set({ focusThemes: themes }),
      clearFocusThemes: () => set({ focusThemes: [] }),
    }),
    {
      name: 'echo-user-storage', // Persist to localStorage
    }
  )
);
