import {
  Apple,
  Beef,
  Carrot,
  ChefHat,
  Citrus,
  Coffee,
  CookingPot,
  Droplets,
  Drumstick,
  Egg,
  Fish,
  Milk,
  Microwave,
  Package,
  Salad,
  Soup,
  Utensils,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { KitchenItemKind } from "@/lib/types";

/**
 * Icon vocabulary the AI picks from when parsing kitchen items (scan and
 * voice routes both emit one of these keys, persisted on kitchen_items.icon).
 * Stored keys are resolved by kitchenIcon(); rows without a key fall back to
 * the keyword rules below.
 */
export const KITCHEN_ICON_KEYS = [
  "apple",
  "beef",
  "carrot",
  "chef-hat",
  "citrus",
  "coffee",
  "cooking-pot",
  "droplets",
  "drumstick",
  "egg",
  "fish",
  "milk",
  "microwave",
  "package",
  "salad",
  "soup",
  "utensils",
  "wheat",
  "wine",
] as const;

export type KitchenIconKey = (typeof KITCHEN_ICON_KEYS)[number];

export const KITCHEN_ICONS: Record<KitchenIconKey, LucideIcon> = {
  apple: Apple,
  beef: Beef,
  carrot: Carrot,
  "chef-hat": ChefHat,
  citrus: Citrus,
  coffee: Coffee,
  "cooking-pot": CookingPot,
  droplets: Droplets,
  drumstick: Drumstick,
  egg: Egg,
  fish: Fish,
  milk: Milk,
  microwave: Microwave,
  package: Package,
  salad: Salad,
  soup: Soup,
  utensils: Utensils,
  wheat: Wheat,
  wine: Wine,
};

/** Fallback keyword rules for items that have no stored icon (manual adds,
 * rows predating the icon column). First match wins. */
const INGREDIENT_ICONS: [RegExp, KitchenIconKey][] = [
  [/egg/, "egg"],
  [/milk|cream|yogurt|butter|cheese|dairy/, "milk"],
  [/apple|banana|orange|fruit|berries|grape/, "apple"],
  [/lemon|lime|citrus/, "citrus"],
  [/tomato|carrot|potato|onion|garlic|pepper|broccoli|veg|celery/, "carrot"],
  [
    /lettuce|salad|spinach|kale|herb|basil|coriander|parsley|leaf|mint/,
    "salad",
  ],
  [/beef|steak|pork|lamb|meat|bacon|mince/, "beef"],
  [/chicken|turkey|drumstick|poultry/, "drumstick"],
  [/fish|salmon|tuna|prawn|shrimp|seafood|cod/, "fish"],
  [/rice|pasta|noodle|flour|bread|wheat|grain|oat|cereal|quinoa/, "wheat"],
  [/coffee|tea|espresso/, "coffee"],
  [/wine|beer|vinegar|alcohol/, "wine"],
  [/soup|stock|broth/, "soup"],
  [/oil|sauce|soy|ketchup|mayo|dressing/, "droplets"],
];

const EQUIPMENT_ICONS: [RegExp, KitchenIconKey][] = [
  [/oven|microwave|air ?fryer|toaster/, "microwave"],
  [/knife|fork|spoon|utensil|chopstick|spatula|whisk|peeler|tongs/, "utensils"],
  [/pot|pan|wok|skillet|saucepan|dutch/, "cooking-pot"],
  [/blender|mixer|processor|grinder/, "chef-hat"],
  [/bowl|plate|dish|board|sheet|tray|tin|mug|cup/, "soup"],
];

function isIconKey(value: string): value is KitchenIconKey {
  return (KITCHEN_ICON_KEYS as readonly string[]).includes(value);
}

/** Resolve the icon for a kitchen item: the AI-stored key wins; otherwise
 * match the name against the keyword rules. */
export function kitchenIcon(item: {
  kind: KitchenItemKind;
  name: string;
  icon?: string | null;
}): LucideIcon {
  if (item.icon && isIconKey(item.icon)) return KITCHEN_ICONS[item.icon];
  const rules = item.kind === "ingredient" ? INGREDIENT_ICONS : EQUIPMENT_ICONS;
  const n = item.name.toLowerCase();
  for (const [re, key] of rules) if (re.test(n)) return KITCHEN_ICONS[key];
  return item.kind === "ingredient" ? Package : CookingPot;
}
