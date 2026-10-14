import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(newTheme);
  },

  setTheme: (theme: Theme) => {
    set({ theme });
    localStorage.setItem('theme', theme);
    invoke('set_setting', { key: 'theme', value: theme }).catch(() => {});
    const root = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      root.classList.add('dark');
      body.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      body.setAttribute('data-theme', 'light');
    }
  },

  loadTheme: async () => {
    // 1. Preferencia explícita del usuario (localStorage)
    const local = localStorage.getItem('theme') as Theme | null;
    if (local) {
      get().setTheme(local);
      return;
    }
    // 2. Preferencia guardada en la base de datos (configuración de empresa)
    try {
      const dbTheme = await invoke<string>('get_setting', { key: 'theme' });
      if (dbTheme === 'light' || dbTheme === 'dark') {
        get().setTheme(dbTheme as Theme);
        return;
      }
    } catch { /* Sin tema en BD: se usará la preferencia del sistema */ }
    // 3. Preferencia del sistema operativo (prefers-color-scheme)
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      get().setTheme('dark');
    } else {
      get().setTheme('light');
    }
    // Escuchar cambios futuros en la preferencia del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Solo auto-cambiar si el usuario no ha establecido preferencia explícita
      if (!localStorage.getItem('theme')) {
        get().setTheme(e.matches ? 'dark' : 'light');
      }
    });
  },
}));
