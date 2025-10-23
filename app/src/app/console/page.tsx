import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { parseSessionToken } from "@/server/auth/session";
import { ConsoleView } from "@/components/console/console-view";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = parseSessionToken(token);

  if (!user) {
    redirect("/login");
  }

  return <ConsoleView user={user} />;
}
