import { put, list, del } from "@vercel/blob";

type Request = { method?: string; query: Record<string, unknown>; body?: unknown };
type Response = { status: (code: number) => Response; setHeader: (name: string, value: string) => Response; json: (body: unknown) => void };

const PREFIX = "ground-truth/";
function blobPath(intersectionId: string): string { return `${PREFIX}${encodeURIComponent(intersectionId)}.json`; }
function jsonResponse(res: Response, status: number, body: unknown): void { res.status(status).setHeader("Cache-Control", "no-store, max-age=0").json(body); }

export default async function handler(req: Request, res: Response) {
  const intersectionId = typeof req.query.intersectionId === "string" ? req.query.intersectionId : "";
  if (!intersectionId) return jsonResponse(res, 400, { error: "intersectionId is required" });

  if (req.method === "GET") {
    try {
      const result = await list({ prefix: blobPath(intersectionId), limit: 1 });
      const blob = result.blobs[0];
      if (!blob) return jsonResponse(res, 404, { error: "Ground Truth not found" });
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) return jsonResponse(res, 502, { error: "Ground Truth storage read failed" });
      return jsonResponse(res, 200, await response.json());
    } catch (error) { console.error("Ground Truth GET failed", error); return jsonResponse(res, 500, { error: "Ground Truth read failed" }); }
  }

  if (req.method === "PUT") {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object") return jsonResponse(res, 400, { error: "JSON body is required" });
      if (body.intersectionId !== intersectionId) return jsonResponse(res, 400, { error: "intersectionId mismatch" });
      if (body.schemaVersion !== 1 || typeof body.intersectionName !== "string" || !Array.isArray(body.approaches) || typeof body.status !== "string") return jsonResponse(res, 400, { error: "Invalid Ground Truth layout" });
      const blob = await put(blobPath(intersectionId), JSON.stringify(body), { access: "public", addRandomSuffix: false, contentType: "application/json; charset=utf-8", cacheControlMaxAge: 0 });
      return jsonResponse(res, 200, { ok: true, url: blob.url, layout: body });
    } catch (error) { console.error("Ground Truth PUT failed", error); return jsonResponse(res, 500, { error: "Ground Truth write failed" }); }
  }

  if (req.method === "DELETE") {
    try {
      const result = await list({ prefix: blobPath(intersectionId), limit: 1 });
      const blob = result.blobs[0];
      if (blob) await del(blob.url);
      return jsonResponse(res, 200, { ok: true });
    } catch (error) { console.error("Ground Truth DELETE failed", error); return jsonResponse(res, 500, { error: "Ground Truth delete failed" }); }
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return jsonResponse(res, 405, { error: "Method not allowed" });
}
