import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { isProviderUsageId, queryProviderUsage } from "@/lib/provider-usage";
import { getModelRuntimeWithExtensions } from "@/lib/model-runtime";
import { collectProviderListingInputs } from "@/lib/provider-listing-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });

  try {
    const modelRuntime = await getModelRuntimeWithExtensions();
    const inputs = await collectProviderListingInputs(modelRuntime);
    const connected: { id: string; name: string }[] = [];
    for (const p of inputs) {
      if (!p.status.configured) continue;
      if (isProviderUsageId(p.id) || p.id === "antigravity" || p.id === "xai" || p.id === "openai-codex" || p.id === "anthropic" || p.id === "google") {
        let displayName = p.name;
        if (p.id === "antigravity") displayName = "Google";
        else if (p.id === "openai-codex") displayName = "Codex";
        else if (p.id === "xai") displayName = "xAI";
        else if (p.id === "anthropic") displayName = "Claude";
        connected.push({
          id: p.id,
          name: displayName,
        });
      }
    }
    return NextResponse.json({ connectedProviders: connected });
  } catch {
    return NextResponse.json({ connectedProviders: [] });
  }
}

export async function POST(request: Request) {
  if (!isApiRequestAllowed(request)) return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  if (!hasJsonContentType(request)) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });

  let body: { providerId?: unknown };
  try {
    body = await request.json() as { providerId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const providerId = typeof body.providerId === "string" ? body.providerId : "";
  if (!isProviderUsageId(providerId)) return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });

  try {
    const result = await queryProviderUsage(providerId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({
      providerId,
      status: "query-failed",
      message: "The provider usage query failed.",
    });
  }
}
