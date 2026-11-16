import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDb } from "./db";

export async function requireAdmin() {
  const session = await getAuth().api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  if (!session) redirect("/login");
  const admin = await getDb().administrator.findUnique({ where: { id: session.user.id }, select: { id: true, active: true } });
  if (!admin?.active) redirect("/login");
  return { id: admin.id };
}
