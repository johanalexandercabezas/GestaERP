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
- 🔒 **SQLCipher** local, recuperación portable y backups cifrados con cola de sincronización remota
- 📅 **Calendario** de notas internas
- 🔐 **Sistema de Licencias** por plan (Básico / Intermedio / Avanzado / ONG)
- 🤖 **GestaHelp** — asistente local por reglas, guías del ERP y consultas controladas (beta; no es un LLM)

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, Framer Motion, Radix UI, Zustand, React Hook Form + Zod, Recharts |
| **Backend** | Rust (Tauri 2), rusqlite + SQLCipher, Argon2id, HMAC-SHA256 |
| **Build** | Vite + Tauri bundler (`.msi` / `.exe`) |
| **CI/CD** | GitHub Actions — lint, tests, release automático, Tauri Updater |
| **Desktop** | Windows 10/11 (x64), instalador `.msi` |

## 📋 Requisitos

### Desarrollo local
- **Node.js** ≥ 22
- **Rust** ≥ 1.80 (con `rustup`)
- **Windows SDK** (Visual Studio Build Tools con C++)
- **Strawberry Perl** en `PATH` (requerido por OpenSSL vendorizado de SQLCipher en Windows)

### Instalación para desarrollo

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd GestaERP

# 2. Configurar la clave de firma de licencias en .env
#    La frase de recuperación de SQLCipher se define al iniciar la aplicación

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
| `GESTAERP_ENV` | `development` o `production` | — |
| `GESTAERP_LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error` | — |

`GESTAERP_SECRET_KEY` es obligatoria; las otras variables tienen valores por defecto. La clave SQLCipher se deriva de la frase de recuperación y se almacena en el almacén seguro del sistema operativo. Guarda la frase fuera del equipo: no es recuperable si se pierde.

Durante la configuración inicial, el administrador responde tres preguntas aleatorias. Las respuestas se guardan como hashes Argon2id dentro de la base SQLCipher; cinco respuestas incorrectas en cinco minutos bloquean la recuperación por 15 minutos, incluso si se reinicia la aplicación. Esto solo restablece la contraseña de inicio de sesión, no la frase SQLCipher. Las preguntas personales son una medida provisional y pueden adivinarse: una alternativa offline más sólida y sin costo de servicio es un código aleatorio de recuperación de un solo uso, guardado fuera del equipo.

Los backups `.gbackup` contienen una instantánea SQLCipher más la sal de recuperación; el servidor remoto recibe únicamente el artefacto cifrado. La API configurable del servidor debe implementar `POST /v1/backups`, `GET /v1/backups` y `GET /v1/backups/{filename}` con Bearer auth e idempotencia por nombre de archivo.

Los backups se crean en la misma carpeta de datos que `gestaerp.db` (en Windows, `%APPDATA%\GestaERP`). Al recuperar en un equipo nuevo, copia allí el archivo `.gbackup`; GestaERP detecta y valida los backups disponibles para seleccionarlos en la pantalla de recuperación. Los archivos de la ubicación anterior `%APPDATA%\GestaERP\backups` también se buscan para mantener compatibilidad.

Los backups `.db` creados por versiones anteriores pueden estar en texto plano; la pantalla los marca como **SIN CIFRAR** y no permite exportarlos ni restaurarlos. Verifica un `.gbackup` nuevo antes de eliminar cualquier archivo histórico.

## ⚖️ Aceptación y privacidad (borrador provisional)

Antes de continuar, tanto instalaciones nuevas como existentes deben aceptar la versión vigente de los términos y reconocer por separado el aviso de privacidad. El backend vuelve a exigir ambas constancias antes de activar una prueba o licencia. La migración 10 guarda un comprobante local con tipo y versión del documento, fecha/hora del equipo, versión de la aplicación y método; no verifica la identidad, no almacena IP ni constituye sello de tiempo o firma electrónica certificada. Los documentos se versionan en `src/legal/policies.ts`; si cambian sustancialmente, actualiza las versiones en `src-tauri/src/legal.rs`. La migración 11 añade el historial local de trazabilidad por titular.

Los textos identifican provisionalmente a Johan Alexander Cabezas Huila y a Gestasofttech Colombia, cuyo registro legal está en trámite. La identificación tributaria informada debe verificarse antes de distribuir una versión comercial. Los textos requieren revisión por un abogado colombiano; la pantalla lo informa expresamente y no constituye certificación de cumplimiento legal.

La aceptación del operador **no** es la autorización de clientes, empleados u otros titulares. Cada negocio debe definir sus finalidades, publicar su propia política, obtener las autorizaciones que correspondan y atender los derechos de los titulares. En el funcionamiento actual, la base y GestaHelp se procesan localmente; el envío de backups remotos es opcional y cifra el archivo en el cliente. Antes de habilitarlo comercialmente, deben definirse y documentarse el encargado, ubicación, retención, contrato de transmisión/transferencia y procedimiento de incidentes del proveedor remoto.

Los formularios de clientes, proveedores y empleados registran una trazabilidad versionada de la base declarada, finalidad, fecha, medio/referencia y usuario que la captura. Los registros históricos quedan marcados como pendientes hasta que se revisen y completen; la aplicación no valida la veracidad del soporte ni decide por el negocio cuál base legal aplica. Cada cambio de la constancia crea una versión y conserva las anteriores; guardar sin cambios no crea duplicados. La hora de captura usa el reloj local del equipo representado en UTC y no es un sello de tiempo confiable.

GestaHelp usa reglas y herramientas locales con permisos backend y confirmación para escrituras. No consulta un modelo generativo externo y no envía el texto del chat a la nube. Sus respuestas pueden ser incompletas; no sustituyen asesoría contable, laboral, tributaria ni jurídica.

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
├── assistant/          ← GestaHelp (reglas, guías y herramientas locales)
├── legal.rs            ← Versionado y comprobantes locales de aceptación
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
