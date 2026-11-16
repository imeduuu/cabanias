import { getAuth } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Expose only the operations used by this installation. No registration or account-management endpoints.
function handle(request: Request) {
  const path = new URL(request.url).pathname;
  const allowed = request.method === "GET" ? ["/api/auth/get-session"] :
    ["/api/auth/sign-in/email", "/api/auth/sign-out"];
  if (!allowed.includes(path)) return new Response(null, { status: 404 });
  // Single-admin installation: one shared throttle bucket, independent of spoofable proxy headers.
  const headers = new Headers(request.headers);
  headers.set("x-cabanias-auth-bucket", "127.0.0.1");
  return getAuth().handler(new Request(request, { headers }));
}
export const GET = handle;
export const POST = handle;
