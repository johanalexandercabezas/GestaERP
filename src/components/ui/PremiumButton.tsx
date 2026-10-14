import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface PremiumButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

const variants = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-sm",
  secondary: "bg-card border border-theme text-primary hover:bg-surface",
  ghost: "text-secondary hover:text-primary hover:bg-surface",
  danger: "bg-danger text-white hover:bg-red-600",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-6 py-3 text-base rounded-xl",
};

const PremiumButton = forwardRef<HTMLButtonElement, PremiumButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, children, className, disabled, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className || ""}`}
        {...(props as unknown as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
        {children}
      </motion.button>
    );
  }
);

PremiumButton.displayName = "PremiumButton";
export default PremiumButton;