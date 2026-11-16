"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { requireAdmin } from "@/lib/require-admin";

export async function logout() {
  await requireAdmin();
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
