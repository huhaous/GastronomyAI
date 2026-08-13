import { NextResponse } from "next/server";
import { elevateCravingRecipe } from "@/lib/ai/openai";
import { ElevateRecipeRequestSchema } from "@/lib/ai/schema";
import { isUpstreamUnavailable } from "@/lib/ai/upstream";
import type { ElevateRecipeRequest, KitchenTool } from "@/types/recipe";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ElevateRecipeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload: ElevateRecipeRequest = {
      ...parsed.data,
      kitchen_tools: parsed.data.kitchen_tools as KitchenTool[] | undefined,
    };

    const { recipe, model } = await elevateCravingRecipe(payload);

    return NextResponse.json({ kind: "elevate", recipe, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = isUpstreamUnavailable(message) ? 503 : 500;
    return NextResponse.json(
      { error: "Failed to elevate recipe", details: message },
      { status }
    );
  }
}
