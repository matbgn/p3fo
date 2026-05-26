import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function LoadingSpinner({ className, size = "md", label }: LoadingSpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 p-8", className)}>
      <Loader2 className={cn("animate-spin text-muted-foreground", sizeMap[size])} />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}