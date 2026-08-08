//! Motor 4 — Explicación.
//!
//! NO consulta datos del negocio: solo conoce GestaERP. Responde preguntas como
//! "¿Cómo funciona la depreciación?" o "¿Cómo hago un cierre de caja?" usando una
//! base de conocimiento interna embebida (100% sin conexión), coherente con la
//! documentación y FAQ del producto.

/// Una entrada de la base de conocimiento de GestaERP.
struct KbEntry {
    /// Palabras clave que activan esta entrada (minúsculas).
    keys: &'static [&'static str],
    /// Título corto mostrado como encabezado de la respuesta.
    title: &'static str,
    /// Explicación en lenguaje natural.
    answer: &'static str,
}

/// Primera mitad de la base de conocimiento (Motor 4).
const KB_A: &[KbEntry] = &[
    KbEntry {
        keys: &["cierre de caja", "cerrar caja", "arqueo"],
        title: "Cierre de caja",
        answer: "En **Caja**, usa la opción de cierre. El sistema compara el saldo inicial \
                 con el actual, valida los movimientos del día (ventas y gastos) y registra \
                 el cierre del período. Verifica que el conteo físico cuadre con el saldo.",
    },
    KbEntry {
        keys: &["depreciaci", "depreciar", "activo fijo"],
        title: "Depreciación",
        answer: "Reparte el costo de un activo fijo (máquina, vehículo, equipo) a lo largo \
                 de su vida útil. Registra el activo con su costo y vida útil; cada período \
                 se reconoce el gasto de depreciación. Define el método contable con tu \
                 contador antes del cierre.",
    },
    KbEntry {
        keys: &[
            "generar nomina",
            "generar la nomina",
            "calcular nomina",
            "nómina",
        ],
        title: "Nómina",
        answer: "En **Nómina** selecciona el período (año-mes), ingresa las horas extra y \
                 pulsa **Generar Nómina**. El sistema calcula salarios, deducciones y \
                 prestaciones de los empleados activos y lo guarda en el historial.",
    },
    KbEntry {
        keys: &[
            "registrar una compra",
            "registrar compra",
            "hacer una compra",
            "compras",
        ],
        title: "Compras",
        answer: "En **Compras** elige el proveedor, ingresa la factura, agrega productos con \
                 cantidad y costo, y pulsa **Registrar compra**. Valida duplicados y \
                 actualiza stock y kardex automáticamente.",
    },
    KbEntry {
        keys: &[
            "agregar producto",
            "nuevo producto",
            "crear producto",
            "editar precio",
            "precio",
        ],
        title: "Productos y precios",
        answer: "Los **productos** se crean al registrar una compra o en **Productos**. Solo \
                 el administrador edita precio, costo y stock mínimo. Lo mismo aplica a los \
                 **servicios**.",
    },
    KbEntry {
        keys: &[
            "punto de venta",
            "vender",
            "hacer una venta",
            "vender a credito",
            "venta a credito",
        ],
        title: "Punto de Venta (POS)",
        answer: "En el **POS** escribe el SKU o nombre, agrega el producto, ajusta cantidad y \
                 pulsa **Cobrar**. Elige el método de pago (Efectivo, Tarjeta, \
                 Transferencia o **Crédito** con cliente) y confirma: descuenta inventario.",
    },
    KbEntry {
        keys: &["cuenta por cobrar", "por cobrar", "cartera", "cobrar"],
        title: "Cuentas por Cobrar",
        answer: "Contiene las ventas a crédito con su saldo. Para recibir un abono usa \
                 **Registrar pago** (monto y método); el sistema reduce el saldo hasta \
                 saldar la cuenta.",
    },
    KbEntry {
        keys: &["cuenta por pagar", "por pagar", "pagar a proveedor"],
        title: "Cuentas por Pagar",
        answer: "Registra las deudas con proveedores (compras a crédito). Desde allí \
                 consultas el saldo y registras el pago cuando pagues la factura.",
    },
];

/// Segunda mitad de la base de conocimiento (Motor 4).
const KB_B: &[KbEntry] = &[
    KbEntry {
        keys: &["cotizaci", "presupuesto", "cotización"],
        title: "Cotizaciones",
        answer: "En **Cotizaciones** armas una propuesta con productos y cantidades sin \
                 descontar inventario. Puedes cambiar su estado y, cuando el cliente la \
                 acepte, **convertirla en venta** para facturarla y sí descontar stock.",
    },
    KbEntry {
        keys: &["kardex", "movimientos de inventario", "inventario", "stock"],
        title: "Kardex / Inventario",
        answer: "El **Kardex** registra cada movimiento de inventario (entradas por compra, \
                 salidas por venta, ajustes) por producto. Úsalo para auditar existencias y \
                 detectar diferencias de forma trazable.",
    },
    KbEntry {
        keys: &["backup", "respaldo", "copia de seguridad", "respaldar"],
        title: "Backups (respaldos)",
        answer: "En **Backups** creas una copia de seguridad de la base de datos, ves el \
                 historial, la exportas, importas o restauras. Solo el **administrador** \
                 puede borrar o restaurar respaldos.",
    },
    KbEntry {
        keys: &["auditor", "registro de acciones", "historial de cambios"],
        title: "Auditoría del sistema",
        answer: "El módulo **Auditoría** registra cada acción de los usuarios (crear, \
                 editar, eliminar) con el responsable, la fecha y los valores modificados. \
                 Puedes filtrar y exportar el historial. GestaHelp también registra aquí \
                 las acciones que ejecuta.",
    },
    KbEntry {
        keys: &["cierre contable", "cerrar periodo", "periodo contable"],
        title: "Cierre contable",
        answer: "El **Cierre Contable** sella el período mensual para evitar cambios \
                 retroactivos. Antes de cerrar, valida que estén soportados ventas, compras, \
                 gastos, nómina y caja. Solo el administrador lo ejecuta.",
    },
    KbEntry {
        keys: &[
            "crear cliente",
            "agregar cliente",
            "nuevo cliente",
            "clientes",
        ],
        title: "Clientes",
        answer: "Puedes crear un **cliente** en **Clientes** o pedírselo a GestaHelp (por \
                 ejemplo: *\"crea un cliente Comercial ABC con nit 901234567\"*), que pedirá \
                 confirmación antes de guardarlo. Se usan para ventas a crédito y reportes.",
    },
];

/// Tercera parte de la base de conocimiento (Motor 4).
const KB_C: &[KbEntry] = &[
    KbEntry {
        keys: &[
            "crear proveedor",
            "agregar proveedor",
            "nuevo proveedor",
            "proveedores",
        ],
        title: "Proveedores",
        answer: "En **Proveedores** registras tus proveedores con NIT, contacto, ciudad y \
                 condiciones de crédito (días de plazo y límite). Se vinculan a compras y \
                 cuentas por pagar.",
    },
    KbEntry {
        keys: &["usuario", "roles", "tipos de usuario", "permisos"],
        title: "Usuarios y roles",
        answer: "El sistema usa **roles** para controlar permisos: **admin** (acceso total) \
                 y roles operativos (cajero/vendedor). El backend valida el rol en cada \
                 comando, así que GestaHelp también respeta esos permisos al actuar.",
    },
    KbEntry {
        keys: &["reporte", "reportes", "exportar", "generar reporte"],
        title: "Reportes",
        answer: "En **Reportes** generas informes de ventas, compras y productos, y puedes \
                 **exportarlos a CSV** para abrirlos en Excel. El período se define al \
                 generar el reporte.",
    },
    KbEntry {
        keys: &["servicio", "servicios", "facturar servicio"],
        title: "Servicios",
        answer: "Los **servicios** se gestionan en **Servicios** y se facturan en el Punto \
                 de Venta como cualquier ítem. Se identifican por su unidad (HORA, DÍA o \
                 SERVICIO).",
    },
    KbEntry {
        keys: &["licencia", "activar licencia", "plan", "trial", "prueba"],
        title: "Licencia y plan",
        answer: "El sistema funciona por **licencia**: puedes activar una licencia oficial, \
                 un período de **prueba (trial)** o verificar el estado actual del plan, los \
                 días restantes y los módulos habilitados.",
    },
];

/// Recorre toda la base de conocimiento (A + B + C).
fn all_kb() -> impl Iterator<Item = &'static KbEntry> {
    KB_A.iter().chain(KB_B.iter()).chain(KB_C.iter())
}

/// Texto de orientación cuando no se encontró una explicación concreta.
pub fn hint() -> String {
    "No encontré una explicación para eso (todavía). Puedo explicarte sobre: **cierre de \
     caja**, **depreciación**, **nómina**, **compras**, **productos/precio**, **punto de \
     venta**, **crédito**, **cuentas por cobrar/pagar**, **cotizaciones**, **kardex**, \
     **backups**, **auditoría**, **cierre contable**, **clientes**, **proveedores**, \
     **roles**, **reportes**, **servicios** o **licencia**. ¿Sobre cuál te amplío?"
        .to_string()
}

/// Busca la explicación más relevante para el mensaje del usuario.
pub fn explain(message: &str) -> Option<String> {
    let m = message.to_lowercase();

    let mut best: Option<(&KbEntry, usize)> = None; // (entrada, coincidencias)
    for entry in all_kb() {
        let hits = entry.keys.iter().filter(|k| m.contains(**k)).count();
        if hits > 0 {
            match &best {
                Some((_, prev)) if hits <= *prev => {}
                _ => best = Some((entry, hits)),
            }
        }
    }

    best.map(|(entry, _)| format!("📘 **{}**\n\n{}", entry.title, entry.answer))
}
