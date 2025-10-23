import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DevLoginForm } from "@/components/auth/dev-login-form";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { parseSessionToken } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = parseSessionToken(token);

  if (user) {
    redirect("/console");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-lg">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold text-slate-100">Freya Agent Console</h1>
          <p className="text-sm text-slate-400">
            Dev login provides a lightweight authentication flow for the take-home. Enter a display
            name to continue.
          </p>
        </div>
        <div className="mt-8">
          <DevLoginForm />
        </div>
      </div>
    </main>
  );
}
