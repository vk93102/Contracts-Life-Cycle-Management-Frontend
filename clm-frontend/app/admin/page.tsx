'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/app/components/DashboardLayout';
import { useAuth } from '@/app/lib/auth-context';
import { ApiClient } from '@/app/lib/api-client';
import { Shield, Users, RefreshCcw, ArrowUpRight, ArrowDownRight, Activity, Clock, FileText } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

type AdminAnalytics = any;

type AdminActivityItem = {
  source: 'audit' | 'workflow' | 'signnow' | 'firma';
  event?: string;
  message?: string;
  entity_type?: string;
  entity_id?: string;
  contract_id?: string | null;
  user_id?: string;
  created_at: string;
};

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
  const [activity, setActivity] = useState<AdminActivityItem[]>([]);
  const [query, setQuery] = useState('');
  const [allTenants, setAllTenants] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!(user as any)?.is_admin;
  const isSuperAdmin = !!(user as any)?.is_superadmin;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const client = new ApiClient();
      const [a, u, act] = await Promise.all([
        client.getAdminAnalytics(),
        client.adminListUsers({ q: query || undefined, allTenants: !!(isSuperAdmin && allTenants) }),
        client.getAdminActivity({ limit: 60 }),
      ]);

      if (!a.success) {
        throw new Error(a.error || 'Failed to load admin analytics');
      }
      if (!u.success) {
        throw new Error(u.error || 'Failed to load users');
      }

      if (!act.success) {
        throw new Error(act.error || 'Failed to load activity');
      }

      setAnalytics(a.data as any);
      const rows = (u.data as any)?.results || [];
      setUsers(rows);

      const items = (act.data as any)?.results || [];
      setActivity(items);
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdmin) {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, isAdmin]);

  const promote = async (row: AdminUserRow) => {
    try {
      if (!isSuperAdmin) return;
      setLoading(true);
      setError(null);
      const client = new ApiClient();
      const resp = await client.adminPromoteUser({ user_id: row.user_id, allTenants: !!(isSuperAdmin && allTenants) });
      if (!resp.success) throw new Error(resp.error || 'Promotion failed');
      await loadAll();
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
      await loadAll();
    } catch (e: any) {
      setError(e?.message || 'Demotion failed');
    } finally {
      setLoading(false);
    }
  };

  const cards = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: 'Templates', value: analytics?.templates?.total ?? 0 },
      { label: 'Contracts', value: analytics?.contracts?.total ?? 0 },
      { label: 'Approvals', value: analytics?.approvals?.total ?? 0 },
      { label: 'Signing Requests (Firma)', value: analytics?.signing_requests?.firma?.total ?? 0 },
    ];
  }, [analytics]);

  const trendData = useMemo(() => {
    return (analytics?.trends_last_6_months || []).map((r: any) => ({
      label: r.label,
      contracts: r.contracts_created ?? 0,
      firma_sent: r.firma_sent ?? 0,
      firma_completed: r.firma_completed ?? 0,
      templates: r.templates_created ?? 0,
    }));
  }, [analytics]);

  const contractTypeData = useMemo(() => {
    return (analytics?.contracts?.by_contract_type || []).map((r: any) => ({
      contract_type: String(r.contract_type || 'unknown'),
      count: r.count ?? 0,
    }));
  }, [analytics]);

  const topTemplates = useMemo(() => {
    return analytics?.templates?.top_templates || [];
  }, [analytics]);

  const fmtSeconds = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const sourceBadge = (source: string) => {
    const base = 'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold';
    if (source === 'firma') return `${base} bg-indigo-50 text-indigo-700`;
    if (source === 'signnow') return `${base} bg-cyan-50 text-cyan-700`;
    if (source === 'workflow') return `${base} bg-amber-50 text-amber-800`;
    return `${base} bg-slate-100 text-slate-700`;
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
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Admin</h1>
            <p className="text-slate-600 text-sm">Tenant-wide analytics + admin promotion</p>
          </div>
        </div>

        <button
          onClick={loadAll}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="rounded-3xl bg-white border border-slate-200 p-6">
            <p className="text-slate-500 text-sm">{c.label}</p>
            <p className="text-4xl font-extrabold text-slate-900 mt-2">{String(c.value).padStart(2, '0')}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-slate-700" />
              <h2 className="text-lg font-extrabold text-slate-900">Trends (6 months)</h2>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="contracts" stroke="#0f172a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="firma_sent" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-slate-500">Tracks contracts created and Firma sends per month.</p>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-extrabold text-slate-900">Contracts by Type</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contractTypeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="contract_type" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f172a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-slate-500">Top 12 contract types by volume.</p>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-extrabold text-slate-900">Operational</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Users (active)</span>
              <span className="font-extrabold text-slate-900">
                {analytics?.users?.active ?? 0} / {analytics?.users?.total ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Admins / Superadmins</span>
              <span className="font-extrabold text-slate-900">
                {analytics?.users?.admins ?? 0} / {analytics?.users?.superadmins ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Contracts expiring (30d)</span>
              <span className="font-extrabold text-slate-900">{analytics?.contracts?.expiring_next_30d ?? 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Firma avg completion</span>
              <span className="font-extrabold text-slate-900">
                {fmtSeconds(analytics?.signing_requests?.firma?.avg_completion_seconds)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Audit logs (7d)</span>
              <span className="font-extrabold text-slate-900">{analytics?.activity_summary?.audit_logs_last_7d ?? 0}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Quick signals for admin ops and usage.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold text-slate-900">Top Templates</h2>
            <span className="text-xs text-slate-500">by contracts created</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Contracts</th>
                </tr>
              </thead>
              <tbody>
                {(topTemplates || []).map((t: any) => (
                  <tr key={t.template_id} className="border-t border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-900">{t.name || '—'}</td>
                    <td className="py-3 pr-4 text-slate-700">{t.contract_type || '—'}</td>
                    <td className="py-3 pr-4 text-slate-700">{t.status || '—'}</td>
                    <td className="py-3 pr-4 font-semibold text-slate-900">{t.contracts_count ?? 0}</td>
                  </tr>
                ))}

                {!topTemplates?.length && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      No templates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-slate-700" />
              <h2 className="text-lg font-extrabold text-slate-900">Recent Activity</h2>
            </div>
            <span className="text-xs text-slate-500">latest 60 events</span>
          </div>

          <div className="space-y-3 max-h-96 overflow-auto pr-1">
            {activity.map((it, idx) => (
              <div key={`${it.source}-${it.created_at}-${idx}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={sourceBadge(it.source)}>{it.source}</span>
                    <span className="text-sm font-semibold text-slate-900">{it.event || it.entity_type || 'event'}</span>
                  </div>
                  <span className="text-xs text-slate-500">{new Date(it.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-sm text-slate-700">{it.message || '—'}</div>
                {(it.contract_id || it.entity_id) && (
                  <div className="mt-2 text-xs text-slate-500">
                    {it.contract_id ? `contract: ${it.contract_id}` : null}
                    {it.contract_id && it.entity_id ? ' · ' : null}
                    {it.entity_id ? `${it.entity_type || 'entity'}: ${it.entity_id}` : null}
                  </div>
                )}
              </div>
            ))}

            {!activity.length && <div className="text-sm text-slate-500">No activity yet.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-200 p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-700" />
            <h2 className="text-lg font-extrabold text-slate-900">Admins</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadAll();
              }}
              placeholder="Search users by email/name…"
              className="w-full sm:w-80 bg-white border border-slate-200 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
            {isSuperAdmin && (
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={allTenants}
                  onChange={(e) => setAllTenants(e.target.checked)}
                  className="accent-slate-900"
                />
                All tenants
              </label>
            )}
            <button
              onClick={loadAll}
              disabled={loading}
              className="w-full sm:w-auto rounded-2xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              Search
            </button>
          </div>
        </div>

        <div className="mb-4 text-xs text-slate-500">
          Showing <span className="font-semibold text-slate-700">{users.length}</span> users
          {query ? (
            <>
              {' '}for <span className="font-semibold text-slate-700">{query}</span>
            </>
          ) : null}
          {isSuperAdmin && allTenants ? ' (all tenants)' : ''}.
        </div>

        {!isSuperAdmin && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
            Only Super Admins can promote/demote admins.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Name</th>
                <th className="py-3 pr-4">Role</th>
                <th className="py-3 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-t border-slate-100">
                  <td className="py-3 pr-4 font-medium text-slate-900">{u.email}</td>
                  <td className="py-3 pr-4 text-slate-700">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                        u.is_admin ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {u.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {u.is_admin ? (
                      <button
                        onClick={() => demote(u)}
                        disabled={loading || !isSuperAdmin}
                        className="inline-flex items-center gap-2 rounded-2xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <ArrowDownRight className="w-4 h-4" />
                        Demote
                      </button>
                    ) : (
                      <button
                        onClick={() => promote(u)}
                        disabled={loading || !isSuperAdmin}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 text-white px-3 py-2 text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {!users.length && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Note: after promotion/demotion, the user must re-login to update their admin token.
        </p>
      </div>
    </DashboardLayout>
  );
}
