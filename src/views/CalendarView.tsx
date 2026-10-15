import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { showToast } from "../components/ui/PremiumToast";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumModal from "../components/ui/PremiumModal";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Bell,
  Trash2,
  Clock,
  CheckCircle,
} from "lucide-react";

interface CalendarNote {
  id: number;
  date: string;
  title: string;
  description: string;
  priority: string;
  completed: boolean;
  created_at: string;
  notification_date: string | null;
}

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const localDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function CalendarView() {
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => localDateKey(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<CalendarNote | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPriority, setFormPriority] = useState("normal");
  const [formTime, setFormTime] = useState("");
  const [formNotify, setFormNotify] = useState(false);
  const [loading, setLoading] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const loadNotes = async () => {
    try {
      const data = await invoke<CalendarNote[]>("list_calendar_notes");
      setNotes(data);
    } catch (error) {
      showToast(`No se pudieron cargar los apuntes: ${String(error)}`, "error");
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const todayStr = localDateKey(new Date());

  const getNotesForDate = (dateStr: string) => notes.filter((n) => n.date === dateStr);

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
  };

  const handleAgendaSelect = (date: string) => {
    const [noteYear, noteMonth] = date.split("-").map(Number);
    setCurrentDate(new Date(noteYear, noteMonth - 1, 1));
    setSelectedDate(date);
  };

  const handleNewNote = () => {
    if (!selectedDate) return;
    setEditingNote(null);
    setFormTitle("");
    setFormDesc("");
    setFormPriority("normal");
    setFormTime("");
    setFormNotify(false);
    setShowForm(true);
  };

  const handleSaveNote = async () => {
    if (!formTitle.trim()) {
      showToast("El título es obligatorio", "error");
      return;
    }
    setLoading(true);
    try {
      const notifyDate = formNotify && formTime ? `${selectedDate} ${formTime}` : null;
      await invoke("create_calendar_note", {
        date: selectedDate,
        title: formTitle.trim(),
        description: formDesc.trim(),
        priority: formPriority,
        notificationDate: notifyDate,
      });
      showToast("Nota guardada correctamente", "success");
      setShowForm(false);
      loadNotes();
    } catch (e) {
      showToast("Error al guardar: " + String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (note: CalendarNote) => {
    try {
      await invoke("update_calendar_note", {
        id: note.id,
        title: note.title,
        description: note.description,
        priority: note.priority,
        completed: !note.completed,
        notificationDate: note.notification_date,
      });
      loadNotes();
    } catch (e) {
      showToast("Error: " + String(e), "error");
    }
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm("¿Eliminar esta nota?")) return;
    try {
      await invoke("delete_calendar_note", { id });
      loadNotes();
      showToast("Nota eliminada", "success");
    } catch (e) {
      showToast("Error: " + String(e), "error");
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "alta":
        return { dot: "bg-danger", border: "border-l-danger", badge: "bg-danger/10 text-danger" };
      case "baja":
        return { dot: "bg-info", border: "border-l-info", badge: "bg-info/10 text-info" };
      default:
        return {
          dot: "bg-warning",
          border: "border-l-warning",
          badge: "bg-warning/10 text-warning",
        };
    }
  };

  const selectedNotes = getNotesForDate(selectedDate);
  const upcomingNotes = notes
    .filter((note) => note.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const pastNotes = notes
    .filter((note) => note.date < todayStr)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <motion.h2
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-2xl font-bold text-primary flex items-center gap-2 mb-6"
      >
        <Calendar className="text-accent" size={24} />
        Calendario
      </motion.h2>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {/* Calendar grid */}
        <div className="w-full rounded-xl border border-theme bg-card p-4">
          {/* Month header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-input transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-primary">
                {MONTHS[month]} {year}
              </h3>
              <button
                className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                onClick={() => {
                  const today = new Date();
                  setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
                  setSelectedDate(todayStr);
                }}
                type="button"
              >
                Hoy
              </button>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded-lg text-secondary hover:text-primary hover:bg-input transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs text-secondary font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayNotes = getNotesForDate(dateStr);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`relative p-2 rounded-lg text-sm transition-all ${
                    isSelected
                      ? "bg-accent text-white font-bold"
                      : isToday
                        ? "bg-accent/20 text-accent font-bold"
                        : "hover:bg-input text-primary"
                  }`}
                >
                  {day}
                  {dayNotes.length > 0 && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dayNotes.slice(0, 3).map((n, j) => (
                        <span
                          key={j}
                          className={`w-1 h-1 rounded-full ${priorityColor(n.priority).dot}`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes panel */}
        <div className="min-w-0 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-primary">Apuntes del {formatDate(selectedDate)}</h3>
              <PremiumButton onClick={handleNewNote} size="sm">
                <Plus size={14} /> Nueva nota
              </PremiumButton>
            </div>

            {selectedNotes.length === 0 && (
              <div className="bg-card border border-theme rounded-xl p-8 text-center text-secondary">
                <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                <p>Sin notas para esta fecha</p>
                <p className="text-xs mt-1">Haz clic en "Nueva nota" para agregar una</p>
              </div>
            )}

            <div className="space-y-2">
              <AnimatePresence>
                {selectedNotes.map((note) => {
                  const pc = priorityColor(note.priority);
                  return (
                    <motion.div
                      key={note.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={`bg-card border border-theme border-l-4 ${pc.border} rounded-xl p-4`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <button
                            onClick={() => handleToggleComplete(note)}
                            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              note.completed
                                ? "bg-success border-success text-white"
                                : "border-secondary hover:border-accent"
                            }`}
                          >
                            {note.completed && <CheckCircle size={12} />}
                          </button>
                          <div className={`flex-1 ${note.completed ? "opacity-50" : ""}`}>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium text-primary ${note.completed ? "line-through" : ""}`}
                              >
                                {note.title}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${pc.badge}`}
                              >
                                {note.priority}
                              </span>
                            </div>
                            {note.description && (
                              <p className="text-xs text-secondary mt-1">{note.description}</p>
                            )}
                            {note.notification_date && (
                              <div className="flex items-center gap-1 mt-1 text-[10px] text-info">
                                <Bell size={10} />
                                <span>Recordatorio: {note.notification_date}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 rounded text-secondary hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-primary">Agenda completa</h3>
                <p className="text-xs text-secondary">
                  {notes.length} {notes.length === 1 ? "apunte" : "apuntes"} · anteriores y próximos
                </p>
              </div>
              <Clock size={18} className="text-accent" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[
                { heading: "Próximos", items: upcomingNotes, empty: "No hay eventos próximos." },
                { heading: "Anteriores", items: pastNotes, empty: "No hay eventos anteriores." },
              ].map((group) => (
                <article
                  key={group.heading}
                  className="overflow-hidden rounded-xl border border-theme bg-card"
                >
                  <h4 className="border-b border-theme px-4 py-3 text-sm font-semibold text-primary">
                    {group.heading}{" "}
                    <span className="text-xs font-normal text-secondary">
                      ({group.items.length})
                    </span>
                  </h4>
                  <div className="max-h-[24rem] space-y-2 overflow-y-auto p-3">
                    {group.items.length === 0 ? (
                      <p className="px-2 py-4 text-sm text-secondary">{group.empty}</p>
                    ) : (
                      group.items.map((note) => {
                        const pc = priorityColor(note.priority);
                        return (
                          <button
                            className={`w-full rounded-lg border border-theme border-l-4 ${pc.border} p-3 text-left transition-colors hover:bg-input`}
                            key={note.id}
                            onClick={() => handleAgendaSelect(note.date)}
                            type="button"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={`truncate text-sm font-medium text-primary ${note.completed ? "line-through opacity-60" : ""}`}
                              >
                                {note.title}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${pc.badge}`}
                              >
                                {note.priority}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs capitalize text-secondary">
                              {formatDate(note.date)}
                            </span>
                            {note.description && (
                              <span className="mt-1 block line-clamp-2 text-xs text-secondary">
                                {note.description}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* New note modal */}
      <PremiumModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingNote ? "Editar nota" : "Nueva nota"}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-secondary mb-1">Título *</label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Título de la nota"
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent uppercase"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-secondary mb-1">Descripción</label>
            <textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Descripción detallada..."
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary mb-1">Prioridad</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-secondary mb-1">Hora (opcional)</label>
              <input
                type="time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notify"
              checked={formNotify}
              onChange={(e) => setFormNotify(e.target.checked)}
              className="rounded border-theme"
            />
            <label htmlFor="notify" className="text-sm text-secondary">
              Crear recordatorio con notificación al iniciar sesión
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowForm(false)} disabled={loading}>
              Cancelar
            </PremiumButton>
            <PremiumButton onClick={handleSaveNote} loading={loading}>
              {loading ? "Guardando..." : "Guardar nota"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}
