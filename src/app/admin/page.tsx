"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Building2, Briefcase, FolderKanban, UserCheck, UserX, Clock } from "lucide-react";

interface Stats {
  users: { total: number; active: number; invited: number; deactivated: number };
  clusters: number;
  clients: number;
  programs: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/clusters").then((r) => r.json()),
      fetch("/api/admin/clients").then((r) => r.json()),
      fetch("/api/admin/programs").then((r) => r.json()),
    ]).then(([users, clusters, clients, programs]) => {
      const arr = Array.isArray(users) ? users : [];
      setStats({
        users: {
          total: arr.length,
          active: arr.filter((u: any) => u.status === "active").length,
          invited: arr.filter((u: any) => u.status === "invited").length,
          deactivated: arr.filter((u: any) => u.status === "deactivated").length,
        },
        clusters: Array.isArray(clusters) ? clusters.length : 0,
        clients: Array.isArray(clients) ? clients.length : 0,
        programs: Array.isArray(programs) ? programs.length : 0,
      });
    });
  }, []);

  const cards = [
    {
      href: "/admin/users",
      icon: Users,
      label: "Users",
      value: stats?.users.total ?? "—",
      sub: stats ? `${stats.users.active} active · ${stats.users.invited} invited` : "",
    },
    { href: "/admin/clusters", icon: Building2, label: "Clusters", value: stats?.clusters ?? "—", sub: "Top-level hierarchy" },
    { href: "/admin/clients", icon: Briefcase, label: "Clients", value: stats?.clients ?? "—", sub: "Under clusters" },
    { href: "/admin/programs", icon: FolderKanban, label: "Programs", value: stats?.programs ?? "—", sub: "Under clients" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Admin Console</h1>
        <p className="text-slate-500 text-sm mt-1">Manage users, hierarchy, and platform configuration</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {cards.map(({ href, icon: Icon, label, value, sub }) => (
          <Link key={href} href={href} className="bg-white rounded-xl border border-slate-200 p-5 hover:border-[#006E74] hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-3">
              <Icon className="w-5 h-5 text-[#006E74]" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            <p className="text-sm font-medium text-slate-700 mt-1">{label}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </Link>
        ))}
      </div>

      {stats && stats.users.invited > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {stats.users.invited} pending invitation{stats.users.invited > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-amber-600">These users have not yet set their password.</p>
          </div>
          <Link href="/admin/users?status=invited" className="ml-auto text-xs font-medium text-amber-700 hover:underline">View →</Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Hierarchy Overview</p>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between"><span>Clusters</span><span className="font-medium">{stats?.clusters ?? "—"}</span></div>
            <div className="flex justify-between pl-4 border-l-2 border-slate-100"><span>└ Clients</span><span className="font-medium">{stats?.clients ?? "—"}</span></div>
            <div className="flex justify-between pl-8 border-l-2 border-slate-100"><span>└ Programs</span><span className="font-medium">{stats?.programs ?? "—"}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">User Status</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-green-500" />Active</span>
              <span className="font-medium text-slate-800">{stats?.users.active ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" />Invited</span>
              <span className="font-medium text-slate-800">{stats?.users.invited ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><UserX className="w-4 h-4 text-slate-400" />Deactivated</span>
              <span className="font-medium text-slate-800">{stats?.users.deactivated ?? "—"}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</p>
          <div className="space-y-2">
            <Link href="/admin/users" className="block text-sm text-[#006E74] hover:underline">+ Invite a new user</Link>
            <Link href="/admin/clusters" className="block text-sm text-[#006E74] hover:underline">+ Create a cluster</Link>
            <Link href="/admin/clients" className="block text-sm text-[#006E74] hover:underline">+ Add a client</Link>
            <Link href="/admin/programs" className="block text-sm text-[#006E74] hover:underline">+ Create a program</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
