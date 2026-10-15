import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SetupProps {
  onComplete?: () => void;
}

export default function Setup({ onComplete }: SetupProps) {
  const [businessName, setBusinessName] = useState("");
  const [nit, setNit] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [ivaResponsable, setIvaResponsable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<Record<string, string>>("get_all_settings")
      .then((settings) => {
        if (settings.business_name) setBusinessName(settings.business_name);
        if (settings.nit) setNit(settings.nit.replace(/\D/g, ""));
        if (settings.address) setAddress(settings.address);
        if (settings.phone) setPhone(settings.phone.replace(/\D/g, ""));
        if (settings.city) setCity(settings.city);
        if (settings.iva_responsable === "1") setIvaResponsable(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await invoke("save_setting", { key: "business_name", value: businessName.trim() });
      await invoke("save_setting", { key: "nit", value: nit.trim() });
      await invoke("save_setting", { key: "address", value: address.trim() });
      await invoke("save_setting", { key: "phone", value: phone.trim() });
      await invoke("save_setting", { key: "city", value: city.trim() });
      await invoke("save_setting", { key: "iva_responsable", value: ivaResponsable ? "1" : "0" });
      setSaved(true);
    } catch (err) {
      console.error("Error al guardar:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        Cargando configuración...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Encabezado */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Configuración del negocio
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Estos datos aparecerán en facturas, reportes y documentos del sistema.
        </p>
      </div>

      {/* Formulario */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        {/* Nombre del negocio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Nombre del negocio <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Ej: Minimercado Don Pedro"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* NIT y Ciudad en una fila */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              NIT
            </label>
            <input
              type="text"
              value={nit}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              onChange={(e) => setNit(e.target.value.replace(/\D/g, ""))}
              placeholder="Ej: 9001234567"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Ciudad
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ej: Bogotá"
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>

        {/* Dirección */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Dirección
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ej: Cra 15 #23-45, Local 3"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Teléfono
          </label>
          <input
            type="text"
            value={phone}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={15}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            placeholder="Ej: 6012345678"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>

        {/* Responsable de IVA */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <input
            type="checkbox"
            id="iva"
            checked={ivaResponsable}
            onChange={(e) => setIvaResponsable(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <label
              htmlFor="iva"
              className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
            >
              Responsable de IVA
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Marca esta opción si según tu RUT eres responsable de IVA. Esto activará el cálculo
              del 19% en ventas y compras.
            </p>
          </div>
        </div>

        {/* Botones */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving || !businessName.trim()}
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            {saving
              ? "Guardando..."
              : saved
                ? "✅ Guardado correctamente"
                : "Guardar configuración"}
          </button>

          {saved && onComplete && (
            <button
              onClick={onComplete}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Continuar al sistema →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
