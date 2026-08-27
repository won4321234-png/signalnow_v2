import { supabase } from "../_lib/supabase";

type Request = { method?: string; query: Record<string, unknown>; body?: unknown };
type Response = { status: (code: number) => Response; setHeader: (name: string, value: string) => Response; json: (body: unknown) => void };

type Layout = {
  schemaVersion: number;
  intersectionId: string;
  intersectionName: string;
  coordinate: { lat: number; lng: number };
  approaches: unknown[];
  status: string;
};

function jsonResponse(res: Response, status: number, body: unknown): void {
  res.status(status).setHeader("Cache-Control", "no-store, max-age=0").json(body);
}

function isValidLayout(value: unknown): value is Layout {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const coordinate = item.coordinate;
  if (!coordinate || typeof coordinate !== "object") return false;
  const point = coordinate as Record<string, unknown>;
  return (
    item.schemaVersion === 1 &&
    typeof item.intersectionId === "string" &&
    typeof item.intersectionName === "string" &&
    Array.isArray(item.approaches) &&
    typeof item.status === "string" &&
    typeof point.lat === "number" && Number.isFinite(point.lat) &&
    point.lat >= -90 && point.lat <= 90 &&
    typeof point.lng === "number" && Number.isFinite(point.lng) &&
    point.lng >= -180 && point.lng <= 180
  );
}

function normalizeIntersectionId(value: string): string {
  return value.trim();
}

export default async function handler(req: Request, res: Response) {
  const rawIntersectionId = typeof req.query.intersectionId === "string" ? req.query.intersectionId : "";
  const intersectionId = normalizeIntersectionId(rawIntersectionId);
  if (!intersectionId) return jsonResponse(res, 400, { error: "intersectionId is required" });

  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("ground_truth")
        .select("layout")
        .eq("intersection_id", intersectionId)
        .maybeSingle();

      if (error) {
        console.error("Ground Truth GET failed", error);
        return jsonResponse(res, 500, { error: "Ground Truth read failed" });
      }
      if (!data) return jsonResponse(res, 404, { error: "Ground Truth not found" });
      return jsonResponse(res, 200, data.layout);
    } catch (error) {
      console.error("Ground Truth GET failed", error);
      return jsonResponse(res, 500, { error: "Ground Truth read failed" });
    }
  }

  if (req.method === "PUT") {
    try {
      const body = req.body as Record<string, unknown> | undefined;
      if (!body || typeof body !== "object") return jsonResponse(res, 400, { error: "JSON body is required" });
      if (body.intersectionId !== intersectionId) return jsonResponse(res, 400, { error: "intersectionId mismatch" });
      if (!isValidLayout(body)) return jsonResponse(res, 400, { error: "Invalid Ground Truth layout" });

      const { data, error } = await supabase
        .from("ground_truth")
        .upsert(
          {
            intersection_id: intersectionId,
            layout: body,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "intersection_id" },
        )
        .select("layout")
        .single();

      if (error) {
        console.error("Ground Truth PUT failed", error);
        return jsonResponse(res, 500, { error: "Ground Truth write failed" });
      }

      return jsonResponse(res, 200, { ok: true, layout: data.layout });
    } catch (error) {
      console.error("Ground Truth PUT failed", error);
      return jsonResponse(res, 500, { error: "Ground Truth write failed" });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { error } = await supabase
        .from("ground_truth")
        .delete()
        .eq("intersection_id", intersectionId);

      if (error) {
        console.error("Ground Truth DELETE failed", error);
        return jsonResponse(res, 500, { error: "Ground Truth delete failed" });
      }

      return jsonResponse(res, 200, { ok: true });
    } catch (error) {
      console.error("Ground Truth DELETE failed", error);
      return jsonResponse(res, 500, { error: "Ground Truth delete failed" });
    }
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return jsonResponse(res, 405, { error: "Method not allowed" });
}
