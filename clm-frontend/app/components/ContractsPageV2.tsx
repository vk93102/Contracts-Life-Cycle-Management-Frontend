'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import { useRouter } from 'next/navigation';
import { ApiClient, Contract } from '@/app/lib/api-client';
import { FileText, Search, Trash2 } from 'lucide-react';

interface ContractStats {
  total: number;
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
}

const ContractsPageV2: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<ContractStats>({
    total: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const lastRefreshAtRef = React.useRef<number>(0);

  useEffect(() => {
    fetchContracts();

    // Keep list reasonably fresh (edit page updates `updated_at`).
    // This is intentionally lightweight; "true" realtime would use websockets.
    const onFocus = () => fetchContracts();
    window.addEventListener('focus', onFocus);

    const onChanged = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 800) return;
      lastRefreshAtRef.current = now;
      fetchContracts();
    };
    window.addEventListener('contracts:changed', onChanged as any);

    const interval = window.setInterval(() => {
      // Avoid unnecessary work when tab is hidden.
      if (document.visibilityState === 'visible') fetchContracts();
    }, 15000);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('contracts:changed', onChanged as any);
      window.clearInterval(interval);
    };
  }, []);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      setError(null);
      lastRefreshAtRef.current = Date.now();
      const client = new ApiClient();
      const response = await client.getContracts();

      if (response.success) {
        const contractsList = Array.isArray(response.data)
          ? response.data
          : response.data?.results || [];
        setContracts(contractsList);

        // Calculate stats
        const newStats = {
          total: contractsList.length,
          draft: contractsList.filter((c: any) => c.status === 'draft').length,
          pending: contractsList.filter((c: any) => c.status === 'pending').length,
          approved: contractsList.filter((c: any) => c.status === 'approved').length,
          rejected: contractsList.filter((c: any) => c.status === 'rejected').length,
        };
        setStats(newStats);
      } else {
        setError(response.error || 'Failed to fetch contracts');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const deleteOne = async (contract: any) => {
    const id = String(contract?.id || '').trim();
    if (!id) return;

    const title = String(contract?.title || contract?.name || 'this contract');
    const ok = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!ok) return;

    try {
      setDeletingId(id);
      setError(null);
      const client = new ApiClient();
      const res = await client.deleteContract(id);
      if (!res.success) {
        setError(res.error || 'Failed to delete contract');
        return;
      }

      // Refresh list and notify any other pages.
      await fetchContracts();
      window.dispatchEvent(new Event('contracts:changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contract');
    } finally {
      setDeletingId(null);
    }
  };

  const openContract = (contractId: string) => {
    router.push(`/contracts/editor?id=${encodeURIComponent(contractId)}`);
  };

  const formatUpdatedLabel = (c: any) => {
    const iso = c?.updated_at || c?.last_edited_at || c?.created_at;
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      draft: 'bg-slate-50 text-slate-700 border-slate-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
    };
    return colors[status] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const filteredContracts =
    filterStatus === 'all'
      ? contracts
      : contracts.filter((c: any) => c.status === filterStatus);

  const visibleContracts = filteredContracts.filter((c: any) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const name = (c.title || c.name || '').toLowerCase();
    return name.includes(s);
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Contracts</h1>
            <p className="mt-1 text-sm text-slate-500">
              All contracts &middot; <span className="font-semibold text-slate-700">{visibleContracts.length} shown</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contracts…"
                className="w-full sm:w-[280px] bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <button
              onClick={() => router.push('/create-contract')}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition whitespace-nowrap"
            >
              <FileText className="w-4 h-4" />
              New Contract
            </button>
          </div>
        </div>

        {/* ── STAT STRIP ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, bar: 'bg-slate-300', sub: 'All contracts' },
            { label: 'Draft', value: stats.draft, bar: 'bg-slate-400', sub: 'In progress' },
            { label: 'Pending', value: stats.pending, bar: 'bg-blue-400', sub: 'Awaiting approval' },
            { label: 'Approved', value: stats.approved, bar: 'bg-blue-700', sub: 'Ready to sign' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 hover:shadow-sm transition">
              <div className={`w-1 h-12 rounded-full shrink-0 ${s.bar}`} />
              <div>
                <p className="text-3xl font-extrabold text-slate-900 leading-none">{String(s.value).padStart(2, '0')}</p>
                <p className="text-xs font-semibold text-slate-500 mt-1">{s.label}</p>
                <p className="text-[11px] text-slate-400">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── TABLE CARD ── */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">

          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm font-extrabold text-slate-800">All Contracts</p>
            <div className="flex gap-1.5 flex-wrap">
              {['all', 'draft', 'pending', 'approved', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          {!loading && !error && visibleContracts.length > 0 && (
            <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <div className="col-span-5">Contract</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-3">Last Updated</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
          )}

          {/* Rows */}
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="py-20 text-center">
                <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mx-auto" />
                <p className="text-sm text-slate-400 mt-3">Loading contracts…</p>
              </div>
            ) : error ? (
              <div className="py-20 text-center text-red-500 text-sm">{error}</div>
            ) : visibleContracts.length === 0 ? (
              <div className="py-20 text-center">
                <FileText className="w-10 h-10 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-400 mt-3">No contracts found</p>
              </div>
            ) : (
              visibleContracts.map((contract: any) => (
                <div
                  key={contract.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openContract(String(contract.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openContract(String(contract.id));
                    }
                  }}
                  className="px-6 py-4 hover:bg-slate-50 transition cursor-pointer group"
                >
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">

                    {/* Contract info */}
                    <div className="md:col-span-5 flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-blue-50 transition">
                        <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{contract.title || contract.name}</p>
                        <p className="text-[11px] text-slate-400 truncate font-mono mt-0.5">{contract.id}</p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="md:col-span-2">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(contract.status)}`}>
                        {String(contract.status).toUpperCase()}
                      </span>
                    </div>

                    {/* Updated */}
                    <div className="md:col-span-3">
                      <p className="text-xs text-slate-600">{formatUpdatedLabel(contract)}</p>
                    </div>

                    {/* Actions */}
                    <div
                      className="md:col-span-2 flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteOne(contract);
                        }}
                        disabled={deletingId === String(contract.id)}
                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-slate-400 transition disabled:opacity-50"
                        title="Delete contract"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition">Edit →</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {!loading && visibleContracts.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-xs text-slate-400">{visibleContracts.length} contract{visibleContracts.length !== 1 ? 's' : ''} displayed</p>
              <button
                onClick={() => router.push('/create-contract')}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + New Contract
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ContractsPageV2;
