import { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Search, ChevronDown, ChevronUp, Headphones, Mail, Globe, Phone } from "lucide-react";
import faqData from "../data/faq.json";
import { openExternal } from "../utils/openExternal";

interface FAQItem {
  q: string;
  a: string;
}

interface FAQCategory {
  category: string;
  questions: FAQItem[];
}

type Tab = "faq" | "contacto";

export default function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("faq");
  const panelRef = useRef<HTMLDivElement>(null);

  const faq: FAQCategory[] = faqData;

  // Filtrar preguntas según búsqueda y categoría
  const filtered = faq
    .filter((cat) => !activeCategory || cat.category === activeCategory)
    .map((cat) => ({
      ...cat,
      questions: cat.questions.filter(
        (item) =>
          item.q.toLowerCase().includes(search.toLowerCase()) ||
          item.a.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((cat) => cat.questions.length > 0);

  const categories = faq.map((cat) => cat.category);

  const toggleExpand = (index: number) => {
    setExpanded(expanded === index ? null : index);
  };

  // FIX SOPORTE: Abrir URL con el plugin opener de Tauri (navegador real)
  const handleOpenUrl = (url: string) => {
    openExternal(url);
  };

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Canales de contacto
  const contactChannels = [
    {
      icon: Phone,
      label: "WhatsApp",
      description: "Soporte por chat",
      action: () => handleOpenUrl("https://wa.me/573244826034?text=Hola%2C%20necesito%20soporte%20con%20GestaERP"),
      color: "text-green-400",
      bg: "bg-green-500/10 hover:bg-green-500/20",
    },
    {
      icon: Mail,
      label: "Correo Electrónico",
      description: "gestaerp@fundasopaco.org",
      action: () => handleOpenUrl("mailto:gestaerp@fundasopaco.org?subject=Soporte%20GestaERP"),
      color: "text-blue-400",
      bg: "bg-blue-500/10 hover:bg-blue-500/20",
    },
    {
      icon: Globe,
      label: "Sitio Web",
      description: "www.fundasopaco.org",
      action: () => handleOpenUrl("https://www.fundasopaco.org"),
      color: "text-purple-400",
      bg: "bg-purple-500/10 hover:bg-purple-500/20",
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-accent hover:bg-accent-hover text-white shadow-lg flex items-center justify-center transition-transform hover:scale-110"
          title="Ayuda y Soporte"
        >
          <Headphones size={28} />
        </button>
      )}

      {/* Panel del asistente */}
      {open && (
        <div
          ref={panelRef}
          className="w-96 h-[520px] bg-card border border-theme rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Encabezado */}
          <div className="p-4 border-b border-theme flex justify-between items-center bg-surface-elevated">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <MessageCircle size={20} className="text-accent" />
              Asistente GestaERP
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="text-secondary hover:text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs: FAQ | Contacto */}
          <div className="flex border-b border-theme">
            <button
              onClick={() => setActiveTab("faq")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "faq"
                  ? "text-accent border-b-2 border-accent"
                  : "text-secondary hover:text-primary"
              }`}
            >
              Preguntas Frecuentes
            </button>
            <button
              onClick={() => setActiveTab("contacto")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === "contacto"
                  ? "text-accent border-b-2 border-accent"
                  : "text-secondary hover:text-primary"
              }`}
            >
              Contacto
            </button>
          </div>

          {/* Contenido FAQ */}
          {activeTab === "faq" && (
            <>
              {/* Barra de búsqueda */}
              <div className="p-3 border-b border-theme">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-2.5 text-secondary" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar en ayuda..."
                    className="w-full pl-10 pr-4 py-2 bg-input border border-theme rounded-lg text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              {/* Categorías */}
              <div className="flex gap-2 p-3 overflow-x-auto border-b border-theme">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition ${
                    !activeCategory
                      ? "bg-accent text-white"
                      : "bg-input text-secondary hover:bg-muted"
                  }`}
                >
                  Todas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition ${
                      activeCategory === cat
                        ? "bg-accent text-white"
                        : "bg-input text-secondary hover:bg-muted"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Lista de preguntas */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {filtered.length === 0 && (
                  <p className="text-secondary text-sm text-center mt-10">
                    No se encontraron resultados.
                  </p>
                )}
                {filtered.map((cat) => (
                  <div key={cat.category}>
                    <h4 className="text-xs font-semibold text-accent mb-2 uppercase tracking-wider">
                      {cat.category}
                    </h4>
                    {cat.questions.map((item) => {
                      const globalIndex = faq
                        .flatMap((c) => c.questions)
                        .findIndex((q) => q.q === item.q);
                      const isOpen = expanded === globalIndex;
                      return (
                        <div
                          key={globalIndex}
                          className="mb-2 border border-theme rounded-lg overflow-hidden"
                        >
                          <button
                            onClick={() => toggleExpand(globalIndex)}
                            className="w-full flex justify-between items-center p-3 text-left text-sm text-primary hover:bg-surface transition"
                          >
                            <span>{item.q}</span>
                            {isOpen ? (
                              <ChevronUp size={16} className="text-secondary shrink-0" />
                            ) : (
                              <ChevronDown size={16} className="text-secondary shrink-0" />
                            )}
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 text-sm text-secondary leading-relaxed">
                              {item.a}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Contenido Contacto */}
          {activeTab === "contacto" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-secondary mb-2">
                Estamos disponibles para ayudarte. Contáctanos por cualquiera de estos canales:
              </p>
              {contactChannels.map((channel) => (
                <button
                  key={channel.label}
                  onClick={channel.action}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border border-theme transition-colors ${channel.bg}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${channel.color} bg-current/10`}>
                    <channel.icon size={20} />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-primary">{channel.label}</p>
                    <p className="text-xs text-secondary">{channel.description}</p>
                  </div>
                  <ChevronDown size={16} className="text-secondary rotate-[-90deg]" />
                </button>
              ))}

              {/* Información adicional */}
              <div className="mt-4 p-4 rounded-xl bg-info/10 border border-info/20">
                <p className="text-xs text-secondary leading-relaxed">
                  <strong className="text-primary">Horario de atención:</strong> Lunes a Viernes, 8:00 AM - 6:00 PM (hora Colombia).<br />
                  <strong className="text-primary">Tiempo de respuesta:</strong> Menos de 24 horas hábiles.
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-3 border-t border-theme text-center text-xs text-secondary bg-surface-elevated">
            GestaERP © 2026 — GestaSoftTech
          </div>
        </div>
      )}
    </div>
  );
}