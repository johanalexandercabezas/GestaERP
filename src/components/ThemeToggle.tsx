import { useThemeStore } from '../stores/theme-store';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
    </button>
  );
}