let token = sessionStorage.getItem("fo_token") || "";
export const setToken = (t: string) => { token = t; t ? sessionStorage.setItem("fo_token", t) : sessionStorage.removeItem("fo_token"); };
export const hasToken = () => !!token;
export class ApiError extends Error { constructor(public status: number, m: string) { super(m); } }
export async function api<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch("/api/v1" + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { setToken(""); location.assign("/login"); }
  if (!r.ok) throw new ApiError(r.status, j?.error?.detail?.message || j?.error?.message || "Request failed");
  return j as T;
}

const auth = (): Record<string, string> => (token ? { Authorization: "Bearer " + token } : {});
async function fail(r: Response): Promise<never> { const j = await r.json().catch(() => ({})); throw new ApiError(r.status, j?.error?.detail?.message || j?.error?.message || "Request failed"); }
export async function fetchBlob(path: string): Promise<Blob> { const r = await fetch("/api/v1" + path, { headers: auth() }); if (!r.ok) return fail(r); return r.blob(); }
export async function download(path: string, name: string) {
  const url = URL.createObjectURL(await fetchBlob(path)); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
}
export async function openFile(path: string) { const url = URL.createObjectURL(await fetchBlob(path)); window.open(url, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(url), 60000); }
export async function sendFile<T = any>(path: string, body: Blob): Promise<T> {
  const r = await fetch("/api/v1" + path, { method: "POST", headers: { ...auth(), "Content-Type": body.type || "application/octet-stream" }, body }); if (!r.ok) return fail(r); return r.json();
}
/** Phone photos are 3 to 8 MB. Shrink to at most 1600 px JPEG before upload so uploads are fast on fest wifi and stay under the server limit. */
export async function prepareFile(f: File): Promise<Blob> {
  if (f.type.startsWith("image/") && f.type !== "image/gif") {
    const bmp = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("Could not read that image"))), "image/jpeg", 0.8));
  }
  if (f.size > 3 * 1024 * 1024) throw new Error("Files must be under 3 MB");
  return f;
}
