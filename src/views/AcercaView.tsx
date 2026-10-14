import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { Info, Shield, ExternalLink, Upload } from "lucide-react";
import { showToast } from "../components/ui/PremiumToast";
import PremiumButton from "../components/ui/PremiumButton";
import PremiumModal from "../components/ui/PremiumModal";

export default function AcercaView() {
  const [updateLoading, setUpdateLoading] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updatePath, setUpdatePath] = useState("");
  const [updateVersion, setUpdateVersion] = useState("");

  const handleSelectExe = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".exe";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement | null)?.files?.[0];
      if (file) {
        setUpdatePath(file.name);
      }
    };
    input.click();
  };

  const handleApplyUpdate = async () => {
    if (!updatePath) {
      showToast("Selecciona un archivo .exe primero", "error");
      return;
    }
    if (!updateVersion) {
      showToast("Ingresa la nueva versión (ej: 1.2.0)", "error");
      return;
    }
    setUpdateLoading(true);
    try {
      const result = await invoke<{ message: string }>("apply_update", {
        newExePath: updatePath, 
        newVersion: updateVersion 
      });
      showToast(result.message, "success");
      setShowUpdateModal(false);
      setUpdatePath("");
      setUpdateVersion("");
    } catch (e) {
      showToast(`Error: ${String(e)}`, "error");
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-3 mb-8">
          <Info size={28} className="text-accent" />
          <h1 className="text-2xl font-bold text-primary">Acerca de GestaERP</h1>
        </div>

        <div className="bg-card border border-theme rounded-xl p-6 space-y-6">
          {/* Versión */}
          <div>
            <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-2">Versión</h3>
            <p className="text-primary font-bold text-lg">V 1.0.0</p>
          </div>

          {/* Desarrollador */}
          <div>
            <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-2">Desarrollador</h3>
            <p className="text-primary font-medium">Johan Alexander Cabezas Huila</p>
            <p className="text-secondary text-sm">GestaSoftTech - Colombia</p>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-2">Soporte</h3>
            <p className="text-secondary text-sm flex items-center gap-2">
              <ExternalLink size={14} />
              www.fundasopaco.org
            </p>
            <p className="text-secondary text-sm mt-1">gestaerp@fundasopaco.org</p>
          </div>

          {/* Seguridad */}
          <div className="bg-input/30 border border-theme rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield size={18} className="text-success mt-0.5" />
              <div>
                <p className="text-primary text-sm font-medium">Base de datos cifrada</p>
                <p className="text-secondary text-xs mt-1">
                  Tu información está protegida con cifrado SQLCipher vinculado a esta máquina.
                  Solo se puede acceder desde este equipo con esta instalación.
                </p>
              </div>
            </div>
          </div>

          {/* Botón de actualización */}
          <div className="border-t border-theme pt-4">
            <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
              Actualización por Soporte
            </h3>
            <p className="text-secondary text-xs mb-3">
              Sube una nueva versión del ejecutable para actualizar GestaERP.
              Se hará un backup automático de la base de datos antes de aplicar la actualización.
            </p>
            <PremiumButton
              onClick={() => setShowUpdateModal(true)}
              variant="secondary"
            >
              <Upload size={16} />
              Actualizar a nueva versión
            </PremiumButton>
          </div>

          {/* Licencias */}
          <div className="border-t border-theme pt-4">
            <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">Licencia</h3>
            <p className="text-secondary text-xs">
              MIT License - Software propietario de GestaSoftTech.
              El uso no autorizado, distribución o modificación sin licencia válida está prohibido.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Modal de actualización */}
      <PremiumModal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        title="Actualización por Soporte"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-info/10 border border-info/30 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Shield size={16} className="text-info mt-0.5 shrink-0" />
              <p className="text-xs text-secondary">
                Se realizará un backup automático de la base de datos antes de aplicar la actualización.
                La aplicación se cerrará y se reemplazará con la nueva versión automáticamente.
              </p>
            </div>
          </div>

          {/* Seleccionar archivo */}
          <div>
            <label className="block text-sm text-secondary mb-1">Archivo ejecutable (.exe)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={updatePath}
                readOnly
                placeholder="C:\...\GestaERP_nuevo.exe"
                className="flex-1 px-3 py-2 bg-input border border-theme rounded-lg text-primary text-sm focus:outline-none"
              />
              <PremiumButton variant="ghost" onClick={handleSelectExe} size="sm">
                <Upload size={14} />
              </PremiumButton>
            </div>
          </div>

          {/* Versión */}
          <div>
            <label className="block text-sm text-secondary mb-1">Nueva versión</label>
            <input
              type="text"
              value={updateVersion}
              onChange={(e) => setUpdateVersion(e.target.value)}
              placeholder="Ej: 2.1.0"
              className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-theme">
            <PremiumButton variant="ghost" onClick={() => setShowUpdateModal(false)} disabled={updateLoading}>
              Cancelar
            </PremiumButton>
            <PremiumButton onClick={handleApplyUpdate} loading={updateLoading}>
              {updateLoading ? "Aplicando..." : "Aplicar actualización"}
            </PremiumButton>
          </div>
        </div>
      </PremiumModal>
    </div>
  );
}