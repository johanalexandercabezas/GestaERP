# 🏗️ Arquitectura de GestaERP v2.1

> **Versión:** 2.1.0  
> **Fecha:** Julio 2026  
> **Propósito:** Documento técnico de arquitectura para desarrolladores y operadores.

---

## Índice

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura de Capas](#3-arquitectura-de-capas)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Seguridad](#5-seguridad)
6. [API / Comandos Tauri](#6-api--comandos-tauri)
7. [Despliegue](#7-despliegue)
8. [Desarrollo](#8-desarrollo)
9. [Evolución Futura](#9-evolución-futura)

---

## 1. Visión General

GestaERP es un sistema ERP de escritorio para Windows/Linux/macOS, construido con:

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Zustand
- **Backend:** Rust (Tauri v2) con SQLite + SQLCipher
- **Comunicación:** Tauri IPC (invoke/commands)

### Principios de Diseño

| Principio | Implementación |
|---|---|
| **Offline-First** | Todos los datos en SQLite local. Sin dependencia de internet. |
| **Secure by Design** | Argon2id para contraseñas y clave de recuperación, SQLCipher y almacén seguro del SO. |
| **Defense in Depth** | Rate limiting, validación de inputs, CSP, auth guards. |
| **Preparado para SaaS** | `empresa_id` en todas las tablas, migración 007 lista. |
| **Clean Architecture** | Dominio separado de comandos Tauri, TransactionGuard DRY. |

---

## 2. Stack Tecnológico

### Frontend (React + TypeScript)

| Dependencia | Versión | Propósito |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 5.8 | Tipado estático |
| Tailwind CSS | 4 | CSS utility-first con design tokens |
| Zustand | 5 | State management (auth, theme, products) |
| Framer Motion | 12 | Animaciones y transiciones |
| Radix UI | 1.x | Componentes accesibles (dialog, select, tabs) |
| Recharts | 3 | Gráficos y visualización de datos |
| React Hook Form | 7 | Formularios con validación |
| Zod | 4 | Validación de schemas |
| Lucide React | 1.x | Iconografía consistente |

### Backend (Rust + Tauri v2)

| Dependencia | Versión | Propósito |
|---|---|---|
| Tauri | 2 | Framework desktop |
| rusqlite | 0.31 | Driver SQLite con bundled SQLCipher |
| argon2 | 0.5 | Hash de contraseñas (ganador de PHC) |
| hmac + sha2 | 0.12 / 0.10 | Firma de licencias |
| chrono | 0.4 | Manejo de fechas/horas |
| serde + serde_json | 1 | Serialización JSON |
| log + env_logger | 0.4 / 0.11 | Logging estructurado |
| dotenvy | 0.15 | Carga de variables de entorno |

---

## 3. Arquitectura de Capas

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19)                       │
│                                                              │
│  src/                                                        │
│  ├── components/        Componentes UI reutilizables         │
│  │   ├── ui/            PremiumButton, PremiumCard, etc.     │
│  │   ├── Sidebar.tsx    Navegación lateral                   │
│  │   └── ThemeToggle.tsx                                      │
│  ├── views/             30+ vistas (lazy-loaded)             │
│  ├── stores/            Zustand: auth, theme, products       │
│  ├── utils/             Validators, formatCurrency           │
│  └── types/             Interfaces TypeScript                │
│                                                              │
│  Comunicación: invoke<T>("comando", { args })                │
├──────────────────────────────────────────────────────────────┤
│                     BACKEND (Rust/Tauri)                      │
│                                                              │
│  src-tauri/src/                                              │
│  ├── main.rs            Entry point + AppState               │
│  ├── config.rs          Configuración centralizada (.env)    │
│  ├── db.rs              Esquema + migraciones + queries      │
│  ├── auth_guard.rs      require_auth / require_admin         │
│  ├── validation.rs      Validación de inputs (OWASP)         │
│  ├── rate_limiter.rs    Protección fuerza bruta              │
│  ├── transaction.rs     TransactionGuard (DRY)               │
│  ├── crypto.rs          Derivación Argon2id de clave portable│
│  ├── license.rs         HMAC-SHA256 para licencias           │
│  ├── audit.rs           Registro de auditoría                │
│  ├── commands/          28 módulos de comandos Tauri         │
│  │   ├── auth.rs        Login, logout, sesión                │
│  │   ├── products.rs    CRUD productos                       │
│  │   ├── sales.rs       Ventas con transacciones             │
│  │   └── ...            25+ módulos adicionales              │
│  └── [domain].rs        Lógica de negocio por dominio        │
│      ├── products.rs                                        │
│      ├── sales.rs       (TransactionGuard)                   │
│      ├── purchases.rs                                       │
│      └── ...                                                │
│                                                              │
│  Almacenamiento: SQLite + SQLCipher (encriptado)             │
└──────────────────────────────────────────────────────────────┘
```

### Flujo de una operación típica (ej: crear producto)

```
1. Frontend: usuario llena formulario
2. Frontend: invoke("create_product", { name, sku, price, ... })
3. Backend: commands/products.rs → create_product()
4. Backend: auth_guard::require_admin(&state)? (verifica rol)
5. Backend: validation::validate_name(&name, "nombre")? (sanitiza)
6. Backend: products::create_product(&conn, &product)? (INSERT)
7. Backend: audit::log(&conn, user_id, "products", id, "create", ...)? (audita)
8. Frontend: recibe respuesta y actualiza UI
```

---

## 4. Modelo de Datos

### Esquema (24 tablas)

| Tabla | Propósito | Timestamps | Soft Delete | empresa_id |
|---|---|---|---|---|
| `users` | Usuarios del sistema | ✅ | ✅ | ✅ |
| `products` | Productos e inventario | ✅ | ✅ | ✅ |
| `sales` + `sale_items` | Ventas y detalle | ✅ | ✅ | ✅ |
| `purchases` + `purchase_items` | Compras y detalle | ✅ | ✅ | ✅ |
| `suppliers` | Proveedores | ✅ | ✅ | ✅ |
| `customers` | Clientes | ✅ | ✅ | ✅ |
| `employees` | Empleados | ✅ | ✅ | ✅ |
| `payroll_entries` | Nómina | ✅ | ❌ | ❌ |
| `expenses` | Gastos | ✅ | ✅ | ✅ |
| `cash_registers` | Caja (apertura/cierre) | ✅ | ❌ | ✅ |
| `receivables` + `receivable_payments` | Cuentas por cobrar | ✅ | ✅ | ✅ |
| `payables` + `payable_payments` | Cuentas por pagar | ✅ | ❌ | ✅ |
| `inventory_movements` | Kardex | ✅ | ❌ | ✅ |
| `physical_counts` + `items` | Auditoría de stock | ✅ | ❌ | ✅ |
| `quotations` + `items` | Cotizaciones | ✅ | ❌ | ✅ |
| `licenses` | Licencias activas | ✅ | ❌ | ❌ |
| `implementation_codes` | Códigos de implementación | ✅ | ❌ | ❌ |
| `audit_logs` | Registro de auditoría | ✅ | ❌ | ❌ |
| `companies` | Empresas (multi-tenancy) | ✅ | ✅ | — |
| `settings` | Configuración key-value | ❌ | ❌ | ❌ |
| `period_closures` | Cierres contables | ✅ | ❌ | ❌ |
| `numbering_sequences` | Consecutivos | ✅ | ❌ | ❌ |
| `calendar_notes` | Notas de calendario | ✅ | ❌ | ❌ |
| `schema_migrations` | Control de versiones DB | ✅ | ❌ | ❌ |

### Índices (20+)

Optimizados para consultas frecuentes: `idx_products_active`, `idx_products_sku`, `idx_sales_created_at`, `idx_expenses_category`, `idx_receivables_status`, etc.

### Migraciones

Sistema de migraciones versionadas en `schema_migrations`:
- **001**: Esquema inicial (14 tablas)
- **002**: Cotizaciones
- **003**: Cuentas por pagar
- **004**: Auditoría
- **005**: Cierres contables
- **006**: Consecutivos
- **007**: Timestamps universales + Soft Delete + Empresas + Índices

---

## 5. Seguridad

### Autenticación
- **Argon2id** (ganador de Password Hashing Competition) para hash de contraseñas
- **Salt aleatorio** generado con `OsRng` (entropía del sistema operativo)
- **Rate limiting**: 5 intentos/minuto, bloqueo 15 minutos (en memoria)

### Autorización
- `require_auth()`: Verifica sesión activa
- `require_admin()`: Verifica rol `admin`
- `current_user_id()`: Obtiene ID del backend (anti-IDOR)
- **Frontend**: oculta menú según rol, backend es fuente de verdad

### Protección de Datos
- **SQLCipher**: La base se cifra con una clave Argon2id derivada de la frase de recuperación
- **Almacén seguro**: La clave se guarda en el keyring nativo y la frase no se persiste
- **Recuperación de cuenta**: tres respuestas aleatorias del administrador se guardan con Argon2id; cinco intentos incorrectos bloquean por 15 minutos, con contador persistente
- **Límite**: las preguntas personales son menos seguras que un código offline aleatorio de un solo uso; restablecer la contraseña de login no recupera la clave SQLCipher
- **Backups `.gbackup`**: snapshot SQLCipher y sal de recuperación; el servidor remoto recibe solo bytes cifrados
- **Portabilidad**: la restauración en otro equipo requiere el backup y su frase de recuperación
- **Ubicación local**: los nuevos `.gbackup` se guardan junto a `gestaerp.db` en `%APPDATA%\GestaERP` en Windows; recuperación descubre los archivos válidos allí y en la carpeta heredada `backups`
- **Snapshots/restauración**: se usa `sqlcipher_export` dentro de SQLCipher; la API SQLite `Backup` no admite bases cifradas
- **Variables de entorno**: Secretos (`GESTAERP_SECRET_KEY`) nunca en código fuente

### OWASP Top 10 Mitigaciones

| Riesgo | Mitigación |
|---|---|
| A01:2021 Broken Access Control | `auth_guard.rs` + `validation.rs` |
| A02:2021 Cryptographic Failures | Argon2id + SQLCipher + keyring nativo + frase portable |
| A03:2021 Injection | rusqlite parametrizado + `sanitize_sql_like()` |
| A04:2021 Insecure Design | Threat modeling, defense in depth |
| A05:2021 Security Misconfiguration | CSP en `tauri.conf.json` |
| A07:2021 Identification Failures | Rate limiting + validación de contraseñas |

---

## 6. API / Comandos Tauri

### Formato de Invocación

```typescript
// Frontend (TypeScript)
import { invoke } from "@tauri-apps/api/core";

const products = await invoke<Product[]>("list_products", {
  activeOnly: true,
});
```

### Categorías de Comandos

| Categoría | Comandos | Auth |
|---|---|---|
| **Autenticación** | `login`, `logout`, `get_current_user` | Público |
| **Dashboard** | `get_dashboard_data` | Auth |
| **Productos** | `create_product`, `list_products`, `update_product`, `delete_product`, `search_products` | Admin |
| **Ventas/POS** | `create_sale_v2`, `get_recent_sales` | Auth |
| **Compras** | `create_purchase`, `get_recent_purchases`, `check_invoice_duplicate` | Admin |
| **Proveedores** | CRUD completo | Auth |
| **Clientes** | CRUD completo | Auth |
| **Empleados** | CRUD completo | Admin |
| **Nómina** | `generate_payroll`, `get_payroll_history` | Admin |
| **Caja** | `open_cash_register`, `close_cash_register` | Auth |
| **Gastos** | `create_expense`, `list_expenses` | Admin |
| **Cuentas por Cobrar** | `list_receivables`, `register_payment` | Auth |
| **Cuentas por Pagar** | CRUD completo | Admin |
| **Cotizaciones** | CRUD completo + conversión a venta | Auth |
| **Inventario Físico** | Auditoría de stock | Admin |
| **Kardex** | Movimientos de inventario | Auth |
| **Reportes** | `generate_sales_report`, `export_report_to_csv` | Auth |
| **Backups** | CRUD + import/export | Admin |
| **Licencias** | `activate_license`, `activate_trial`, `get_license_status` | Público |
| **Configuración** | `get_setting`, `set_setting`, `save_business_info` | Admin |
| **Auditoría** | `get_audit_logs`, `get_audit_summary` | Admin |
| **Calendario** | CRUD de notas | Auth |
| **Usuarios** | CRUD + cambio de contraseña | Admin |

---

## 7. Despliegue

### Desarrollo Local

```bash
# Requisitos: Node.js 22+, Rust 1.85+, Tauri CLI
npm install
npm run tauri dev
```

### Producción (Windows/macOS/Linux)

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

### Docker

```bash
# Con secretos configurados en .env
cp .env.example .env
nano .env  # Configurar GESTAERP_SECRET_KEY

docker-compose up -d
```

### Variables de Entorno Críticas

```bash
GESTAERP_SECRET_KEY=  # Clave maestra para licencias (cambiar en producción)
GESTAERP_ENV=production
GESTAERP_LOG_LEVEL=info
```

La clave SQLCipher se deriva de una frase de recuperación definida por el usuario y se guarda en el almacén seguro nativo; no se configura mediante variables de entorno.

---

## 8. Desarrollo

### Estructura de Ramas (Git Flow)

```
main        ← Producción (commits estables)
  └─ develop ← Desarrollo activo
       └─ feature/* ← Nuevas funcionalidades
       └─ fix/*     ← Corrección de bugs
       └─ release/* ← Preparación de releases
```

### Commits Semánticos

```
feat:     Nueva funcionalidad
fix:      Corrección de bug
docs:     Documentación
style:    Formato, punto y coma, etc.
refactor: Refactorización sin cambio funcional
test:     Agregar o modificar tests
chore:    Tareas de mantenimiento
security: Mejoras de seguridad
```

### Tests

```bash
# Frontend
npm test                    # Ejecutar tests Vitest

# Backend
cd src-tauri && cargo test  # Ejecutar tests Rust
```

### CI/CD (GitHub Actions)

Pipeline automático en cada push/PR:
1. **Lint + Type Check** (TypeScript)
2. **Tests Unitarios** (Vitest)
3. **Build + Tests** (Rust)
4. **Auditoría de Seguridad** (npm audit + cargo audit)
5. **Verificación de Formato** (rustfmt)

---

## 9. Evolución Futura

### Roadmap Técnico

| Fase | Estado | Descripción |
|---|---|---|
| **FASE 0** | ✅ | Seguridad base: secretos, logging, Docker |
| **FASE 1** | ✅ | Base de datos: migraciones, índices, multi-tenancy |
| **FASE 2** | ✅ | Backend: DRY, TransactionGuard compartido |
| **FASE 3** | ✅ | Frontend: Code Splitting, UX premium, modo oscuro |
| **FASE 4** | ✅ | Seguridad: OWASP, rate limiting, CSP, validación |
| **FASE 5** | ✅ | Testing + CI/CD + Documentación |
| **SaaS** | 🔮 | API REST, autenticación OAuth, multi-tenancy real |
| **Móvil** | 🔮 | Tauri mobile (iOS/Android) |
| **IA** | 🔮 | Integración con LLMs para reportes inteligentes |

### Preparado para SaaS

- ✅ `empresa_id` en 14 tablas principales (default=1)
- ✅ Tabla `companies` creada
- ✅ Rate limiting configurable
- ✅ API versionada (arquitectura preparada)
- ✅ Logging estructurado listo para agregación centralizada
- ⬜ Row Level Security (RLS) — requiere migración a PostgreSQL
- ⬜ OAuth 2.0 / Supabase Auth — arquitectura desacoplada lista

---

> **Documento mantenido por GestaSoftTech S.A.S.**  
> Colombia, Julio 2026