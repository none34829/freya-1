import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { parseSessionToken } from "@/server/auth/session";

export default async function RootIndex() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = parseSessionToken(token);

  if (user) {
    redirect("/console");
  }

  redirect("/login");
}
