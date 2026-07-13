import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import PremiumModal from "../components/ui/PremiumModal";
import PremiumButton from "../components/ui/PremiumButton";

interface ForceOpenCashModalProps {
  userId: number;
  onOpened: () => void;
}

export default function ForceOpenCashModal({ userId, onOpened }: ForceOpenCashModalProps) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (!amount.trim()) {
      setError("Ingrese un monto inicial");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await invoke("open_cash_register", {
        userId: userId,
        initialBalance: amount,
      });
      onOpened();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PremiumModal open={true} onClose={() => {}} title="Abrir caja" size="sm">
      <p className="text-sm text-secondary mb-4">
        Para comenzar a operar, debe abrir la caja con un saldo inicial.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-secondary mb-1">Monto inicial ($)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2 bg-input border border-theme rounded-lg text-primary"
            placeholder="0.00"
            autoFocus
          />
        </div>
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}
        <PremiumButton
          onClick={handleOpen}
          loading={loading}
          className="w-full"
        >
          {loading ? "Abriendo..." : "Abrir caja"}
        </PremiumButton>
      </div>
    </PremiumModal>
  );
}