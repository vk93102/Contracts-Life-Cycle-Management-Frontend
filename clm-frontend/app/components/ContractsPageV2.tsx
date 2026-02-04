'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import { useRouter } from 'next/navigation';
import { ApiClient, Contract } from '@/app/lib/api-client';
import { Bell, FileText, Search } from 'lucide-react';

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
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Contracts</h1>
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contracts..."
              className="w-[320px] bg-white border border-slate-200 rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>
          <button
            onClick={() => router.push('/create-contract')}
            className="inline-flex items-center gap-2 rounded-full bg-[#0F141F] text-white px-5 py-3 text-sm font-semibold"
          >
            <FileText className="w-4 h-4" />
            New Contract
          </button>
          <button className="w-11 h-11 rounded-full bg-white border border-slate-200 inline-flex items-center justify-center" aria-label="Notifications">
            <Bell className="w-5 h-5 text-slate-700" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[{ label: 'Total', value: stats.total }, { label: 'Draft', value: stats.draft }, { label: 'Pending', value: stats.pending }, { label: 'Approved', value: stats.approved }].map((s) => (
          <div key={s.label} className="rounded-3xl bg-white border border-slate-200 p-6">
            <p className="text-slate-500 text-sm">{s.label}</p>
            <p className="text-4xl font-extrabold text-slate-900 mt-2">{String(s.value).padStart(2, '0')}</p>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-lg font-extrabold text-slate-900">All Contracts</p>
            <p className="text-sm text-slate-500 mt-1">{visibleContracts.length} contract{visibleContracts.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {['all', 'draft', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${
                  filterStatus === status
                    ? 'bg-[#0F141F] text-white border-[#0F141F]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {loading ? (
            <div className="py-16 text-center text-slate-500">Loading contracts…</div>
          ) : error ? (
            <div className="py-16 text-center text-rose-600">{error}</div>
          ) : visibleContracts.length === 0 ? (
            <div className="py-16 text-center text-slate-500">No contracts found</div>
          ) : (
            visibleContracts.map((contract: any) => (
              <button
                key={contract.id}
                onClick={() => router.push(`/contracts/${contract.id}`)}
                className="w-full text-left px-6 py-5 hover:bg-slate-50 transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{contract.title || contract.name}</p>
                    <p className="text-xs text-slate-500 mt-1 truncate">{contract.id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(contract.status)}`}>
                      {String(contract.status).toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-500 hidden sm:inline">
                      {formatUpdatedLabel(contract)}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">View →</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ContractsPageV2;
