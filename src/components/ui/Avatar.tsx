import { cn, colorFromId, initials } from "@/lib/utils";

interface Props {
  id: string;
  name: string;
  src?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}

export function Avatar({ id, name, src, size = 40, online, className }: Props) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none", className)}
      style={{ width: size, height: size, background: src ? undefined : colorFromId(id), fontSize: size * 0.38 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-bg-elev",
            online ? "bg-success" : "bg-text-faint",
          )}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
        />
      )}
    </span>
  );
}
