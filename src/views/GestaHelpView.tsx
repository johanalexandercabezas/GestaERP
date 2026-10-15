import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRight,
  Bot,
  Check,
  CircleHelp,
  RotateCcw,
  Send,
  ShieldCheck,
  Star,
  User,
  X,
} from "lucide-react";

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
  suggestedView?: string;
}

interface GestaHelpReply {
  reply: string;
  intent: string;
  requires_confirmation: boolean;
  executed: boolean;
  tools: string[];
  plan: GestaHelpPlan | null;
  suggested_view: string | null;
}

const viewLabels: Record<string, string> = {
  dashboard: "Resumen",
  products: "Productos",
  pos: "Punto de venta",
  purchases: "Compras",
  suppliers: "Proveedores",
  cash: "Caja",
  backups: "Backups",
  customers: "Clientes",
  reports: "Reportes",
  expenses: "Gastos",
  receivables: "Cuentas por cobrar",
  payables: "Cuentas por pagar",
  employees: "Empleados",
  payroll: "Nómina",
  physical_inventory: "Auditoría de stock",
  calendar: "Calendario",
  quotations: "Cotizaciones",
  kardex: "Kardex",
  acerca: "Acerca de",
};

const promptsByView: Record<string, string[]> = {
  dashboard: ["¿Cuánto vendimos hoy?", "Dame un resumen del mes", "¿Qué me recomiendas?"],
  products: ["¿Qué productos están por debajo del stock mínimo?", "¿Qué productos se venden más?"],
  pos: ["¿Cuánto vendimos hoy?", "Muéstrame las ventas recientes"],
  purchases: ["¿Cómo registro una compra?", "¿Qué productos debo reponer?"],
  cash: ["¿Cuál es el saldo actual de caja?", "¿Cómo hago el cierre de caja?"],
  expenses: ["¿Cuánto gastamos hoy?", "Registra un gasto de 25000 por arriendo"],
  receivables: ["¿Qué cuentas por cobrar están pendientes?", "¿Cómo registro un abono?"],
  payables: ["¿Cómo registro un pago a proveedor?", "¿Cómo hago una compra a crédito?"],
  customers: ["¿Cuántos clientes hay?", "¿Cómo registro un cliente?"],
  payroll: ["¿Cómo genero la nómina?", "¿Dónde consulto el historial de nómina?"],
  employees: ["¿Cómo registro un empleado?", "¿Cómo genero la nómina?"],
  reports: ["Dame un resumen del mes", "¿Cómo exporto un reporte?"],
  backups: ["¿Cómo hago un respaldo?", "¿Cómo restauro un backup?"],
  calendar: ["¿Cómo creo un apunte en el calendario?"],
  quotations: ["¿Cómo creo una cotización?", "¿Una cotización descuenta inventario?"],
  kardex: ["¿Qué registra el Kardex?", "¿Qué productos están por debajo del stock mínimo?"],
};

function renderText(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : <span key={index}>{part}</span>
  );
}

function createWelcome(view: string) {
  const label = viewLabels[view] ?? "ERP";
  return `Hola, soy **GestaHelp**. Estás en el contexto de **${label}**.\n\nPuedo responder consultas de datos locales, explicar procedimientos y preparar algunas acciones para que las confirmes antes de ejecutarlas.`;
}

export default function GestaHelpView({
  view = "dashboard",
  onNavigate,
  availableViews,
}: {
  view?: string;
  onNavigate: (view: string) => void;
  availableViews: string[];
}) {
  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 0, role: "assistant", text: createWelcome(view) },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nextMessageId = useRef(1);
  const quickPrompts = promptsByView[view] ?? promptsByView.dashboard;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const appendAssistant = (text: string, suggestedView?: string | null) => {
    const id = nextMessageId.current++;
    setMessages((current) => [
      ...current,
      {
        id,
        role: "assistant",
        text,
        suggestedView: suggestedView ?? undefined,
      },
    ]);
  };

  const send = async (prompt = input.trim()) => {
    const text = prompt.trim();
    if (!text || loading) return;
    setInput("");
    const userMessageId = nextMessageId.current++;
    setMessages((current) => [...current, { id: userMessageId, role: "user", text }]);
    setLoading(true);
    try {
      const response = await invoke<GestaHelpReply>("chat", {
        message: text,
        currentView: view,
      });
      const assistantMessageId = nextMessageId.current++;
      setMessages((current) => [
        ...current,
        {
          id: assistantMessageId,
          role: "assistant",
          text: response.reply,
          plan: response.requires_confirmation ? response.plan ?? undefined : undefined,
          suggestedView: response.suggested_view ?? undefined,
        },
      ]);
    } catch {
      appendAssistant(
        "No pude completar esa solicitud. Revisa que tu sesión siga activa e inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  };

  const resolvePlan = (id: number, resolved: boolean) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, planResolved: resolved } : message))
    );
  };

  const confirmPlan = async (id: number, plan: GestaHelpPlan) => {
    resolvePlan(id, true);
    setLoading(true);
    try {
      const response = await invoke<GestaHelpReply>("execute", { plan });
      appendAssistant(response.reply, response.suggested_view);
    } catch {
      appendAssistant("No se pudo ejecutar la acción. No se confirmó ningún cambio; revisa tus permisos e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const clearConversation = () => {
    nextMessageId.current = 1;
    setMessages([{ id: 0, role: "assistant", text: createWelcome(view) }]);
    setInput("");
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto w-full">
      <header className="px-5 py-4 border-b border-theme flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-accent to-purple-600 flex items-center justify-center text-white shrink-0">
          <Star size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-primary">GestaHelp</h1>
          <p className="text-xs text-secondary">
            Contexto: <span className="font-medium text-primary">{viewLabels[view] ?? view}</span>
            {" · "}Asistencia local del ERP
          </p>
        </div>
        <button
          type="button"
          onClick={clearConversation}
          disabled={loading}
          className="p-2 rounded-lg text-secondary hover:text-primary hover:bg-surface-elevated disabled:opacity-40"
          aria-label="Limpiar conversación"
          title="Limpiar conversación"
        >
          <RotateCcw size={17} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <article
              className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-accent text-white"
                  : "bg-surface-elevated border border-theme text-primary"
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
                {message.role === "assistant" ? <Bot size={14} /> : <User size={14} />}
                {message.role === "assistant" ? "GestaHelp" : "Tú"}
              </div>
              {renderText(message.text)}

              {message.suggestedView &&
                viewLabels[message.suggestedView] &&
                availableViews.includes(message.suggestedView) && (
                <button
                  type="button"
                  onClick={() => onNavigate(message.suggestedView!)}
                  className="mt-3 flex items-center gap-2 rounded-lg border border-theme bg-surface px-3 py-2 text-xs font-medium text-accent hover:bg-surface-elevated"
                >
                  Abrir {viewLabels[message.suggestedView]} <ArrowRight size={14} />
                </button>
              )}

              {message.plan && !message.planResolved && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void confirmPlan(message.id, message.plan!)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium disabled:opacity-40"
                  >
                    <Check size={14} /> Confirmar acción
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      resolvePlan(message.id, false);
                      appendAssistant("Acción cancelada. No se modificó ningún dato.");
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface border border-theme text-secondary hover:text-danger text-xs font-medium disabled:opacity-40"
                  >
                    <X size={14} /> Cancelar
                  </button>
                </div>
              )}
            </article>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start" role="status" aria-live="polite">
            <div className="bg-surface-elevated border border-theme rounded-2xl px-4 py-3 text-sm text-secondary">
              Consultando información local…
            </div>
          </div>
        )}

        {messages.length === 1 && !loading && (
          <section className="pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary mb-2 flex items-center gap-2">
              <CircleHelp size={14} /> Prueba con una pregunta
            </p>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => void send(prompt)}
                  className="rounded-full border border-theme bg-card px-3 py-2 text-xs text-secondary hover:text-accent hover:border-accent transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="p-4 border-t border-theme bg-surface-elevated">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 1500))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Pregunta por datos o procedimientos del ERP…"
            rows={2}
            maxLength={1500}
            aria-label="Mensaje para GestaHelp"
            className="flex-1 resize-y min-h-11 max-h-36 px-4 py-3 rounded-xl bg-input border border-theme text-primary placeholder-secondary focus:outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="h-11 w-11 shrink-0 rounded-xl bg-accent hover:bg-accent-hover text-white disabled:opacity-40 flex items-center justify-center"
            aria-label="Enviar mensaje"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-secondary flex items-center gap-1.5">
          <ShieldCheck size={12} />
          El chat se procesa localmente; no se envía a un modelo externo. No incluyas datos sensibles innecesarios.
        </p>
      </footer>
    </div>
  );
}
