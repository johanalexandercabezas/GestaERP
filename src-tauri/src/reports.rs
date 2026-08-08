use printpdf::*;
use rusqlite::Connection;
use std::fs::File;
use std::io::BufWriter;

pub fn generate_sales_report(conn: &Connection, file_path: &str) -> Result<(), String> {
    // Obtener ventas recientes (últimas 200)
    let mut stmt = conn
        .prepare("SELECT created_at, payment_method, total FROM sales ORDER BY id DESC LIMIT 200")
        .map_err(|e| format!("Error al consultar ventas: {}", e))?;
    let sales = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
            ))
        })
        .map_err(|e| format!("Error al leer ventas: {}", e))?;

    let mut sales_data = Vec::new();
    for sale in sales {
        sales_data.push(sale.map_err(|e| format!("Error en fila: {}", e))?);
    }

    // Crear documento PDF
    let (doc, page1, layer1) =
        PdfDocument::new("Reporte de Ventas", Mm(210.0), Mm(297.0), "Layer 1");

    // Agregar la fuente Helvetica (viene incluida)
    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("Error al cargar fuente: {}", e))?;
    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| format!("Error al cargar fuente bold: {}", e))?;

    let current_layer = doc.get_page(page1).get_layer(layer1);

    // Título
    current_layer.use_text(
        "REPORTE DE VENTAS".to_string(),
        18.0,
        Mm(20.0),
        Mm(270.0),
        &font_bold,
    );

    // Fecha
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    current_layer.use_text(
        format!("Generado: {}", now),
        10.0,
        Mm(20.0),
        Mm(260.0),
        &font,
    );

    // Línea separadora
    let points = vec![
        (Point::new(Mm(20.0), Mm(255.0)), false),
        (Point::new(Mm(190.0), Mm(255.0)), false),
    ];
    let line = Line {
        points,
        is_closed: false,
    };
    current_layer.add_line(line);

    // Encabezados de tabla
    let y_start = 250.0;
    current_layer.use_text("Fecha", 10.0, Mm(20.0), Mm(y_start), &font_bold);
    current_layer.use_text("Metodo", 10.0, Mm(80.0), Mm(y_start), &font_bold);
    current_layer.use_text("Total", 10.0, Mm(140.0), Mm(y_start), &font_bold);

    // Datos
    let mut y = y_start - 7.0;
    for (date, method, total) in &sales_data {
        if y < 20.0 {
            break;
        }
        current_layer.use_text(date.clone(), 9.0, Mm(20.0), Mm(y), &font);
        current_layer.use_text(method.clone(), 9.0, Mm(80.0), Mm(y), &font);
        current_layer.use_text(format!("${:.2}", total), 9.0, Mm(140.0), Mm(y), &font);
        y -= 6.0;
    }

    // Guardar
    let file = File::create(file_path).map_err(|e| format!("Error al crear archivo PDF: {}", e))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| format!("Error al escribir PDF: {}", e))?;

    Ok(())
}
