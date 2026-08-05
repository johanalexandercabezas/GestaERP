import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * FIX SOPORTE: Abre URLs externas de forma segura en Tauri.
 * Usa el plugin oficial @tauri-apps/plugin-opener (opener) que abre
 * el navegador/sistema correcto para la URL. En navegador (dev) usa
 * window.open como fallback.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    // En Tauri, el plugin opener abre la URL con el programa asociado (navegador)
    await openUrl(url, undefined);
  } catch (e) {
    // Fallback para entorno de navegador (vite dev en navegador, no en Tauri)
    console.warn("[openExternal] opener falló, usando window.open", e);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Abre WhatsApp con un mensaje predefinido.
 */
export function whatsappSupport(phone = "573244826034", text = "Hola%2C%20necesito%20soporte%20con%20GestaERP"): Promise<void> {
  return openExternal(`https://wa.me/${phone}?text=${text}`);
}