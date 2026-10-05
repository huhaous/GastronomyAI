---
name: graph-physics
description: >-
  Enforces GastronomyAI graph physics over bandaid patches. Use whenever
  changing cook methods, method integrity, the knowledge graph, portion
  scaling, Elevate output, sauce/yogurt/starch behavior, scrubbing off-plate
  foods, filling method holes, calorie/protein floors, or any recipe
  post-check. Also use when the user says bandaid, permanent fix, missing
  token, hole, yogurt, mapo, starchCook, saucePhysics, or methodRole.
---

# Graph physics, not bandaids

The engine is **prompt + graph + post-check**. Cook identity is **physics on the plate and the graph**, never a function or regex per dish name.

Read this before writing cook, graph, scaler, or method-integrity code. If a proposed change fails the gate below, do not ship it.

## The gate (fail = undo)

Before finishing, answer no to all of these:

1. Did I add `ensureCarbonara`, `ensureTikka`, `ensureMapo`, or any other dish-named hook?
2. Did I add a craving word-list (`tikka|alfredo|carbonara|raita|mapo`)?
3. Did I grow `isBrokenFragment` / tidy regexes to catch one new hole (`the cooked`, `and until`, `10g,`)?
4. Did I delete a noun from a sentence and then patch the leftover grammar?
5. Did I dump missing foods with `Add the X, Y, and Z`?
6. Did I add yogurt (or any binder) because "every plate needs fat-mimicry"?

If any answer is yes: revert that approach. Put the physics on a **graph node** and **compile** the method from roles.

## Where physics lives

| Kind of cook / sauce | Lives on the node as | Examples |
|---|---|---|
| Starch cook | `starchCook` | `boil_reserve_toss` · `simmer` · `reheat` · `toast_assemble` |
| Same carb, different cook | `starchFamily` | dry rice vs leftover/pouch rice = `rice` |
| How a listed food appears in the method | `methodRole` | `fold_into_sauce` · `slurry` · `sauce_join` · `assemble` · `mix_in` · `finish` |
| Sauce body | `saucePhysics` | `cold_dairy` (yogurt/cottage) · `starch_gloss` (cornstarch) |
| Volume green | `elevationRole: volume` | spinach wilt — not a mapo special case |
| Pasta stand-in | `volumeNoodle` | zucchini ribbons are not wheat pasta |

A new *kind* of cook or sauce gets a new field value on a node. A new *food* gets a node (or an alias on the existing node). Never a new `ensureX`.

## Compile, do not patch

When the model writes a food that is not on the plate:

- Identify the **cook** that food implied (wilt, spiralize, dry simmer, yogurt emulsion).
- **Drop that cook** — the whole sentence or action — the same way off-plate zucchini-noodle sentences are dropped.
- **Compile** what remains from `starchCook` / `methodRole` / `saucePhysics` on the foods that are still listed.

Do not: delete `spinach` from `tofu, and spinach until glossy and wilted` and then regex `and until`.

One plate, one starch cook (toast > boil > reheat > simmer). One plate, one sauce physics (lecithin pasta wins; else starch gloss vs cold dairy — yogurt is not the default chili-oil gloss).

## Sauce and yogurt

Yogurt/`cold_dairy` binds cream, mayo, cheese sauce, and burger sauce (`toast_assemble`). A slurry is chili-oil / pan gloss. They are not interchangeable. Keep yogurt only when that is the plate's sauce physics, or the craving named a food the yogurt node actually substitutes for. Do not keep it from a dish-name list.

## Calories

The calorie cap is a **solver ceiling**. Protein floor is lean meat, not a tub of yogurt. Do not cut meat below the gram floor and then grow it back past the cap. Do not add a second shrink pass to hide a scaler fight.

## Prompt

The prompt may state the same physics. It must not grow a per-dish exception list. Fat-mimicry uses the physics the plate already has.

## If you catch yourself

Hole in the method → the off-plate **cook** is still in the sentence. Drop the cook; compile from roles.

Wrong food (yogurt in mapo, dry simmer on a pouch) → wrong `saucePhysics` / `starchCook` on the node, or the matcher treated `cooked` as a qualifier on a dry grain. Fix the node or the match rule.

Calories over target → ceiling belongs in `solveScaling`, not a later "and then shrink rice" patch that undoes the protein floor.
