/**
 * Method integrity: the cook-facing document has to match the plate, bloom
 * pungent alliums before cold dairy, and use any liquid it reserved.
 */
import { ensureCarbonaraEmulsion } from "../src/lib/cook/carbonaraEmulsion";
import { applySignaturePlate } from "../src/lib/cook/signaturePlate";
import { repairCookMethod } from "../src/lib/cook/methodIntegrity";
import { findIngredientNode } from "../src/data/knowledgeGraph";
import type { GourmetRecipe } from "../src/types/recipe";

const squashNode = findIngredientNode("Spaghetti squash");
if (!squashNode || /pasta/i.test(squashNode.name)) {
  console.error("FAIL: spaghetti squash resolved as pasta:", squashNode?.name);
  process.exit(1);
}

const base = {
  name: "Test",
  tagline: "Silk over pasta.",
  total_time_minutes: 15,
  active_time_minutes: 12,
  servings: 1,
  macros: { calories: 400, protein_g: 40, carbs_g: 30, fat_g: 8 },
  fat_loss_metrics: {
    satiety_index: 8,
    satiety_label: "High",
    tef_kcal: 20,
    glycemic_impact: "low" as const,
    glycemic_note: "x",
  },
  fat_mimicry_tech: {
    title: "Yogurt",
    replaces: "cream",
    mechanism: "blend",
    mouthfeel_result: "silk",
  },
  culinary_physics_tips: [],
  flavor_radar: { sweet: 1, sour: 2, salty: 3, umami: 4, aroma_complexity: 5 },
  texture_balance: [],
  psychological_reward_note: "",
  plating: { composition: "pasta in a wide bowl" },
  tools_used: ["stovetop" as const],
};

const broken = {
  ...base,
  ingredients: [
    { name: "Pasta", quantity: "55", unit: "g", notes: "dry weight" },
    { name: "Chicken breast", quantity: "180", unit: "g" },
    { name: "Greek yogurt", quantity: "160", unit: "g" },
    { name: "Garlic", quantity: "5", unit: "g" },
    { name: "Lemon juice", quantity: "10", unit: "ml" },
    { name: "Dijon mustard", quantity: "8", unit: "g" },
    { name: "Parmesan", quantity: "40", unit: "g" },
  ],
  steps: [
    {
      order: 1,
      instruction:
        "Boil 55g dry pasta until al dente. Reserve a splash of pasta water, drain.",
    },
    { order: 2, instruction: "Sear the chicken." },
    {
      order: 3,
      instruction:
        "Blend Greek yogurt, lemon juice, mustard, and 5g minced raw garlic together into a smooth, unheated sauce.",
    },
    { order: 4, instruction: "Toss the drained pasta with the sauce in the pan." },
    {
      order: 5,
      instruction: "Toss the drained pasta with the sauce in the pan.",
    },
  ],
} as GourmetRecipe;

const repaired = repairCookMethod(broken);
const method = repaired.steps.map((step) => step.instruction).join("\n");

if (/zucchini/i.test(method)) {
  console.error("FAIL: zucchini left on a pasta plate:\n", method);
  process.exit(1);
}

const tosses = repaired.steps.filter((step) =>
  /toss/i.test(step.instruction) && /pasta/i.test(step.instruction)
);
if (tosses.length !== 1) {
  console.error(
    `FAIL: expected one pasta toss, got ${tosses.length}:\n`,
    method
  );
  process.exit(1);
}

const chickenAfterSear = repaired.steps.some(
  (step, i) =>
    i > 0 &&
    /chicken/i.test(step.instruction) &&
    /slice|fold|toss|add/i.test(step.instruction)
);
if (!chickenAfterSear) {
  console.error("FAIL: seared chicken never returns to the pasta:\n", method);
  process.exit(1);
}
if (!/parmesan/i.test(method)) {
  console.error("FAIL: listed parmesan never appears in the method:\n", method);
  process.exit(1);
}

const sauce = repaired.steps.find(
  (step) =>
    /yogurt|cottage/i.test(step.instruction) &&
    /whisk|stir|blend/i.test(step.instruction)
);
if (!sauce || /garlic/i.test(sauce.instruction)) {
  console.error("FAIL: raw garlic still in the cold sauce:", sauce?.instruction);
  process.exit(1);
}
const bloomed = repaired.steps.some(
  (step) => /garlic/i.test(step.instruction) && /fragrant/i.test(step.instruction)
);
if (!bloomed) {
  console.error("FAIL: garlic was never bloomed:\n", method);
  process.exit(1);
}

const reserved = repaired.steps.filter((step) =>
  /pasta water/i.test(step.instruction)
);
if (reserved.length < 2) {
  console.error(
    "FAIL: pasta water reserved but never used:\n",
    method
  );
  process.exit(1);
}

const again = repairCookMethod(repaired);
if (again.steps.map((s) => s.instruction).join("\n") !== method) {
  console.error("FAIL: repair is not idempotent.");
  process.exit(1);
}

const heated = repairCookMethod({
  ...broken,
  steps: [
    ...broken.steps.slice(0, 4),
    {
      order: 5,
      instruction:
        "Stir the yogurt emulsion into the skillet. Cook for an additional minute.",
      duration_minutes: 1,
    },
  ],
} as GourmetRecipe);
const heatedMethod = heated.steps.map((step) => step.instruction).join("\n");
if (/additional minute|cook for 1/i.test(heatedMethod)) {
  console.error("FAIL: yogurt returned to the flame:\n", heatedMethod);
  process.exit(1);
}
if (!/off the heat|curdle|residual heat/i.test(heatedMethod)) {
  console.error("FAIL: no off-heat guard after yogurt:\n", heatedMethod);
  process.exit(1);
}
const heatedAgain = repairCookMethod(heated);
if (
  heatedAgain.steps.map((s) => s.instruction).join("\n") !== heatedMethod
) {
  console.error("FAIL: yogurt-heat repair is not idempotent.");
  process.exit(1);
}

const noodleSwap = repairCookMethod({
  ...base,
  ingredients: [
    { name: "Pasta", quantity: "55", unit: "g", notes: "dry weight" },
    { name: "Chicken breast", quantity: "180", unit: "g" },
    { name: "Greek yogurt", quantity: "160", unit: "g" },
    { name: "Spinach", quantity: "50", unit: "g" },
  ],
  steps: [
    { order: 1, instruction: "Chop the pasta into thin strips." },
    { order: 2, instruction: "Sear the chicken." },
    {
      order: 3,
      instruction: "Wilt the spinach in the pan.",
    },
    {
      order: 4,
      instruction:
        "Blend the Greek yogurt, pasta strips, lemon, and mustard in a blender until smooth.",
    },
    {
      order: 5,
      instruction:
        "Combine the sauce, chicken, and spinach in a bowl. Boil 55g dry pasta until al dente. Reserve a splash of pasta water and drain.",
    },
    {
      order: 6,
      instruction:
        "Serve immediately. Loosen with reserved pasta water and drain.",
    },
  ],
} as GourmetRecipe);

const noodleMethod = noodleSwap.steps.map((step) => step.instruction);
const noodleText = noodleMethod.join("\n");
if (/chop.{0,40}pasta|pasta strips/i.test(noodleText)) {
  console.error("FAIL: vegetable-noodle template survived:\n", noodleText);
  process.exit(1);
}
if (noodleSwap.steps.some((step) => /blend/i.test(step.instruction) && /pasta/i.test(step.instruction))) {
  console.error("FAIL: pasta blended into the sauce:\n", noodleText);
  process.exit(1);
}
const boilAt = noodleSwap.steps.findIndex(
  (step) => /\bboil\b/i.test(step.instruction) && /pasta/i.test(step.instruction)
);
const tossAt = noodleSwap.steps.findIndex(
  (step) => /\btoss\b/i.test(step.instruction) && /pasta/i.test(step.instruction)
);
const serveAt = noodleSwap.steps.findIndex((step) =>
  /^(plate|serve)\b|\bserve immediately\b/i.test(step.instruction.trim())
);
if (boilAt !== 0) {
  console.error(`FAIL: pasta boil must be first, was ${boilAt}:\n`, noodleText);
  process.exit(1);
}
if (tossAt < 0 || (serveAt >= 0 && tossAt > serveAt)) {
  console.error("FAIL: toss must come before plating:\n", noodleText);
  process.exit(1);
}
if (
  serveAt >= 0 &&
  serveAt !== tossAt &&
  /loosen|drain/i.test(noodleSwap.steps[serveAt].instruction)
) {
  console.error("FAIL: drainage after plating:\n", noodleText);
  process.exit(1);
}
if (!noodleSwap.steps.some((step) => /sear/i.test(step.instruction))) {
  console.error("FAIL: sear was dropped:\n", noodleText);
  process.exit(1);
}
if (
  !noodleSwap.steps.some(
    (step) =>
      /yogurt/i.test(step.instruction) &&
      /whisk|stir|blend/i.test(step.instruction)
  )
) {
  console.error("FAIL: yogurt sauce was dropped:\n", noodleText);
  process.exit(1);
}

const crowded = repairCookMethod(
  {
    ...base,
    ingredients: [
      { name: "Pasta", quantity: "55", unit: "g", notes: "dry weight" },
      { name: "Chicken breast", quantity: "180", unit: "g" },
      { name: "Greek yogurt", quantity: "160", unit: "g" },
      { name: "Garlic", quantity: "5", unit: "g" },
      { name: "Parmesan", quantity: "20", unit: "g" },
    ],
    steps: [
      { order: 1, instruction: "Sear the chicken." },
      {
        order: 2,
        instruction: "Sauté the garlic until fragrant.",
      },
      {
        order: 3,
        instruction: "Add the noodles and cook for 2-3 minutes until tender.",
      },
      {
        order: 4,
        instruction: "add Greek yogurt to the pan with garlic and.",
      },
      { order: 5, instruction: "Combine the sauce in a bowl." },
      { order: 6, instruction: "Serve immediately." },
    ],
  } as GourmetRecipe,
  { effort: "weeknight" }
);
const crowdedText = crowded.steps.map((step) => step.instruction).join("\n");
if (crowded.steps.length > 6) {
  console.error(
    `FAIL: weeknight still has ${crowded.steps.length} steps:\n`,
    crowdedText
  );
  process.exit(1);
}
if (/noodles and cook|until tender/i.test(crowdedText)) {
  console.error("FAIL: ghost vegetable-noodle sauté survived:\n", crowdedText);
  process.exit(1);
}
if (/\band\.\s*$/m.test(crowdedText) || /garlic and\./i.test(crowdedText)) {
  console.error("FAIL: truncated conjunction survived:\n", crowdedText);
  process.exit(1);
}
if (!/yogurt/i.test(crowdedText)) {
  console.error("FAIL: yogurt step was dropped:\n", crowdedText);
  process.exit(1);
}

const burgerGhost = repairCookMethod({
  ...base,
  name: "Test Burger",
  tagline: "A stacked burger.",
  plating: { composition: "stacked burger on a bun" },
  ingredients: [
    { name: "Whole Wheat Burger Bun", quantity: "70", unit: "g", notes: "1 bun" },
    { name: "Chicken breast", quantity: "150", unit: "g" },
    { name: "Cheddar", quantity: "20", unit: "g" },
    { name: "Mixed Greens", quantity: "60", unit: "g" },
    { name: "Pasta", quantity: "94", unit: "g", notes: "dry weight" },
  ],
  steps: [
    {
      order: 1,
      instruction:
        "Boil 94g dry pasta until al dente. Reserve a splash of pasta water and drain.",
    },
    { order: 2, instruction: "Toast the bun cut-side down." },
    { order: 3, instruction: "Sear the chicken until browned." },
    { order: 4, instruction: "Melt the cheddar on the patty." },
    {
      order: 5,
      instruction:
        "Loosen with the reserved pasta water so the sauce emulsifies and clings.",
    },
    { order: 6, instruction: "Place the top bun on." },
  ],
} as GourmetRecipe);

const burgerGhostText = burgerGhost.steps.map((step) => step.instruction).join("\n");
if (burgerGhost.ingredients.some((line) => /pasta/i.test(line.name))) {
  console.error("FAIL: ghost pasta stayed on a bun plate.");
  process.exit(1);
}
if (/\bpasta\b|pasta water|emulsif/i.test(burgerGhostText)) {
  console.error("FAIL: pasta method survived on a burger:\n", burgerGhostText);
  process.exit(1);
}
if (!/place the top bun/i.test(burgerGhostText)) {
  console.error("FAIL: burger assembly was dropped:\n", burgerGhostText);
  process.exit(1);
}

const zucchiniBurgerPasta = repairCookMethod({
  ...base,
  name: "Zucchini Chicken Burger",
  original_craving: "cheese burger",
  tagline: "A stacked burger.",
  plating: { composition: "zucchini rounds as buns" },
  ingredients: [
    { name: "Chicken breast", quantity: "180", unit: "g" },
    { name: "Pasta", quantity: "110", unit: "g", notes: "dry weight" },
    { name: "Greek yogurt", quantity: "120", unit: "g" },
  ],
  steps: [
    {
      order: 1,
      instruction:
        "Boil 110g dry pasta until al dente. Reserve a splash of pasta water, then drain.",
    },
    { order: 2, instruction: "Sear the chicken." },
    { order: 3, instruction: "Toss the drained pasta with the sauce off the heat." },
  ],
} as GourmetRecipe);
if (zucchiniBurgerPasta.ingredients.some((line) => /pasta/i.test(line.name))) {
  console.error("FAIL: pasta stayed on a burger that used zucchini as the bun.");
  process.exit(1);
}
if (/\bpasta\b|pasta water|boil \d/i.test(
  zucchiniBurgerPasta.steps.map((s) => s.instruction).join("\n")
)) {
  console.error(
    "FAIL: pasta method compiled for a burger:\n",
    zucchiniBurgerPasta.steps.map((s) => s.instruction).join("\n")
  );
  process.exit(1);
}

const fettuccineToss = repairCookMethod({
  ...base,
  ingredients: [
    { name: "Pasta", quantity: "90", unit: "g", notes: "dry weight" },
    { name: "Greek yogurt", quantity: "160", unit: "g" },
    { name: "Chicken breast", quantity: "150", unit: "g" },
    { name: "Garlic", quantity: "5", unit: "g" },
    { name: "Parmesan", quantity: "20", unit: "g" },
  ],
  steps: [
    {
      order: 1,
      instruction:
        "Boil 90g dry pasta until al dente. Reserve a splash of pasta water, then drain.",
    },
    { order: 2, instruction: "Sear the chicken." },
    {
      order: 3,
      instruction: "Blend the Greek yogurt until smooth.",
    },
    {
      order: 4,
      instruction: "Add cooked fettuccine to the pan and toss well.",
    },
    {
      order: 5,
      instruction: "Toss the drained pasta with the sauce off the heat.",
    },
    { order: 6, instruction: "Serve immediately." },
  ],
} as GourmetRecipe);
const fettuccineText = fettuccineToss.steps.map((step) => step.instruction);
const tossSteps = fettuccineText.filter(
  (text) => /toss/i.test(text) && /pasta|fettuccine/i.test(text)
);
if (tossSteps.length !== 1) {
  console.error(
    `FAIL: fettuccine toss and pasta toss both survived (${tossSteps.length}):\n`,
    fettuccineText.join("\n")
  );
  process.exit(1);
}

const squashPlate = repairCookMethod({
  ...base,
  name: "Roasted squash bowl",
  ingredients: [
    { name: "Spaghetti squash", quantity: "145", unit: "g" },
    { name: "Chicken breast", quantity: "180", unit: "g" },
    { name: "Greek yogurt", quantity: "120", unit: "g" },
  ],
  steps: [
    { order: 1, instruction: "Halve the spaghetti squash and roast for 30 minutes." },
    { order: 2, instruction: "Sear the chicken until golden." },
    { order: 3, instruction: "Stir the Greek yogurt in off the heat." },
  ],
} as GourmetRecipe);
const squashText = squashPlate.steps.map((step) => step.instruction).join("\n");
if (/\bboil\b/i.test(squashText) && /dry pasta/i.test(squashText)) {
  console.error("FAIL: spaghetti squash compiled as wheat pasta:\n", squashText);
  process.exit(1);
}
if (!/roast/i.test(squashText) || !/squash/i.test(squashText)) {
  console.error("FAIL: squash roast was dropped:\n", squashText);
  process.exit(1);
}

const burgerFold = repairCookMethod({
  ...base,
  name: "Post-Workout Chicken Burger",
  original_craving: "cheese burger",
  ingredients: [
    { name: "Chicken breast", quantity: "180", unit: "g" },
    { name: "Whole Wheat Burger Bun", quantity: "70", unit: "g" },
    { name: "Greek yogurt", quantity: "60", unit: "g" },
    { name: "Spinach", quantity: "80", unit: "g" },
  ],
  steps: [
    { order: 1, instruction: "Preheat a nonstick pan over medium heat." },
    {
      order: 2,
      instruction:
        "Season the chicken breast, then cook until golden. Slice into strips when done.",
    },
    {
      order: 3,
      instruction: "Mix Greek yogurt and lemon juice. Stir it in off the heat.",
    },
    { order: 4, instruction: "Toast the burger buns until crispy." },
    { order: 5, instruction: "Sauté garlic then wilt the spinach." },
    {
      order: 6,
      instruction:
        "Assemble the burger: yogurt on the bottom bun, top with chicken strips and spinach. Place the top bun to complete.",
    },
  ],
} as GourmetRecipe);
const burgerFoldText = burgerFold.steps.map((step) => step.instruction).join("\n");
if (/fold it through the .+ bun and sauce/i.test(burgerFoldText)) {
  console.error("FAIL: pasta fold leaked onto a burger:\n", burgerFoldText);
  process.exit(1);
}

const carbonaraPlate = ensureCarbonaraEmulsion(
  {
    ...base,
    name: "Post-Workout Protein Carbonara",
    original_craving: "carbonara",
    ingredients: [
      { name: "spaghetti", quantity: "100", unit: "g" },
      { name: "chicken breast", quantity: "250", unit: "g" },
      { name: "Greek yogurt", quantity: "120", unit: "ml" },
      { name: "Egg yolk", quantity: "17", unit: "g", notes: "1 yolk" },
      { name: "mustard", quantity: "1", unit: "ml" },
    ],
    steps: [
      { order: 1, instruction: "Boil 100g dry pasta until al dente. Reserve pasta water, drain." },
      { order: 2, instruction: "Sear the chicken." },
      {
        order: 3,
        instruction: "In a blender, combine Greek yogurt and mustard. Stir it into the pan off the heat.",
      },
      { order: 4, instruction: "Toss the drained pasta with the sauce off the heat." },
    ],
  } as GourmetRecipe,
  { craving: "carbonara", targetCalories: 480 }
);
const carbonaraCooked = repairCookMethod(carbonaraPlate);
const carbonaraText = carbonaraCooked.steps.map((step) => step.instruction).join("\n");
if (!carbonaraCooked.ingredients.some((line) => /egg|yolk/i.test(line.name))) {
  console.error("FAIL: carbonara never received an emulsion egg");
  process.exit(1);
}
if (!/egg|yolk/i.test(carbonaraText)) {
  console.error("FAIL: carbonara method never uses the egg:\n", carbonaraText);
  process.exit(1);
}
if (/blend|blitz|processor/i.test(carbonaraText)) {
  console.error("FAIL: carbonara called for a blender:\n", carbonaraText);
  process.exit(1);
}
if (!/whisk/i.test(carbonaraText)) {
  console.error("FAIL: carbonara should whisk in the pan:\n", carbonaraText);
  process.exit(1);
}
if (carbonaraCooked.steps.length > 4) {
  console.error(
    `FAIL: weeknight carbonara has ${carbonaraCooked.steps.length} steps:\n`,
    carbonaraText
  );
  process.exit(1);
}
if (!/off the heat|residual heat/i.test(carbonaraText)) {
  console.error("FAIL: carbonara egg is not off-heat:\n", carbonaraText);
  process.exit(1);
}
if (/scramble/i.test(carbonaraText) === false) {
  // The compiled instruction must warn the cook; "never scramble" is the physics.
  console.error("FAIL: carbonara missing scramble guard:\n", carbonaraText);
  process.exit(1);
}
const carbonaraAgain = repairCookMethod(carbonaraCooked);
if (
  carbonaraAgain.steps.map((s) => s.instruction).join("\n") !== carbonaraText
) {
  console.error("FAIL: carbonara emulsion repair is not idempotent.");
  process.exit(1);
}

const signed = applySignaturePlate(
  {
    ...base,
    name: "Post-Workout Protein Carbonara",
    original_craving: "carbonara",
    tagline: "A lighter twist that mimics traditional carbonara without the guilt.",
    psychological_reward_note:
      "Enjoy carbonara without the guilt, thanks to a lighter yogurt emulsion.",
    ingredients: [
      { name: "spaghetti", quantity: "100", unit: "g" },
      { name: "chicken breast", quantity: "250", unit: "g" },
      { name: "Greek yogurt", quantity: "150", unit: "g" },
      { name: "Egg yolk", quantity: "17", unit: "g", notes: "1 yolk" },
      { name: "garlic", quantity: "15", unit: "g" },
      { name: "spinach", quantity: "60", unit: "g" },
      { name: "mustard", quantity: "8", unit: "g" },
    ],
    steps: [
      { order: 1, instruction: "Boil pasta." },
      { order: 2, instruction: "Sear chicken, wilt spinach, bloom garlic." },
    ],
  } as GourmetRecipe,
  { craving: "carbonara", targetCalories: 480 }
);
const signedNames = signed.ingredients.map((line) => line.name.toLowerCase()).join(" ");
if (/spinach/.test(signedNames)) {
  console.error("FAIL: signature plate kept volume spinach:", signedNames);
  process.exit(1);
}
if (/\bgarlic\b/.test(signedNames)) {
  console.error("FAIL: signature plate kept unasked garlic:", signedNames);
  process.exit(1);
}
if (/mustard/.test(signedNames)) {
  console.error("FAIL: signature plate kept mustard on carbonara:", signedNames);
  process.exit(1);
}
if (!/parmesan/.test(signedNames)) {
  console.error("FAIL: carbonara missing parmesan signature:", signedNames);
  process.exit(1);
}
const yogurtG = Number(
  signed.ingredients.find((line) => /yogurt/i.test(line.name))?.quantity
);
if (yogurtG > 80) {
  console.error(`FAIL: yogurt binder was a tub: ${yogurtG}g`);
  process.exit(1);
}
if (/guilt|mimics|lighter twist/i.test(signed.psychological_reward_note + signed.tagline)) {
  console.error("FAIL: permission copy still apologizes:", signed.psychological_reward_note);
  process.exit(1);
}
const signedCook = repairCookMethod(signed, { effort: "weeknight" });
const signedMethod = signedCook.steps.map((step) => step.instruction).join("\n");
if (signedCook.steps.length > 4) {
  console.error(`FAIL: signed carbonara has ${signedCook.steps.length} steps:\n`, signedMethod);
  process.exit(1);
}
if (/spinach|mustard/i.test(signedMethod)) {
  console.error("FAIL: dropped extras survived in the method:\n", signedMethod);
  process.exit(1);
}
if (/blend|blitz|processor/i.test(signedMethod)) {
  console.error("FAIL: weeknight carbonara still wants a blender:\n", signedMethod);
  process.exit(1);
}

const creamyPasta = applySignaturePlate(
  {
    ...base,
    name: "Weeknight creamy pasta",
    original_craving: "creamy pasta",
    tagline: "A healthier twist on cream sauce without the guilt.",
    psychological_reward_note: "Creamy pasta without the guilt.",
    ingredients: [
      { name: "spaghetti", quantity: "90", unit: "g" },
      { name: "chicken breast", quantity: "180", unit: "g" },
      { name: "Greek yogurt", quantity: "180", unit: "g" },
      { name: "spinach", quantity: "80", unit: "g" },
      { name: "garlic", quantity: "8", unit: "g" },
    ],
    steps: [
      { order: 1, instruction: "Boil pasta." },
      { order: 2, instruction: "Sear chicken and wilt spinach." },
    ],
  } as GourmetRecipe,
  { craving: "creamy pasta", targetCalories: 480 }
);
const creamyNames = creamyPasta.ingredients.map((line) => line.name.toLowerCase()).join(" ");
if (/spinach/.test(creamyNames)) {
  console.error("FAIL: unasked spinach survived on unnamed pasta:", creamyNames);
  process.exit(1);
}
if (!/\bgarlic\b/.test(creamyNames)) {
  console.error("FAIL: garlic on creamy pasta is the dish, not a carbonara exception:", creamyNames);
  process.exit(1);
}
const creamyYogurt = Number(
  creamyPasta.ingredients.find((line) => /yogurt/i.test(line.name))?.quantity
);
if (creamyYogurt > 100) {
  console.error(`FAIL: yogurt binder not capped on unnamed pasta: ${creamyYogurt}g`);
  process.exit(1);
}
if (!/parmesan/.test(creamyNames)) {
  console.error("FAIL: dairy pasta missing cheese signature:", creamyNames);
  process.exit(1);
}
if (/guilt|healthier twist/i.test(creamyPasta.psychological_reward_note + creamyPasta.tagline)) {
  console.error("FAIL: unnamed pasta still apologizes:", creamyPasta.psychological_reward_note);
  process.exit(1);
}
const creamyCook = repairCookMethod(creamyPasta, { effort: "weeknight" });
if (creamyCook.steps.length > 4) {
  console.error(`FAIL: unnamed pasta has ${creamyCook.steps.length} steps`);
  process.exit(1);
}
if (/blend|blitz|processor/i.test(creamyCook.steps.map((s) => s.instruction).join("\n"))) {
  console.error("FAIL: unnamed pasta called for a blender");
  process.exit(1);
}

const burgerSigned = applySignaturePlate(
  {
    ...base,
    name: "Chicken burger",
    original_craving: "cheeseburger",
    ingredients: [
      { name: "Whole Wheat Burger Bun", quantity: "70", unit: "g" },
      { name: "chicken breast", quantity: "160", unit: "g" },
      { name: "lettuce leaves", quantity: "30", unit: "g" },
      { name: "spinach", quantity: "80", unit: "g" },
    ],
    steps: [{ order: 1, instruction: "Toast the bun. Sear the chicken. Wilt spinach." }],
  } as GourmetRecipe,
  { craving: "cheeseburger" }
);
const burgerNames = burgerSigned.ingredients.map((line) => line.name.toLowerCase()).join(" ");
if (/spinach/.test(burgerNames)) {
  console.error("FAIL: wilted spinach survived on a burger:", burgerNames);
  process.exit(1);
}
if (!/lettuce|greens/.test(burgerNames)) {
  console.error("FAIL: burger lettuce was dropped as volume:", burgerNames);
  process.exit(1);
}
if (!/bun/.test(burgerNames)) {
  console.error("FAIL: burger lost its bun:", burgerNames);
  process.exit(1);
}

const tikka = applySignaturePlate(
  {
    ...base,
    name: "Chicken tikka bowl",
    original_craving: "chicken tikka masala",
    tagline: "A healthier twist without the guilt.",
    psychological_reward_note: "Tikka without the guilt.",
    ingredients: [
      { name: "White rice", quantity: "80", unit: "g" },
      { name: "chicken breast", quantity: "180", unit: "g" },
      { name: "Greek yogurt", quantity: "160", unit: "g" },
      { name: "spinach", quantity: "70", unit: "g" },
      { name: "garlic", quantity: "8", unit: "g" },
    ],
    steps: [
      { order: 1, instruction: "Cook rice. Sear chicken. Wilt spinach. Stir yogurt." },
    ],
  } as GourmetRecipe,
  { craving: "chicken tikka masala" }
);
const tikkaNames = tikka.ingredients.map((line) => line.name.toLowerCase()).join(" ");
if (/spinach/.test(tikkaNames)) {
  console.error("FAIL: unasked spinach survived on tikka:", tikkaNames);
  process.exit(1);
}
if (!/\bgarlic\b/.test(tikkaNames)) {
  console.error("FAIL: tikka lost garlic:", tikkaNames);
  process.exit(1);
}
if (/parmesan/.test(tikkaNames)) {
  console.error("FAIL: tikka should not gain Italian cheese:", tikkaNames);
  process.exit(1);
}
const tikkaYogurt = Number(
  tikka.ingredients.find((line) => /yogurt/i.test(line.name))?.quantity
);
if (tikkaYogurt > 100) {
  console.error(`FAIL: yogurt not capped on tikka: ${tikkaYogurt}g`);
  process.exit(1);
}
const tikkaCook = repairCookMethod(tikka, { effort: "weeknight" });
if (tikkaCook.steps.length > 4) {
  console.error(`FAIL: tikka has ${tikkaCook.steps.length} steps`);
  process.exit(1);
}
if (/parmesan|carbonara|alfredo/i.test(tikkaCook.steps.map((s) => s.instruction).join("\n"))) {
  console.error("FAIL: tikka method borrowed a pasta identity");
  process.exit(1);
}

console.log("OK");
