import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "./PremiumToast";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Image as ImageIcon } from "lucide-react";

interface LogoUploaderProps {
  currentLogo: string | null;
  onLogoChange: (base64: string | null) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export default function LogoUploader({ currentLogo, onLogoChange, disabled = false }: LogoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentLogo);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showToast("Formato no válido. Usa JPG, PNG, WEBP o SVG", "error");
      return;
    }
    if (file.size > MAX_SIZE) {
      showToast("La imagen supera los 5MB", "error");
      return;
    }

    setUploading(true);
    try {
      // Leer archivo como ArrayBuffer
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));

      // Enviar al backend Tauri
      const result = await invoke<string>("upload_business_logo", { logoBytes: bytes });
      
      // Recargar logo desde el backend
      const b64 = await invoke<string | null>("get_business_logo");
      if (b64) {
        const dataUrl = `data:image/png;base64,${b64}`;
        setPreview(dataUrl);
        onLogoChange(b64);
      }
      
      showToast(result, "success");
    } catch (e) {
      showToast("Error al subir logo: " + String(e), "error");
    } finally {
      setUploading(false);
    }
  }, [onLogoChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleClick = () => {
    if (!disabled && !uploading) {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleRemove = () => {
    setPreview(null);
    onLogoChange(null);
  };

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        onChange={handleFileChange}
        className="hidden"
      />

      <AnimatePresence mode="wait">
        {preview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative inline-block"
          >
            <div className="w-24 h-24 rounded-xl border-2 border-theme overflow-hidden bg-input">
              <img
                src={preview}
                alt="Logo del negocio"
                className="w-full h-full object-contain"
              />
            </div>
            {!disabled && (
              <button
                onClick={handleRemove}
                className="absolute -top-2 -right-2 w-6 h-6 bg-danger text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm"
                title="Eliminar logo"
              >
                <X size={12} />
              </button>
            )}
            <p className="text-xs text-secondary mt-1 text-center">Logo actual</p>
          </motion.div>
        ) : (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={handleClick}
            className={`
              relative w-32 h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer
              transition-all duration-200
              ${dragOver
                ? "border-accent bg-accent/10 scale-105"
                : "border-theme hover:border-accent/50 hover:bg-input"
              }
              ${disabled || uploading ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {uploading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Upload size={24} className="text-accent" />
              </motion.div>
            ) : (
              <>
                <ImageIcon size={24} className="text-secondary" />
                <span className="text-xs text-secondary text-center px-2">
                  Arrastra o haz clic para subir logo
                </span>
              </>
            )}
            {dragOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 rounded-xl bg-accent/5 flex items-center justify-center"
              >
                <span className="text-sm text-accent font-medium">Soltar imagen</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-label">
        Formatos: JPG, PNG, WEBP, SVG • Máx 5MB • Se redimensiona a 200x200px
      </p>
    </div>
  );
}