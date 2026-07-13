import React, { useState, useCallback, useRef, useEffect } from "react";

interface NumericInputProps {
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  decimals?: number;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

/**
 * Componente de entrada numérica profesional con validación estricta.
 * - Bloquea caracteres no numéricos.
 * - Formato visual al perder foco.
 * - Indicador de error inline.
 * - Compatible con react-hook-form via forwardRef.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      value,
      onChange,
      onBlur,
      label,
      placeholder = "0",
      prefix,
      suffix,
      min,
      max,
      decimals = 2,
      error,
      disabled = false,
      className = "",
      id,
      name,
    },
    ref
  ) => {
    const [focused, setFocused] = useState(false);
    const [displayValue, setDisplayValue] = useState(String(value));
    const internalRef = useRef<HTMLInputElement>(null);

    // Sync external value changes
    useEffect(() => {
      if (!focused) {
        setDisplayValue(String(value));
      }
    }, [value, focused]);

    const isOutOfRange = useCallback(() => {
      const num = parseFloat(String(value));
      if (isNaN(num)) return false;
      if (min !== undefined && num < min) return true;
      if (max !== undefined && num > max) return true;
      return false;
    }, [value, min, max]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows, home, end
      const allowedKeys = [
        "Backspace", "Delete", "Tab", "Escape", "Enter",
        "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
        "Home", "End",
      ];
      if (allowedKeys.includes(e.key)) return;

      // Allow Ctrl/Cmd + A, C, V, X
      if ((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) return;

      // Allow decimal point (only if decimals > 0 and no existing decimal)
      if ((e.key === "." || e.key === ",") && decimals > 0) {
        const currentVal = (e.target as HTMLInputElement).value;
        if (currentVal.includes(".") || currentVal.includes(",")) {
          e.preventDefault();
        }
        return;
      }

      // Allow minus sign only at the start if min < 0
      if (e.key === "-" && min !== undefined && min < 0) {
        const currentVal = (e.target as HTMLInputElement).value;
        const selStart = (e.target as HTMLInputElement).selectionStart;
        if (selStart === 0 && !currentVal.includes("-")) return;
        e.preventDefault();
        return;
      }

      // Block non-digit characters
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value;
      // Normalize comma to dot
      raw = raw.replace(",", ".");

      // Allow empty, minus sign alone, or valid number patterns
      if (raw === "" || raw === "-" || raw === ".") {
        setDisplayValue(raw);
        onChange(raw === "" || raw === "-" || raw === "." ? "0" : raw);
        return;
      }

      // Validate decimal places
      if (raw.includes(".")) {
        const parts = raw.split(".");
        if (parts[1] && parts[1].length > decimals) {
          return; // Don't update if exceeding decimal places
        }
      }

      setDisplayValue(raw);
      onChange(raw);
    };

    const handleFocus = () => {
      setFocused(true);
      // Show raw value on focus
      const num = parseFloat(String(value));
      if (!isNaN(num)) {
        setDisplayValue(num === 0 ? "" : String(num));
      }
    };

    const handleBlur = () => {
      setFocused(false);
      // Clean up value
      let num = parseFloat(displayValue);
      if (isNaN(num)) num = 0;
      if (decimals === 0) num = Math.round(num);

      setDisplayValue(String(num));
      onChange(String(num));
      onBlur?.();
    };

    const outOfRange = isOutOfRange();
    const hasError = !!error || outOfRange;

    const rangeHint = (() => {
      if (min !== undefined && max !== undefined) return `${min} - ${max}`;
      if (min !== undefined) return `Mín: ${min}`;
      if (max !== undefined) return `Máx: ${max}`;
      return null;
    })();

    // Merge refs
    const setRef = useCallback(
      (node: HTMLInputElement | null) => {
        (internalRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      },
      [ref]
    );

    return (
      <div className={`relative ${className}`}>
        {label && (
          <label className="block text-sm font-medium text-primary mb-1" htmlFor={id}>
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm pointer-events-none select-none">
              {prefix}
            </span>
          )}
          <input
            ref={setRef}
            id={id}
            name={name}
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full py-2 bg-input border rounded-lg text-primary transition-all duration-150 focus:outline-none focus:ring-2 ${
              prefix ? "pl-8 pr-3" : "px-3"
            } ${suffix ? "pr-10" : ""} ${
              hasError
                ? "border-danger focus:ring-danger/30"
                : "border-theme focus:ring-accent/30"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary text-sm pointer-events-none select-none">
              {suffix}
            </span>
          )}
        </div>
        {(error || (outOfRange && rangeHint)) && (
          <p className="text-xs text-danger mt-1">
            {error || `Valor fuera de rango (${rangeHint})`}
          </p>
        )}
      </div>
    );
  }
);

NumericInput.displayName = "NumericInput";

export default NumericInput;
