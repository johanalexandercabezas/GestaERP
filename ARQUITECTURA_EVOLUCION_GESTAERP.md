# ARQUITECTURA Y ROADMAP DE EVOLUCIÓN - GestaERP
**Versión:** 1.0.0 → 2.0.0  
**Fecha:** 22 de junio de 2026  
**Filosofía:** "El ERP colombiano simple, rápido y económico para emprendedores y pequeñas empresas"

---

## 1. ARQUITECTURA ACTUAL (v1.0.0)

### Stack Confirmado
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion
- **Backend:** Tauri 2.x + Rust
- **Database:** SQLite (rusqlite 0.31)
- **Encriptación:** Clave derivada por máquina (HMAC-SHA256) - arquitectura lista para SQLCipher
- **Tests:** 26 unit tests (Rust)

### Módulos Existentes (19)
1. Dashboard
2. Productos
3. Servicios
4. Punto de Venta
5. Compras
6. Proveedores
7. Clientes
8. Empleados
9. Nómina
10. Caja
11. Gastos
12. Cuentas por Cobrar
13. Reportes
14. Auditoría de Stock
15. Backups
16. Calendario
17. Usuarios
18. Licencias
19. Configuración

---

## 2. ROADMAP DE VERSIONES

### v1.0.0 (ACTUAL) - Producción
- ✅ Módulos base funcionando
- ✅ Seguridad básica (auth guard, clave derivada)
- ✅ Tema claro/oscuro
- ✅ Soporte WhatsApp
- ✅ Build limpio, 26 tests

### v1.1 (COMPLETADO)
**Objetivo:** Mejoras de usabilidad sin cambiar arquitectura

1. **Cotizaciones** (Requerimiento 1)
   - Estados: Borrador, Enviada, Aprobada, Rechazada, Vencida
   - Campos: consecutivo, fechas, cliente, items, IVA, descuento, observaciones
   - Exportar PDF, duplicar, convertir a venta
   - Tablas: `quotations`, `quotation_items`
   - Comandos: 6 (create, list, get, update, delete, convert_to_sale)
   - Vista: `QuotationsView.tsx`

2. **Mejoras UI/UX**
   - Mejora de contrastes tema claro/oscuro
   - Timeout de inactividad configurable (15-30 min)
   - Icono .ico para instalador NSIS
   - Firma de código (certificado EV)

### v1.2 (COMPLETADO)
**Objetivo:** Gestión financiera ampliada

1. **Cuentas por Pagar** (Requerimiento 2)
   - Tabla: `payables`
   - Estados: Pendiente, Parcial, Pagada, Vencida
   - Campos: proveedor, número factura, fechas, valor, abono, saldo, observaciones
   - Alertas de vencimiento
   - Dashboard resumen
   - Comandos: 6 (create, list, get, update, register_payment, get_summary)
   - Vista: `PayablesView.tsx`

2. **Kardex** (Requerimiento 3)
   - Tabla: `inventory_movements` (ya existe, ampliar)
   - Movimientos: Compra, Venta, Ajuste, Condensación, Devolución
   - Filtros por producto y fechas
   - Exportar CSV, imprimir
   - Comandos: 4 (list, get_by_product, export_csv, print)
   - Vista: `KardexView.tsx`

### v2.0 (COMPLETADO)
**Objetivo:** Trazabilidad, seguridad y escalabilidad

1. **Auditoría Real** (Requerimiento 4)
   - Tabla: `audit_logs`
   - Registro automático de cambios en tablas críticas
   - Filtros: usuario, fecha, acción
   - Exportar
   - Vista: `AuditView.tsx`

2. **Cierre Contable** (Requerimiento 5)
   - Tabla: `period_closures`
   - Estados: Abierto, Cerrado
   - Bloqueo de edición en periodos cerrados
   - Solo admin puede reabrir
   - Integración con módulos existentes

3. **Consecutivos Independientes** (Requerimiento 6)
   - Tabla: `numbering_sequences`
   - Configuración por módulo: prefijo, longitud, número actual
   - Validaciones de unicidad
   - CRUD completo

4. **SQLCipher** (Requerimiento 7)
   - Migración a `bundled-sqlcipher-vendored-openssl`
   - Encriptación real de BD
   - Backup/restore cifrado
   - Contraseña maestra opcional
   - **PLAN MIGRATORIO DOCUMENTADO**

5. **Tests Ampliados** (Requerimiento 8)
   - 80+ unit tests
   - 20+ integración
   - 10+ migraciones
   - 15+ permisos
   - 10+ backup
   - **Total objetivo: 150+ tests**

---

## 3. DISEÑO DE BASE DE DATOS - TABLAS NUEVAS

### 3.1 Cotizaciones

```sql
CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consecutive TEXT NOT NULL UNIQUE,           -- COT-000001
    date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    due_date TEXT,
    customer_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_doc TEXT,
    items TEXT NOT NULL,                        -- JSON array
    subtotal REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    iva_amount REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    observations TEXT,
    status TEXT NOT NULL DEFAULT 'Borrador',    -- Borrador, Enviada, Aprobada, Rechazada, Vencida
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quotation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quotation_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    iva_percent REAL NOT NULL DEFAULT 0,
    discount_percent REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
```

### 3.2 Cuentas por Pagar

```sql
CREATE TABLE IF NOT EXISTS payables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    balance REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pendiente',   -- Pendiente, Parcial, Pagada, Vencida
    observations TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payable_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payable_id INTEGER NOT NULL,
    payment_date TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Efectivo',
    reference TEXT,
    observations TEXT,
    created_by INTEGER NOT NULL,
    FOREIGN KEY (payable_id) REFERENCES payables(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_payables_status ON payables(status);
CREATE INDEX IF NOT EXISTS idx_payables_supplier ON payables(supplier_id);
```

### 3.3 Auditoría (audit_logs)

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    action TEXT NOT NULL,                       -- INSERT, UPDATE, DELETE
    old_values TEXT,                            -- JSON
    new_values TEXT,                            -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    machine_name TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_at);
```

### 3.4 Cierre Contable

```sql
CREATE TABLE IF NOT EXISTS period_closures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
    year INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Abierto',     -- Abierto, Cerrado
    closed_by INTEGER,
    closed_at TEXT,
    observations TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (closed_by) REFERENCES users(id),
    UNIQUE(month, year)
);
```

### 3.5 Consecutivos

```sql
CREATE TABLE IF NOT EXISTS numbering_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT NOT NULL UNIQUE,                -- ventas, cotizaciones, compras, recibos, egresos
    prefix TEXT NOT NULL,                       -- FV-, COT-, COM-, RC-, EG-
    length INTEGER NOT NULL DEFAULT 6,
    current_number INTEGER NOT NULL DEFAULT 1,
    padding_char TEXT NOT NULL DEFAULT '0',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

---

## 4. MIGRACIONES

```sql
-- Migration 002: Cotizaciones
CREATE TABLE IF NOT EXISTS quotations (...);
CREATE TABLE IF NOT EXISTS quotation_items (...);

-- Migration 003: Cuentas por Pagar
CREATE TABLE IF NOT EXISTS payables (...);
CREATE TABLE IF NOT EXISTS payable_payments (...);

-- Migration 004: Auditoría
CREATE TABLE IF NOT EXISTS audit_logs (...);

-- Migration 005: Cierre Contable
CREATE TABLE IF NOT EXISTS period_closures (...);

-- Migration 006: Consecutivos
CREATE TABLE IF NOT EXISTS numbering_sequences (...);
INSERT OR IGNORE INTO numbering_sequences (module, prefix, current_number) VALUES
  ('ventas', 'FV-', 1),
  ('cotizaciones', 'COT-', 1),
  ('compras', 'COM-', 1),
  ('recibos', 'RC-', 1),
  ('egresos', 'EG-', 1);
```

---

## 5. COMANDOS RUST NECESARIOS

### Cotizaciones
```rust
create_quotation(state, consecutive, date, due_date, customer_id, customer_name, customer_doc, items, subtotal, iva_percent, iva_amount, discount_percent, discount_amount, total, observations) -> Result<i64>
list_quotations(state, status_filter?) -> Result<Vec<Quotation>>
get_quotation(state, id) -> Result<Quotation>
update_quotation(state, id, ...) -> Result<()>
delete_quotation(state, id) -> Result<()>
convert_quotation_to_sale(state, quotation_id, payment_method) -> Result<i64> // sale_id
print_quotation(state, id) -> Result<String> // path PDF/ticket
```

### Cuentas por Pagar
```rust
create_payable(state, supplier_id, supplier_name, invoice_number, invoice_date, due_date, total_amount, observations) -> Result<i64>
list_payables(state, status_filter?, supplier_id?) -> Result<Vec<Payable>>
get_payable(state, id) -> Result<Payable>
register_payable_payment(state, payable_id, amount, payment_method, reference, observations) -> Result<()>
get_payables_summary(state) -> Result<{total_pending, total_partial, total_paid, total_overdue}>
```

### Kardex
```rust
get_inventory_movements(state, product_id?, start_date?, end_date?) -> Result<Vec<InventoryMovement>>
get_product_kardex(state, product_id, start_date?, end_date?) -> Result<Vec<KardexItem>>
export_kardex_csv(state, product_id?, start_date?, end_date?) -> Result<{csv, filename}>
print_kardex(state, product_id?, start_date?, end_date?) -> Result<String>
```

### Auditoría
```rust
get_audit_logs(state, table_name?, user_id?, start_date?, end_date?, action?) -> Result<Vec<AuditLog>>
get_audit_log_by_record(state, table_name, record_id) -> Result<Vec<AuditLog>>
export_audit_csv(state, filters) -> Result<{csv, filename}>
```

### Cierre Contable
```rust
get_period_closure(state, month, year) -> Result<Option<PeriodClosure>>
close_period(state, month, year, observations) -> Result<()>
reopen_period(state, month, year, observations) -> Result<()>
get_open_periods(state) -> Result<Vec<PeriodClosure>>
is_period_closed(state, month, year) -> Result<bool>
```

### Consecutivos
```rust
get_next_number(state, module) -> Result<{consecutive, number}>
update_numbering_sequence(state, module, prefix, length, current_number) -> Result<()>
list_numbering_sequences(state) -> Result<Vec<NumberingSequence>>
reset_numbering_sequence(state, module) -> Result<()>
```

---

## 6. VISTAS REACT

### Cotizaciones
```tsx
// src/views/QuotationsView.tsx
- Lista de cotizaciones con filtros (estado, fecha, cliente)
- Formulario creación/edición
- Modal de items con búsqueda de productos
- Botones: Imprimir, Duplicar, Enviar, Convertir a Venta
- Estados visuales con colores
```

### Cuentas por Pagar
```tsx
// src/views/PayablesView.tsx
- Tabla de cuentas por pagar con filtros
- Modal de abono/pago parcial
- Dashboard resumen (Total pendiente, vencido, pagado)
- Alertas de vencimiento (5 días antes)
- Historial de pagos por factura
```

### Kardex
```tsx
// src/views/KardexView.tsx
- Selector de producto con búsqueda
- Selector de fechas
- Tabla de movimientos (fecha, documento, tipo, entrada, salida, saldo)
- Botones: Exportar CSV, Imprimir
- Resumen: entradas, salidas, saldo final
```

### Auditoría
```tsx
// src/views/AuditView.tsx
- Filtros: usuario, tabla, acción, fechas
- Tabla de cambios: quién, qué, cuándo
- Modal detalle con old_values vs new_values (diff visual)
- Exportar CSV
```

### Cierre Contable
```tsx
// src/views/PeriodClosuresView.tsx
- Selector de mes/año
- Estado: Abierto/Cerrado
- Botón Cerrar (solo admin, solo periodo abierto)
- Botón Reabrir (solo admin, periodo cerrado)
- Lista de periodos cerrados
- Validación de bloques (no permitir ediciones en periodo cerrado)
```

### Consecutivos
```tsx
// src/views/NumberingView.tsx
- Tabla: Módulo, Prefijo, Longitud, Número actual, Siguiente
- Formulario edición inline
- Botón Reiniciar
- Vista previa: FV-000001, COT-000003, etc.
```

---

## 7. PLAN DE IMPLEMENTACIÓN

### Fase 1: v1.1 (2-3 semanas)
1. **Cotizaciones**
   - Migración: 002
   - Backend: 5 comandos
   - Frontend: QuotationsView + formularios
   - Tests: 15 unit tests + 3 integración
   - Documentación: manual de cotizaciones

2. **Mejoras UI/UX**
   - Timeout configurable (settings)
   - Icono .ico
   - Mejora contrastes (revisión exhaustiva)

### Fase 2: v1.2 (3-4 semanas)
1. **Cuentas por Pagar**
   - Migración: 003
   - Backend: 6 comandos
   - Frontend: PayablesView + dashboard resumen
   - Tests: 12 unit tests + 2 integración

2. **Kardex Ampliado**
   - Usar tabla existente `inventory_movements`
   - Backend: 4 comandos (nuevos filtros, export, print)
   - Frontend: KardexView
   - Tests: 10 unit tests + 2 integración

### Fase 3: v2.0 (6-8 semanas)
1. **Auditoría**
   - Migración: 004
   - Backend: 3 comandos + triggers automáticos
   - Frontend: AuditView
   - Tests: 20 unit tests + 3 integración

2. **Cierre Contable**
   - Migración: 005
   - Backend: 4 comandos + validaciones en módulos
   - Frontend: PeriodClosuresView
   - Tests: 15 unit tests + 3 integración

3. **Consecutivos**
   - Migración: 006
   - Backend: 6 comandos
   - Frontend: NumberingView
   - Tests: 10 unit tests

4. **SQLCipher (Plan)**
   - Documento de migración
   - Script de conversión de BD existente
   - Pruebas de compatibilidad
   - NO implementar hasta v2.1

5. **Tests Ampliados**
   - 80+ unit tests
   - 20+ integración
   - 10+ migraciones
   - 15+ permisos
   - 10+ backup

---

## 8. CAMBIOS REQUERIDOS POR MÓDULO

### Backend (Rust)
- **commands/**: +24 comandos nuevos
- **db.rs**: +6 funciones de consulta
- **Migraciones**: 006 nuevas
- **Triggers/Auditoría**: triggers automáticos en tablas críticas
- **Auth**: middlewares existentes reutilizables

### Frontend (React/TS)
- **views/**: +6 vistas nuevas (Quotations, Payables, Kardex, Audit, PeriodClosures, Numbering)
- **components/**: reutilizables (PremiumModal, PremiumButton, PremiumSelect)
- **types/**: interfaces nuevas para cada entidad
- **stores/**: posible store para configuración de consecutivos

### Base de Datos
- **Tablas nuevas:** 8 (quotations, quotation_items, payables, payable_payments, audit_logs, period_closures, numbering_sequences)
- **Tablas ampliadas:** inventory_movements (ya existe, agregar campos)
- **Migraciones:** 006 nuevas versionadas
- **Backups:** compatibles, no rompen existentes

---

## 9. CASOS DE PRUEBA PRINCIPALES

### Cotizaciones
1. ✅ Crear cotización borrador
2. ✅ Enviar cotización (cambia estado)
3. ✅ Aprobar cotización
4. ✅ Rechazar cotización
5. ✅ Convertir cotización aprobada en venta
6. ✅ Duplicar cotización
7. ✅ Imprimir cotización PDF
8. ✅ Exportar cotización
9. ✅ Validar consecutivo único
10. ✅ Validar cliente existe

### Cuentas por Pagar
1. ✅ Registrar factura proveedor
2. ✅ Registrar abono parcial
3. ✅ Marcar como pagada
4. ✅ Marcar como vencida (automático)
5. ✅ Alertas de vencimiento próximas
6. ✅ Filtros por estado/proveedor
7. ✅ Dashboard resumen

### Kardex
1. ✅ Listar movimientos por producto
2. ✅ Filtrar por fechas
3. ✅ Calcular saldos correctamente
4. ✅ Exportar CSV
5. ✅ Imprimir kardex

### Auditoría
1. ✅ Registrar INSERT en productos
2. ✅ Registrar UPDATE en clientes
3. ✅ Registrar DELETE en gastos
4. ✅ Filtrar por usuario
5. ✅ Filtrar por tabla
6. ✅ Exportar CSV
7. ✅ Ver diff old vs new

### Cierre Contable
1. ✅ Cerrar periodo (no admin: denegado)
2. ✅ Reabrir periodo (solo admin)
3. ✅ Validar periodo cerrado antes de crear venta
4. ✅ Validar periodo cerrado antes de crear compra
5. ✅ Listar periodos cerrados

### Consecutivos
1. ✅ Obtener siguiente número ventas: FV-000001
2. ✅ Modificar prefijo y longitud
3. ✅ Reiniciar numeración
4. ✅ Validar consecutivo único en ventas
5. ✅ Configurar todos los módulos

---

## 10. RIESGOS Y MITIGACIONES

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Complejidad Cotizaciones | Medio | Modular, estados simples, flujo claros |
| Performance Kardex | Bajo | Índices en producto + fecha, paginación |
| Auditoría storage | Medio | Podar logs antiguos (>1 año) con job automático |
| Cierre contable bloqueos | Alto | Mensajes claros, override admin, logging |
| SQLCipher migración | Alto | Plan detallado, script, pruebas exhaustivas |
| Tests insuficientes | Medio | Meta 150+ tests, CI/CD obligatorio |

---

## 11. RECOMENDACIONES ARQUITECTÓNICAS

### 11.1 Principios
- **KISS:** Mantener simples los módulos
- **YAGNI:** No implementar funcionalidades no solicitadas
- **Offline-first:** Todo funciona sin internet
- **Performance:** Carga <2s, respuesta <200ms
- **UX Minimalista:** Máximo 3 clics para cualquier acción común

### 11.2 Estructura de Commits
```
feat: agregar módulo cotizaciones
fix: corregir cálculo IVA en cotizaciones
docs: actualizar AUDITORIA_COMPLETA_GESTAERP.md
test: agregar 15 tests para cotizaciones
refactor: extraer lógica de numeración a helper
```

### 11.3 CI/CD (Futuro)
- GitHub Actions
- Build automático en push
- Tests automáticos (cargo test + npm run build)
- Release automático con NSIS
- Firma de código automática (si hay certificado)

---

## 12. CRONOGRAMA ESTIMADO

| Versión | Duración | Hitos Principales |
|---------|----------|-------------------|
| v1.1 | 2-3 semanas | Cotizaciones + Mejoras UI/UX |
| v1.2 | 3-4 semanas | Cuentas por Pagar + Kardex |
| v2.0 | 6-8 semanas | Auditoría + Cierre Contable + Consecutivos + Tests |
| v2.1 | 2-3 semanas | SQLCipher (cuando cliente lo solicite) |

**Total estimado:** 13-18 semanas (~3-4.5 meses)

---

## 13. ENTREGABLES POR FASE

### v1.1
- [ ] Código fuente actualizado
- [ ] Migraciones aplicadas
- [ ] Tests unitarios (15+)
- [ ] Manual de usuario: Cotizaciones
- [ ] Build firmado (si hay certificado)
- [ ] Notas de release

### v1.2
- [ ] Código fuente actualizado
- [ ] Migraciones aplicadas
- [ ] Tests unitarios (12+)
- [ ] Manual de usuario: Cuentas por Pagar + Kardex
- [ ] Build firmado

### v2.0
- [ ] Código fuente actualizado
- [ ] 150+ tests (unit + integración + migración + permisos + backup)
- [ ] Plan de migración SQLCipher documentado
- [ ] Manuales de usuario: Auditoría, Cierre Contable, Consecutivos
- [ ] Build firmado
- [ ] Documentación técnica completa

---

## 14. CONCLUSIÓN

**GestaERP v1.0.0** es una base sólida para evolucionar.

La arquitectura actual permite:
- ✅ Agregar módulos sin romper existentes
- ✅ Migraciones versionadas
- ✅ Tests unitarios robustos
- ✅ Código limpio y mantenible

**Próximo paso recomendado:** Implementar **Cotizaciones (v1.1)** porque:
1. Agrega valor comercial inmediato
2. Flujo lógico hacia ventas
3. Completa el ciclo: Cotización → Venta → Factura
4. Complejidad moderada

**Filosofía mantenida:**
- Simple y rápido
- Offline-first
- Bajo consumo
- Curva de aprendizaje mínima
- Enfocado en emprendedores colombianos

---

**Arquitecto:** Cline (IA Assistant)  
**Fecha:** 22 de junio de 2026  
**Estado:** APROBADO PARA EJECUCIÓN