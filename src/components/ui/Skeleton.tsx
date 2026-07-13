interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "table-row" | "circle" | "table-cell";
}

export default function Skeleton({ className = "", variant = "text" }: SkeletonProps) {
  const base = "relative overflow-hidden bg-muted rounded";

  const variants = {
    text: "h-4 w-full",
    card: "h-24 w-full rounded-xl",
    "table-row": "h-10 w-full rounded",
    circle: "h-10 w-10 rounded-full",
    "table-cell": "h-4 w-3/4",
  };

  return (
    <div className={`${base} ${variants[variant]} ${className}`}>
      {/* Shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-shimmer" />
    </div>
  );
}