import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: isGoogleOAuthConfigured() });
}
