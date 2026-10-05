import { findIngredientNode } from "../src/data/knowledgeGraph";
import { repairCookMethod } from "../src/lib/cook/methodIntegrity";
import type { GourmetRecipe } from "../src/types/recipe";

function assert(cond: unknown, message: string): void {
  if (!cond) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`ok   ${message}`);
  }
}

function matched(query: string, expectName: string): void {
  const node = findIngredientNode(query);
  assert(
    node?.name.toLowerCase().includes(expectName.toLowerCase()) ||
      node?.cookName?.toLowerCase().includes(expectName.toLowerCase()),
    `${query} → ${node?.name ?? "undefined"} (want ${expectName})`
  );
}

matched("cooked white rice pouch", "Cooked White Rice");
matched("cooked jasmine rice", "Cooked White Rice");
matched("leftover rice", "Cooked White Rice");
matched("white rice", "White Rice");
matched("white burger bun", "bun");
matched("yellow onion", "onion");
matched("silken tofu", "Silken");
matched("unsalted chicken stock", "Broth");
matched("tomato", "tomato");

{
  const pouch = findIngredientNode("cooked white rice pouch");
  assert(pouch?.handling?.starchCook === "reheat", "pouch rice cooks as reheat");
  const dry = findIngredientNode("white rice");
  assert(dry?.handling?.starchCook === "simmer", "dry rice cooks as simmer");
  const tofu = findIngredientNode("silken tofu");
  assert(tofu?.handling?.methodRole === "fold_into_sauce", "silken tofu folds into sauce");
  const gel = findIngredientNode("cornstarch");
  assert(gel?.handling?.methodRole === "slurry", "cornstarch is a slurry");
}

function skeleton(
  ingredients: GourmetRecipe["ingredients"],
  steps: GourmetRecipe["steps"],
  extra: Partial<GourmetRecipe> = {}
): GourmetRecipe {
  return {
    name: "Test plate",
    tagline: "Test",
    total_time_minutes: 15,
    active_time_minutes: 15,
    servings: 1,
    macros: { calories: 480, protein_g: 40, carbs_g: 40, fat_g: 12 },
    fat_loss_metrics: {
      satiety_index: 7,
      satiety_label: "High Satiety",
      tef_kcal: 50,
      glycemic_impact: "moderate",
      glycemic_note: "",
    },
    fat_mimicry_tech: {
      title: "Test",
      replaces: "oil",
      mechanism: "starch",
      mouthfeel_result: "creamy, tangy, shake-shop sauce",
      agents: [],
    },
    ingredients,
    steps,
    culinary_physics_tips: [],
    flavor_radar: { sweet: 1, sour: 1, salty: 5, umami: 6, aroma_complexity: 5 },
    texture_balance: [],
    psychological_reward_note:
      "This spends calories on a closed burger so it feels like permission to eat a burger, not a workaround.",
    plating: {
      composition: "Set the closed burger slightly off-center.",
      color_contrast: "golden bun, orange cheddar, red tomato, green lettuce",
    },
    tools_used: ["stovetop"],
    ...extra,
  };
}

const burger = repairCookMethod(
  skeleton(
    [
      { name: "96% lean ground beef", quantity: "118", unit: "g" },
      { name: "liquid egg whites", quantity: "80", unit: "ml" },
      { name: "white burger bun", quantity: "65", unit: "g" },
      { name: "reduced-fat cheddar cheese", quantity: "18", unit: "g" },
      { name: "0% Greek yogurt", quantity: "35", unit: "g" },
      { name: "ketchup", quantity: "10", unit: "g" },
      { name: "yellow mustard", quantity: "8", unit: "g" },
      { name: "dill pickle slices", quantity: "25", unit: "g" },
      { name: "tomato", quantity: "40", unit: "g" },
      { name: "lettuce", quantity: "20", unit: "g" },
      { name: "yellow onion", quantity: "20", unit: "g" },
      { name: "Worcestershire sauce", quantity: "5", unit: "ml" },
    ],
    [
      {
        order: 1,
        instruction:
          "Mix the lean ground beef, liquid egg whites, 10g minced yellow onion, Worcestershire sauce, salt, and black pepper into one wide patty.",
      },
      {
        order: 2,
        instruction:
          "Sear the patty in a hot nonstick pan for 4 minutes per side, adding the cheddar on top for the final 30 seconds.",
      },
      {
        order: 3,
        instruction: "Toast the cut-sides down in the same pan.",
      },
      {
        order: 4,
        instruction:
          "Off heat, whisk the Greek yogurt, ketchup, and mustard in the warm pan, then assemble the bun with sauce, cheesy patty, pickle, lettuce, and remaining onion.",
      },
    ]
  ),
  { effort: "weeknight" }
);

const burgerMethod = burger.steps.map((s) => s.instruction).join(" ");
assert(/onion/i.test(burgerMethod), "burger method keeps onion");
assert(!/\b10g,\s/i.test(burgerMethod), "burger method does not drop onion after 10g");
assert(/remaining onion/i.test(burgerMethod), "burger assemble keeps remaining onion");
assert(/closed burger/i.test(burger.plating.composition), "plating keeps burger");
assert(/tomato/i.test(burger.plating.color_contrast ?? ""), "contrast keeps tomato");
assert(/burger/i.test(burger.psychological_reward_note), "reward note keeps burger");
assert(
  /shake-shop/i.test(burger.fat_mimicry_tech.mouthfeel_result),
  "mouthfeel keeps shake-shop"
);
assert(
  burger.steps.some((s) => /toast|bun/i.test(s.instruction)),
  "toast compile does not wipe a bun method"
);

const mapo = repairCookMethod(
  skeleton(
    [
      { name: "99% lean ground chicken breast", quantity: "150", unit: "g" },
      { name: "silken tofu", quantity: "150", unit: "g" },
      {
        name: "cooked white rice pouch",
        quantity: "85",
        unit: "g",
        notes: "as-purchased cooked rice",
      },
      { name: "garlic", quantity: "5", unit: "g" },
      { name: "fresh ginger", quantity: "5", unit: "g" },
      { name: "unsalted chicken stock", quantity: "80", unit: "ml" },
      { name: "cornstarch", quantity: "4", unit: "g" },
    ],
    [
      {
        order: 1,
        instruction:
          "Warm the cooked rice in the pan for 1 minute, then tip it into a serving bowl.",
      },
      {
        order: 2,
        instruction:
          "Add the sesame oil and ground chicken to the pan, press it thin, and brown until no pink remains.",
      },
      {
        order: 3,
        instruction:
          "Stir in the garlic, ginger, doubanjiang, soy sauce, chili flakes, and Sichuan pepper until fragrant.",
      },
    ],
    {
      plating: {
        composition:
          "Spoon the glossy mapo chicken-tofu mixture over the small mound of rice so the sauce runs down the sides.",
      },
      psychological_reward_note:
        "soft tofu over rice, but the calories are spent on protein.",
    }
  ),
  { effort: "weeknight" }
);

const mapoMethod = mapo.steps.map((s) => s.instruction).join(" ");
assert(/cooked rice/i.test(mapoMethod), "mapo method keeps cooked rice");
assert(!/Warm the cooked in/i.test(mapoMethod), "mapo does not hole out rice");
assert(/fold the silken tofu/i.test(mapoMethod), "mapo folds tofu from methodRole");
assert(/stock|cornstarch/i.test(mapoMethod), "mapo slurry uses stock/cornstarch");
assert(!/Add the silken tofu/i.test(mapoMethod), "mapo does not dump-list tofu");
assert(
  !/Simmer \d+g white rice until tender/i.test(mapoMethod),
  "pouch rice is not rewritten as a dry simmer"
);
assert(/mound of rice/i.test(mapo.plating.composition), "mapo plating keeps rice");
assert(/over rice/i.test(mapo.psychological_reward_note), "mapo reward keeps rice");

const mapoWilt = repairCookMethod(
  skeleton(
    [
      { name: "99% lean ground turkey", quantity: "165", unit: "g" },
      { name: "silken tofu", quantity: "180", unit: "g" },
      { name: "cooked white rice", quantity: "75", unit: "g" },
      { name: "low-sodium chicken stock", quantity: "120", unit: "ml" },
      { name: "cornstarch", quantity: "5", unit: "g" },
      { name: "white miso paste", quantity: "8", unit: "g" },
      { name: "chili garlic sauce", quantity: "12", unit: "g" },
    ],
    [
      {
        order: 1,
        instruction: "Warm the cooked white rice in the pan and slide it into your serving bowl.",
      },
      {
        order: 2,
        instruction: "Brown the lean ground turkey in the fragrant pan.",
      },
      {
        order: 3,
        instruction:
          "Stir in the chicken stock, cornstarch, soy sauce, miso, chili garlic sauce, silken tofu, and spinach until glossy and hot. Stir in the miso paste.",
      },
    ]
  ),
  { effort: "weeknight" }
);
const mapoWiltMethod = mapoWilt.steps.map((s) => s.instruction).join(" ");
assert(!/\bwilted\b/i.test(mapoWiltMethod), "volume-green cook leaves with the dropped green");
assert(!/and spinach/i.test(mapoWiltMethod), "off-plate spinach is not kept in the method");
assert(!/\band until\b/i.test(mapoWiltMethod), "volume-green cook is dropped, not noun-scrubbed");
assert(/silken tofu|fold the/i.test(mapoWiltMethod), "tofu compiles from fold_into_sauce after wilt drop");
assert(/stock|cornstarch|glossy/i.test(mapoWiltMethod), "slurry compiles from methodRole after wilt drop");
assert(
  (mapoWiltMethod.match(/miso/gi) ?? []).length <= 2,
  "miso is not appended twice after a short name"
);

const mapoCold = repairCookMethod(
  skeleton(
    [
      { name: "99% lean ground chicken breast", quantity: "150", unit: "g" },
      { name: "silken tofu", quantity: "150", unit: "g" },
      { name: "cooked white rice pouch", quantity: "85", unit: "g" },
      { name: "unsalted chicken stock", quantity: "80", unit: "ml" },
      { name: "cornstarch", quantity: "4", unit: "g" },
    ],
    [
      {
        order: 1,
        instruction:
          "Add the sesame oil and ground chicken to the pan, press it thin, and brown until no pink remains.",
      },
    ]
  ),
  { effort: "weeknight" }
);
const mapoColdMethod = mapoCold.steps.map((s) => s.instruction).join(" ");
assert(/Warm the cooked rice/i.test(mapoColdMethod), "missing reheat is compiled from starchCook");
assert(/fold the silken tofu/i.test(mapoColdMethod), "missing tofu is compiled from fold_into_sauce");
assert(/cornstarch/i.test(mapoColdMethod), "missing slurry is compiled from methodRole");

const pastaZuke = repairCookMethod(
  skeleton(
    [
      { name: "Fettuccine", quantity: "85", unit: "g" },
      { name: "Chicken breast", quantity: "160", unit: "g" },
      { name: "Greek yogurt", quantity: "80", unit: "g" },
    ],
    [
      {
        order: 1,
        instruction:
          "Sear the chicken with the zucchini until tender. Toss the drained pasta with the yogurt off the heat.",
      },
    ],
    { name: "Test Alfredo" }
  ),
  { effort: "weeknight" }
);
const pastaZukeMethod = pastaZuke.steps.map((s) => s.instruction).join(" ");
assert(!/zucchini/i.test(pastaZukeMethod), "off-plate zucchini cook is dropped");
assert(!/\band until\b/i.test(pastaZukeMethod), "zucchini is not noun-deleted from the sear");
assert(/sear/i.test(pastaZukeMethod) && /chicken/i.test(pastaZukeMethod), "sear compiles after the zucchini cook drops");

if (process.exitCode) {
  console.error(
    JSON.stringify(
      { burgerMethod, mapoMethod, mapoColdMethod, mapoWiltMethod, pastaZukeMethod },
      null,
      2
    )
  );
}
