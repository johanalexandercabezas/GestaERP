import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface PremiumSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  disabled?: boolean;
}

export default function PremiumSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  searchable = false,
  className = "",
  disabled = false,
}: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = searchable
    ? options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-input border border-theme rounded-lg text-primary text-sm transition-all duration-200 ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
        }`}
      >
        <span className={selectedOption ? "text-primary" : "text-secondary"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} className="text-secondary" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full bg-card border border-theme rounded-lg shadow-lg overflow-hidden"
          >
            {searchable && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-theme">
                <Search size={14} className="text-secondary" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="flex-1 bg-transparent text-sm text-primary placeholder-secondary outline-none"
                  autoFocus
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <p className="px-4 py-3 text-sm text-secondary">Sin resultados</p>
              ) : (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                      option.value === value
                        ? "bg-accent/10 text-accent font-medium"
                        : "text-primary hover:bg-surface"
                    }`}
                  >
                    {option.label}
                    {option.value === value && <Check size={16} className="text-accent" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}