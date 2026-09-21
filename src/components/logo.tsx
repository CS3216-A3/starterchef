import { cn } from "@/lib/utils";

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
        <path
          fill="#F58220"
          d="M12 3c.75 3-3 4.5-3 8.25a3 3 0 0 0 6 0c0-1.5-.75-2.25-1.13-3.38C16.5 8.63 18 10.5 18 13.13A6 6 0 1 1 6 13.13C6 8.25 9.75 6 12 3z"
        />
      </svg>
      {showWordmark ? (
        <span className="text-lg font-extrabold tracking-tight text-espresso">
          StarterChef
        </span>
      ) : null}
    </span>
  );
}
