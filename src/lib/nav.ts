import { Bookmark, ChefHat, CookingPot } from "lucide-react";

export const appNavLinks = [
  { href: "/today", label: "Today", icon: ChefHat },
  { href: "/kitchen", label: "My Kitchen", icon: CookingPot },
  { href: "/recipes", label: "Saved recipes", icon: Bookmark },
] as const;
