import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar user={session.user as any} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
