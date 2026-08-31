import { cn } from "@/lib/utils";

export function OrboMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
      <defs>
        <linearGradient id="orbo-g" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#8b7dff" />
          <stop offset="1" stopColor="#6a58ff" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="20" stroke="url(#orbo-g)" strokeWidth="4" />
      <circle cx="24" cy="24" r="7" fill="url(#orbo-g)" />
      <circle cx="38.5" cy="14" r="4.5" fill="#8b7dff" />
    </svg>
  );
}

export function OrboWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <OrboMark size={28} />
      <span className="text-lg font-bold tracking-tight">Orbo</span>
    </div>
  );
}
