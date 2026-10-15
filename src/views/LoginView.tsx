import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface RecoveryQuestion {
  id: string;
  prompt: string;
}

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
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryQuestions, setRecoveryQuestions] = useState<RecoveryQuestion[]>([]);
  const [recoveryAnswers, setRecoveryAnswers] = useState<Record<string, string>>({});
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const handleStartRecovery = async () => {
    if (!username.trim()) {
      setError("Escribe el usuario administrador para buscar sus preguntas.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const questions = await invoke<RecoveryQuestion[]>("get_admin_recovery_questions", {
        username: username.trim(),
      });
      setRecoveryQuestions(questions);
      setRecoveryAnswers({});
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmNewPassword) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    if (
      newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword)
    ) {
      setError(
        "La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas y números.",
      );
      return;
    }
    if (
      recoveryQuestions.length !== 3 ||
      recoveryQuestions.some((question) => !recoveryAnswers[question.id]?.trim())
    ) {
      setError("Responde las 3 preguntas de recuperación.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await invoke("reset_admin_password", {
        username: username.trim(),
        recoveryAnswers: recoveryQuestions.map((question) => ({
          questionId: question.id,
          answer: recoveryAnswers[question.id],
        })),
        newPassword,
      });
      setRecoveryMode(false);
      setRecoveryQuestions([]);
      setRecoveryAnswers({});
      setPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNotice("Contraseña restablecida. Inicia sesión con la contraseña nueva.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

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
        <h1 className="text-2xl font-bold text-primary dark:text-gray-900 mb-2">
          {recoveryMode ? "Recuperar contraseña" : "Iniciar sesión"}
        </h1>
        <p className="text-secondary dark:text-gray-600 mb-6">
          {recoveryMode
            ? "Restablecimiento local para la cuenta administradora."
            : "Accede a tu cuenta de GestaERP"}
        </p>

        {notice && (
          <p
            className="mb-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
            role="status"
          >
            {notice}
          </p>
        )}

        {recoveryMode ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-primary dark:text-gray-700">
              Usuario administrador
              <input
                autoComplete="username"
                className="mt-1 w-full rounded-lg border border-theme bg-input px-4 py-2.5 text-primary dark:bg-gray-100 dark:text-gray-900"
                onChange={(event) => {
                  setUsername(event.target.value);
                  setRecoveryQuestions([]);
                  setRecoveryAnswers({});
                  setNewPassword("");
                  setConfirmNewPassword("");
                }}
                value={username}
              />
            </label>
            {recoveryQuestions.length === 0 ? (
              <button
                className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                disabled={loading}
                onClick={handleStartRecovery}
                type="button"
              >
                {loading ? "Buscando..." : "Mostrar mis preguntas"}
              </button>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-3">
                  {recoveryQuestions.map((question) => (
                    <label
                      className="block text-sm font-medium text-primary dark:text-gray-700"
                      key={question.id}
                    >
                      {question.prompt}
                      <input
                        autoComplete="off"
                        className="mt-1 w-full rounded-lg border border-theme bg-input px-4 py-2.5 text-primary dark:bg-gray-100 dark:text-gray-900"
                        onChange={(event) =>
                          setRecoveryAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }
                        type="password"
                        value={recoveryAnswers[question.id] ?? ""}
                      />
                    </label>
                  ))}
                </div>
                <label className="block text-sm font-medium text-primary dark:text-gray-700">
                  Nueva contraseña
                  <input
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-lg border border-theme bg-input px-4 py-2.5 text-primary dark:bg-gray-100 dark:text-gray-900"
                    onChange={(event) => setNewPassword(event.target.value)}
                    type="password"
                    value={newPassword}
                  />
                </label>
                <label className="block text-sm font-medium text-primary dark:text-gray-700">
                  Confirma la contraseña nueva
                  <input
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-lg border border-theme bg-input px-4 py-2.5 text-primary dark:bg-gray-100 dark:text-gray-900"
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    type="password"
                    value={confirmNewPassword}
                  />
                </label>
                <button
                  className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Verificando..." : "Restablecer contraseña"}
                </button>
              </form>
            )}
            <button
              className="w-full py-2 text-sm text-secondary hover:text-primary"
              onClick={() => {
                setRecoveryMode(false);
                setRecoveryQuestions([]);
                setRecoveryAnswers({});
                setError("");
              }}
              type="button"
            >
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
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
            <button
              className="w-full py-2 text-sm text-accent hover:underline"
              onClick={() => {
                setRecoveryMode(true);
                setError("");
                setNotice("");
              }}
              type="button"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        {error && (
          <div
            className="mt-4 rounded-lg border border-red-800 bg-red-900/50 p-3 text-sm text-red-200 dark:border-red-300 dark:bg-red-100 dark:text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
