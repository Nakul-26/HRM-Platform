"use server";

import { redirect } from "next/navigation";
import { clearToken } from "@/lib/session";

export async function signOutAction() {
  await clearToken();
  redirect("/login");
}
