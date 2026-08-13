import { NextResponse } from "next/server";
import { generateGourmetRecipe } from "@/lib/ai/openai";
import { GenerateRecipeRequestSchema } from "@/lib/ai/schema";
import { isUpstreamUnavailable } from "@/lib/ai/upstream";
import type { GenerateRecipeRequest, KitchenTool } from "@/types/recipe";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = GenerateRecipeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload: GenerateRecipeRequest = {
      ...parsed.data,
      kitchen_tools: parsed.data.kitchen_tools as KitchenTool[],
    };

    const { recipe, model } = await generateGourmetRecipe(payload);

    return NextResponse.json({ kind: "generate", recipe, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = isUpstreamUnavailable(message) ? 503 : 500;
    return NextResponse.json(
      { error: "Failed to generate recipe", details: message },
      { status }
    );
  }
}
