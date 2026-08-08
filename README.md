# 🇨🇴 GestaERP — ERP Local para Negocios Colombianos

Aplicación de escritorio **offline-first** para la gestión empresarial de pequeñas y medianas empresas en Colombia. Construida con **Tauri 2 + React 19 + TypeScript + Rust + SQLite**.

## ✨ Funcionalidades

- 📊 **Dashboard** con KPIs, gráficos de ventas y productos estrella
- 📦 **Productos y Servicios** — inventario con stock mínimo, búsqueda, categorización
- 🛒 **Punto de Venta (POS)** — ventas rápidas, múltiples métodos de pago, ticket impreso
- 📋 **Cotizaciones** — presupuestos convertibles a ventas
- 📥 **Compras** a proveedores con control de facturas duplicadas
- 🏢 **Clientes y Proveedores** — gestión de contactos, créditos
- 💵 **Caja** — apertura/cierre, arqueo, conciliación de métodos de pago
- 💰 **Cartera (Cuentas por Cobrar)** — abonos parciales, saldos
- 🧾 **Gastos** — registro de egresos categorizados
- 📑 **Cuentas por Pagar** a proveedores
- 👥 **Empleados y Nómina** — liquidación, prestaciones, reportes
- 🏭 **Kárdex / Inventario Físico** — movimientos, conteos, ajustes
- 📈 **Reportes** de ventas exportables a CSV
- 🔒 **Backups** locales con restauración
- 📅 **Calendario** de notas internas
- 🔐 **Sistema de Licencias** por plan (Básico / Intermedio / Avanzado / ONG)
- 🤖 **GestaHelp** — asistente digital interno (beta)

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, Framer Motion, Radix UI, Zustand, React Hook Form + Zod, Recharts |
| **Backend** | Rust (Tauri 2), rusqlite (SQLite), Argon2id, HMAC-SHA256 |
| **Build** | Vite + Tauri bundler (`.msi` / `.exe`) |
| **CI/CD** | GitHub Actions — lint, tests, release automático, Tauri Updater |
| **Desktop** | Windows 10/11 (x64), instalador `.msi` |

## 📋 Requisitos

### Desarrollo local
- **Node.js** ≥ 22
- **Rust** ≥ 1.80 (con `rustup`)
- **Windows SDK** (Visual Studio Build Tools con C++)

### Instalación para desarrollo

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd GestaERP

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con valores aleatorios seguros

# 3. Instalar dependencias frontend
npm install

# 4. Ejecutar en modo desarrollo
npm run tauri dev

# 5. Build de producción
npm run tauri build
```

## 🔐 Variables de entorno obligatorias

| Variable | Propósito | Longitud mínima |
|---|---|---|
| `GESTAERP_SECRET_KEY` | Clave maestra para firmar licencias | 32 caracteres |
| `GESTAERP_DB_PEPPER` | Pepper para derivar clave de BD por máquina | 20 caracteres |
| `GESTAERP_ENV` | `development` o `production` | — |
| `GESTAERP_LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error` | — |

**⚠️ Sin estas variables la aplicación aborta al iniciar.** Genera valores aleatorios seguros, no uses palabras comunes.

## 🏗️ Arquitectura

```
src/                    ← Frontend React + TypeScript
├── App.tsx             ← Layout principal, routing, licencia, login
├── views/              ← Vistas por módulo (Dashboard, POS, etc.)
├── components/ui/      ← Componentes reutilizables
├── stores/             ← Estado global (Zustand)
├── types/              ← Interfaces TypeScript compartidas
└── utils/              ← Utilidades (formato moneda, validadores)

src-tauri/src/          ← Backend Rust
├── main.rs             ← Punto de entrada, registro de comandos
├── db.rs               ← Conexión SQLite, migraciones, queries
├── commands/           ← Comandos Tauri (IPC frontend→backend)
│   ├── auth.rs         ← Login/logout/sesión
│   ├── products.rs     ← CRUD productos
│   ├── sales.rs        ← Ventas
│   └── ...             ← Módulos restantes
├── assistant/          ← GestaHelp (asistente IA)
├── license.rs          ← Validación de licencias (HMAC)
├── crypto.rs           ← Derivación de clave de BD por máquina
└── auth_guard.rs       ← Guards de autenticación/rol
```

## 🧪 Testing

```bash
# Frontend (Vitest)
npx vitest run

# Backend (Rust)
cd src-tauri && cargo test
```

## 📦 Release

Los releases se generan automáticamente con GitHub Actions al pushear un tag `v*`. El instalador se firma con la clave privada almacenada en los secrets del repositorio.

## 📝 Licencia

Software propietario. Todos los derechos reservados © GestaSoftTech.

---

**¿Soporte?** WhatsApp: [+57 3244826034](https://wa.me/573244826034) | [GitHub Issues](https://github.com/GestaSoftTech/GestaERP/issues)
