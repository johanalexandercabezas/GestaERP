# 🧪 Estrategia de Testing — GestaERP

## Estado actual (22 tests unitarios frontend)

| Archivo | Tests | Cobertura |
|---|---|---|
| `src/__tests__/formatCurrency.test.ts` | 7 | Formateo de moneda COP |
| `src/__tests__/validators.test.ts` | 11 | Validación de contraseñas, username, email |
| `src/__tests__/authBootstrap.test.ts` | 4 | Flujo de autenticación inicial |

## Lo que falta (AUD-017)

### 🔴 Crítico — sin cobertura
- **Login / Logout**: rate limiting, Argon2id, bloqueo de cuenta
- **Licencias**: validación HMAC, activación, trial, rate limiting
- **Caja**: apertura, cierre, arqueo, conciliación
- **Ventas**: creación, cálculos de totales, métodos de pago
- **reset_database**: integridad post-reset, protección del admin

### 🟠 Alta prioridad
- **CRUD Productos**: validación de SKU duplicado, stock
- **CRUD Clientes/Proveedores**: validación de documentos
- **Migraciones**: ejecución secuencial 001→008 en BD fresca
- **Backups**: creación, restauración, integridad

### 🟡 Media prioridad
- **Dashboard**: estructura de datos, métricas calculadas
- **Config**: carga de .env, validación de secretos en producción
- **GestaHelp**: intents, tools de lectura/escritura, permisos

### 🟢 Baja prioridad
- Componentes UI (PremiumCard, PremiumModal, etc.)
- Vistas (renderizado, navegación, estados loading/empty/error)

## Cómo ejecutar

```bash
# Frontend
npx vitest run

# Backend
cd src-tauri && cargo test

# Backend — solo migraciones
cd src-tauri && cargo test -- db::tests
```

## Convenciones

- Tests unitarios de backend: `#[cfg(test)] mod tests { ... }` en cada módulo
- Tests unitarios de frontend: `src/__tests__/*.test.ts`
- Tests de integración backend: `src-tauri/tests/` (a crear)
- Usar `rusqlite::Connection::open_in_memory()` para tests de BD
- No modificar `.env` real en tests; usar `env::set_var` / `env::remove_var`
