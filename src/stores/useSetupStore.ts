import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

interface SetupState {
  isComplete: boolean;
  checkSetup: () => Promise<void>;
}

export const useSetupStore = create<SetupState>((set) => ({
  isComplete: false,
  checkSetup: async () => {
    try {
      const result = await invoke<boolean>('is_setup_complete');
      set({ isComplete: result });
    } catch {
      set({ isComplete: false });
    }
  },
}));