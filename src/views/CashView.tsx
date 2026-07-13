import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { showToast } from "../components/ui/PremiumToast";

interface CashRegister {
  id: number;
  user_id: number;
  open_date: string;
  close_date: string | null;
  initial_balance: number;
  current_balance: number;
  final_balance: number | null;
  status: string;
}

interface CashViewProps {
  userId: number;
}

export default function CashView({ userId }: CashViewProps) {
  const [openReg, setOpenReg] = useState<CashRegister | null>(null);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [initialBalance, setInitialBalance] = useState("");
  const [finalBalance, setFinalBalance] = useState("");
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      const open = await invoke<CashRegister | null>("get_open_register");
      setOpenReg(open);
      const list = await invoke<CashRegister[]>("get_recent_registers");
      setRegisters(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpen = async () => {
    if (!initialBalance.trim()) {
      setError("Ingrese un monto inicial");
      return;
    }
    setError("");
    try {
      await invoke("open_cash_register", {
        userId: userId,
        initialBalance: initialBalance,
      });
      setInitialBalance("");
      loadData();
    } catch (e) {
      setError(String(e));
    }
    showToast("Caja abierta correctamente", "success");
  };

  const handleClose = async () => {
    if (!openReg) return;
    if (!finalBalance.trim()) {
      setError("Ingrese el monto final de cierre");
      return;
    }
    setError("");
    try {
      await invoke("close_cash_register", {
        registerId: openReg.id,
        finalBalance: finalBalance,
      });
      setFinalBalance("");
      loadData();
    } catch (e) {
      setError(String(e));
    }
    showToast("Caja abierta correctamente", "success");
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-bold mb-6">Caja</h2>

      {error && (
        <div className="p-3 mb-4 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {!openReg ? (
        <div className="bg-card border border-theme rounded-xl p-6 max-w-md mb-8">
          <h3 className="text-lg font-semibold mb-3">Abrir caja</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-secondary mb-1">Monto inicial</label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                placeholder="0.00"
              />
            </div>
            <button
              onClick={handleOpen}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-primary rounded-lg transition"
            >
              Abrir caja
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-theme rounded-xl p-6 max-w-md mb-8">
          <h3 className="text-lg font-semibold mb-3">Caja abierta</h3>
          <p className="text-sm text-secondary">
            Abierta el: <span className="text-primary">{openReg.open_date}</span>
          </p>
          <p className="text-sm text-secondary mt-1">
            Saldo actual:{" "}
            <span className="text-primary">
              ${openReg.current_balance.toFixed(2)}
            </span>
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm text-secondary mb-1">
                Monto final (cierre)
              </label>
              <input
                type="number"
                value={finalBalance}
                onChange={(e) => setFinalBalance(e.target.value)}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-primary"
                placeholder="0.00"
              />
            </div>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-primary rounded-lg transition"
            >
              Cerrar caja
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-theme rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-input text-primary text-sm">
            <tr>
              <th className="p-3">Apertura</th>
              <th className="p-3">Cierre</th>
              <th className="p-3">Saldo inicial</th>
              <th className="p-3">Saldo final</th>
              <th className="p-3">Diferencia</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {registers.map((reg, index) => (
              <motion.tr
                key={reg.id}
                className="border-t border-theme hover:bg-input/50"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <td className="p-3">{reg.open_date}</td>
                <td className="p-3">{reg.close_date || "—"}</td>
                <td className="p-3">${reg.initial_balance.toFixed(2)}</td>
                <td className="p-3">
                  {reg.final_balance != null
                    ? `$${reg.final_balance.toFixed(2)}`
                    : "—"}
                </td>
                <td
                  className={`p-3 ${
                    reg.final_balance != null
                      ? reg.final_balance - reg.initial_balance >= 0
                        ? "text-green-400"
                        : "text-red-400"
                      : ""
                  }`}
                >
                  {reg.final_balance != null
                    ? `$${(reg.final_balance - reg.initial_balance).toFixed(2)}`
                    : "—"}
                </td>
              </motion.tr>
            ))}
            {registers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-secondary">
                  Sin registros de caja
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}