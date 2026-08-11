import type { KitchenTool } from "@/types/recipe";

export const KITCHEN_TOOL_OPTIONS: { id: KitchenTool; label: string }[] = [
  { id: "sous_vide", label: "Sous-vide" },
  { id: "air_fryer", label: "Air Fryer" },
  { id: "blender", label: "Blender" },
  { id: "immersion_blender", label: "Immersion Blender" },
  { id: "oven", label: "Oven" },
  { id: "stovetop", label: "Stovetop" },
  { id: "grill", label: "Grill" },
  { id: "food_processor", label: "Food Processor" },
  { id: "microwave", label: "Microwave" },
];
