import { OrboMark } from "@/components/ui/Logo";

export default function HomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg bg-grid text-center">
      <OrboMark size={56} />
      <div>
        <h1 className="text-lg font-semibold">Welcome to Orbo</h1>
        <p className="mt-1 max-w-xs text-sm text-text-dim">
          Pick a conversation on the left, or start a new one to message and call.
        </p>
      </div>
    </div>
  );
}
