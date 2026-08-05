// FIX AUDITORÍA (P1-Testing):
// Vitest 4.1.10 no inyecta correctamente `describe`/`it`/`expect` globalmente
// en este entorno (error "Cannot read properties of undefined (reading 'config')").
// Este setup importa explícitamente las funciones y las asigna a globalThis,
// garantizando que existan sin depender del transformador de Vitest.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Asignar a globalThis para que estén disponibles en todos los archivos de test
(globalThis as Record<string, unknown>).describe = describe;
(globalThis as Record<string, unknown>).it = it;
(globalThis as Record<string, unknown>).expect = expect;
(globalThis as Record<string, unknown>).beforeEach = beforeEach;
(globalThis as Record<string, unknown>).afterEach = afterEach;