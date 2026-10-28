/**
 * Every line below is a real ingredient the hosted engine failed to price.
 *
 * One chicken tikka masala told the diner 478 kcal while the graph could only
 * vouch for 268 — five of twelve lines went unmatched, and four of those five
 * were foods the graph already knew under slightly different words. The card
 * looked finished; only the coverage log said otherwise.
 */

import { findIngredientNode } from "../src/data/knowledgeGraph";

function assert(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
  console.log(`ok   ${message}`);
}

function resolves(line: string, expectedKey: string): void {
  const node = findIngredientNode(line);
  assert(
    node?.key === expectedKey,
    `"${line}" resolves to ${expectedKey} (got ${node?.key ?? "nothing"})`
  );
}

// --- the adjective in the middle -----------------------------------------
// A qualifier only ever worked at an edge: "cooked basmati rice" is not a
// contiguous phrase inside "cooked white basmati rice".
resolves("cooked white basmati rice", "cooked-white-rice");
resolves("cooked basmati rice", "cooked-white-rice");
// Without "cooked" the same words are the dry grain, at nearly three times
// the calories per 100g. The adjective fix must not blur that line.
resolves("white basmati rice", "white-rice");

// --- seasonings that were meant to be exempt ------------------------------
// NEGLIGIBLE_SEASONINGS exists so a plate seasoned with salt can still be
// fully verified. "fine" salt was flipping plates to unverified for ~0 kcal.
for (const line of ["fine salt", "fine sea salt", "tikka masala spice blend"]) {
  const node = findIngredientNode(line);
  assert(
    node?.negligible === true,
    `"${line}" is a negligible seasoning, not an unknown food`
  );
}

// --- foods the graph genuinely did not have -------------------------------
resolves("canola oil", "neutral-oil");
resolves("vegetable oil", "neutral-oil");
resolves("tomato passata", "tomato-passata");
resolves("passata", "tomato-passata");

// Passata is strained, paste is concentrated. Pricing 130g of one as the
// other invents roughly 65 kcal, which is how a card drifts without lying.
const passata = findIngredientNode("tomato passata");
const paste = findIngredientNode("tomato paste");
assert(
  passata?.key !== paste?.key,
  "passata and paste stay separate nodes"
);
assert(
  (passata?.macroPer100g.calories ?? 0) < (paste?.macroPer100g.calories ?? 0),
  "passata is the lighter of the two"
);

// --- the taco and cheeseburger backlog -----------------------------------
// One chicken tacos plate reported 461 kcal and could only vouch for 254:
// the tortilla, the salsa, the cabbage and the lime all went unpriced, so
// 45% of the energy on the card rested on nothing the graph had seen.
resolves("corn tortillas", "corn-tortilla");
resolves("tomato salsa", "salsa");
resolves("shredded cabbage", "green-cabbage");
resolves("lime juice", "lime-juice");
// A cheeseburger lost only one line — but one line is enough to drop a whole
// plate from verified to estimated.
resolves("iceberg lettuce", "iceberg-lettuce");
resolves("shredded iceberg", "iceberg-lettuce");

// Iceberg is denser shredded than loose leaves are. Reading a cup of it off
// the mixed-greens node would have understated the line by well over double.
const iceberg = findIngredientNode("iceberg lettuce");
const greens = findIngredientNode("mixed greens");
assert(
  iceberg?.key !== greens?.key,
  "iceberg keeps its own node rather than borrowing mixed greens"
);
assert(
  (iceberg?.gramsPer?.cup ?? 0) > (greens?.gramsPer?.cup ?? 0),
  "a cup of shredded iceberg weighs more than a cup of loose greens"
);

// Plain "lettuce" is still the mixed-greens node, and a lime wedge is still
// a garnish worth zero calories — neither new node may swallow them.
resolves("lettuce", "mixed-greens");
assert(
  findIngredientNode("lime wedge")?.negligible === true,
  "a lime wedge stays a negligible garnish"
);

// --- how the supermarket writes it ---------------------------------------
// Re-running the same taco craving after the nodes above landed produced a
// second, more telling failure: every missing line was a food the graph
// already held, described by its packet. 250g of chicken breast went
// unpriced because the line called it "raw chicken breast strips".
resolves("raw chicken breast strips", "chicken-breast");
resolves("bagged shredded red cabbage", "green-cabbage");
resolves("pre-diced red onion", "onion");
assert(
  findIngredientNode("taco seasoning blend")?.negligible === true,
  '"taco seasoning blend" is a negligible seasoning'
);

// --- the invariants the looser matcher must not break ---------------------
const squash = findIngredientNode("spaghetti squash");
const spaghetti = findIngredientNode("spaghetti");
assert(
  squash?.key !== spaghetti?.key,
  "spaghetti still does not claim spaghetti squash"
);

// Content words are compared in any order now, so guard the pairs that differ
// by exactly one real noun rather than by an adjective.
const chickenBreast = findIngredientNode("chicken breast");
const chickenThigh = findIngredientNode("chicken thigh");
if (chickenBreast && chickenThigh) {
  assert(
    chickenBreast.key !== chickenThigh.key,
    "breast and thigh stay distinct"
  );
}

// A line that reduces to no content words at all must not match everything.
assert(
  findIngredientNode("fresh raw whole") === undefined,
  "a line of pure qualifiers matches nothing"
);

console.log("\ngraph-match-smoke ok");
