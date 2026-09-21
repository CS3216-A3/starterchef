import { ChefHat, ChevronDown, Clock, Users } from "lucide-react";

const filters = [
  { icon: Clock, label: "20 minutes" },
  { icon: Users, label: "2 people" },
  { icon: ChefHat, label: "Beginner" },
] as const;

export function FilterPills() {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map(({ icon: Icon, label }) => (
        <button
          key={label}
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-espresso shadow-sm ring-1 ring-oat transition-colors hover:ring-flame/50"
        >
          <Icon className="h-4 w-4 text-espresso-light" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 text-espresso-light" />
        </button>
      ))}
    </div>
  );
}
