import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function Dashboard() {
  const [businessName, setBusinessName] = useState("");
  const [ivaResponsable, setIvaResponsable] = useState(false);

  useEffect(() => {
    invoke<string>("get_setting", { key: "business_name" })
      .then(setBusinessName)
      .catch(() => setBusinessName("Sin nombre"));
    invoke<string>("get_setting", { key: "iva_responsable" })
      .then((val) => setIvaResponsable(val === "1"))
      .catch(() => {});
  }, []);

  const cards = [
    { label: "Ventas hoy", value: "$0", color: "text-green-600 dark:text-green-400", icon: "📈" },
    { label: "Productos en stock", value: "0", color: "text-blue-600 dark:text-blue-400", icon: "📦" },
    { label: "Caja actual", value: "$0", color: "text-yellow-600 dark:text-yellow-400", icon: "💰" },
    { label: "Alertas de stock", value: "0", color: "text-orange-600 dark:text-orange-400", icon: "⚠️" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Bienvenido, {businessName}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Resumen de la actividad del negocio
          {ivaResponsable && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              Responsable de IVA
            </span>
          )}
        </p>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Mensaje de bienvenida */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Primeros pasos
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Para comenzar a usar GestaERP, te recomendamos seguir estos pasos en orden:
        </p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-bold">1</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Agregar tus productos al catálogo</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-bold">2</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Abrir la caja para el día</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-bold">3</span>
            <span className="text-sm text-gray-700 dark:text-gray-300">Realizar tu primera venta en el POS</span>
          </div>
        </div>
      </div>
    </div>
  );
}