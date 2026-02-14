'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import { useRouter } from 'next/navigation';
import { ApiClient, FirmaSigningRequestListItem } from '@/app/lib/api-client';
import { CheckSquare, Search, Send, ArrowRight } from 'lucide-react';

type StatusFilter = 'all' | 'draft' | 'sent' | 'completed' | 'declined' | 'failed';

const SigningRequestsPageV2: React.FC = () => {
  const [items, setItems] = useState<FirmaSigningRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const router = useRouter();

  const fetchList = async () => {
    try {
      setLoading(true);
      setError(null);
      const client = new ApiClient();
      const res = await client.firmaListSigningRequests({ limit: 200, status: filterStatus === 'all' ? undefined : filterStatus });
      if (!res.success) {
        setError(res.error || 'Failed to load signing requests');
        setItems([]);
        return;
      }
      const results = (res.data as any)?.results;
      setItems(Array.isArray(results) ? results : []);
      setLastRefreshAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load signing requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const formatTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const statusPill = (status: string) => {
    const s = String(status || '').toLowerCase();
    const map: Record<string, string> = {
      completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      sent: 'bg-amber-50 text-amber-700 border-amber-200',
      in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
      draft: 'bg-slate-50 text-slate-700 border-slate-200',
      declined: 'bg-rose-50 text-rose-700 border-rose-200',
      failed: 'bg-rose-50 text-rose-700 border-rose-200',
    };
    return map[s] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = items;
    if (!q) return base;
    return base.filter((it) => {
      const title = String(it.contract_title || '').toLowerCase();
      const cid = String(it.contract_id || '').toLowerCase();
      const did = String(it.firma_document_id || '').toLowerCase();
      return title.includes(q) || cid.includes(q) || did.includes(q);
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => String(i.status).toLowerCase() === 'completed').length;
    const pending = items.filter((i) => ['sent', 'in_progress', 'draft'].includes(String(i.status).toLowerCase())).length;
    const failed = items.filter((i) => ['declined', 'failed'].includes(String(i.status).toLowerCase())).length;
    return { total, completed, pending, failed };
  }, [items]);

  const refreshOne = async (contractId: string, rowId: string) => {
    try {
      setRefreshingId(rowId);
      const client = new ApiClient();
      await client.firmaStatus(contractId);
      await fetchList();
    } finally {
      setRefreshingId(null);
    }
  };

  const resendOne = async (contractId: string, rowId: string) => {
    try {
      setResendingId(rowId);
      const client = new ApiClient();
      const res = await client.firmaResendInvites(contractId);
      if (!res.success) {
        setError(res.error || 'Failed to resend');
      }
      await fetchList();
    } finally {
      setResendingId(null);
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3">
            <span>Signing Requests</span>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold bg-white text-slate-700 border-slate-200">
              <CheckSquare className="w-4 h-4" />
              {stats.total} total
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lastRefreshAt ? `Last update: ${lastRefreshAt.toLocaleString()}` : '—'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search signing requests…"
              className="w-full sm:w-[320px] bg-white border border-slate-200 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>
          <button
            onClick={fetchList}
            className="inline-flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-800 px-5 py-3 text-sm font-semibold hover:bg-slate-50 w-full sm:w-auto"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[{ label: 'Total', value: stats.total }, { label: 'Pending', value: stats.pending }, { label: 'Completed', value: stats.completed }, { label: 'Failed', value: stats.failed }].map((s) => (
          <div key={s.label} className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-6">
            <p className="text-slate-500 text-sm">{s.label}</p>
            <p className="text-4xl font-extrabold text-slate-900 mt-2">{String(s.value).padStart(2, '0')}</p>
          </div>
        ))}
      </div>

      {/* Filters + List */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-slate-900">All Signing Requests</p>
            <p className="text-sm text-slate-500 mt-1">{visible.length} request{visible.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex gap-2 overflow-x-auto sm:flex-wrap">
            {(['all', 'draft', 'sent', 'completed', 'declined', 'failed'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  filterStatus === s
                    ? 'bg-[#0F141F] text-white border-[#0F141F]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {loading ? (
            <div className="py-16 text-center text-slate-500">Loading signing requests…</div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600">{error}</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-slate-500">No signing requests found</div>
          ) : (
            visible.map((it) => {
              const p = it.progress || { total_signers: 0, signed: 0, remaining: 0 };
              const pct = p.total_signers > 0 ? Math.round((p.signed / p.total_signers) * 100) : 0;
              return (
                <div key={it.id} className="px-6 py-5 hover:bg-slate-50 transition">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{it.contract_title}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <p className="text-xs text-slate-500 truncate">Contract: {it.contract_id}</p>
                        <span className="text-slate-300">•</span>
                        <p className="text-xs text-slate-500 truncate">Request ID: {it.firma_document_id}</p>
                      </div>

                      <div className="mt-4 w-full">
                        <div className="flex items-center justify-between text-xs text-slate-600">
                          <span>Progress</span>
                          <span className="font-semibold">{p.signed}/{p.total_signers} ({pct}%)</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-[#FF5C7A]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-6 mt-4 text-xs text-slate-500">
                        <span>Last update: {formatTime(it.last_updated || it.last_checked)}</span>
                        <span>Status checked: {formatTime(it.last_checked)}</span>
                        <span>Expires: {formatTime(it.expires_at)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:items-end gap-3">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${statusPill(String(it.status))}`}>
                        {String(it.status).replace('_', ' ').toUpperCase()}
                      </span>

                      <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                        <button
                          onClick={() => refreshOne(it.contract_id, it.id)}
                          disabled={refreshingId === it.id}
                          className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 text-slate-800 px-4 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                        >
                          {refreshingId === it.id ? 'Refreshing…' : 'Refresh'}
                        </button>

                        <button
                          onClick={() => resendOne(it.contract_id, it.id)}
                          disabled={resendingId === it.id}
                          className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 text-slate-800 px-4 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {resendingId === it.id ? 'Resending…' : 'Resend'}
                        </button>

                        <button
                          onClick={() => router.push(`/contracts/${it.contract_id}/signing-status`)}
                          className="inline-flex items-center gap-2 rounded-full bg-[#0F141F] text-white px-4 py-2 text-xs font-semibold"
                        >
                          Open <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SigningRequestsPageV2;
