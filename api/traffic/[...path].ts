type Request = {
  method?: string;
  query: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
};

type Response = {
  status: (code: number) => Response;
  setHeader: (name: string, value: string) => Response;
  json: (body: unknown) => void;
};

const API_BASE_URL = "https://apis.data.go.kr/B551982/rti";
const ALLOWED_PATHS = new Set(["crsrd_map_info", "tl_drct_info"]);
const SUPPORTED_REGIONS = new Set(["1100000000", "3100000000"]);
const MAX_PAGE = 1000;
const MAX_ROWS = 100;
const REQUEST_TIMEOUT_MS = 9000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function jsonResponse(res: Response, status: number, body: unknown): void {
  res.status(status).setHeader("Cache-Control", "no-store, max-age=0").json(body);
}

function stringParam(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join("/").trim();
  return typeof value === "string" ? value.trim() : "";
}

function numberParam(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientKey(req: Request): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value ?? "unknown").split(",")[0].trim() || "unknown";
}

function allowRequest(req: Request): boolean {
  const now = Date.now();
  const key = clientKey(req);
  if (rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(bucketKey);
    }
  }
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX) return false;
  current.count += 1;
  return true;
}

function getServiceKey(): string {
  const key =
    process.env.TRAFFIC_API_SERVICE_KEY ||
    process.env.TRAFFIC_API_KEY ||
    process.env.VITE_TRAFFIC_API_KEY ||
    process.env.VITE_DATA_API_SERVICE_KEY ||
    "";
  return key.trim();
}

export default async function handler(req: Request, res: Response) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  if (!allowRequest(req)) {
    return jsonResponse(res, 429, { error: "Traffic API rate limit exceeded" });
  }

  const rawPath = stringParam(req.query.path).replace(/^\/+|\/+$/g, "");
  if (!ALLOWED_PATHS.has(rawPath)) {
    return jsonResponse(res, 404, { error: "Unsupported traffic API endpoint" });
  }

  const stdgCd = stringParam(req.query.stdgCd);
  if (!SUPPORTED_REGIONS.has(stdgCd)) {
    return jsonResponse(res, 400, { error: "Unsupported traffic region" });
  }

  const pageNo = numberParam(req.query.pageNo, 1);
  const numOfRows = numberParam(req.query.numOfRows, 100);
  const crsrdId = stringParam(req.query.crsrdId);
  if (crsrdId.length > 80) return jsonResponse(res, 400, { error: "Invalid crsrdId" });
  if (pageNo > MAX_PAGE || numOfRows > MAX_ROWS) {
    return jsonResponse(res, 400, { error: "Invalid pagination parameters" });
  }

  const requestServiceKey = stringParam(req.query.serviceKey);\n  const serviceKey =\n    process.env.TRAFFIC_API_SERVICE_KEY ||\n    process.env.TRAFFIC_API_KEY ||\n    process.env.VITE_TRAFFIC_API_KEY ||\n    process.env.VITE_DATA_API_SERVICE_KEY ||\n    requestServiceKey;
  if (!serviceKey) {
    return jsonResponse(res, 500, { error: "Traffic API service key is not configured on the server" });
  }

  const url = new URL(API_BASE_URL + "/" + rawPath);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("type", "JSON");
  url.searchParams.set("stdgCd", stdgCd);
  if (crsrdId) url.searchParams.set("crsrdId", crsrdId);
  url.searchParams.set("serviceKey", serviceKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const body = await upstream.text();
    if (!upstream.ok) {
      console.error("[traffic proxy] upstream error", { endpoint: rawPath, status: upstream.status });
      return jsonResponse(res, upstream.status >= 500 ? 502 : upstream.status, {
        error: "Traffic upstream request failed",
        upstreamStatus: upstream.status,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return jsonResponse(res, 502, { error: "Traffic upstream returned invalid JSON" });
    }

    return res
      .status(200)
      .setHeader("Cache-Control", "no-store, max-age=0")
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .json(parsed);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    console.error("[traffic proxy] request failed", {
      endpoint: rawPath,
      reason: timedOut ? "timeout" : error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(res, 502, { error: timedOut ? "Traffic upstream timeout" : "Traffic upstream unavailable" });
  } finally {
    clearTimeout(timer);
  }
}
