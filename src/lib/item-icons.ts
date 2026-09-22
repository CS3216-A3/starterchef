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

/**
 * Keyword → icon mapping for kitchen items. First matching rule wins, so
 * specific terms should come before generic ones. Falls back to Package
 * (ingredients) / Utensils (equipment).
 */

const INGREDIENT_ICONS: [RegExp, LucideIcon][] = [
  [/egg/, Egg],
  [/milk|cream|yogurt|butter|cheese|dairy/, Milk],
  [/apple|banana|orange|fruit|berries|grape/, Apple],
  [/lemon|lime|orange|citrus/, Citrus],
  [/tomato|carrot|potato|onion|garlic|pepper|broccoli|veg|celery/, Carrot],
  [/lettuce|salad|spinach|kale|herb|basil|coriander|parsley|leaf|mint/, Salad],
  [/beef|steak|pork|lamb|meat|bacon|mince/, Beef],
  [/chicken|turkey|drumstick|poultry/, Drumstick],
  [/fish|salmon|tuna|prawn|shrimp|seafood|cod/, Fish],
  [/rice|pasta|noodle|flour|bread|wheat|grain|oat|cereal|quinoa/, Wheat],
  [/coffee|tea|espresso/, Coffee],
  [/wine|beer|vinegar|alcohol/, Wine],
  [/soup|stock|broth/, Soup],
  [/oil|sauce|soy|ketchup|mayo|dressing/, Droplets],
];

const EQUIPMENT_ICONS: [RegExp, LucideIcon][] = [
  [/oven|microwave|air ?fryer|toaster/, Microwave],
  [/knife|fork|spoon|utensil|chopstick|spatula|whisk|peeler|tongs/, Utensils],
  [/pot|pan|wok|skillet|saucepan|dutch/, CookingPot],
  [/blender|mixer|processor|grinder/, ChefHat],
  [/bowl|plate|dish|board|sheet|tray|tin|mug|cup/, Soup],
];

export function ingredientIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  for (const [re, icon] of INGREDIENT_ICONS) if (re.test(n)) return icon;
  return Package;
}

export function equipmentIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  for (const [re, icon] of EQUIPMENT_ICONS) if (re.test(n)) return icon;
  return CookingPot;
}
