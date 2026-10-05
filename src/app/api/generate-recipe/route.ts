import { NextResponse } from "next/server";
import { generateGourmetRecipe } from "@/lib/ai/openai";
import { GenerateRecipeRequestSchema } from "@/lib/ai/schema";
import { isUpstreamUnavailable } from "@/lib/ai/upstream";
import { readAnonId } from "@/lib/telemetry/anonId";
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

    const { recipe, model } = await generateGourmetRecipe(payload, {
      anonId: readAnonId(request.headers),
    });

    return NextResponse.json({ kind: "generate", recipe, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = isUpstreamUnavailable(message) ? 503 : 500;
    // A 503 is the model being off; a 500 is our bug, and the client only ever
    // sees the message, so the stack has to land somewhere.
    if (status === 500) console.error("generate-recipe failed", err);
    return NextResponse.json(
      { error: "Failed to generate recipe", details: message },
      { status }
    );
  }
}
