import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumSelect from "../components/ui/PremiumSelect";
import { showToast } from "../components/ui/PremiumToast";
import PersonalDataBasisFields from "../components/PersonalDataBasisFields";
import {
  emptyProcessingBasis,
  type ProcessingBasisInput,
  type ProcessingBasisRecord,
} from "../types/personalData";

interface Employee {
  id: number;
  name: string;
  doc_type: string | null;
  doc_number: string | null;
  position: string | null;
  base_salary: number;
  transport_allowance: boolean;
  has_social_security: boolean;
  payment_frequency: string;
  risk_level: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  department: string | null;
  address: string | null;
  hire_date: string | null;
  eps: string | null;
  arl: string | null;
  afp: string | null;
  ccf: string | null;
  fondo_cesantias: string | null;
  active: boolean;
  processing_basis: ProcessingBasisRecord | null;
}

const SMMLV = 1_750_905.0;
const EPS_LIST = ["Aliansalud","Asmetsalud","Capital Salud","Coosalud","Compensar EPS","Dusakawi EPSI","Ecoopsos","Emssanar","EPS AIC","Famisanar","Mallamas","Mutual Ser","Nueva EPS","Salud Total","Sanitas","Savia Salud","SOS","Sura EPS","Confenalcovalle","Cajacopi"];
const ARL_LIST = ["AXA Colpatria","Bolívar","Colmena","Mapfre","Positiva","Sura ARL"];
const AFP_LIST = ["Colfondos","Porvenir","Protección","Skandia","Colpensiones","Caxdac"];
const FONDO_CESANTIAS_LIST = [
  "Porvenir", "Protección", "Colfondos", "Skandia",
  "Fondo Nacional del Ahorro (FNA)", "Fiduciaria Davivienda",
  "Fiduciaria Bancolombia", "Fiduprevisora", "Old Mutual",
  "Colmena", "BBVA Asset Management"
];
const RISK_LEVELS = ["I","II","III","IV","V"];
const PAYMENT_FREQUENCY_OPTIONS = [
  { value: "Mensual", label: "Mensual" },
  { value: "Quincenal", label: "Quincenal" },
  { value: "Diario", label: "Diario" },
];

const CITIES_BY_DEPT: Record<string, { dept: string; ccfs: string[] }> = {
  "BOGOTÁ": { dept: "BOGOTÁ", ccfs: ["COLSUBSIDIO", "CAFAM", "COMPENSAR"] },
  "MEDELLÍN": { dept: "ANTIOQUIA", ccfs: ["COMFAMA", "COMFENALCO ANTIOQUIA"] },
  "CALI": { dept: "VALLE DEL CAUCA", ccfs: ["COMFENALCO VALLE DE LA GENTE", "COMFANDI"] },
  "BARRANQUILLA": { dept: "ATLÁNTICO", ccfs: ["COMBARRANQUILLA", "CAJACOPI ATLÁNTICO"] },
  "CARTAGENA": { dept: "BOLÍVAR", ccfs: ["COMFENALCO CARTAGENA"] },
  "CÚCUTA": { dept: "NORTE DE SANTANDER", ccfs: ["COMFAORIENTE"] },
  "BUCARAMANGA": { dept: "SANTANDER", ccfs: ["COMFENALCO SANTANDER", "CAJASAN"] },
  "PEREIRA": { dept: "RISARALDA", ccfs: ["COMFAMILIAR RISARALDA"] },
  "MANIZALES": { dept: "CALDAS", ccfs: ["CONFA"] },
  "IBAGUÉ": { dept: "TOLIMA", ccfs: ["CAFASUR", "COMFENALCO TOLIMA"] },
};

const CITIES = Object.keys(CITIES_BY_DEPT);

export default function EmployeesView() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [docType, setDocType] = useState("CC");
  const [docNumber, setDocNumber] = useState("");
  const [position, setPosition] = useState("");
  const [baseSalary, setBaseSalary] = useState("0");
  const [hasSocialSecurity, setHasSocialSecurity] = useState(false);
  const [paymentFreq, setPaymentFreq] = useState("Mensual");
  const [riskLevel, setRiskLevel] = useState("I");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [department, setDepartment] = useState("");
  const [address, setAddress] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [eps, setEps] = useState("");
  const [arl, setArl] = useState("");
  const [afp, setAfp] = useState("");
  const [ccf, setCcf] = useState("");
  const [fondo_cesantias, setFondo_cesantias] = useState("");
  const [active, setActive] = useState(true);
  const [processingBasis, setProcessingBasis] =
    useState<ProcessingBasisInput>(emptyProcessingBasis);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await invoke<Employee[]>("list_employees");
      setEmployees(data);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, []);

  const transportAuto = hasSocialSecurity && (parseFloat(baseSalary) || 0) <= 2.0 * SMMLV;

  const resetForm = () => {
    setName(""); setDocType("CC"); setDocNumber(""); setPosition("");
    setBaseSalary("0"); setHasSocialSecurity(false); setPaymentFreq("Mensual");
    setRiskLevel("I"); setPhone(""); setEmail(""); setCity(""); setDepartment("");
    setAddress(""); setHireDate(""); setEps(""); setArl(""); setAfp(""); setCcf("");
    setFondo_cesantias(""); setActive(true); setError(""); setEditing(null);
    setProcessingBasis(emptyProcessingBasis());
  };

  const openNew = () => { resetForm(); setShowForm(true); };
  const openEdit = (e: Employee) => {
    setEditing(e);
    setName(e.name); setDocType(e.doc_type || "CC"); setDocNumber(e.doc_number || "");
    setPosition(e.position || ""); setBaseSalary(e.base_salary.toString());
    setHasSocialSecurity(e.has_social_security);
    setPaymentFreq(e.payment_frequency);
    setRiskLevel(e.risk_level); setPhone(e.phone || ""); setEmail(e.email || "");
    setCity(e.city || ""); setDepartment(e.department || ""); setAddress(e.address || "");
    setHireDate(e.hire_date || ""); setEps(e.eps || ""); setArl(e.arl || ""); setAfp(e.afp || "");
    setCcf(e.ccf || ""); setFondo_cesantias(e.fondo_cesantias || ""); setActive(e.active);
    setProcessingBasis(
      e.processing_basis
        ? {
            basis: e.processing_basis.basis,
            basisDetail: e.processing_basis.basisDetail,
            purpose: e.processing_basis.purpose,
            effectiveDate: e.processing_basis.effectiveDate,
            evidenceMethod: e.processing_basis.evidenceMethod,
            evidenceReference: e.processing_basis.evidenceReference,
          }
        : emptyProcessingBasis(),
    );
    setShowForm(true);
  };

  const handleCityChange = (value: string) => {
    setCity(value);
    const deptInfo = CITIES_BY_DEPT[value];
    if (deptInfo) {
      setDepartment(deptInfo.dept);
      setCcf("");
    }
  };

  const save = async () => {
    if (!name.trim() || !docNumber.trim() || !position.trim() || !city.trim() || !address.trim() || !hireDate.trim()) {
      setError("TODOS LOS CAMPOS SON OBLIGATORIOS");
      showToast("TODOS LOS CAMPOS SON OBLIGATORIOS", "error");
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(baseSalary)) {
      setError("EL SALARIO DEBE SER UN NÚMERO VÁLIDO");
      return;
    }
    if (!/^\d+$/.test(phone)) {
      setError("EL TELÉFONO DEBE CONTENER SOLO NÚMEROS");
      return;
    }
    if (!/^\d+$/.test(docNumber)) {
      setError("EL NÚMERO DE DOCUMENTO DEBE CONTENER SOLO NÚMEROS");
      return;
    }
    setError("");
    try {
      if (editing) {
        await invoke("update_employee", {
          id: editing.id, name: name.toUpperCase(), docType, docNumber, position: position.toUpperCase(),
          baseSalary, transportAllowance: transportAuto, hasSocialSecurity,
          paymentFrequency: hasSocialSecurity ? paymentFreq : "Diario",
          riskLevel, phone, email: email.toUpperCase(), city: city.toUpperCase(),
          department: department.toUpperCase(), address: address.toUpperCase(),
          hireDate, eps: eps.toUpperCase(), arl: arl.toUpperCase(), afp: afp.toUpperCase(),
          ccf: ccf.toUpperCase(), fondo_cesantias: fondo_cesantias.toUpperCase(), active,
          processingBasis,
        });
      } else {
        await invoke("create_employee", {
          name: name.toUpperCase(), docType, docNumber, position: position.toUpperCase(),
          baseSalary, transportAllowance: transportAuto, hasSocialSecurity,
          paymentFrequency: hasSocialSecurity ? paymentFreq : "Diario",
          riskLevel, phone, email: email.toUpperCase(), city: city.toUpperCase(),
          department: department.toUpperCase(), address: address.toUpperCase(),
          hireDate, eps: eps.toUpperCase(), arl: arl.toUpperCase(), afp: afp.toUpperCase(),
          ccf: ccf.toUpperCase(), fondo_cesantias: fondo_cesantias.toUpperCase(),
          processingBasis,
        });
      }
      showToast(editing ? "EMPLEADO ACTUALIZADO" : "EMPLEADO CREADO", "success");
      setShowForm(false); resetForm(); load();
    } catch (e) {
      setError(String(e));
      showToast("ERROR AL GUARDAR EL EMPLEADO: " + String(e), "error");
    }
  };

  const deleteEmp = async (id: number) => {
    if (confirm("¿Eliminar empleado?")) { await invoke("delete_employee", { id }); load(); }
  };

  const ccfOptions = department ? (CITIES_BY_DEPT[city]?.ccfs || []) : [];

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Empleados</h2>
        <button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-primary px-4 py-2 rounded-lg">+ Nuevo empleado</button>
      </div>

      <div className="bg-card border border-theme rounded-xl overflow-hidden mb-8">
        <table className="w-full text-left text-sm">
          <thead className="bg-input text-primary">
            <tr>
              <th className="p-3">Nombre</th><th className="p-3">Documento</th><th className="p-3">Cargo</th>
              <th className="p-3">Salario</th><th className="p-3">Frecuencia</th><th className="p-3">EPS</th>
              <th className="p-3">ARL</th><th className="p-3">AFP</th><th className="p-3">CCF</th>
              <th className="p-3">Fondo Cesantías</th><th className="p-3">Activo</th><th className="p-3">Trazabilidad</th><th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {employees.map((e, index) => (
              <motion.tr key={e.id} className="border-t border-theme hover:bg-input/50"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <td className="p-3">{e.name}</td><td className="p-3">{e.doc_type} {e.doc_number}</td>
                <td className="p-3">{e.position}</td><td className="p-3">${e.base_salary.toLocaleString()}</td>
                <td className="p-3">{e.payment_frequency}</td><td className="p-3">{e.eps || "-"}</td>
                <td className="p-3">{e.arl || "-"}</td><td className="p-3">{e.afp || "-"}</td>
                <td className="p-3">{e.ccf || "-"}</td><td className="p-3">{e.fondo_cesantias || "-"}</td>
                <td className="p-3">{e.active ? "✅" : "❌"}</td>
                <td className="p-3">{e.processing_basis ? "Registrada" : "Pendiente de revisión"}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => openEdit(e)} className="text-accent hover:underline text-sm">Editar</button>
                  <button onClick={() => deleteEmp(e.id)} className="text-danger hover:underline text-sm">Eliminar</button>
                </td>
              </motion.tr>
            ))}
            {employees.length === 0 && <tr><td colSpan={13} className="p-6 text-center text-secondary">No hay empleados</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <PremiumModal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Editar empleado" : "Nuevo empleado"} size="xl">
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Nombre *", content: <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: null, content: <div className="flex gap-2"><div className="w-1/3"><label className="block text-xs text-secondary">Tipo Doc.</label><select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"><option value="CC">CC</option><option value="NIT">NIT</option></select></div><div className="flex-1"><label className="block text-xs text-secondary">Número *</label><input value={docNumber} onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ''))} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /></div></div> },
              { label: "Cargo *", content: <input value={position} onChange={(e) => setPosition(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: "Salario base *", content: <input type="number" step="any" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
            ].map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                {c.label && <label className="block text-xs text-secondary mb-1">{c.label}</label>}{c.content}
              </motion.div>
            ))}
            <motion.div className="col-span-3 flex items-center gap-4 mt-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <label className="flex items-center gap-2 text-xs text-secondary"><input type="checkbox" checked={hasSocialSecurity} onChange={(e) => { setHasSocialSecurity(e.target.checked); if (!e.target.checked) setPaymentFreq("Diario"); }} /> ¿Tiene seguridad social?</label>
              {hasSocialSecurity && (
                <div><label className="block text-xs text-secondary">Frecuencia de pago</label><PremiumSelect options={PAYMENT_FREQUENCY_OPTIONS} value={paymentFreq} onChange={setPaymentFreq} placeholder="..." className="w-full" /></div>
              )}
            </motion.div>
            {[
              { label: "Nivel de riesgo ARL", content: <PremiumSelect options={RISK_LEVELS.map(r => ({ value: r, label: `Nivel ${r}` }))} value={riskLevel} onChange={setRiskLevel} className="w-full" /> },
              { label: "Teléfono *", content: <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: "Email", content: <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: "Ciudad *", content: <select value={city} onChange={(e) => handleCityChange(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"><option value="">Seleccionar...</option>{CITIES.map(c => (<option key={c} value={c}>{c}</option>))}</select> },
              { label: "Departamento", content: <input value={department} disabled className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: "Dirección *", content: <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: "Fecha de ingreso *", content: <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary" /> },
              { label: "EPS", content: <PremiumSelect options={EPS_LIST.map(e => ({ value: e, label: e }))} value={eps} onChange={setEps} placeholder="Seleccionar..." searchable className="w-full" /> },
              { label: "ARL", content: <PremiumSelect options={ARL_LIST.map(a => ({ value: a, label: a }))} value={arl} onChange={setArl} placeholder="Seleccionar..." searchable className="w-full" /> },
              { label: "AFP (Pensión)", content: <PremiumSelect options={AFP_LIST.map(a => ({ value: a, label: a }))} value={afp} onChange={setAfp} placeholder="Seleccionar..." searchable className="w-full" /> },
              { label: "CCF", content: <PremiumSelect options={ccfOptions.map(c => ({ value: c, label: c }))} value={ccf} onChange={setCcf} placeholder="Seleccionar..." className="w-full" disabled={ccfOptions.length === 0} /> },
              { label: "Fondo de Cesantías", content: <PremiumSelect options={FONDO_CESANTIAS_LIST.map(f => ({ value: f, label: f }))} value={fondo_cesantias} onChange={setFondo_cesantias} placeholder="Seleccionar fondo..." searchable className="w-full" /> },
            ].map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.08 }}>
                <label className="block text-xs text-secondary mb-1">{c.label}</label>{c.content}
              </motion.div>
            ))}
            <div className="col-span-3">
              <PersonalDataBasisFields
                subject="employee"
                subjectId={editing?.id}
                value={processingBasis}
                onChange={setProcessingBasis}
              />
            </div>
            {error && <div className="col-span-3 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">{error}</div>}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted hover:bg-gray-600 rounded-lg text-primary">Cancelar</button>
            <button onClick={save} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-primary">{editing ? "Actualizar" : "Crear"}</button>
          </div>
        </PremiumModal>
      )}
    </div>
  );
}