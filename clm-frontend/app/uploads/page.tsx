'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { ApiClient } from '../lib/api-client';
import { UploadCloud, Download, Eye, FileText, Lock, Search, Trash2 } from 'lucide-react';

type PrivateUploadItem = {
  key: string;
  filename: string;
  file_type: string;
  size: number;
  uploaded_at?: string | null;
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

const iconForType = (type: string) => {
  const t = (type || '').toLowerCase();
  if (t === 'pdf') {
    return (
      <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
        <FileText className="w-5 h-5" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
      <FileText className="w-5 h-5" />
    </div>
  );
};

export default function UploadsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [items, setItems] = useState<PrivateUploadItem[]>([]);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<PrivateUploadItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setBusy(true);
    try {
      const client = new ApiClient();
      const res = await client.listPrivateUploads();
      if (!res.success) throw new Error(res.error || 'Failed to load uploads');
      const results = (res.data as any)?.results || [];
      setItems(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load uploads');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => (it.filename || '').toLowerCase().includes(s));
  }, [items, query]);

  const pickFile = () => fileInputRef.current?.click();

  const validateFile = (f: File) => {
    const name = (f.name || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (ext !== 'pdf' && ext !== 'txt') return 'Only .pdf and .txt files are supported.';
    const max = 25 * 1024 * 1024;
    if (f.size > max) return 'File too large. Max size is 25MB.';
    return null;
  };

  const upload = async (file: File) => {
    const msg = validateFile(file);
    if (msg) {
      setError(msg);
      return;
    }

    setBusy(true);
    setUploadPercent(0);
    setError(null);
    try {
      const client = new ApiClient();
      const res = await client.uploadPrivateUploadWithProgress(file, {
        onProgress: ({ percent }) => {
          if (typeof percent === 'number') setUploadPercent(percent);
        },
      });
      if (!res.success) throw new Error(res.error || 'Upload failed');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      setTimeout(() => setUploadPercent(null), 800);
    }
  };

  const openPreview = async (it: PrivateUploadItem) => {
    setPreviewOpen(true);
    setPreviewItem(it);
    setPreviewUrl(null);
    setPreviewText(null);
    setError(null);

    try {
      const client = new ApiClient();
      const res = await client.getPrivateUploadUrl(it.key);
      if (!res.success) throw new Error(res.error || 'Failed to get preview URL');
      const url = (res.data as any)?.url as string | undefined;
      if (!url) throw new Error('No URL returned');
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open preview');
    }
  };

  const downloadFile = async (it: PrivateUploadItem) => {
    setError(null);
    try {
      const client = new ApiClient();
      const res = await client.getPrivateUploadUrl(it.key);
      if (!res.success) throw new Error(res.error || 'Failed to get download URL');
      const url = (res.data as any)?.url as string | undefined;
      if (!url) throw new Error('No URL returned');

      // Use the Cloudflare R2 presigned URL directly for maximum compatibility.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const remove = async (it: PrivateUploadItem) => {
    if (!window.confirm(`Delete ${it.filename}?`)) return;
    setError(null);
    setBusy(true);
    try {
      const client = new ApiClient();
      const res = await client.deletePrivateUpload(it.key);
      if (!res.success) throw new Error(res.error || 'Delete failed');
      await load();
      if (previewItem?.key === it.key) {
        setPreviewOpen(false);
        setPreviewItem(null);
        setPreviewUrl(null);
        setPreviewText(null);
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
            Private
            <br className="md:hidden" /> Document Vault &amp;
            <br className="md:hidden" /> Management
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

        <div className="bg-white rounded-[28px] p-6 md:p-8 shadow-sm">
          {/* Upload Area */}
          <div className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
            <UploadCloud className="w-5 h-5 text-rose-500" />
            Private Uploads
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
              <div className="text-xs md:text-sm text-white/90 mt-2">Support for PDF and .TXT files</div>
              <div className="text-[11px] md:text-xs text-white/80 mt-1">Max file size 25MB • Encryption Enabled</div>

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
                accept=".pdf,.txt,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
            </div>
          </div>

          {typeof uploadPercent === 'number' && (
            <div className="mt-4">
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

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Table Header */}
          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 text-slate-700">
                  <Lock className="w-4 h-4" />
                </span>
                My Private Files
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
                {items.length}
              </span>
            </div>

            <div className="relative w-full md:w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search files..."
                className="w-full bg-white border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 overflow-hidden">
            <div className="hidden md:grid grid-cols-12 bg-slate-50 px-5 py-3 text-[11px] font-bold text-slate-500 tracking-wide">
              <div className="col-span-6">FILE NAME</div>
              <div className="col-span-3">UPLOAD DATE</div>
              <div className="col-span-2">SIZE</div>
              <div className="col-span-1 text-right">ACTIONS</div>
            </div>

            <div className="divide-y divide-slate-100">
              {busy && items.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-500">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-6 text-sm text-slate-500">No files found</div>
              ) : (
                filtered.map((it) => (
                  <div key={it.key} className="px-5 py-4">
                    {/* Desktop row */}
                    <div className="hidden md:grid grid-cols-12 items-center">
                      <div className="col-span-6 flex items-center gap-3 min-w-0">
                        {iconForType(it.file_type)}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{it.filename}</div>
                          <div className="text-xs text-slate-500">Private</div>
                        </div>
                      </div>

                      <div className="col-span-3 text-sm text-slate-600">{formatDate(it.uploaded_at)}</div>
                      <div className="col-span-2 text-sm text-slate-600">{formatBytes(it.size)}</div>

                      <div className="col-span-1 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-800"
                          aria-label="View"
                          onClick={() => void openPreview(it)}
                          disabled={busy}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-800"
                          aria-label="Download"
                          onClick={() => void downloadFile(it)}
                          disabled={busy}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="text-rose-500 hover:text-rose-700"
                          aria-label="Delete"
                          onClick={() => void remove(it)}
                          disabled={busy}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div className="md:hidden flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {iconForType(it.file_type)}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{it.filename}</div>
                          <div className="text-xs text-slate-500">Private</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-800"
                          aria-label="View"
                          onClick={() => void openPreview(it)}
                          disabled={busy}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="text-slate-500 hover:text-slate-800"
                          aria-label="Download"
                          onClick={() => void downloadFile(it)}
                          disabled={busy}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="text-rose-500 hover:text-rose-700"
                          aria-label="Delete"
                          onClick={() => void remove(it)}
                          disabled={busy}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="md:hidden mt-2 text-xs text-slate-600">
                      {formatDate(it.uploaded_at)} • {formatBytes(it.size)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {Math.min(filtered.length, 50)} of {items.length} private files
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                aria-label="Previous"
                disabled
              >
                ‹
              </button>
              <button
                type="button"
                className="w-9 h-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                aria-label="Next"
                disabled
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {previewOpen && previewItem && (
          <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center px-4" onClick={() => setPreviewOpen(false)}>
            <div
              className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{previewItem.filename}</div>
                  <div className="text-xs text-slate-500">Private preview</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => void downloadFile(previewItem)}
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    onClick={() => void remove(previewItem)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                  <button
                    type="button"
                    className="w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    aria-label="Close"
                    onClick={() => setPreviewOpen(false)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="h-[70vh] bg-slate-50">
                {!previewUrl ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">Loading preview…</div>
                ) : (previewItem.file_type || '').toLowerCase() === 'pdf' ? (
                  <iframe title="PDF preview" src={previewUrl} className="w-full h-full" />
                ) : (
                  <iframe title="Text preview" src={previewUrl} className="w-full h-full" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
