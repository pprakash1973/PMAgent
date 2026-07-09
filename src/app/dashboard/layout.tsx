import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as { role?: string; name?: string };
  return (
    <AppShell role={user.role ?? "pm"} userName={user.name ?? "User"}>
      {children}
    </AppShell>
  );
}
