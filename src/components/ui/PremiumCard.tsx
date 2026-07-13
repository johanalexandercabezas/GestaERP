import { motion } from "framer-motion";
import { ReactNode } from "react";

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  animate?: boolean;
}

export default function PremiumCard({ children, className = "", hover = false, animate = true }: PremiumCardProps) {
  const Component = animate ? motion.div : "div";

  return (
    <Component
      initial={animate ? { opacity: 0, y: 10 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={animate ? { duration: 0.3, ease: "easeOut" } : undefined}
      whileHover={hover ? { y: -2, boxShadow: "var(--shadow-md)" } : undefined}
      className={`bg-card border border-theme rounded-xl p-5 transition-shadow duration-200 ${className}`}
    >
      {children}
    </Component>
  );
}