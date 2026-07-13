import { Toaster as SonnerToaster, toast } from "sonner";

export function showToast(message: string, type: "success" | "error" | "warning" | "info" = "success") {
  const colors = {
    success: { bg: "#10b981", text: "#ffffff" },
    error: { bg: "#ef4444", text: "#ffffff" },
    warning: { bg: "#f59e0b", text: "#000000" },
    info: { bg: "#3b82f6", text: "#ffffff" },
  };

  toast(message, {
    style: {
      background: colors[type].bg,
      color: colors[type].text,
      border: "none",
      borderRadius: "0.75rem",
      padding: "12px 16px",
      fontSize: "14px",
      fontWeight: 500,
    },
    duration: 3000,
  });
}

export default function PremiumToaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      expand={false}
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "0.75rem",
          padding: "12px 16px",
          fontSize: "14px",
        },
      }}
    />
  );
}