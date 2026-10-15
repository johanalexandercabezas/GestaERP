import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { Download, ExternalLink, Info, Shield } from "lucide-react";
import { showToast } from "../components/ui/PremiumToast";
import PremiumButton from "../components/ui/PremiumButton";
import { requestUpdateCheck } from "../utils/updaterEvents";

export default function AcercaView() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("get_app_version")
      .then(setVersion)
      .catch((error: unknown) => {
        console.error("No se pudo consultar la versión de GestaERP:", error);
        showToast(`No se pudo consultar la versión: ${String(error)}`, "error");
      });
  }, []);

  return (
    <div className="flex-1 overflow-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-2xl"
      >
        <div className="mb-8 flex items-center gap-3">
          <Info size={28} className="text-accent" />
          <h1 className="text-2xl font-bold text-primary">Acerca de GestaERP</h1>
        </div>

        <div className="space-y-6 rounded-xl border border-theme bg-card p-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">Versión</h3>
            <p className="text-lg font-bold text-primary">{version ? `v${version}` : "Consultando…"}</p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">Desarrollador</h3>
            <p className="font-medium text-primary">Johan Alexander Cabezas Huila</p>
            <p className="text-sm text-secondary">GestaSoftTech - Colombia</p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">Soporte</h3>
            <p className="flex items-center gap-2 text-sm text-secondary">
              <ExternalLink size={14} />
              www.fundasopaco.org
            </p>
            <p className="mt-1 text-sm text-secondary">gestaerp@fundasopaco.org</p>
          </div>

          <div className="rounded-lg border border-theme bg-input/30 p-4">
            <div className="flex items-start gap-3">
              <Shield size={18} className="mt-0.5 text-success" />
              <div>
                <p className="text-sm font-medium text-primary">Base de datos cifrada</p>
                <p className="mt-1 text-xs text-secondary">
                  Tu información está protegida con cifrado SQLCipher vinculado a esta máquina.
                  Solo se puede acceder desde este equipo con esta instalación.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-theme pt-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">
              Actualizaciones
            </h3>
            <p className="mb-3 text-xs text-secondary">
              GestaERP busca actualizaciones firmadas al iniciar. Puedes elegir cuándo descargarlas;
              la instalación requiere tu confirmación y reinicia la aplicación.
            </p>
            <PremiumButton
              onClick={requestUpdateCheck}
              variant="secondary"
            >
              <Download size={16} />
              Buscar actualizaciones
            </PremiumButton>
          </div>

          <div className="border-t border-theme pt-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-secondary">Licencia</h3>
            <p className="text-xs text-secondary">
              MIT License - Software propietario de GestaSoftTech.
              El uso no autorizado, distribución o modificación sin licencia válida está prohibido.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
