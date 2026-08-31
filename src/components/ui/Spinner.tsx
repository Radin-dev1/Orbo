import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn("animate-spin text-text-dim", className)} />;
}

export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg">
      <Spinner size={26} />
      {label && <p className="text-sm text-text-dim">{label}</p>}
    </div>
  );
}
