use crate::payroll::{BenefitLoad, Employee, PayrollEntry};
use std::fs;
use std::path::Path;

pub fn generate_payroll_pdf(
    period: &str,
    entries: &[PayrollEntry],
    employees: &[Employee],
    benefits: &[BenefitLoad],
    business_name: &str,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    let dir = Path::new(output_dir).join(period);
    fs::create_dir_all(&dir).map_err(|e| format!("Error al crear carpeta: {}", e))?;

    let mut files = Vec::new();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 1. Consolidado
    let mut consolidated = format!(
        "═══════════════════════════════════════\n  REPORTE DE NÓMINA - {}\n  {}\n═══════════════════════════════════════\n\n",
        period, now
    );
    consolidated.push_str(&format!(
        "{:30} {:>10} {:>10} {:>12} {:>12}\n",
        "Empleado", "Devengado", "Salud", "Pensión", "Neto"
    ));
    consolidated.push_str(&format!("{}\n", "─".repeat(86)));
    for entry in entries {
        let emp = employees
            .iter()
            .find(|e| e.id == entry.employee_id)
            .map(|e| e.name.as_str())
            .unwrap_or("N/A");
        consolidated.push_str(&format!(
            "{:30} {:>10.2} {:>10.2} {:>12.2} {:>12.2}\n",
            emp,
            entry.total_earnings,
            entry.health_deduction,
            entry.pension_deduction,
            entry.net_salary
        ));
    }
    let consolidated_path = dir.join(format!("nomina_{}.txt", period));
    fs::write(&consolidated_path, &consolidated)
        .map_err(|e| format!("Error al escribir: {}", e))?;
    files.push(consolidated_path.display().to_string());

    // 2. Desprendibles individuales
    for entry in entries {
        let emp = employees.iter().find(|e| e.id == entry.employee_id);
        if let Some(emp) = emp {
            let mut desprendible = format!(
                "═══════════════════════════════════════\n  DESPRENDIBLE DE NÓMINA\n  {}\n═══════════════════════════════════════\n\n",
                business_name
            );
            desprendible.push_str(&format!("Empleado: {}\n", emp.name));
            desprendible.push_str(&format!(
                "Documento: {} {}\n",
                emp.doc_type.as_deref().unwrap_or(""),
                emp.doc_number.as_deref().unwrap_or("")
            ));
            desprendible.push_str(&format!(
                "Cargo: {}\n",
                emp.position.as_deref().unwrap_or("")
            ));
            desprendible.push_str(&format!("Período: {}\n", period));
            desprendible.push_str(&format!("Frecuencia: {}\n", entry.payment_frequency));
            desprendible.push_str(&format!("Días trabajados: {:.0}\n", entry.days_worked));
            desprendible.push_str(&format!("Fecha de generación: {}\n\n", now));
            desprendible.push_str("─────────────── DEVENGADO ───────────────\n");
            desprendible.push_str(&format!(
                "Salario básico:          ${:>12.2}\n",
                entry.basic_salary
            ));
            if entry.transport_allowance > 0.0 {
                desprendible.push_str(&format!(
                    "Auxilio de transporte:   ${:>12.2}\n",
                    entry.transport_allowance
                ));
            }
            if entry.overtime_day_hours > 0.0 {
                desprendible.push_str(&format!(
                    "Horas extra diurnas:     ${:>12.2}\n",
                    entry.basic_salary / 240.0 * 1.25 * entry.overtime_day_hours
                ));
            }
            if entry.overtime_night_hours > 0.0 {
                desprendible.push_str(&format!(
                    "Horas extra nocturnas:   ${:>12.2}\n",
                    entry.basic_salary / 240.0 * 1.75 * entry.overtime_night_hours
                ));
            }
            if entry.sunday_hours > 0.0 {
                desprendible.push_str(&format!(
                    "Recargo dominical:       ${:>12.2}\n",
                    entry.basic_salary / 240.0 * 2.0 * entry.sunday_hours
                ));
            }
            if entry.holiday_hours > 0.0 {
                desprendible.push_str(&format!(
                    "Recargo festivo:         ${:>12.2}\n",
                    entry.basic_salary / 240.0 * 2.0 * entry.holiday_hours
                ));
            }
            desprendible.push_str(&format!(
                "TOTAL DEVENGADO:         ${:>12.2}\n\n",
                entry.total_earnings
            ));
            desprendible.push_str("─────────────── DEDUCCIONES ───────────────\n");
            desprendible.push_str(&format!(
                "Salud (4%):              ${:>12.2}\n",
                entry.health_deduction
            ));
            desprendible.push_str(&format!(
                "Pensión (4%):            ${:>12.2}\n",
                entry.pension_deduction
            ));
            desprendible.push_str(&format!(
                "TOTAL DEDUCCIONES:       ${:>12.2}\n\n",
                entry.health_deduction + entry.pension_deduction
            ));
            desprendible.push_str("──────────────────────────────────────────\n");
            desprendible.push_str(&format!(
                "NETO A PAGAR:            ${:>12.2}\n",
                entry.net_salary
            ));
            desprendible.push_str("──────────────────────────────────────────\n\n");
            desprendible.push_str(&format!("Generado por GestaERP - {}\n", now));

            let filename = format!("desprendible_{}_{}.txt", emp.name.replace(' ', "_"), period);
            let filepath = dir.join(&filename);
            fs::write(&filepath, &desprendible).map_err(|e| format!("Error al escribir: {}", e))?;
            files.push(filepath.display().to_string());
        }
    }

    // 3. Carga prestacional
    let mut carga = format!(
        "═══════════════════════════════════════\n  CARGA PRESTACIONAL - {}\n  {}\n═══════════════════════════════════════\n\n",
        period, now
    );
    for bl in benefits {
        carga.push_str(&format!("Empleado: {}\n", bl.employee_name));
        carga.push_str(&format!("  Salario base: ${:.2}\n", bl.base_salary));
        carga.push_str(&format!(
            "  Salud empleador (8.5%):    ${:.2}\n",
            bl.health_employer
        ));
        carga.push_str(&format!(
            "  Pensión empleador (12%):   ${:.2}\n",
            bl.pension_employer
        ));
        carga.push_str(&format!(
            "  ARL:                       ${:.2}\n",
            bl.arl_cost
        ));
        carga.push_str(&format!(
            "  CCF (4%):                  ${:.2}\n",
            bl.ccf_cost
        ));
        carga.push_str(&format!(
            "  SENA (2%):                 ${:.2}\n",
            bl.sena_cost
        ));
        carga.push_str(&format!(
            "  ICBF (3%):                 ${:.2}\n",
            bl.icbf_cost
        ));
        carga.push_str(&format!(
            "  Prima servicios (8.33%):   ${:.2}\n",
            bl.prima_provision
        ));
        carga.push_str(&format!(
            "  Cesantías (8.33%):         ${:.2}\n",
            bl.cesantias_provision
        ));
        carga.push_str(&format!(
            "  Int. cesantías (1%):       ${:.2}\n",
            bl.int_cesantias_provision
        ));
        carga.push_str(&format!(
            "  Vacaciones (4.17%):        ${:.2}\n",
            bl.vacaciones_provision
        ));
        carga.push_str(&format!(
            "  TOTAL CARGA EMPLEADOR:     ${:.2}\n\n",
            bl.total_employer_cost
        ));
    }
    let carga_path = dir.join(format!("carga_prestacional_{}.txt", period));
    fs::write(&carga_path, &carga).map_err(|e| format!("Error al escribir: {}", e))?;
    files.push(carga_path.display().to_string());

    Ok(files)
}
