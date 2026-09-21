import Image from "next/image";
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
      <Image
        src="/logo.png"
        alt=""
        aria-hidden="true"
        width={32}
        height={32}
        className="h-8 w-auto"
        unoptimized
      />
      {showWordmark ? (
        <span className="text-lg font-extrabold tracking-tight text-espresso">
          StarterChef
        </span>
      ) : null}
    </span>
  );
}
