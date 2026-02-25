'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/components/DashboardLayout';
import GovernanceDashboardAdminV2 from '@/app/components/GovernanceDashboardAdminV2';
import { useAuth } from '@/app/lib/auth-context';
import { ApiClient } from '@/app/lib/api-client';
import { Shield, Users, RefreshCcw, ArrowUpRight, ArrowDownRight, Clock, FileText } from 'lucide-react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

type AdminAnalytics = any;

type AdminUserRow = {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  tenant_id: string;
  is_active: boolean;
  is_admin: boolean;
  date_joined?: string;
  last_login?: string;
};

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [featureUsage, setFeatureUsage] = useState<any>(null);
  const [userRegistration, setUserRegistration] = useState<any>(null);
  const [userFeatureUsage, setUserFeatureUsage] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [allTenants, setAllTenants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userSearchReqIdRef = useRef(0);

  const isAdmin = !!(user as any)?.is_admin;
  const isSuperAdmin = !!(user as any)?.is_superadmin;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const client = new ApiClient();
      const [a, fu, ur, ufu] = await Promise.all([
        client.getAdminAnalytics(),
        client.getAdminFeatureUsage(),
        client.getAdminUserRegistration(),
        client.getAdminUserFeatureUsage(),
      ]);

      if (!a.success) {
        throw new Error(a.error || 'Failed to load admin analytics');
      }
      setAnalytics(a.data as any);

      if (fu.success) {
        setFeatureUsage(fu.data);
      }
      if (ur.success) {
        setUserRegistration(ur.data);
      }
      if (ufu.success) {
        setUserFeatureUsage(ufu.data);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (q?: string) => {
    const requestId = ++userSearchReqIdRef.current;
    setUsersLoading(true);
    try {
      const client = new ApiClient();
      const resp = await client.adminListUsers({
        q: (q ?? query) || undefined,
        allTenants: !!(isSuperAdmin && allTenants),
      });
      if (requestId !== userSearchReqIdRef.current) return; // ignore stale response
      if (!resp.success) throw new Error(resp.error || 'Failed to load users');
      const rows = (resp.data as any)?.results || [];
      setUsers(rows);
    } catch (e: any) {
      if (requestId !== userSearchReqIdRef.current) return;
      setError(e?.message || 'Failed to load users');
    } finally {
      if (requestId === userSearchReqIdRef.current) setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdmin) {
      loadDashboard();
      loadUsers('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, isAdmin]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !isAdmin) return;
    const t = setTimeout(() => {
      loadUsers();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, allTenants, isSuperAdmin, isLoading, isAuthenticated, isAdmin]);

  const promote = async (row: AdminUserRow) => {
    try {
      if (!isSuperAdmin) return;
      setLoading(true);
      setError(null);
      const client = new ApiClient();
      const resp = await client.adminPromoteUser({ user_id: row.user_id, allTenants: !!(isSuperAdmin && allTenants) });
      if (!resp.success) throw new Error(resp.error || 'Promotion failed');
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || 'Promotion failed');
    } finally {
      setLoading(false);
    }
  };

  const demote = async (row: AdminUserRow) => {
    try {
      if (!isSuperAdmin) return;
      setLoading(true);
      setError(null);
      const client = new ApiClient();
      const resp = await client.adminDemoteUser({ user_id: row.user_id, allTenants: !!(isSuperAdmin && allTenants) });
      if (!resp.success) throw new Error(resp.error || 'Demotion failed');
      await loadUsers();
    } catch (e: any) {
      setError(e?.message || 'Demotion failed');
    } finally {
      setLoading(false);
    }
  };

  const contractTypeData = useMemo(() => {
    return (analytics?.contracts?.by_contract_type || []).map((r: any) => ({
      contract_type: String(r.contract_type || 'unknown'),
      count: r.count ?? 0,
    }));
  }, [analytics]);


  const fmtSeconds = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };


  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-700">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="rounded-3xl bg-white border border-slate-200 p-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Admin</h1>
              <p className="text-slate-600 text-sm">You don’t have admin access.</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Admin Panel</h1>
              <p className="text-sm text-slate-500 mt-0.5">System analytics, governance &amp; user management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isSuperAdmin && (
              <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                Super Admin
              </span>
            )}
            <button
              onClick={() => { loadDashboard(); loadUsers(''); }}
              disabled={loading}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-60"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── ERROR BANNER ── */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-red-700 text-sm flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            {error}
          </div>
        )}

        {/* ── GOVERNANCE DASHBOARD ── */}
        <GovernanceDashboardAdminV2
          analytics={analytics}
          userRegistration={userRegistration}
          featureUsage={featureUsage}
        />

        {/* ── CHARTS STRIP ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Contracts by type bar chart */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <h2 className="text-sm font-extrabold text-slate-800">Contracts by Type</h2>
                </div>
                <p className="text-xs text-slate-400 ml-9">Volume breakdown by contract category</p>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
                {contractTypeData.length} types
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contractTypeData} margin={{ top: 4, right: 4, left: -8, bottom: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="contract_type"
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={60}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94A3B8' }}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    cursor={{ fill: '#F8FAFC' }}
                  />
                  <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 2, 2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Operational signals */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-800">Operational Signals</h2>
            </div>
            <div className="flex-1 space-y-0 divide-y divide-slate-100">
              {[
                { label: 'Active users', value: `${analytics?.users?.active ?? 0} / ${analytics?.users?.total ?? 0}` },
                { label: 'Admins / Superadmins', value: `${analytics?.users?.admins ?? 0} / ${analytics?.users?.superadmins ?? 0}` },
                { label: 'Expiring contracts (30d)', value: String(analytics?.contracts?.expiring_next_30d ?? 0), highlight: (analytics?.contracts?.expiring_next_30d ?? 0) > 0 },
                { label: 'Avg completion time', value: fmtSeconds(analytics?.contracts?.avg_completion_seconds) },
                { label: 'Audit logs (7d)', value: String(analytics?.activity_summary?.audit_logs_last_7d ?? 0) },
                { label: 'AI assist sessions', value: String(analytics?.activity_summary?.ai_sessions ?? '—') },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between py-2.5">
                  <span className="text-xs text-slate-500">{s.label}</span>
                  <span className={`text-sm font-extrabold ${ s.highlight ? 'text-amber-600' : 'text-slate-900' }`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── USER MANAGEMENT ── */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">

          {/* Card header */}
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-800">User Management</h2>
                <p className="text-xs text-slate-400">
                  {users.length} user{users.length === 1 ? '' : 's'}
                  {query ? ` matching "${query}"` : ''}
                  {isSuperAdmin && allTenants ? ' · all tenants' : ''}
                </p>
              </div>
            </div>

            {/* Search controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search email or name…"
                  className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              {isSuperAdmin && (
                <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-white transition">
                  <input
                    type="checkbox"
                    checked={allTenants}
                    onChange={(e) => setAllTenants(e.target.checked)}
                    className="accent-blue-600"
                  />
                  All tenants
                </label>
              )}
              <button
                onClick={() => loadUsers()}
                disabled={loading || usersLoading}
                className="h-9 px-4 rounded-2xl bg-blue-600 text-white text-sm font-extrabold hover:bg-blue-700 transition disabled:opacity-60 whitespace-nowrap"
              >
                {usersLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>

          {/* Super-admin warning */}
          {!isSuperAdmin && (
            <div className="mx-6 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-800 text-xs font-semibold">
              Only Super Admins can promote or demote users.
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-3 px-6 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="py-3 px-4 text-left text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Joined</th>
                  <th className="py-3 px-4 text-right text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 text-sm">
                      {usersLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />
                          Searching…
                        </span>
                      ) : 'No users found.'}
                    </td>
                  </tr>
                ) : users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-3.5 px-6">
                      <p className="font-semibold text-slate-900">{u.email}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{u.user_id}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                        u.is_admin
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {u.is_admin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400">
                      {u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {u.is_admin ? (
                        <button
                          onClick={() => demote(u)}
                          disabled={loading || !isSuperAdmin}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition disabled:opacity-50"
                        >
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          Demote
                        </button>
                      ) : (
                        <button
                          onClick={() => promote(u)}
                          disabled={loading || !isSuperAdmin}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-blue-600 text-white text-xs font-extrabold hover:bg-blue-700 transition disabled:opacity-50"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          Promote
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="px-6 py-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">Note: after promotion or demotion, the user must sign out and sign back in to refresh their access token.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
