"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  BriefcaseIcon, LayoutDashboard, FolderKanban, BarChart3,
  Users, Settings, LogOut, ChevronRight, TrendingUp,
} from "lucide-react";

type User = { id: string; name?: string | null; email?: string | null; role?: string; orgName?: string };

const navItems = (role: string) => {
  const base = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
  if (role === "pm" || role === "admin") {
    base.push({ href: "/dashboard/projects", label: "My Projects", icon: FolderKanban });
  }
  if (role === "dm" || role === "admin") {
    base.push({ href: "/dashboard/portfolio", label: "Portfolio", icon: BarChart3 });
  }
  if (role === "dh" || role === "admin") {
    base.push({ href: "/dashboard/executive", label: "Executive View", icon: TrendingUp });
  }
  if (role === "admin") {
    base.push({ href: "/dashboard/admin", label: "Admin", icon: Settings });
  }
  return base;
};

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();
  const role = user.role || "pm";
  const items = navItems(role);

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="bg-blue-600 rounded-lg p-2">
          <BriefcaseIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-sm">PM Agent</span>
          <p className="text-slate-400 text-xs truncate max-w-[120px]">{(user as any).orgName || "Enterprise"}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto" />}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-slate-400 capitalize">{role.replace("_", " ")}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-3 h-3" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
