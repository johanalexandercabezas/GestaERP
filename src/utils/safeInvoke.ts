/**
 * Safe invoke wrapper for Tauri commands.
 * Ensures ALL invoke() calls have proper error handling with Sonner toasts.
 * Prevents silent failures from Rust backend commands.
 */
import { invoke } from "@tauri-apps/api/core";
import { showToast } from "../components/ui/PremiumToast";

/**
 * Wraps a Tauri invoke call with automatic error handling via Sonner toast.
 * Use this instead of raw invoke() everywhere for consistent error UX.
 * 
 * @example
 * // Before (unsafe):
 * const data = await invoke("list_products");
 * 
 * // After (safe):
 * const data = await safeInvoke<Product[]>("list_products");
 * 
 * @example
 * // With typed error:
 * const data = await safeInvoke<Product[]>("list_products", {}, { 
 *   errorMessage: "Error al cargar productos" 
 * });
 */
export async function safeInvoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
  options?: {
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    silent?: boolean; // If true, don't show toast for errors
  }
): Promise<T | null> {
  try {
    const result = await invoke<T>(command, args);
    
    if (options?.successMessage) {
      showToast(options.successMessage, "success");
    }
    
    options?.onSuccess?.(result);
    return result;
  } catch (e) {
    const errorStr = String(e);
    
    if (!options?.silent) {
      showToast(
        options?.errorMessage || `Error: ${errorStr}`,
        "error"
      );
    }
    
    options?.onError?.(errorStr);
    return null;
  }
}

/**
 * Invokes a Tauri command and returns the raw result, but shows toast on failure.
 * Use when you need the raw response for further processing.
 */
export async function invokeWithError<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
  errorMessage?: string
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    const errorStr = String(e);
    showToast(errorMessage || `Error: ${errorStr}`, "error");
    throw e;
  }
}