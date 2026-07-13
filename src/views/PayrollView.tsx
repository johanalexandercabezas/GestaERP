import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Employee {
  id: number; name: string; base_salary: number; transport_allowance: boolean;
  payment_frequency: string; risk_level: string; active: boolean;
}

interface PayrollEntry {
  id: number; employee_id: number; period: string; payment_frequency: string;
  days_worked: number; basic_salary: number; transport_allowance: number;
  overtime_day_hours: number; overtime_night_hours: number;
  sunday_hours: number; holiday_hours: number;
  total_earnings: number; health_deduction: number; pension_deduction: number;
  net_salary: number; created_at: string;
}

interface BenefitLoad {
  employee_id: number; employee_name: string; base_salary: number;
  health_employer: number; pension_employer: number; arl_cost: number;
  ccf_cost: number; sena_cost: number; icbf_cost: number;
  prima_provision: number; cesantias_provision: number;
  int_cesantias_provision: number; vacaciones_provision: number;
  total_employer_cost: number;
}

export default function PayrollView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [overtime, setOvertime] = useState<Record<number, { day: string; night: string; sunday: string; holiday: string }>>({});
  const [result, setResult] = useState<PayrollEntry[] | null>(null);
  const [history, setHistory] = useState<PayrollEntry[]>([]);
  const [benefits, setBenefits] = useState<BenefitLoad[]>([]);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reportMsg, setReportMsg] = useState("");

  useEffect(() => {
    invoke<Employee[]>("list_employees").then(setEmployees).catch(console.error);
  }, []);

  useEffect(() => {
    if (period) {
      invoke<PayrollEntry[]>("get_payroll_history", { period }).then(setHistory).catch(console.error);
    }
  }, [period]);

  const handleOvertimeChange = (id: number, field: string, value: string) => {
    setOvertime(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

const generate = async () => {
    setError(""); setGenerating(true);
    try {
      const ovArray = employees.map(emp => {
        const ov = overtime[emp.id] || { day: "0", night: "0", sunday: "0", holiday: "0" };
        return [emp.id, parseFloat(ov.day) || 0, parseFloat(ov.night) || 0, parseFloat(ov.sunday) || 0, parseFloat(ov.holiday) || 0] as [number, number, number, number, number];
      });
      const entries = await invoke<PayrollEntry[]>("generate_payroll", { period, overtimeHours: ovArray });
      setResult(entries);
      const hist = await invoke<PayrollEntry[]>("get_payroll_history", { period });
      setHistory(hist);
      const bl = await invoke<BenefitLoad[]>("get_benefit_load");
      setBenefits(bl);
      // Generar reportes automáticamente
      const files = await invoke<string[]>("generate_payroll_report", { period });
      setReportMsg(`Reportes generados en: ${files.join(', ')}`);
    } catch (e) { setError(String(e)); }
    finally { setGenerating(false); }
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-bold mb-6">Nómina</h2>
      <div className="mb-6 flex gap-4 items-end flex-wrap">
        <div>
          <label className="block text-sm text-secondary mb-1">Período (YYYY-MM)</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2 bg-input border border-theme rounded-lg text-primary" />
        </div>
        <button onClick={generate} disabled={generating} className={`px-4 py-2 rounded-lg text-primary ${generating ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}>
          {generating ? "Generando..." : "Generar Nómina + Reportes"}
        </button>
      </div>
      {error && <div className="p-3 mb-4 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">{error}</div>}
      {reportMsg && <div className="p-3 mb-4 bg-green-900/50 border border-green-800 rounded-lg text-green-200 text-sm">{reportMsg}</div>}

      {employees.length > 0 && !result && (
        <div className="bg-card border border-theme rounded-xl p-4 mb-8">
          <h3 className="text-lg font-semibold mb-3">Horas extra / recargos</h3>
          <table className="w-full text-left text-sm">
            <thead className="text-secondary"><tr><th className="pb-2">Empleado</th><th className="pb-2">H.E. Diurna</th><th className="pb-2">H.E. Nocturna</th><th className="pb-2">Dominical</th><th className="pb-2">Festiva</th></tr></thead>
            <tbody>
              {employees.filter(e => e.active).map(emp => {
                const ov = overtime[emp.id] || { day: "", night: "", sunday: "", holiday: "" };
                return (<tr key={emp.id} className="border-t border-theme">
                  <td className="py-2">{emp.name}</td>
                  <td className="py-2"><input type="number" value={ov.day} onChange={e => handleOvertimeChange(emp.id, "day", e.target.value)} className="w-16 px-1 py-0.5 bg-input border border-theme rounded text-primary text-sm" /></td>
                  <td className="py-2"><input type="number" value={ov.night} onChange={e => handleOvertimeChange(emp.id, "night", e.target.value)} className="w-16 px-1 py-0.5 bg-input border border-theme rounded text-primary text-sm" /></td>
                  <td className="py-2"><input type="number" value={ov.sunday} onChange={e => handleOvertimeChange(emp.id, "sunday", e.target.value)} className="w-16 px-1 py-0.5 bg-input border border-theme rounded text-primary text-sm" /></td>
                  <td className="py-2"><input type="number" value={ov.holiday} onChange={e => handleOvertimeChange(emp.id, "holiday", e.target.value)} className="w-16 px-1 py-0.5 bg-input border border-theme rounded text-primary text-sm" /></td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {(result || history.length > 0) && (
        <div className="bg-card border border-theme rounded-xl overflow-hidden mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary">
              <tr>
                <th className="p-3">Empleado</th><th className="p-3">Frec.</th><th className="p-3">Días</th>
                <th className="p-3">Salario</th><th className="p-3">Transp.</th>
                <th className="p-3">H.E.D.</th><th className="p-3">H.E.N.</th>
                <th className="p-3">Dom.</th><th className="p-3">Fest.</th>
                <th className="p-3">Total Dev.</th><th className="p-3">Salud</th><th className="p-3">Pensión</th>
                <th className="p-3">Neto</th>
              </tr>
            </thead>
            <tbody>
              {(result || history).map(entry => {
                const emp = employees.find(e => e.id === entry.employee_id);
                return (<tr key={entry.id} className="border-t border-theme">
                  <td className="p-3">{emp?.name || `ID ${entry.employee_id}`}</td>
                  <td className="p-3">{entry.payment_frequency}</td>
                  <td className="p-3">{entry.days_worked}</td>
                  <td className="p-3">${entry.basic_salary.toLocaleString()}</td>
                  <td className="p-3">${entry.transport_allowance.toLocaleString()}</td>
                  <td className="p-3">{entry.overtime_day_hours}h</td>
                  <td className="p-3">{entry.overtime_night_hours}h</td>
                  <td className="p-3">{entry.sunday_hours}h</td>
                  <td className="p-3">{entry.holiday_hours}h</td>
                  <td className="p-3">${entry.total_earnings.toLocaleString()}</td>
                  <td className="p-3">-${entry.health_deduction.toLocaleString()}</td>
                  <td className="p-3">-${entry.pension_deduction.toLocaleString()}</td>
                  <td className="p-3 font-bold text-green-400">${entry.net_salary.toLocaleString()}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {benefits.length > 0 && (
        <div className="bg-card border border-theme rounded-xl overflow-hidden">
          <h3 className="text-lg font-semibold p-4 border-b border-theme">Carga Prestacional (Empleador)</h3>
          <table className="w-full text-left text-sm">
            <thead className="bg-input text-primary">
              <tr>
                <th className="p-3">Empleado</th><th className="p-3">Salud(8.5%)</th><th className="p-3">Pensión(12%)</th>
                <th className="p-3">ARL</th><th className="p-3">CCF(4%)</th><th className="p-3">SENA</th><th className="p-3">ICBF</th>
                <th className="p-3">Prima</th><th className="p-3">Cesantías</th><th className="p-3">Int.Ces.</th>
                <th className="p-3">Vacac.</th><th className="p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {benefits.map(bl => (
                <tr key={bl.employee_id} className="border-t border-theme">
                  <td className="p-3">{bl.employee_name}</td>
                  <td className="p-3">${bl.health_employer.toFixed(0)}</td>
                  <td className="p-3">${bl.pension_employer.toFixed(0)}</td>
                  <td className="p-3">${bl.arl_cost.toFixed(0)}</td>
                  <td className="p-3">${bl.ccf_cost.toFixed(0)}</td>
                  <td className="p-3">${bl.sena_cost.toFixed(0)}</td>
                  <td className="p-3">${bl.icbf_cost.toFixed(0)}</td>
                  <td className="p-3">${bl.prima_provision.toFixed(0)}</td>
                  <td className="p-3">${bl.cesantias_provision.toFixed(0)}</td>
                  <td className="p-3">${bl.int_cesantias_provision.toFixed(0)}</td>
                  <td className="p-3">${bl.vacaciones_provision.toFixed(0)}</td>
                  <td className="p-3 font-bold text-red-400">${bl.total_employer_cost.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}