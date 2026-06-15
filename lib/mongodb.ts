import dns from "dns";
import { NextResponse } from "next/server";
import { MongoClient } from "mongodb";

let mongoAuthHintLogged = false;
let mongoDnsConfigured = false;

/** mongodb+srv needs SRV lookups; some Windows DNS setups refuse them (querySrv ECONNREFUSED). */
function ensureMongoSrvDns() {
  if (mongoDnsConfigured || !uri.startsWith("mongodb+srv://")) {
    return;
  }
  mongoDnsConfigured = true;

  const custom = process.env.MONGODB_DNS_SERVERS?.trim();
  const servers = custom
    ? custom.split(",").map((s) => s.trim()).filter(Boolean)
    : ["8.8.8.8", "1.1.1.1"];

  if (servers.length > 0) {
    dns.setServers(servers);
  }
}

function logMongoConnectFailure(err: unknown) {
  const code =
    err && typeof err === "object" && err && "code" in err
      ? (err as { code: number }).code
      : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  const isAuth =
    code === 8000 ||
    /bad auth|Authentication failed|MongoServerError.*8000/i.test(msg);

  if (isAuth) {
    if (!mongoAuthHintLogged) {
      mongoAuthHintLogged = true;
      console.error(
        "[MongoDB] Authentication failed — the username/password in MONGODB_URI do not match your Atlas database user.\n" +
          "  → Atlas → Database Access → pick your user → Edit → reset password → Connect → Drivers → copy the new URI into MONGODB_URI in .env.local.\n" +
          "  → In the URI, encode special characters in the password (@ : / ? # %) using percent-encoding (e.g. @ → %40)."
      );
    }
    return;
  }
  console.error("[MongoDB] Connection error:", err);
}

/**
 * One connection string for all API routes. Using the same global client promise
 * avoids different routes initializing MongoClient with different env vars and
 * clobbering each other's `global._mongoClientPromise`.
 */
const uri =
  process.env.MONGODB_URI?.trim() ||
  process.env.MONGODB_CONNECTION_STRINGS?.trim() ||
  "";

export const defaultDbName = process.env.MONGODB_DB_NAME || "worklog";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoUri(): string {
  return uri;
}

/**
 * Lazy singleton; undefined if no URI (caller should return 500 / skip DB).
 */
export function getSharedClientPromise(): Promise<MongoClient> | undefined {
  if (!uri) {
    return undefined;
  }
  if (!global._mongoClientPromise) {
    ensureMongoSrvDns();

    /** Default 50: ~200 parallel marks need headroom vs the old 10; cap at 100. Stay under Atlas max connections (tier limit minus ops overhead). */
    const rawPool = process.env.MONGODB_MAX_POOL_SIZE?.trim();
    const parsed = rawPool ? Number.parseInt(rawPool, 10) : NaN;
    const maxPoolSize = Number.isFinite(parsed)
      ? Math.min(100, Math.max(10, parsed))
      : 50;

    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize,
    });
    // If connect fails once, do not keep a permanently rejected promise — every later
    // request would fail instantly (e.g. 500 in ~30ms). Allow the next call to retry.
    global._mongoClientPromise = client.connect().catch((err: unknown) => {
      global._mongoClientPromise = undefined;
      console.error("Mongo connect failed:", err);
      throw err;
    });
  }
  return global._mongoClientPromise;
}

/** Connected client, or a JSON 500 response if URI is missing or connect fails. */
export async function connectMongoDb(): Promise<MongoClient | NextResponse> {
  const cp = getSharedClientPromise();
  if (!cp) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }
  try {
    return await cp;
  } catch (err) {
    logMongoConnectFailure(err);
    return NextResponse.json({ error: "Database connection misconfigured" }, { status: 500 });
  }
}
