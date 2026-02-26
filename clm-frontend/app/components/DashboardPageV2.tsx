'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/lib/auth-context';
import { ApiClient } from '@/app/lib/api-client';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────
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
  review_count_30d?: number;
  upload_count_30d?: number;
  repository_upload_count_30d?: number;
  private_upload_count_30d?: number;
  contracts_r2_upload_count_30d?: number;
  templates_count?: number;
  template_files_count?: number;
  contract_templates_count?: number;
  activity_last_14_days: Array<{ date: string; count: number }>;
  contract_types_180d: Array<{ type: string; count: number }>;
  ai_tasks_by_status_180d: Array<{ status: string; count: number }>;
  reviews_by_status_180d: Array<{ status: string; count: number }>;
  calendar_by_category_180d: Array<{ category: string; count: number }>;
  calendar_upcoming_30d: number;
  calendar_upcoming_365d?: number;
  esign_by_provider_180d: Array<{ provider: string; count: number }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const BLUE_PALETTE = ['#1E40AF', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toDonutData(rows: Array<{ name: string; value: number }>, maxSlices = 5): DonutDatum[] {
  const sorted = [...rows].sort((a, b) => (b.value || 0) - (a.value || 0));
  if (sorted.length <= maxSlices) return sorted;
  const head = sorted.slice(0, maxSlices);
  const tailSum = sorted.slice(maxSlices).reduce((acc, x) => acc + (x.value || 0), 0);
  return tailSum > 0 ? [...head, { name: 'Other', value: tailSum }] : head;
}

function formatCompactDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatReminderStamp(iso: string, allDay?: boolean) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'UPCOMING';
  if (allDay) return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).toUpperCase();
}

function statusConfig(status: string): { label: string; className: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'executed' || s === 'signed' || s === 'completed')
    return { label: 'Approved', className: 'bg-blue-50 text-blue-700 border border-blue-200' };
  if (s === 'pending' || s === 'in_review' || s === 'review' || s === 'processing')
    return { label: 'Pending', className: 'bg-gray-100 text-gray-700 border border-gray-200' };
  if (s === 'rejected' || s === 'failed' || s === 'declined')
    return { label: 'Rejected', className: 'bg-gray-900 text-white border border-gray-900' };
  if (s === 'draft')
    return { label: 'Draft', className: 'bg-white text-gray-600 border border-gray-300' };
  if (s === 'sent' || s === 'in_progress')
    return { label: s === 'sent' ? 'Sent' : 'In Progress', className: 'bg-blue-50 text-blue-700 border border-blue-200' };
  return { label: String(status).replace(/_/g, ' '), className: 'bg-white text-gray-600 border border-gray-200' };
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon, accent = false,
}: {
  label: string; value: number | string; sub: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`relative flex flex-col gap-4 rounded-2xl border p-5 shadow-sm overflow-hidden transition-all hover:shadow-md ${accent ? 'bg-blue-600 border-blue-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-blue-200' : 'text-gray-400'}`}>{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${accent ? 'bg-white/20' : 'bg-blue-50'}`}>
          <span className={accent ? 'text-white' : 'text-blue-600'}>{icon}</span>
        </div>
      </div>
      <div>
        <p className={`text-4xl font-bold tracking-tight ${accent ? 'text-white' : 'text-gray-900'}`}>{value}</p>
        <p className={`text-xs mt-1.5 ${accent ? 'text-blue-200' : 'text-gray-400'}`}>{sub}</p>
      </div>
      <div className={`absolute -bottom-8 -right-8 w-28 h-28 rounded-full opacity-10 ${accent ? 'bg-white' : 'bg-blue-500'}`} />
    </div>
  );
}

// ─── Donut Card ───────────────────────────────────────────────────────────────
function DonutCard({ title, subtitle, data, emptyText, badge }: {
  title: string; subtitle?: string; data: DonutDatum[]; emptyText?: string; badge?: string;
}) {
  const total = data.reduce((acc, x) => acc + (x.value || 0), 0);
  const hasData = total > 0;
  const topItems = [...data].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 4);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">{badge}</span>
        )}
      </div>

      <div className="h-44 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={74} paddingAngle={2} animationDuration={800}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BLUE_PALETTE[i % BLUE_PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">{emptyText || 'No data available.'}</div>
        )}
      </div>

      {hasData && (
        <div className="mt-4 space-y-2">
          {topItems.map((item, i) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BLUE_PALETTE[i % BLUE_PALETTE.length] }} />
                <span className="text-xs text-gray-600 flex-1 truncate">{item.name}</span>
                <span className="text-xs font-bold text-gray-900">{pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">Total</span>
        <span className="text-xs font-bold text-gray-900">{total}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const DashboardPageV2: React.FC = () => {
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({ total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<
    Array<{ id: string; title: string; start: string; end?: string; allDay?: boolean; category?: string }>
  >([]);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [nowTs, setNowTs] = useState<number>(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/');
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (isLoading || !isAuthenticated) return;
      setIsSyncing(true);
      setInsightsLoading(true);
      try {
        const client = new ApiClient();
        const start = new Date();
        const end = new Date();
        start.setDate(start.getDate() - 365);
        end.setDate(end.getDate() + 365);

        const [statsRes, recentRes, contractsRes, insightsRes, eventsRes] = await Promise.all([
          client.getContractStatistics(),
          client.getRecentContracts(5),
          client.getContracts(),
          client.getDashboardInsights(),
          client.listCalendarEvents({ start: start.toISOString(), end: end.toISOString() }),
        ]);

        const unauthorized = [statsRes, recentRes, contractsRes, insightsRes, eventsRes].some(
          (r) => !r.success && r.status === 401
        );
        if (unauthorized) {
          try { client.logout(); } catch { /* ignore */ }
          router.push('/');
          return;
        }

        if (statsRes.success && statsRes.data) {
          const d = statsRes.data as any;
          setStats({ total: d.total || 0, draft: d.draft || 0, pending: d.pending || 0, approved: d.approved || 0, rejected: d.rejected || 0 });
        }

        if (recentRes.success && recentRes.data) {
          const contracts = Array.isArray(recentRes.data) ? recentRes.data : (recentRes.data as any).results || [];
          setRecentContracts(
            contracts.slice(0, 6).map((c: any) => ({
              id: c.id,
              name: c.title || c.name,
              status: c.status,
              date: c.created_at || new Date().toISOString(),
              value: c.value || 0,
              trend: 0,
            }))
          );
        }

        if (contractsRes.success && contractsRes.data) {
          const all = Array.isArray(contractsRes.data) ? contractsRes.data : (contractsRes.data as any).results || [];
          const now = new Date();
          const months: Date[] = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));
          setGrowth(
            months.map((d) => {
              const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              const count = all.filter((c: any) => {
                const cd = new Date(c.created_at || c.createdAt || c.date || '');
                return `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}` === k;
              }).length;
              return { month: d.toLocaleString(undefined, { month: 'short' }), count };
            })
          );
        }

        if (insightsRes.success && insightsRes.data) setInsights(insightsRes.data as any);

        if ((eventsRes as any)?.success && (eventsRes as any)?.data) {
          const raw = (eventsRes as any).data;
          const items = Array.isArray(raw) ? raw : raw.results || [];
          const now = new Date();
          const normalized = items
            .map((e: any) => {
              const startIso = e.start_datetime || e.startDatetime || e.start || '';
              const startDate = startIso ? new Date(startIso) : null;
              const startMs = startDate && !isNaN(startDate.getTime()) ? startDate.getTime() : NaN;
              return { id: String(e.id || ''), title: String(e.title || 'Untitled'), start: startIso, end: e.end_datetime || e.endDatetime || e.end, allDay: Boolean(e.all_day ?? e.allDay ?? false), category: e.category, __startMs: startMs };
            })
            .filter((e: any) => isFinite(e.__startMs))
            .sort((a: any, b: any) => a.__startMs - b.__startMs);
          const upcoming = normalized.filter((e: any) => e.__startMs >= now.getTime());
          const selected = (upcoming.length ? upcoming : [...normalized].reverse()).slice(0, 3).map(({ __startMs, ...rest }: any) => rest);
          setUpcomingEvents(selected);
        } else {
          setUpcomingEvents([]);
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setIsSyncing(false);
        setInsightsLoading(false);
      }
    };

    if (user && !isLoading && isAuthenticated) fetchData();
  }, [user, isLoading, isAuthenticated, router]);

  // ── Loading / Auth guard ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-500 font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  // ── Derived values ────────────────────────────────────────────────────────
  const reviewCount = (insights?.feature_usage_30d || []).reduce((acc, r) =>
    acc + (r.key?.toLowerCase().includes('review') ? (r.count || 0) : 0), 0);
  const uploadCount = typeof insights?.upload_count_30d === 'number'
    ? insights.upload_count_30d
    : (insights?.feature_usage_30d || []).reduce((acc, r) => acc + (r.key?.toLowerCase().includes('upload') ? (r.count || 0) : 0), 0);
  const templatesCount = typeof insights?.templates_count === 'number'
    ? insights.templates_count
    : ((insights?.template_files_count || 0) + (insights?.contract_templates_count || 0));
  const aiCount = (insights?.ai_tasks_by_status_180d || []).reduce((acc, r) => acc + (r.count || 0), 0);
  const upcomingEventsKpi = typeof insights?.calendar_upcoming_365d === 'number'
    ? insights.calendar_upcoming_365d
    : (insights?.calendar_upcoming_30d ?? 0);
  const contractTypeData = toDonutData(
    (insights?.contract_types_180d || []).map((x) => ({ name: x.type || 'Unspecified', value: x.count })), 5
  );

  const statusDist = [
    { label: 'Approved', value: stats.approved, bar: 'bg-blue-600', dot: 'bg-blue-600' },
    { label: 'Pending',  value: stats.pending,  bar: 'bg-blue-300', dot: 'bg-blue-300' },
    { label: 'Draft',    value: stats.draft,    bar: 'bg-gray-300', dot: 'bg-gray-300' },
    { label: 'Rejected', value: stats.rejected, bar: 'bg-gray-900', dot: 'bg-gray-900' },
  ];

  const nowDate = new Date(nowTs);
  const dateStr = nowDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          </div>
          <p className="text-sm text-gray-400">{dateStr} · {timeStr}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { if (!isSyncing && user && isAuthenticated) { /* re-mount by forcing re-render */ } }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : 'Refresh'}</span>
          </button>
          <button
            onClick={() => router.push('/create-contract')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Contract
          </button>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total Contracts" value={stats.total} sub="Across all statuses" icon={<FileText className="w-4 h-4" />} accent />
        <KpiCard label="Pending Review" value={stats.pending} sub="Awaiting team action" icon={<Clock className="w-4 h-4" />} />
        <KpiCard label="Approved" value={stats.approved} sub="Ready for execution" icon={<ShieldCheck className="w-4 h-4" />} />
        <KpiCard label="Upcoming Events" value={upcomingEventsKpi} sub="Next 12 months" icon={<CalendarDays className="w-4 h-4" />} />
      </div>

      {/* ── Status Distribution Bar ──────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Status Distribution</h3>
            <span className="text-xs text-gray-400">{stats.total} total</span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full gap-0.5">
            {statusDist.filter((x) => x.value > 0).map((item) => (
              <div
                key={item.label}
                className={`${item.bar} h-full transition-all duration-700`}
                style={{ width: `${Math.round((item.value / stats.total) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {statusDist.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                <span className="text-xs text-gray-500">{item.label}</span>
                <span className="text-xs font-bold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 mb-5">
        {/* Area Chart */}
        <div className="xl:col-span-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Activity Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">Monthly contract creation velocity</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
              <BarChart3 className="w-3 h-3" /> Last 6 months
            </span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growth} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2563EB"
                  strokeWidth={2.5}
                  fill="url(#blueGrad)"
                  dot={{ r: 3, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#1D4ED8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut */}
        <div className="xl:col-span-4">
          <DonutCard
            title="Contract Types"
            subtitle="Distribution · 6 months"
            data={contractTypeData}
            emptyText="No type data yet."
            badge="Live"
          />
        </div>
      </div>

      {/* ── Bottom Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Recent Contracts Table */}
        <div className="xl:col-span-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Contracts</h3>
            <button
              onClick={() => router.push('/contracts')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_130px_100px] text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 bg-gray-50/80 border-b border-gray-100">
            <div>Contract</div>
            <div>Status</div>
            <div className="text-right">Created</div>
          </div>

          {isSyncing ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" /> Refreshing…
            </div>
          ) : recentContracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-14">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                <FileText className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm text-gray-400 font-medium">No contracts yet</p>
              <button
                onClick={() => router.push('/create-contract')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Create your first contract →
              </button>
            </div>
          ) : (
            recentContracts.map((c, idx) => {
              const cfg = statusConfig(c.status);
              return (
                <div
                  key={c.id}
                  className={`grid grid-cols-1 md:grid-cols-[1fr_130px_100px] items-center gap-3 px-6 py-3.5 transition-colors hover:bg-gray-50 cursor-pointer ${idx < recentContracts.length - 1 ? 'border-b border-gray-100' : ''}`}
                  onClick={() => router.push(`/contracts/${c.id}`)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  </div>
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 md:text-right font-medium">{formatCompactDate(c.date)}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Panel */}
        <div className="xl:col-span-4 flex flex-col gap-4">
          {/* Operations Snapshot */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Operations</h3>
              <span className="text-xs text-gray-400">30d overview</span>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Reviews',   value: reviewCount,   icon: <Activity className="w-3.5 h-3.5 text-blue-500" /> },
                { label: 'Uploads',   value: uploadCount,   icon: <Upload className="w-3.5 h-3.5 text-blue-500" /> },
                { label: 'Templates', value: templatesCount, icon: <FileText className="w-3.5 h-3.5 text-blue-500" /> },
                { label: 'AI Tasks',  value: aiCount,       icon: <Zap className="w-3.5 h-3.5 text-blue-500" /> },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5 hover:border-gray-200 hover:bg-gray-50/60 transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">{row.icon}</div>
                  <span className="flex-1 text-sm text-gray-600">{row.label}</span>
                  <span className="text-sm font-bold text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Draft contracts</span>
              <span className="text-xs font-bold text-gray-900">{stats.draft}</span>
            </div>
          </div>

          {/* Reminders / Events */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Upcoming Events</h3>
              <span className={`text-xs font-medium ${isSyncing ? 'text-blue-500' : 'text-gray-400'}`}>
                {isSyncing ? 'Syncing…' : 'Synced'}
              </span>
            </div>

            <div className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center">
                  <CalendarDays className="w-7 h-7 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No upcoming events.</p>
                </div>
              ) : (
                upcomingEvents.map((e, idx) => (
                  <div
                    key={e.id || String(idx)}
                    className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 hover:border-blue-200 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => router.push('/calendar')}
                  >
                    <p className="text-[10px] font-bold text-blue-600 tracking-wide">{formatReminderStamp(e.start, e.allDay)}</p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{e.title}</p>
                    {e.category && <p className="text-xs text-gray-400 mt-0.5">{e.category}</p>}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => router.push('/calendar')}
              className="mt-4 w-full rounded-xl bg-gray-900 hover:bg-blue-600 active:bg-blue-700 text-white py-2.5 text-sm font-semibold transition-colors"
            >
              Open Calendar
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPageV2;
