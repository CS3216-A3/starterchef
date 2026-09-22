import Image from "next/image";
import type { LucideIcon } from "lucide-react";

/**
 * Recipe hero/step image. Renders the real photo when `imageUrl` exists;
 * otherwise a deterministic illustrated placeholder — a warm gradient picked
 * by hashing the title, a subtle dot texture, and the recipe's icon — so a
 * missing image reads as a designed surface, not an empty box.
 */

const placeholderGradients = [
  "from-flame-soft to-oat-dark",
  "from-oat to-flame-soft",
  "from-oat-dark to-oat",
  "from-flame-soft to-oat",
  "from-oat to-oat-dark",
] as const;

function hashTitle(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = (h * 31 + title.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function RecipeImage({
  imageUrl,
  title,
  icon: Icon,
  iconClassName = "h-12 w-12",
}: {
  imageUrl: string | null | undefined;
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt={title}
        fill
        sizes="(max-width: 640px) 100vw, 33vw"
        className="object-cover"
      />
    );
  }

  const gradient =
    placeholderGradients[hashTitle(title) % placeholderGradients.length];

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}
    >
      {/* Subtle dot texture so the surface reads as intentional */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(var(--color-espresso) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
          opacity: 0.08,
        }}
      />
      <Icon className={`${iconClassName} text-espresso/30`} strokeWidth={1.5} />
    </div>
  );
}
