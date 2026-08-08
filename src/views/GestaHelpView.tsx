import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Send, Star, Bot, User, Check, X } from "lucide-react";

interface GestaHelpPlan {
  tool: string;
  summary: string;
  params: Record<string, string>;
}

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  text: string;
  plan?: GestaHelpPlan;
  planResolved?: boolean;
}

interface GestaHelpReply {
  reply: string;
  intent: string;
  requires_confirmation: boolean;
  executed: boolean;
  tools: string[];
  plan: GestaHelpPlan | null;
}

/** Renderiza texto con marcado **negrita** a JSX (contenido del propio backend). */
function renderText(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <span key={i}>{part}</span>
  );
}

export default function GestaHelpView({ view }: { view?: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 0,
      role: "assistant",
      text: "Hola, soy **GestaHelp** 🤖, tu asistente digital de GestaERP.\n\nPregúntame por ventas, productos, caja, clientes o dime qué deseas hacer. Por ejemplo:\n· «¿cuánto vendimos hoy?»\n· «crea un cliente»\n· «¿cómo funciona el cierre de caja?»\n· «¿qué me recomiendas?»",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { id: Date.now(), role: "user", text }]);
    setLoading(true);
    try {
      const res = await invoke<GestaHelpReply>("chat", {
        message: text,
        currentView: view ?? "dashboard",
      });
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: "assistant",
          text: res.reply,
          plan: res.requires_confirmation && res.plan ? res.plan : undefined,
        },
      ]);
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now(), role: "assistant", text: `Error: ${String(e)}` }]);
    } finally {
      setLoading(false);
    }
  };

  const resolvePlan = (id: number, resolved: boolean) => {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, planResolved: resolved } : msg)));
  };

  const confirmPlan = async (id: number, plan: GestaHelpPlan) => {
    resolvePlan(id, true);
    setLoading(true);
    try {
      const res = await invoke<GestaHelpReply>("execute", { plan });
      setMessages((m) => [...m, { id: Date.now(), role: "assistant", text: res.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { id: Date.now(), role: "assistant", text: `Error: ${String(e)}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="p-5 border-b border-theme flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-linear-to-br from-accent to-purple-600 flex items-center justify-center text-white">
          <Star size={22} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-primary">GestaHelp</h1>
          <p className="text-xs text-secondary">
            Asistente digital de GestaERP · Módulo: <span className="capitalize">{view ?? "dashboard"}</span>
          </p>
        </div>
      </div>

      {/* Mensajes */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-accent text-white"
                  : "bg-surface-elevated border border-theme text-primary"
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
                {m.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
                {m.role === "assistant" ? "GestaHelp" : "Tú"}
              </div>
              {renderText(m.text)}
              {m.plan && !m.planResolved && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => confirmPlan(m.id, m.plan!)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium"
                  >
                    <Check size={14} /> Confirmar
                  </button>
                  <button
                    onClick={() => {
                      resolvePlan(m.id, false);
                      setMessages((msgs) => [
                        ...msgs,
                        { id: Date.now(), role: "assistant", text: "Acción cancelada. No se modificó ningún dato. 👍" },
                      ]);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-theme text-secondary hover:text-danger text-xs font-medium"
                  >
                    <X size={14} /> Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface-elevated border border-theme rounded-2xl px-4 py-3 text-sm text-secondary">
              Escribiendo…
            </div>
          </div>
        )}
      </div>

      {/* Entrada */}
      <div className="p-4 border-t border-theme bg-surface-elevated">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Escribe tu mensaje…"
            className="flex-1 px-4 py-2.5 rounded-xl bg-input border border-theme text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-4 rounded-xl bg-accent hover:bg-accent-hover text-white disabled:opacity-40 flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
