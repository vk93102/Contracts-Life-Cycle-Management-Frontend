'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth-context';
import { ApiClient } from '@/app/lib/api-client';
import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Contract {
  id: string;
  name: string;
  title?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  date: string;
  created_at?: string;
  value: number;
  trend: number;
}

interface DashboardStats {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
}

type GrowthPoint = { month: string; count: number };

type DonutDatum = { name: string; value: number };

type DashboardInsights = {
  feature_usage_30d: Array<{ key: string; count: number }>;
  activity_last_14_days: Array<{ date: string; count: number }>;
  contract_types_180d: Array<{ type: string; count: number }>;
  ai_tasks_by_status_180d: Array<{ status: string; count: number }>;
  reviews_by_status_180d: Array<{ status: string; count: number }>;
  calendar_by_category_180d: Array<{ category: string; count: number }>;
  calendar_upcoming_30d: number;
  esign_by_provider_180d: Array<{ provider: string; count: number }>;
  firma_by_status_180d?: Array<{ status: string; count: number }>;
  signnow_by_status_180d?: Array<{ status: string; count: number }>;
};

const DONUT_COLORS = ['#0F141F', '#F43F5E', '#06B6D4', '#A78BFA', '#F59E0B', '#10B981', '#64748B', '#E11D48'];

function toDonutData(rows: Array<{ name: string; value: number }>, maxSlices: number = 6): DonutDatum[] {
  const sorted = [...rows].sort((a, b) => (b.value || 0) - (a.value || 0));
  if (sorted.length <= maxSlices) return sorted;
  const head = sorted.slice(0, maxSlices);
  const tailSum = sorted.slice(maxSlices).reduce((acc, x) => acc + (x.value || 0), 0);
  if (tailSum <= 0) return head;
  return [...head, { name: 'Other', value: tailSum }];
}

function DonutCard(props: {
  title: string;
  subtitle?: string;
  data: DonutDatum[];
  emptyText?: string;
  footerRight?: string;
}) {
  const total = props.data.reduce((acc, x) => acc + (x.value || 0), 0);
  const hasData = total > 0;
  const top = [...props.data].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 3);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">{props.title}</h2>
          {props.subtitle ? <p className="text-xs text-slate-500 mt-1">{props.subtitle}</p> : null}
        </div>
        {props.footerRight ? (
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">{props.footerRight}</span>
        ) : null}
      </div>

      <div className="mt-5 h-48">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={props.data}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                isAnimationActive
                animationDuration={900}
              >
                {props.data.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0' }}
                formatter={(value: any, name: any) => [value, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">{props.emptyText || 'No data yet.'}</div>
        )}
      </div>

      {hasData ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {top.map((x, idx) => {
            const pct = total > 0 ? Math.round((x.value / total) * 100) : 0;
            return (
              <div key={x.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                  <span className="text-slate-700 font-semibold truncate">{x.name}</span>
                </div>
                <span className="text-slate-500 font-semibold">{x.value} • {pct}%</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Total</span>
        <span className="text-sm font-extrabold text-slate-900">{total}</span>
      </div>
    </div>
  );
}

function formatCompactDate(isoOrDate: string) {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
}

function statusPill(status: string) {
  const s = String(status || '').toLowerCase();
  const base = 'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border';
  if (s === 'approved' || s === 'executed' || s === 'signed' || s === 'completed') {
    return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
  }
  if (s === 'pending' || s === 'review' || s === 'in_review' || s === 'processing') {
    return `${base} bg-amber-50 text-amber-700 border-amber-200`;
  }
  if (s === 'rejected' || s === 'failed' || s === 'declined') {
    return `${base} bg-rose-50 text-rose-700 border-rose-200`;
  }
  if (s === 'sent' || s === 'in_progress') {
    return `${base} bg-blue-50 text-blue-700 border-blue-200`;
  }
  return `${base} bg-slate-50 text-slate-700 border-slate-200`;
}

const DashboardPageV2: React.FC = () => {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Array<{ id: string; title: string; start: string; category?: string }>>([]);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (isLoading || !isAuthenticated) {
          return;
        }
        setIsSyncing(true);
        setInsightsLoading(true);
        const client = new ApiClient();
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 30);
        const [statsResponse, recentResponse, contractsResponse, insightsResponse, eventsResponse] = await Promise.all([
          client.getContractStatistics(),
          client.getRecentContracts(5),
          client.getContracts(),
          client.getDashboardInsights(),
          client.listCalendarEvents({ start: start.toISOString(), end: end.toISOString() }),
        ]);

        const unauthorized = [statsResponse, recentResponse, contractsResponse, insightsResponse].some(
          (r) => !r.success && r.status === 401
        );
        if (unauthorized) {
          try {
            client.logout();
          } catch {
            // ignore
          }
          router.push('/');
          return;
        }

        if (statsResponse.success && statsResponse.data) {
          setStats({
            total: (statsResponse.data as any).total || 0,
            draft: (statsResponse.data as any).draft || 0,
            pending: (statsResponse.data as any).pending || 0,
            approved: (statsResponse.data as any).approved || 0,
            rejected: (statsResponse.data as any).rejected || 0,
          });
        }

        if (recentResponse.success && recentResponse.data) {
          const contracts = Array.isArray(recentResponse.data)
            ? recentResponse.data
            : (recentResponse.data as any).results || [];

          const recent: Contract[] = contracts.slice(0, 5).map((contract: any) => ({
            id: contract.id,
            name: contract.title || contract.name,
            status: contract.status,
            date: contract.created_at || new Date().toISOString().split('T')[0],
            value: contract.value || 0,
            trend: 0,
          }));

          setRecentContracts(recent);
        }

        if (contractsResponse.success && contractsResponse.data) {
          const all = Array.isArray(contractsResponse.data)
            ? contractsResponse.data
            : (contractsResponse.data as any).results || [];

          const now = new Date();

          const months: Date[] = [];
          for (let i = 5; i >= 0; i--) {
            months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
          }

          const points: GrowthPoint[] = months.map((d) => {
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleString(undefined, { month: 'short' });
            const count = all.filter((c: any) => {
              const created = c.created_at || c.createdAt || c.date || c.created;
              if (!created) return false;
              const cd = new Date(created);
              const k = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}`;
              return k === monthKey;
            }).length;
            return { month: label, count };
          });

          setGrowth(points);
        }

        if (insightsResponse.success && insightsResponse.data) {
          setInsights(insightsResponse.data as any);
        }

        if (eventsResponse && (eventsResponse as any).success && (eventsResponse as any).data) {
          const raw = (eventsResponse as any).data;
          const items = Array.isArray(raw) ? raw : raw.results || [];
          setUpcomingEvents(
            items.slice(0, 6).map((e: any) => ({
              id: e.id,
              title: e.title,
              start: e.start_datetime || e.startDatetime || e.start || new Date().toISOString(),
              category: e.category,
            }))
          );
        } else {
          setUpcomingEvents([]);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsSyncing(false);
        setInsightsLoading(false);
      }
    };

    if (user && !isLoading && isAuthenticated) {
      fetchData();
    }
  }, [user, isLoading, isAuthenticated, router]);

  const formatActivity = (c: Contract) => {
    const name = c.title || c.name;
    const status = c.status;
    const who = (c as any).created_by || (c as any).createdBy || 'User';
    const verb = status === 'draft' ? 'draft created by' : status === 'pending' ? 'submitted by' : status === 'approved' ? 'approved for' : 'updated by';
    return `${name} ${verb} ${who}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const reviewFeatureUsageCount = (insights?.feature_usage_30d || []).reduce((acc, r) => {
    const key = String(r.key || '').toLowerCase();
    return acc + (key.includes('review') ? (r.count || 0) : 0);
  }, 0);

  const uploadFeatureUsageCount = (insights?.feature_usage_30d || []).reduce((acc, r) => {
    const key = String(r.key || '').toLowerCase();
    const isUploadish = key.includes('upload') || key.includes('document');
    return acc + (isUploadish ? (r.count || 0) : 0);
  }, 0);

  const aiGenerationsUsed = (insights?.ai_tasks_by_status_180d || []).reduce((acc, r) => acc + (r.count || 0), 0);

  const contractTypeData = toDonutData(
    (insights?.contract_types_180d || []).map((x) => ({ name: x.type || 'Unspecified', value: x.count })),
    4
  );

  const esignStatusRows = [
    ...(insights?.firma_by_status_180d || []),
    ...(insights?.signnow_by_status_180d || []),
  ];
  const esignTotal = esignStatusRows.reduce((acc, r) => acc + (r.count || 0), 0);
  const esignCompleted = esignStatusRows.reduce((acc, r) => {
    const st = String(r.status || '').toLowerCase();
    return acc + (st === 'completed' ? r.count : 0);
  }, 0);
  const esignWaiting = Math.max(0, esignTotal - esignCompleted);
  const completionRate = esignTotal > 0 ? Math.round((esignCompleted / esignTotal) * 100) : 0;

  return (
    <DashboardLayout>
      {/* Header (screenshot style) */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-7">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">User Contract Overview</h1>
          <span className="hidden sm:inline-flex items-center gap-2 text-xs font-semibold bg-white/80 border border-slate-200 rounded-full px-3 py-1 text-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            My Dashboard
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <div className="rounded-[28px] bg-gradient-to-br from-rose-400 to-pink-500 text-white p-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-15" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, #fff 0 2px, transparent 3px)' }} />
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-[11px] bg-white/20 px-2 py-1 rounded-full font-bold">+12%</span>
          </div>
          <p className="mt-5 text-4xl font-extrabold">{stats.total}</p>
          <p className="text-sm text-white/90">Total Contracts</p>
        </div>

        <div className="rounded-[28px] bg-white/90 border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-[11px] bg-amber-50 border border-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold">Last 30d</span>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-sm font-extrabold text-slate-900">Review feature usage</span>
              </div>
              <span className="text-2xl font-extrabold text-slate-900">{reviewFeatureUsageCount}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-sm font-extrabold text-slate-900 truncate">Upload document usage</span>
              </div>
              <span className="text-2xl font-extrabold text-slate-900">{uploadFeatureUsageCount}</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Upload className="w-4 h-4" />
            Based on your activity logs
          </div>
        </div>

        <div className="rounded-[28px] bg-white/90 border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-600" />
            </div>
          </div>
          <p className="mt-5 text-4xl font-extrabold text-slate-900">{aiGenerationsUsed.toLocaleString()}</p>
          <p className="text-sm text-slate-500">AI Generations Used</p>
        </div>

        <div className="rounded-[28px] bg-white/90 border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-[11px] bg-blue-50 border border-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold">Next: 30d</span>
          </div>
          <p className="mt-5 text-4xl font-extrabold text-slate-900">{insights?.calendar_upcoming_30d ?? 0}</p>
          <p className="text-sm text-slate-500">Upcoming Events</p>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Contract Type Distribution */}
        <div className="xl:col-span-4 bg-white/90 border border-slate-200 rounded-[28px] p-6">
          <h2 className="text-lg font-extrabold text-slate-900">Contract Type Distribution</h2>
          <div className="mt-6 h-64 relative">
            {contractTypeData.reduce((a, b) => a + b.value, 0) > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={contractTypeData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={78}
                      outerRadius={102}
                      paddingAngle={2}
                      isAnimationActive
                      animationDuration={900}
                    >
                      {contractTypeData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={DONUT_COLORS[(index + 1) % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-3xl font-extrabold text-slate-900">{stats.total}</div>
                  <div className="text-xs font-bold tracking-widest text-slate-400">ACTIVE</div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-500">No contract type data yet.</div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {contractTypeData.slice(0, 4).map((x, idx) => (
              <div key={x.name} className="flex items-center gap-2 text-xs text-slate-600 font-semibold">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DONUT_COLORS[(idx + 1) % DONUT_COLORS.length] }} />
                <span className="truncate">{x.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Contracts */}
        <div className="xl:col-span-5 bg-white/90 border border-slate-200 rounded-[28px] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900">Recent Contracts</h2>
            <button onClick={() => router.push('/contracts')} className="text-sm font-semibold text-rose-500">View All</button>
          </div>

          <div className="mt-5">
            <div className="hidden md:grid grid-cols-[1fr,140px,80px] gap-3 text-xs font-bold text-slate-400 px-3 py-2">
              <div>Contract Name</div>
              <div>Status</div>
              <div>Date</div>
            </div>

            {isSyncing ? (
              <div className="text-sm text-slate-500 px-3 py-6">Loading…</div>
            ) : recentContracts.length === 0 ? (
              <div className="text-sm text-slate-500 px-3 py-6">No recent contracts.</div>
            ) : (
              <div className="space-y-2">
                {recentContracts.slice(0, 6).map((c) => (
                  <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1fr,140px,80px] gap-3 items-center rounded-2xl px-3 py-3 hover:bg-slate-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 truncate">{c.name}</div>
                      </div>
                    </div>
                    <div className="md:justify-self-start">
                      <span className={statusPill(c.status)}>{String(c.status).replace('_', ' ')}</span>
                    </div>
                    <div className="text-sm text-slate-500 md:text-right">{formatCompactDate(c.date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side: E-sign + Reminders */}
        <div className="xl:col-span-3 space-y-6">
          <div className="bg-white/90 border border-slate-200 rounded-[28px] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-900">E-Sign Status</h2>
              <button className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-400" aria-label="More">⋮</button>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400">Completion Rate</p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-1">{completionRate}%</p>
                </div>
                <p className="text-xs font-bold text-emerald-600">+5.4%</p>
              </div>

              <div className="mt-4 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-rose-400" style={{ width: `${completionRate}%` }} />
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full border border-emerald-200 bg-emerald-50 inline-flex items-center justify-center text-emerald-700 font-extrabold">✓</span>
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">Completed</div>
                      <div className="text-xs text-slate-500">{esignCompleted} contracts</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full border border-amber-200 bg-amber-50 inline-flex items-center justify-center text-amber-700 font-extrabold">8</span>
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">Waiting</div>
                      <div className="text-xs text-slate-500">{esignWaiting} contracts</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/90 border border-slate-200 rounded-[28px] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-900">Reminders</h2>
              <button className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-400" aria-label="More">⋮</button>
            </div>

            <div className="mt-5 space-y-3">
              {upcomingEvents.slice(0, 3).map((e, idx) => (
                <div key={e.id || String(idx)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-bold text-slate-400">
                    {new Date(e.start).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-slate-900">{e.title}</p>
                </div>
              ))}

              {!upcomingEvents.length ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No upcoming reminders.</div>
              ) : null}
            </div>

            <button
              className="mt-5 w-full rounded-2xl bg-[#0F141F] text-white py-3 text-sm font-extrabold"
              onClick={() => router.push('/calendar')}
              type="button"
            >
              Add Reminder
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPageV2;
