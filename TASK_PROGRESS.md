# TASK_PROGRESS.md - Estado final

## ✅ COMPLETADO

### Módulo Servicios independiente
- [x] Menú "Servicios" con ícono Briefcase (siempre visible)
- [x] Vista ServicesView con Catálogo + Facturar
- [x] Servicios sin stock (solo nombre, costo interno, precio, IVA)
- [x] Backend: list_active_services registrado en Rust
- [x] Integrado con Dashboard, Caja, Reportes

### Botón COBRAR verde
- [x] bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white

### Limpiar historial (botón en BackupView)
- [x] Botón "Limpiar historial" en BackupView
- [x] Comando reset_database en Rust (src-tauri/src/commands/settings.rs)
- [x] Registrado en main.rs
- [x] Elimina ventas, compras, gastos, caja, movimientos, nóminas, calendario
- [x] Conserva licencia, productos, servicios, clientes, proveedores, empleados, admin
- [x] VACUUM automático

### Compilaciones exitosas
- [x] npm run build: 0 errores
- [x] cargo check: 0 errores
- [x] cargo test: 23/23 tests pasados
- [x] tsc --noEmit: 0 errores

## Pendientes originales (no implementados)
- Punto 3: Error al crear empleados
- Punto 1: Mayúsculas en todos los módulos
- Punto 8: Roles dinámicos (Admin/Vendedor/Asistente)
- Punto 6: Backups automáticos cada 5 min

## Sesión 2026-09-16 — Quick wins frontend (rama chore/frontend-quickwins, commit 91580be)

Ambiente: C:\Users\Jcabezas\Documents\GestaERP (clon partial blob:none).
⚠️ Este equipo NO tiene compilador nativo (sin MSVC/Build Tools): cargo check/test
no ejecutables localmente. Los "cargo" arriba vienen de CI/anteriores, no de hoy.

### Cambios
- [x] package.json: scripts `test` (vitest run) y `test:watch` (vitest)
- [x] package.json + lock: eliminada react-router-dom (sin uso en src/, verificado)
- [x] vite.config.ts: manualChunks de objeto -> función; único chunk `vendor`
  - Elimina warning "Circular chunk: vendor-data -> vendor-ui"
  - Elimina chunk vacío "vendor-react" (React no caía en su chunk en Vite 7)
  - index.js de entrada: 235 kB -> 21 kB (gzip 73 -> 7 kB)
  - Justificación: app Tauri = assets locales; la granularidad de caché HTTP
    de vendor-chunks no aporta; el code-splitting por vistas se conserva.

### Validación (este equipo)
- npm test: 22/22 OK (3 archivos, ~730 ms)
- npx tsc --noEmit: 0 errores
- npm run build: OK, sin warnings de chunks

### Pendiente inmediato
- [ ] Instalar VS 2022 Build Tools (workload C++) -> habilita cargo test y `tauri build` en este equipo
- [ ] Push de chore/frontend-quickwins y PR/merge a main
- [ ] Merge de fix/gestahelp-problems (ahead de main, sin divergencia)
- [ ] F0 higiene del repo (dist/ versionado, target/**, .gitattributes) — también arregla la lentitud de git status
- [ ] F1: licencias, updater, Wompi (ver INFORME_AUDITORIA_TECNICA_GESTAERP.md)

### Adenda 16/09 (misma sesión) — main fusionada y rama rebasada
- [x] main fusionada por fast-forward a 4f5fdef (fix/gestahelp-problems) y pushed.
      El push dispara ci.yml (cargo test en Ubuntu) -> valida el backend.
- [x] chore/frontend-quickwins rebasado sobre el nuevo main (rama re-creada,
      force-push). Los quick wins se portaron al nuevo vite.config.js.
- [x] FIX: el commit 4f5fdef tenía 3 regresiones de frontend:
  1. src/views/LicenseActivationView.tsx: interface Props vacía sin cerrar
     (borró accidentalmente onActivated y el cierre) -> restaurada.
  2. vite.config.ts quedó como stub "export {}" y VITEST lo cargaba antes
     que vite.config.js -> "config must export or return an object".
     Solución: stub eliminado; la config vive solo en vite.config.js.
  3. tsconfig.json perdió "types": ["vitest/globals"] y la referencia a
     tsconfig.node.json -> restaurados (tsconfig.node.json ahora apunta a
     vite.config.js).
- [x] Validación sobre main rebasado: npm test 42/42 (6 archivos, la rama fix
      aportó 20 tests nuevos), tsc --noEmit 0 errores (log vacío), build OK
      sin warnings de chunks (index 21 kB, vendor 784 kB).
- [ ] Pendiente: crear PR de chore/frontend-quickwins -> main.
- [ ] Nota entorno: este clon parcial (blob:none) hace lentos git status/commit
      y bloquea cambios de rama por target/** versionado. F0 lo arregla.
