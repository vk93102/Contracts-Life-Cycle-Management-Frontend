'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '../components/DashboardLayout';
import { ApiClient, ReviewContractListItem, ReviewContractStatus } from '../lib/api-client';
import {
  Download,
  Eye,
  FileText,
  RefreshCcw,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';

type PreviewState = {
  open: boolean;
  item: ReviewContractListItem | null;
  url: string | null;
  text: string | null;
};

const formatBytes = (bytes: number): string => {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
};

const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const statusPill = (status: ReviewContractStatus) => {
  const map: Record<ReviewContractStatus, string> = {
    uploaded: 'bg-slate-50 text-slate-700 border-slate-200',
    processing: 'bg-amber-50 text-amber-700 border-amber-200',
    ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return map[status] || 'bg-slate-50 text-slate-700 border-slate-200';
};

export default function ReviewPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  const [items, setItems] = useState<ReviewContractListItem[]>([]);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [analyzeOnUpload, setAnalyzeOnUpload] = useState(true);

  const [preview, setPreview] = useState<PreviewState>({
    open: false,
    item: null,
    url: null,
    text: null,
  });

  const load = async (q?: string) => {
    setError(null);
    setLoading(true);
    try {
      const client = new ApiClient();
      const res = await client.listReviewContracts({ q: q?.trim() ? q.trim() : undefined });
      if (!res.success) throw new Error(res.error || 'Failed to load review contracts');
      const results = (res.data as any)?.results || [];
      setItems(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load review contracts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load(query);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const name = (it.title || '').toLowerCase();
      const fn = (it.original_filename || '').toLowerCase();
      return name.includes(s) || fn.includes(s);
    });
  }, [items, query]);

  const validateFile = (f: File) => {
    const name = (f.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (ext !== 'pdf' && ext !== 'txt' && ext !== 'docx') return 'Only .pdf, .docx and .txt files are supported.';
    const max = 25 * 1024 * 1024;
    if (f.size > max) return 'File too large. Max size is 25MB.';
    return null;
  };

  const pickFile = () => fileInputRef.current?.click();

  const upload = async (file: File) => {
    const msg = validateFile(file);
    if (msg) {
      setError(msg);
      return;
    }

    setBusy(true);
    setUploadPercent(0);
    setProcessing(false);
    setError(null);
    try {
      const client = new ApiClient();
      const res = await client.uploadReviewContractWithProgress(file, {
        analyze: analyzeOnUpload,
        onProgress: ({ percent }) => {
          if (typeof percent === 'number') setUploadPercent(percent);
        },
      });
      if (!res.success) throw new Error(res.error || 'Upload failed');

      // If analyze was requested, backend may spend time extracting/embedding/reviewing.
      if (analyzeOnUpload) setProcessing(true);
      await load(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      setTimeout(() => {
        setUploadPercent(null);
        setProcessing(false);
      }, 800);
    }
  };

  const openPreview = async (it: ReviewContractListItem) => {
    setError(null);
    setPreview({ open: true, item: it, url: null, text: null });

    try {
      const client = new ApiClient();
      const res = await client.getReviewContractUrl(it.id);
      if (!res.success) throw new Error(res.error || 'Failed to get preview URL');
      const url = (res.data as any)?.url as string | undefined;
      if (!url) throw new Error('No URL returned');

      if ((it.file_type || '').toLowerCase() === 'txt') {
        const txt = await fetch(url).then((r) => r.text());
        setPreview({ open: true, item: it, url, text: txt });
      } else {
        setPreview({ open: true, item: it, url, text: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open preview');
    }
  };

  const downloadOriginal = async (it: ReviewContractListItem) => {
    setError(null);
    try {
      const client = new ApiClient();
      const res = await client.getReviewContractUrl(it.id);
      if (!res.success) throw new Error(res.error || 'Failed to get download URL');
      const url = (res.data as any)?.url as string | undefined;
      if (!url) throw new Error('No URL returned');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const downloadReport = async (it: ReviewContractListItem, kind: 'txt' | 'pdf') => {
    setError(null);
    try {
      const client = new ApiClient();
      const res =
        kind === 'txt' ? await client.downloadReviewReportTxt(it.id) : await client.downloadReviewReportPdf(it.id);
      if (!res.success || !res.data) throw new Error(res.error || 'Download failed');

      const blob = res.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const base = (it.title || it.original_filename || 'lawflow_report').trim().replace(/\s+/g, '_');
      a.download = kind === 'txt' ? `${base}_review.txt` : `${base}_review.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const analyze = async (it: ReviewContractListItem) => {
    setError(null);
    setBusy(true);
    try {
      const client = new ApiClient();
      const res = await client.analyzeReviewContract(it.id);
      if (!res.success) throw new Error(res.error || 'Analyze failed');
      await load(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyze failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (it: ReviewContractListItem) => {
    if (!window.confirm(`Delete ${it.title || it.original_filename}?`)) return;
    setError(null);
    setBusy(true);
    try {
      const client = new ApiClient();
      const res = await client.deleteReviewContract(it.id);
      if (!res.success) throw new Error(res.error || 'Delete failed');
      await load(query);
      if (preview.item?.id === it.id) {
        setPreview({ open: false, item: null, url: null, text: null });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top Bar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-3xl md:text-3xl font-extrabold text-slate-900 leading-tight">
            Review
            <br className="md:hidden" /> Contracts
          </h1>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-[360px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="w-full bg-white border border-slate-200 rounded-full pl-10 pr-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-[28px] p-6 md:p-8 shadow-sm">
          <div className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <UploadCloud className="w-5 h-5 text-rose-500" />
            Upload Contract for Review
          </div>

          <div className="flex items-center gap-3 mb-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={analyzeOnUpload}
                onChange={(e) => setAnalyzeOnUpload(e.target.checked)}
                className="w-4 h-4 accent-rose-500"
              />
              Analyze automatically (Voyage + Gemini)
            </label>
          </div>

          <div
            className={`relative rounded-[22px] border-2 border-dashed transition overflow-hidden ${
              dragOver ? 'border-rose-300' : 'border-rose-200'
            }`}
            style={{
              background: 'linear-gradient(180deg, rgba(255,92,122,0.85), rgba(255,92,122,0.70))',
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void upload(f);
            }}
          >
            <div className="px-6 py-12 md:py-14 flex flex-col items-center text-center text-white">
              <div className="w-16 h-16 rounded-full bg-white/15 flex items-center justify-center mb-4">
                <UploadCloud className="w-7 h-7 text-white" />
              </div>
              <div className="text-base md:text-lg font-extrabold">Drag &amp; Drop files here</div>
              <div className="text-xs md:text-sm text-white/90 mt-2">Support for PDF, DOCX and .TXT files</div>
              <div className="text-[11px] md:text-xs text-white/80 mt-1">Max file size 25MB</div>

              <button
                type="button"
                onClick={pickFile}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-white text-slate-900 px-5 py-2.5 text-sm font-semibold hover:bg-white/90"
                disabled={busy}
              >
                Choose file
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>

          {(typeof uploadPercent === 'number' || processing) && (
            <div className="mt-4">
              {typeof uploadPercent === 'number' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                    <div className="font-semibold">Uploading</div>
                    <div>{Math.min(100, Math.max(0, uploadPercent))}%</div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-rose-500 transition-[width] duration-200"
                      style={{ width: `${Math.min(100, Math.max(0, uploadPercent))}%` }}
                    />
                  </div>
                </div>
              )}

              {processing && (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                    <div className="font-semibold">Processing</div>
                    <div>Analyzing…</div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-2 w-1/3 rounded-full bg-slate-300 animate-pulse" />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div className="mt-4 text-sm text-rose-600">{error}</div>}
        </div>

        {/* List */}
        <div className="bg-white rounded-[28px] p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <div className="text-lg font-extrabold text-slate-900">Reviewed Documents</div>
              <div className="text-sm text-slate-500">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</div>
            </div>
            <button
              type="button"
              onClick={() => load(query)}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              disabled={loading}
            >
              <RefreshCcw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-3 pr-4">Document</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Size</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="py-3 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td className="py-10 text-slate-500" colSpan={5}>
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td className="py-10 text-slate-500" colSpan={5}>
                      No review documents yet
                    </td>
                  </tr>
                ) : (
                  filtered.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => router.push(`/review/${it.id}`)}
                          className="text-left"
                        >
                          <div className="font-semibold text-slate-900">{it.title || it.original_filename}</div>
                          <div className="text-xs text-slate-500">{it.original_filename}</div>
                        </button>
                      </td>
                      <td className="py-4 pr-4">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusPill(
                            it.status
                          )}`}
                        >
                          {String(it.status).toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-slate-700">{formatBytes(it.size_bytes)}</td>
                      <td className="py-4 pr-4 text-slate-700">{formatDate(it.created_at)}</td>
                      <td className="py-4 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/review/${it.id}`)}
                            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 inline-flex items-center justify-center"
                            title="Open review"
                          >
                            <FileText className="w-4 h-4 text-slate-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openPreview(it)}
                            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 inline-flex items-center justify-center"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4 text-slate-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadOriginal(it)}
                            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 inline-flex items-center justify-center"
                            title="Download original"
                          >
                            <Download className="w-4 h-4 text-slate-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadReport(it, 'pdf')}
                            className="px-3 h-9 rounded-xl bg-[#0F141F] text-white hover:bg-[#0F141F]/90 inline-flex items-center justify-center text-xs font-semibold"
                            title="Download report (PDF)"
                          >
                            Report PDF
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadReport(it, 'txt')}
                            className="px-3 h-9 rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center text-xs font-semibold"
                            title="Download report (TXT)"
                          >
                            Report TXT
                          </button>

                          <button
                            type="button"
                            onClick={() => analyze(it)}
                            className="w-9 h-9 rounded-xl bg-amber-50 hover:bg-amber-100 inline-flex items-center justify-center"
                            title="Re-analyze"
                            disabled={busy}
                          >
                            <RefreshCcw className="w-4 h-4 text-amber-700" />
                          </button>

                          <button
                            type="button"
                            onClick={() => remove(it)}
                            className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 inline-flex items-center justify-center"
                            title="Delete"
                            disabled={busy}
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Preview Modal */}
        {preview.open && (
          <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-5xl rounded-3xl overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-extrabold text-slate-900 truncate">
                    {preview.item?.title || preview.item?.original_filename || 'Preview'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{preview.item?.original_filename}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreview({ open: false, item: null, url: null, text: null })}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 inline-flex items-center justify-center"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                {!preview.url ? (
                  <div className="text-slate-500">Loading preview…</div>
                ) : preview.text != null ? (
                  <pre className="whitespace-pre-wrap text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-[70vh] overflow-auto">
                    {preview.text}
                  </pre>
                ) : (preview.item?.file_type || '').toLowerCase() === 'pdf' ? (
                  <iframe
                    src={preview.url}
                    className="w-full h-[70vh] rounded-2xl border border-slate-200"
                    title="Preview"
                  />
                ) : (
                  <div className="text-slate-700">
                    Preview isn’t available for this file type.{' '}
                    <button
                      type="button"
                      className="text-rose-600 font-semibold"
                      onClick={() => preview.item && downloadOriginal(preview.item)}
                    >
                      Download original
                    </button>
                    .
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
