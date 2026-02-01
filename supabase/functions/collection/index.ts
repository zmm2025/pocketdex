// Supabase Edge Function: verify Clerk JWT and proxy collection load/save.
// Set CLERK_JWKS_URL in Supabase Dashboard → Project Settings → Edge Functions → Secrets.
// e.g. https://clerk.pocketdex.zain.build/.well-known/jwks.json

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const TABLE = "user_collections";
const CLERK_JWKS_URL = Deno.env.get("CLERK_JWKS_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  const [scheme, token] = authHeader.split(/\s+/);
  if (scheme !== "Bearer" || !token) throw new Error("Expected Bearer token");
  return token.trim();
}

async function verifyClerkJwt(token: string): Promise<string> {
  if (!CLERK_JWKS_URL) throw new Error("CLERK_JWKS_URL is not set");
  const jwks = jose.createRemoteJWKSet(new URL(CLERK_JWKS_URL));
  const { payload } = await jose.jwtVerify(token, jwks);
  const sub = payload.sub;
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
