"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, Building2, Briefcase, FolderKanban, LayoutDashboard, LogOut, ChevronRight } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/clusters", icon: Building2, label: "Clusters" },
  { href: "/admin/clients", icon: Briefcase, label: "Clients" },
  { href: "/admin/programs", icon: FolderKanban, label: "Programs" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [path, setPath] = useState("");

  useEffect(() => { setPath(window.location.pathname); }, []);

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/login"); return; }
    if (status === "authenticated" && (session?.user as any)?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  if (status === "loading") return null;
  if ((session?.user as any)?.role !== "admin") return null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 bg-[#006E74] text-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-white/20">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-sm font-bold">U</div>
            <span className="font-bold text-sm">PM Agent Admin</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ href, icon: Icon, label }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setPath(href)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  active ? "bg-white/20 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-white/20 space-y-2">
          <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all">
            <ChevronRight className="w-3 h-3" />
            Back to PM Agent
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <LogOut className="w-3 h-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
