/**
 * Pure persisted vocabulary for kitchen item icons. Keep this separate from
 * the Lucide component map so server-side validation never imports React UI.
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
