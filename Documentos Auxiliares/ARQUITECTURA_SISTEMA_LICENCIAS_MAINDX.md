# Arquitectura del Sistema de Licencias — GestaERP ↔ MaindX

> **Versión:** 2.4.0  
> **Fecha:** Julio 2026  
> **Autor:** GestaSoftTech — CEO Johan Alexander Cabezas  
> **Propósito:** Documento de integración para el software MaindX (gestión externa de licencias, pagos y activaciones de GestaERP)

---

## Índice

1. [Visión General del Flujo de Negocio](#1-visión-general-del-flujo-de-negocio)
2. [Diagrama de Flujo](#2-diagrama-de-flujo)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [API / Comandos Tauri](#4-api--comandos-tauri)
5. [Sistema de Códigos de Aceptación (Implementación)](#5-sistema-de-códigos-de-aceptación-implementación)
6. [Sistema de Claves de Licencia (HMAC)](#6-sistema-de-claves-de-licencia-hmac)
7. [Configuración de Planes](#7-configuración-de-planes)
8. [Integración con MaindX](#8-integración-con-maindx)
9. [Consideraciones Técnicas](#9-consideraciones-técnicas)

---

## 1. Visión General del Flujo de Negocio

GestaERP ofrece dos rutas de activación mutuamente excluyentes:

### Ruta A — Plan ONG / Fundación (Simplificada)
```
Términos → Selección "ONG" → Verificación WhatsApp → Pago mensualidad ($5.000/mes) → Clave de licencia → ERP activo
```
- **Sin costo de implementación**
- Requiere verificación de entidad sin ánimo de lucro (cédula RL + RUT)
- 1 usuario, módulos básicos

### Ruta B — Planes Corporativos (Básico / Intermedio / Avanzado)
```
Términos → Selección "Corporativo" → Pago implementación ($30.000 único) → [MaindX verifica pago] → Código de aceptación → Validación → Selección plan → Pago mensualidad → Clave de licencia → ERP activo
```
- **Con costo de implementación único de $30.000 COP**
- Requiere código de aceptación generado por GestaSoftTech tras verificar el pago
- De 1 a 6 usuarios según plan

### Ruta C — Trial (15 días)
```
Términos → "Probar gratis" → Trial 15 días → ERP activo (todas las funciones)
```
- Sin costo, sin tarjeta, 2 usuarios máximo
- No requiere pagos ni códigos

---

## 2. Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GestaERP — Flujo de Licencias v2.4                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌────────────────────┐                                     │
│  │ Términos │───▶│ Selección Tipo Plan │                                     │
│  └──────────┘    └──────┬─────────────┘                                     │
│                         │                                                    │
│           ┌─────────────┼─────────────┐                                      │
│           ▼              │              ▼                                     │
│   ┌───────────┐         │      ┌────────────────┐                            │
│   │    ONG    │         │      │  Corporativo   │                            │
│   │ Fundación │         │      │ (Bás/Int/Avz)  │                            │
│   └─────┬─────┘         │      └───────┬────────┘                            │
│         │               │              │                                      │
│         ▼               │              ▼                                      │
│  ┌──────────────┐       │      ┌──────────────────────┐                       │
│  │ Verificación │       │      │ Pago Implementación  │                       │
│  │  WhatsApp    │       │      │   $30.000 COP (Wompi)│                       │
│  │ (24h)        │       │      └──────────┬───────────┘                       │
│  └──────┬───────┘       │                 │                                    │
│         │               │                 ▼                                    │
│         ▼               │      ┌──────────────────────┐                       │
│  ┌──────────────┐       │      │ MaindX verifica pago │                       │
│  │ Pago Mensual │       │      │ y genera código de   │                       │
│  │  $5.000 COP  │       │      │ aceptación (6 chars) │                       │
│  │  (Wompi)     │       │      └──────────┬───────────┘                       │
│  └──────┬───────┘       │                 │                                    │
│         │               │                 ▼                                    │
│         ▼               │      ┌──────────────────────┐                       │
│  ┌──────────────┐       │      │ Validar código en    │                       │
│  │ Clave ONG    │       │      │ GestaERP             │                       │
│  │ GESTA-ONG-XX │       │      └──────────┬───────────┘                       │
│  └──────┬───────┘       │                 │                                    │
│         │               │                 ▼                                    │
│         ▼               │      ┌──────────────────────┐                       │
│  ┌──────────────┐       │      │ Seleccionar Plan     │                       │
│  │   ERP Activo │       │      │ (Bás/Int/Avz)        │                       │
│  └──────────────┘       │      └──────────┬───────────┘                       │
│                         │                 │                                    │
│                         │                 ▼                                    │
│                         │      ┌──────────────────────┐                       │
│                         │      │ Pago Mensualidad     │                       │
│                         │      │ $14.900 - $69.900    │                       │
│                         │      │ (Wompi)              │                       │
│                         │      └──────────┬───────────┘                       │
│                         │                 │                                    │
│                         │                 ▼                                    │
│                         │      ┌──────────────────────┐                       │
│                         │      │ Clave Corporativa    │                       │
│                         │      │ GESTA-BAS/INT/AVZ-XX │                       │
│                         │      └──────────┬───────────┘                       │
│                         │                 │                                    │
│                         │                 ▼                                    │
│                         │      ┌──────────────────────┐                       │
│                         └──────│   ERP Activo         │                       │
│                                └──────────────────────┘                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────┐                       │
│  │             Trial 15 días (alternativo)            │                       │
│  │  Términos → "Probar" → ERP Activo 15 días          │                       │
│  └────────────────────────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de Datos

### 3.1 Tabla: `licenses` (Licencias activas)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | Auto-incremental |
| `license_key` | TEXT UNIQUE | Clave formato `GESTA-PLAN-XXXXXX` |
| `plan` | TEXT | `ong`, `basico`, `intermedio`, `avanzado`, `trial` |
| `activated_at` | TEXT | Fecha/hora de activación (datetime) |
| `expires_at` | TEXT | Fecha de expiración (30 días desde activación, 15 para trial) |
| `max_users` | INTEGER | Máximo de usuarios (1-6 según plan) |
| `active` | INTEGER | 1 = activa, 0 = inactiva |
| `machine_id` | TEXT | Hash del hardware (binding de máquina) |
| `revoked` | INTEGER | 0 = vigente, 1 = revocada |
| `activation_count` | INTEGER | Contador de activaciones (máx. 3) |

### 3.2 Tabla: `implementation_codes` (Códigos de aceptación) ⭐ NUEVA v2.4

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | Auto-incremental |
| `code` | TEXT UNIQUE | Código alfanumérico de 6 caracteres (ej: `A1B2C3`) |
| `generated_at` | TEXT | Fecha/hora de generación |
| `validated_at` | TEXT | Fecha/hora de validación (NULL si no se ha validado) |
| `active` | INTEGER | 1 = activo, 0 = inactivo |

**Reglas de negocio:**
- Solo puede existir UN código activo por instalación
- Si `validated_at` no es NULL → la implementación está pagada
- El código es case-insensitive (se normaliza a uppercase)
- Una vez validado, no se puede generar otro código

### 3.3 Configuración: `settings`

| Key | Value | Descripción |
|---|---|---|
| `license_plan` | `none` / `ong` / `basico` / `intermedio` / `avanzado` / `trial` | Plan actual (legacy) |

---

## 4. API / Comandos Tauri

Todos los comandos se invocan desde el frontend (React/TypeScript) vía `invoke()` de Tauri.

### 4.1 Licencias

#### `get_license_status`
```typescript
// Entrada: ninguna
// Salida: LicenseInfo
invoke<LicenseInfo>("get_license_status")
```
```typescript
interface LicenseInfo {
  plan: string;           // "ong" | "basico" | "intermedio" | "avanzado" | "trial" | "none"
  activated: boolean;
  expires_at: string;     // "YYYY-MM-DD"
  max_users: number;
  days_left: number;
  modules: string[];      // ["dashboard", "products", ...]
}
```

#### `activate_license`
```typescript
// Entrada: { key: string, plan: string }
// Salida: LicenseInfo
invoke<LicenseInfo>("activate_license", { key: "GESTA-INT-ABC123", plan: "intermedio" })
```
- La clave se valida con HMAC-SHA256 contra el plan especificado
- Ventana de validez: 5 días desde la generación
- Límite: 3 activaciones por clave (misma máquina no cuenta)
- Al activar, desactiva automáticamente cualquier licencia previa

#### `activate_trial`
```typescript
// Entrada: ninguna
// Salida: LicenseInfo
invoke<LicenseInfo>("activate_trial")
```
- 15 días, 2 usuarios máx, todos los módulos
- Solo si NO hay licencia activa

#### `revoke_license`
```typescript
// Entrada: { license_key: string }
// Salida: void
invoke<void>("revoke_license", { license_key: "GESTA-INT-ABC123" })
```
- Requiere rol admin
- Marca `revoked = 1` y `active = 0`

### 4.2 Implementación (Códigos de Aceptación) ⭐ NUEVO v2.4

#### `get_implementation_status`
```typescript
invoke<ImplementationStatus>("get_implementation_status")
```
```typescript
interface ImplementationStatus {
  is_paid: boolean;          // true si validated_at no es null
  code: string;              // código de 6 chars (vacío si no se ha generado)
  generated_at: string;      // fecha de generación
  validated_at: string | null; // null si no se ha validado
}
```

#### `generate_implementation_code`
```typescript
invoke<ImplementationStatus>("generate_implementation_code")
```
- **Precondición:** No debe existir un código ya validado
- Si ya hay un código activo sin validar, devuelve el mismo
- Si no hay código, genera uno nuevo de 6 caracteres
- **Usar cuando:** El cliente afirma haber pagado la implementación y MaindX quiere generar el código

#### `validate_implementation_code`
```typescript
invoke<ImplementationStatus>("validate_implementation_code", { code: "A1B2C3" })
```
- Case-insensitive
- Marca `validated_at` con la fecha actual
- **Usar cuando:** El cliente ingresa el código en GestaERP para desbloquear planes corporativos

#### `is_implementation_paid`
```typescript
invoke<boolean>("is_implementation_paid")
```
- Booleano rápido, no requiere parámetros

---

## 5. Sistema de Códigos de Aceptación (Implementación)

### Propósito
Garantizar que solo clientes que hayan pagado la implementación ($30.000 COP) puedan acceder a los planes corporativos. El plan ONG está exento.

### Flujo de responsabilidades

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Cliente │     │  MaindX  │     │ GestaERP │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     │ 1. Paga $30K   │                │
     │   en Wompi     │                │
     │───────────────▶│                │
     │                │                │
     │                │ 2. Verifica    │
     │                │   pago Wompi   │
     │                │                │
     │                │ 3. generate_   │
     │                │   implementation_code()
     │                │───────────────▶│
     │                │                │
     │                │ ◀─────────────│
     │                │   { code: "A1B2C3" }
     │                │                │
     │ 4. Entrega     │                │
     │   código       │                │
     │◀───────────────│                │
     │                │                │
     │ 5. Ingresa     │                │
     │   código en    │                │
     │   GestaERP     │                │
     │───────────────────────────────▶│
     │                │                │
     │                │                │ 6. validate_
     │                │                │   implementation_code()
     │                │                │
     │                │                │ 7. ✅ Desbloquea
     │                │                │   planes corporativos
     │                │                │
```

### Generación del código
```rust
// implementation.rs
fn generate_code() -> String {
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    // 6 caracteres alfanuméricos (sin I, O, 0, 1 para evitar confusiones)
    let mut rng = rand::thread_rng();
    (0..6).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
}
```
- **Longitud:** 6 caracteres
- **Alfabeto:** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excluye I, O, 0, 1)
- **Formato de ejemplo:** `A3B7K9`, `X2M5N8`, `Q4R6T2`
- **Case-insensitive:** se acepta mayúscula o minúscula

---

## 6. Sistema de Claves de Licencia (HMAC)

### Algoritmo
```
CLAVE = "GESTA-" + PREFIJO_PLAN + "-" + FIRMA_HMAC

Donde:
  PREFIJO_PLAN = plan_to_prefix(plan)
    "basico"     → "BAS"
    "intermedio" → "INT"
    "avanzado"   → "AVZ"
    "ong"        → "ONG"

  FIRMA_HMAC = HMAC-SHA256(SECRET_KEY, plan + "|" + LICENSE_DAYS + "|" + fecha_emision)
    truncado a 8 bytes, codificado en HEX uppercase
  
  SECRET_KEY = "GestaERP_2026_SecureKey_Colombia" (fijo)
  LICENSE_DAYS = 30
```

### Ejemplos de claves válidas
| Plan | Clave de ejemplo |
|---|---|
| ONG | `GESTA-ONG-A1B2C3D4` |
| Básico | `GESTA-BAS-E5F6G7H8` |
| Intermedio | `GESTA-INT-I9J0K1L2` |
| Avanzado | `GESTA-AVZ-M3N4O5P6` |

### Herramienta de generación: `generate_keys`
```bash
# Desde src-tauri/
cargo run --bin generate_keys <plan> [dias]

# Ejemplos:
cargo run --bin generate_keys ong       # Clave ONG, 30 días
cargo run --bin generate_keys basico 90 # Clave Básico, 90 días
cargo run --bin generate_keys avanzado  # Clave Avanzado, 30 días
```

### Herramienta de gestión: `keygen`
```bash
cargo run --bin keygen

# Comandos disponibles:
#   generar   - Emitir nueva licencia
#   listar    - Listar licencias activas
#   revocar   - Revocar licencia
#   validar   - Validar clave
#   planes    - Ver planes disponibles
```

---

## 7. Configuración de Planes

### Tabla de Planes y Precios (COP)

| Plan | Precio Mensual | Implementación | Usuarios | Módulos |
|---|---|---|---|---|
| **ONG** | $5.000 | $0 (exento) | 1 | dashboard, products, pos, purchases, suppliers, expenses, receivables, physical_inventory, services, quotations, kardex, calendar |
| **Básico** | $14.900 | $30.000 | 1 | Mismos que ONG |
| **Intermedio** ⭐ | $29.900 | $30.000 | 2 | Todo Básico + payroll, cash, reports, backups, users + customers, employees, payables |
| **Avanzado** | $69.900 | $30.000 | 6 | Todo Intermedio + customization, support, audit, accounting |
| **Trial** | $0 | $0 | 2 | Todos excepto audit, accounting, users, physical_inventory (15 días) |

### Enlaces de Pago Wompi

| Concepto | URL |
|---|---|
| Implementación | `https://checkout.wompi.co/l/6x5IkU` |
| Plan ONG | `https://checkout.wompi.co/l/ywc2wk` |
| Plan Básico | `https://checkout.wompi.co/l/EzuS2v` |
| Plan Intermedio | `https://checkout.wompi.co/l/zyPfYP` |
| Plan Avanzado | `https://checkout.wompi.co/l/BYbEP6` |

### WhatsApp de Verificación ONG
- Número: `+57 324 482 6034`
- Link: `https://wa.me/573244826034`
- Documentos requeridos: Cédula RL + RUT actualizado
- Tiempo de verificación: hasta 24 horas

---

## 8. Integración con MaindX

### 8.1 ¿Qué debe hacer MaindX?

MaindX actúa como el **orquestador externo** de pagos y generación de códigos/licencias:

```
┌──────────────────────────────────────────────────────────┐
│                      MaindX                              │
│                                                          │
│  1. Recibir notificación de pago (Wompi webhook)        │
│  2. Verificar el monto y concepto del pago              │
│  3. Según el tipo de pago:                              │
│     ├── Implementación ($30.000)                        │
│     │   └── generate_implementation_code() → entregar   │
│     │       código al cliente (email/WhatsApp)          │
│     └── Mensualidad ($5.000 - $69.900)                  │
│         └── generate_keys (plan, dias) → generar clave  │
│             de licencia GESTA-PLAN-XXXXXX → entregar    │
│             al cliente                                  │
│  4. Registrar la transacción en BD propia               │
│  5. (Opcional) Notificar a GestaSoftTech                │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Endpoints que MaindX debe exponer (sugeridos)

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/api/payments/webhook` | Recibir webhook de Wompi |
| `POST` | `/api/licenses/generate` | Generar clave para un plan |
| `POST` | `/api/implementation/generate-code` | Generar código de aceptación |
| `GET` | `/api/licenses/list` | Listar licencias emitidas |
| `POST` | `/api/licenses/revoke` | Revocar una licencia |
| `GET` | `/api/implementation/status/:code` | Verificar estado de código |

### 8.3 Scripts de generación que MaindX debe invocar

MaindX puede llamar directamente a las herramientas de GestaERP:

```bash
# Generar clave de licencia
cd /ruta/a/GestaERP/src-tauri
cargo run --bin generate_keys intermedio 30
# Output: GESTA-INT-XXXXXXXX

# Generar clave con días personalizados
cargo run --bin generate_keys basico 90
# Output: GESTA-BAS-XXXXXXXX

# Gestionar licencias (CRUD)
cargo run --bin keygen generar   # Interactivo
cargo run --bin keygen listar    # Lista todas
cargo run --bin keygen revocar <codigo>
```

### 8.4 O integración directa vía Rust (si MaindX también es Rust)

```rust
// MaindX puede importar el módulo license de GestaERP
use gestaerp::license;

// Generar clave (requiere acceso a SECRET_KEY)
let key = license::generate_test_key("intermedio", 0);

// O usar el binario generate_keys como CLI
let output = Command::new("cargo")
    .args(["run", "--bin", "generate_keys", "intermedio", "30"])
    .current_dir("/ruta/GestaERP/src-tauri")
    .output()?;
```

### 8.5 Formato de entrega al cliente

Cuando MaindX entregue el código/clave al cliente, se sugiere este formato:

```
═══════════════════════════════════════════
  GestaERP — Activación de Licencia
═══════════════════════════════════════════

Plan: Intermedio
Mensualidad: $29.900 COP/mes
Duración: 30 días

Tu clave de activación:
  GESTA-INT-A1B2C3D4

Instrucciones:
1. Abre GestaERP
2. Ve a la sección de Licencias
3. Ingresa la clave de activación
4. ¡Listo! Tu ERP estará activo.

¿Dudas? Contáctanos:
  WhatsApp: +57 324 482 6034
  Email: soporte@gestasofttech.com

═══════════════════════════════════════════
```

---

## 9. Consideraciones Técnicas

### 9.1 Seguridad
- **SECRET_KEY** (`GestaERP_2026_SecureKey_Colombia`): Debe mantenerse privada. Es la clave maestra para generar/validar licencias.
- **Machine binding**: Cada licencia se vincula al hash del hardware. Límite de 3 activaciones por clave.
- **Revocación**: Las licencias revocadas no pueden reactivarse en otra máquina.

### 9.2 Migraciones de Base de Datos
- **Versión actual del esquema:** 10
- La migración 010 (v2.4) crea `implementation_codes`
- Las migraciones se ejecutan automáticamente al iniciar GestaERP

### 9.3 Compatibilidad
- **Plataforma:** Windows, macOS, Linux (Tauri v2)
- **Base de datos:** SQLite con SQLCipher (encriptada por máquina)
- **Frontend:** React 18 + TypeScript + Tailwind CSS 4 + Framer Motion

### 9.4 Precios (actualizados Julio 2026)

| Concepto | Valor COP |
|---|---|
| Implementación (pago único) | $30.000 |
| Plan ONG (mensual) | $5.000 |
| Plan Básico (mensual) | $14.900 |
| Plan Intermedio (mensual) | $29.900 |
| Plan Avanzado (mensual) | $69.900 |
| Trial (15 días) | $0 |

---

## Apéndice A: Archivos Relevantes

| Archivo | Descripción |
|---|---|
| `src-tauri/src/license.rs` | Lógica de activación, validación HMAC, revocación |
| `src-tauri/src/implementation.rs` | Sistema de códigos de aceptación (NUEVO v2.4) |
| `src-tauri/src/commands/licenses.rs` | Comandos Tauri (API) para licencias + implementación |
| `src-tauri/src/db.rs` | Migraciones SQL (ver MIGRATION_010_IMPLEMENTATION) |
| `src-tauri/generate_keys.rs` | Binario CLI para generar claves |
| `src-tauri/keygen/src/main.rs` | Herramienta de gestión de licencias (CRUD) |
| `src/views/LicenseActivationView.tsx` | UI del flujo de activación (React) |

## Apéndice B: Variables de Entorno / Constantes

```typescript
// Frontend (React)
const IMPLEMENTATION_COST = 30_000;           // COP
const IMPLEMENTATION_WOMPI_LINK = "https://checkout.wompi.co/l/6x5IkU";
const ONG_WHATSAPP = "https://wa.me/573244826034";

const ONG_PLAN = {
  id: "ong", price: 5_000, setupFee: 0,
  wompiLink: "https://checkout.wompi.co/l/ywc2wk"
};

const CORP_PLANS = [
  { id: "basico",     price: 14_900, wompiLink: "https://checkout.wompi.co/l/EzuS2v" },
  { id: "intermedio", price: 29_900, wompiLink: "https://checkout.wompi.co/l/zyPfYP" },
  { id: "avanzado",   price: 69_900, wompiLink: "https://checkout.wompi.co/l/BYbEP6" },
];
```

```rust
// Backend (Rust)
const SECRET_KEY: &[u8] = b"GestaERP_2026_SecureKey_Colombia";
const LICENSE_DAYS: i64 = 30;
const TRIAL_DAYS: i64 = 15;
const MAX_ACTIVATIONS: i64 = 3;
```

---

> **Documento generado automáticamente desde el código fuente de GestaERP v1.0.1.**  
> Para actualizaciones, revisar los archivos listados en el Apéndice A.