import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UserInfo {
  id: number;
  full_name: string;
  role: string;
}

interface LoginResponse {
  success: boolean;
  user: UserInfo | null;
  message: string;
}

interface LoginViewProps {
  onLogin: (user: UserInfo) => void;
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Usuario y contraseña son requeridos");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await invoke<LoginResponse>("login", { username, password });
      if (res.success && res.user) {
        onLogin(res.user);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError("Error de conexión: " + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface dark:bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card dark:bg-white border border-border dark:border-theme rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-bold text-primary dark:text-gray-900 mb-2">Iniciar sesión</h1>
        <p className="text-secondary dark:text-gray-600 mb-6">Accede a tu cuenta de GestaERP</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary dark:text-gray-700 mb-1">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-input dark:bg-gray-100 border border-theme dark:border-gray-300 rounded-lg text-primary dark:text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary dark:text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-input dark:bg-gray-100 border border-theme dark:border-gray-300 rounded-lg text-primary dark:text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 dark:bg-red-100 border border-red-800 dark:border-red-300 rounded-lg text-red-200 dark:text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-lg font-semibold text-primary transition ${
              loading
                ? "bg-muted cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 active:scale-[0.98]"
            }`}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}