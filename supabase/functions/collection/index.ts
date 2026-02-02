// Supabase Edge Function: verify Clerk JWT and proxy collection load/save.
//
// Set CLERK_ALLOWED_ISSUERS to a comma-separated list of Clerk issuer URLs.
// The function decodes the JWT to get the issuer (iss), checks it is in the allow-list,
// then fetches JWKS from iss + "/.well-known/jwks.json" and verifies the token.
// This allows both dev and prod Clerk tokens with one config (no switching secrets).
//
// Example: "https://clerk.pocketdex.zain.build,https://sweet-fowl-52.clerk.accounts.dev"
//
// Find issuer URLs in Clerk Dashboard → Configure → Domains (Frontend API domain).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const TABLE = "user_collections";
const CLERK_ALLOWED_ISSUERS = Deno.env.get("CLERK_ALLOWED_ISSUERS");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  const [scheme, token] = authHeader.split(/\s+/);
  if (scheme !== "Bearer" || !token) throw new Error("Expected Bearer token");
  return token.trim();
}

function getAllowedIssuers(): Set<string> {
  if (!CLERK_ALLOWED_ISSUERS || !CLERK_ALLOWED_ISSUERS.trim()) return new Set();
  return new Set(
    CLERK_ALLOWED_ISSUERS.split(",").map((u) => u.trim().replace(/\/$/, ""))
  );
}

async function verifyClerkJwt(token: string): Promise<string> {
  const allowedIssuers = getAllowedIssuers();

  if (allowedIssuers.size === 0) {
    throw new Error("CLERK_ALLOWED_ISSUERS is not set");
  }

  const payload = jose.decodeJwt(token);
  const iss = payload.iss;
  if (typeof iss !== "string" || !iss) throw new Error("JWT missing iss");
  const issuer = iss.replace(/\/$/, "");
  if (!allowedIssuers.has(issuer)) {
    throw new Error("Issuer not allowed");
  }
  const jwksUrl = `${issuer}/.well-known/jwks.json`;
  const jwks = jose.createRemoteJWKSet(new URL(jwksUrl));
  const { payload: verified } = await jose.jwtVerify(token, jwks);
  const sub = verified.sub;
  if (typeof sub !== "string" || !sub) throw new Error("JWT missing sub");
  return sub;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  let userId: string;
  try {
    const token = getAuthToken(req);
    userId = await verifyClerkJwt(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return Response.json({ error: msg }, { status: 401, headers: corsHeaders() });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("collection")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Supabase load error", error);
        return Response.json(
          { error: error.message },
          { status: 500, headers: corsHeaders() }
        );
      }

      const collection =
        data?.collection && typeof data.collection === "object"
          ? data.collection
          : null;
      return Response.json({ collection }, { headers: corsHeaders() });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const collection = body?.collection;
      if (collection === undefined || typeof collection !== "object") {
        return Response.json(
          { error: "Body must include { collection: object }" },
          { status: 400, headers: corsHeaders() }
        );
      }

      const { error } = await supabase.from(TABLE).upsert(
        {
          user_id: userId,
          collection,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.error("Supabase save error", error);
        return Response.json(
          { error: error.message },
          { status: 500, headers: corsHeaders() }
        );
      }

      return Response.json({ ok: true }, { headers: corsHeaders() });
    }

    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders() }
    );
  } catch (e) {
    console.error("Edge function error", e);
    return Response.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500, headers: corsHeaders() }
    );
  }
});
