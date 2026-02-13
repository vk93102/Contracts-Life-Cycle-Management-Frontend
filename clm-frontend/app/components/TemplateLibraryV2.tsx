'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from './DashboardLayout';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Download,
  FileText,
  Trash2,
  Minus,
  MoreVertical,
  PlusCircle,
  Plus,
  Search,
  Shield,
} from 'lucide-react';
import { ApiClient, FileTemplateItem } from '@/app/lib/api-client';
import { useAuth } from '@/app/lib/auth-context';
import { downloadTextAsPdf } from '@/app/lib/downloads';

type Template = FileTemplateItem;

function statusPill(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'published' || s === 'active') return { label: 'ACTIVE', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (s === 'archived') return { label: 'ARCHIVED', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return { label: 'DRAFT', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
}

const TemplateLibrary: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'Agreements' | 'NDA' | 'SOW' | 'All'>('All');
  const [zoom, setZoom] = useState(100);
  const [rawTemplateDoc, setRawTemplateDoc] = useState('');
  const [templateDocLoading, setTemplateDocLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('NDA');
  const [createDescription, setCreateDescription] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [myTemplatesCount, setMyTemplatesCount] = useState<number | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [templatesMenuOpen, setTemplatesMenuOpen] = useState(false);
  const [semanticMatches, setSemanticMatches] = useState<string[] | null>(null);
  const [showAllList, setShowAllList] = useState(false);
  const router = useRouter();

  const LIST_LIMIT = 18;

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    // Keep "My Templates" card accurate.
    if (!user) {
      setMyTemplatesCount(null);
      return;
    }
    fetchMyTemplatesCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setDownloadOpen(false);
    setTemplatesMenuOpen(false);
    const load = async () => {
      try {
        setTemplateDocLoading(true);
        const client = new ApiClient();
        const response = await client.getTemplateFileContent(selectedTemplate.filename);
        if (response.success && response.data) {
          const content = (response.data as any).content || '';
          setRawTemplateDoc(content);
          return;
        }
        setRawTemplateDoc('');
      } catch {
        setRawTemplateDoc('');
      } finally {
        setTemplateDocLoading(false);
      }
    };
    load();
  }, [selectedTemplate]);

  useEffect(() => {
    if (!downloadOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Close for any click outside the menu/button container.
      if (target.closest('[data-download-menu]')) return;
      setDownloadOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [downloadOpen]);

  useEffect(() => {
    if (!templatesMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-templates-menu]')) return;
      setTemplatesMenuOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [templatesMenuOpen]);

  // Semantic search for templates (debounced)
  useEffect(() => {
    const q = search.trim();
    if (!q || q.length < 2) {
      setSemanticMatches(null);
      return;
    }
    if (!user) {
      setSemanticMatches(null);
      return;
    }

    const t = window.setTimeout(async () => {
      try {
        const client = new ApiClient();
        const res = await client.semanticSearchWithParams(q, { entity_type: 'template', limit: '50' });
        const results = (res.data as any)?.results || [];
        const filenames: string[] = [];
        for (const r of results) {
          const fn = (r?.metadata && (r.metadata.filename as string)) || '';
          if (fn) filenames.push(fn);
        }
        setSemanticMatches(filenames.length ? filenames : []);
      } catch {
        setSemanticMatches(null);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [search, user]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const client = new ApiClient();
      const response = await client.listTemplateFiles();

      if (!response.success) {
        setError(response.error || 'Failed to load templates');
        return;
      }

      const templateList = (response.data as any)?.results || [];

      setTemplates(templateList);
      if (templateList.length > 0) {
        setSelectedTemplate(templateList[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyTemplatesCount = async () => {
    try {
      const client = new ApiClient();
      const res = await client.listMyTemplateFiles();
      if (!res.success) {
        setMyTemplatesCount(0);
        return;
      }
      const count = (res.data as any)?.count;
      setMyTemplatesCount(typeof count === 'number' ? count : ((res.data as any)?.results || []).length);
    } catch {
      setMyTemplatesCount(0);
    }
  };

  const canDeleteTemplate = (t: Template | null) => {
    if (!user || !t) return false;
    const uid = String((user as any).user_id || '');
    const email = String((user as any).email || '').toLowerCase();
    const createdById = String((t as any).created_by_id || '');
    const createdByEmail = String((t as any).created_by_email || '').toLowerCase();
    return Boolean((uid && createdById && uid === createdById) || (email && createdByEmail && email === createdByEmail));
  };

  const deleteSelectedTemplate = async () => {
    if (!user || !selectedTemplate) return;
    if (!canDeleteTemplate(selectedTemplate)) {
      setError('You can only delete templates you created.');
      return;
    }
    const ok = window.confirm(`Delete "${selectedTemplate.name}"? This cannot be undone.`);
    if (!ok) return;

    try {
      setError(null);
      const client = new ApiClient();
      const res = await client.deleteTemplateFile(selectedTemplate.filename);
      if (!res.success) {
        setError(res.error || 'Failed to delete template');
        return;
      }
      setSelectedTemplate(null);
      setRawTemplateDoc('');
      await fetchTemplates();
      await fetchMyTemplatesCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete template');
    }
  };

  const createTemplate = async () => {
    try {
      if (!user) {
        setError('Please log in to create templates.');
        return;
      }
      setCreateBusy(true);
      const client = new ApiClient();
      const displayName = createName.trim() || 'New Template';
      const content =
        createContent ||
        `${displayName.toUpperCase()}\n\n${(createDescription || '').trim()}\n\n[Paste your template text here]\n`;

      const base = `${createType}-${displayName}`
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^A-Za-z0-9_.-]/g, '');
      const uniqueFilename = `${base || createType}-${Date.now()}`;

      const res = await client.createTemplateFile({
        name: displayName,
        filename: uniqueFilename,
        description: (createDescription || '').trim(),
        content,
      });
      if (!res.success) {
        setError(res.error || 'Failed to create template');
        return;
      }
      setCreateOpen(false);
      setCreateName('');
      setCreateType('NDA');
      setCreateDescription('');
      setCreateContent('');
      await fetchTemplates();
      await fetchMyTemplatesCount();
    } finally {
      setCreateBusy(false);
    }
  };

  const stats = useMemo(() => {
    const total = templates.length;
    const activeCount = templates.filter((t) => {
      const s = String(t.status || '').toLowerCase();
      return s === 'published' || s === 'active';
    }).length;
    const draftCount = Math.max(total - activeCount, 0);

    const byName = new Map<string, number>();
    templates.forEach((t) => {
      byName.set(t.name, (byName.get(t.name) || 0) + 1);
    });
    const mostUsed = Array.from(byName.entries()).sort((a, b) => b[1] - a[1])[0];

    return {
      total,
      mostUsedName: mostUsed?.[0] || (templates[0]?.name || '—'),
      mostUsedCount: mostUsed?.[1] || 0,
      activeCount,
      draftCount,
    };
  }, [templates]);

  const categories = useMemo(() => {
    const nda = templates.filter((t) => (t.contract_type || '').toLowerCase().includes('nda')).length;
    const sow = templates.filter((t) => (t.contract_type || '').toLowerCase().includes('sow')).length;
    const agreements = templates.length - nda - sow;
    return {
      All: templates.length,
      Agreements: Math.max(agreements, 0),
      NDA: nda,
      SOW: sow,
    };
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = templates
      .filter((t) => {
        const ct = (t.contract_type || '').toLowerCase();
        if (activeCategory === 'All') return true;
        if (activeCategory === 'NDA') return ct.includes('nda');
        if (activeCategory === 'SOW') return ct.includes('sow');
        return !ct.includes('nda') && !ct.includes('sow');
      })
      .filter((t) => {
        if (!showOnlyMine) return true;
        if (!user) return false;
        return (
          (t.created_by_id && t.created_by_id === user.user_id) ||
          (t.created_by_email && t.created_by_email === user.email)
        );
      });

    // Prefer semantic matches when available; fallback to local substring matching.
    if (s && semanticMatches && semanticMatches.length > 0) {
      const set = new Set(semanticMatches);
      const rank = new Map<string, number>();
      semanticMatches.forEach((fn, idx) => rank.set(fn, idx));
      return base
        .filter((t) => set.has(t.filename))
        .sort((a, b) => (rank.get(a.filename) ?? 9999) - (rank.get(b.filename) ?? 9999));
    }

    return base.filter((t) => {
      if (!s) return true;
      return (
        (t.name || '').toLowerCase().includes(s) ||
        (t.filename || '').toLowerCase().includes(s) ||
        (t.description || '').toLowerCase().includes(s)
      );
    });
  }, [templates, search, activeCategory, showOnlyMine, user, semanticMatches]);

  const listTemplates = useMemo(() => {
    if (showAllList) return filteredTemplates;
    return filteredTemplates.slice(0, LIST_LIMIT);
  }, [filteredTemplates, showAllList]);

  const downloadTemplateTxt = () => {
    if (!selectedTemplate || !rawTemplateDoc) return;

    const blob = new Blob([rawTemplateDoc], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedTemplate.filename || 'template.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadTemplatePdf = async () => {
    if (!selectedTemplate || !rawTemplateDoc) return;
    await downloadTextAsPdf({
      filename: selectedTemplate.filename,
      title: selectedTemplate.name,
      text: rawTemplateDoc,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-extrabold text-slate-900">Template Library</h1>
              <div className="relative hidden md:block" data-templates-menu>
                <button
                  type="button"
                  onClick={() => setTemplatesMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  All Templates
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>

                {templatesMenuOpen && (
                  <div className="absolute left-0 top-12 z-30 w-[340px] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-500">Quick switch</div>
                      <div className="text-sm font-bold text-slate-900">Templates</div>
                    </div>
                    <div className="max-h-[320px] overflow-auto">
                      {templates.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-slate-500">No templates available</div>
                      ) : (
                        templates.map((t) => {
                          const active = selectedTemplate?.id === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                setSelectedTemplate(t);
                                setTemplatesMenuOpen(false);
                              }}
                              className={`w-full px-4 py-3 text-left flex items-center justify-between gap-4 hover:bg-slate-50 ${
                                active ? 'bg-rose-50' : ''
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">{t.name}</div>
                                <div className="text-xs text-slate-500 truncate">{t.filename}</div>
                              </div>
                              {active && <span className="text-xs font-semibold text-rose-600">Active</span>}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedTemplate && (
              <div className="hidden md:flex items-center gap-2 bg-white rounded-full border border-slate-200 px-4 py-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="text-sm text-slate-700">Previewing: {selectedTemplate.name}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-white border border-slate-200 rounded-full pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <button
              onClick={() => {
                if (!user) {
                  setError('Please log in to create templates.');
                  return;
                }
                setCreateOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0F141F] text-white px-5 py-3 text-sm font-semibold w-full sm:w-auto"
            >
              <PlusCircle className="w-4 h-4" />
              New Template
            </button>
          </div>
        </div>

        {/* Top Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          <div className="rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, #fff 0 2px, transparent 3px)' }} />
            <p className="text-white/90 text-sm">Total Templates</p>
            <p className="text-4xl font-black mt-3">{String(templates.length).padStart(2, '0')}</p>
            <p className="text-xs text-white/80 mt-2">In your library</p>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6">
            <p className="text-slate-500 text-sm">Recently Used</p>
            <p className="text-xl font-bold text-slate-900 mt-2">{stats.mostUsedName}</p>
            <p className="text-xs text-slate-500 mt-1">Used {stats.mostUsedCount} times</p>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6">
            <p className="text-slate-500 text-sm">My Templates</p>
            <p className="text-4xl font-bold text-slate-900 mt-2">
              {String(myTemplatesCount ?? 0).padStart(2, '0')}
            </p>
            <p className="text-xs text-slate-500 mt-3">
              {user ? 'Templates you created and saved.' : 'Log in to track your templates.'}
            </p>
          </div>

        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left: Categories + Templates */}
          <div className="xl:col-span-3">
            <div className="bg-white border border-slate-200 rounded-3xl p-5">
              <h3 className="text-sm font-semibold text-slate-700">Categories</h3>
              <div className="mt-4 space-y-2">
                {(['All', 'Agreements', 'NDA', 'SOW'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setActiveCategory(c)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition ${
                      activeCategory === c
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{c}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded-lg ${
                        activeCategory === c ? 'bg-white/20' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {(categories as any)[c] ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 tracking-widest">TEMPLATES</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOnlyMine((v) => !v)}
                    disabled={!user}
                    className={`inline-flex items-center gap-2 text-sm font-semibold rounded-full px-3 py-1 border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      showOnlyMine
                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title={user ? 'Show only templates you created' : 'Log in to filter your templates'}
                  >
                    My
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!user) {
                        setError('Please log in to create templates.');
                        return;
                      }
                      setCreateOpen(true);
                    }}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700"
                  >
                    <Plus className="w-4 h-4" />
                    New
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {loading ? (
                  <div className="text-slate-500 text-sm py-8 text-center">Loading templates…</div>
                ) : error ? (
                  <div className="text-red-600 text-sm py-8 text-center">{error}</div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="text-slate-500 text-sm py-8 text-center">No templates found</div>
                ) : (
                  <>
                    <div className="text-[11px] text-slate-500">
                      Showing {listTemplates.length} of {filteredTemplates.length}
                    </div>
                    <div className="max-h-[55vh] xl:max-h-[560px] overflow-auto pr-1 space-y-3">
                      {listTemplates.map((t) => {
                        const pill = statusPill(t.status);
                        const active = selectedTemplate?.id === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTemplate(t)}
                            className={`w-full text-left rounded-2xl border p-4 transition ${
                              active ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center">
                                {(t.contract_type || '').toLowerCase().includes('nda') ? (
                                  <Shield className="w-5 h-5 text-slate-700" />
                                ) : (
                                  <FileText className="w-5 h-5 text-slate-700" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                                <p className="text-xs text-slate-500 mt-1 truncate">{t.description || 'Template'}</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <span className={`text-[10px] px-2 py-1 rounded-full border ${pill.cls}`}>{pill.label}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {filteredTemplates.length > LIST_LIMIT && (
                      <button
                        type="button"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                        onClick={() => setShowAllList((v) => !v)}
                      >
                        {showAllList ? 'Show fewer templates' : `Show all templates (${filteredTemplates.length})`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          

          {/* Right: Preview */}
          <div className="xl:col-span-9">
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="text-xs font-semibold text-slate-600 w-12 text-center">{zoom}%</div>
                  <button className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center" onClick={() => setZoom((z) => Math.min(150, z + 10))}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={deleteSelectedTemplate}
                    disabled={!selectedTemplate || !canDeleteTemplate(selectedTemplate)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-700 border border-slate-200 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                    title={canDeleteTemplate(selectedTemplate) ? 'Delete this template' : 'Only templates you created can be deleted'}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>

                <div className="relative flex items-center gap-2" data-download-menu>
                  <button
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => setDownloadOpen((v) => !v)}
                    disabled={!selectedTemplate || !rawTemplateDoc || templateDocLoading}
                    type="button"
                  >
                    <Download className="w-4 h-4" />
                    Download
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {downloadOpen && (
                    <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 flex items-center gap-2"
                        onClick={async () => {
                          setDownloadOpen(false);
                          await downloadTemplatePdf();
                        }}
                      >
                        <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                          <Download className="w-4 h-4 text-slate-700" />
                        </span>
                        Download as PDF
                      </button>
                      <button
                        type="button"
                        className="w-full px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 flex items-center gap-2"
                        onClick={() => {
                          setDownloadOpen(false);
                          downloadTemplateTxt();
                        }}
                      >
                        <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                          <Download className="w-4 h-4 text-slate-700" />
                        </span>
                        Download as .txt
                      </button>
                    </div>
                  )}
                </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 origin-top" style={{ transform: `scale(${zoom / 100})` }}>
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-slate-900" />
                    <div className="text-xs text-slate-400">DOC-LOCAL-{selectedTemplate?.id?.slice(0, 6) || '000001'}</div>
                  </div>

                  <div className="mt-6 text-center">
                    <h3 className="text-xl font-black tracking-wide text-slate-900 uppercase">
                      {selectedTemplate?.name || 'TEMPLATE'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2">Exact .txt content</p>
                  </div>

                  <div className="mt-6">
                    {templateDocLoading ? (
                      <div className="text-sm text-slate-500">Loading preview…</div>
                    ) : rawTemplateDoc ? (
                      <div>
                        <pre className="whitespace-pre-wrap text-[11px] leading-6 text-slate-800 font-serif max-h-[520px] overflow-auto">
                          {rawTemplateDoc}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">No preview available for this template type.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !createBusy && setCreateOpen(false)} />
          <div className="relative w-[92vw] max-w-lg rounded-3xl bg-white border border-slate-200 p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">New Template</h3>
              <button className="text-slate-500 hover:text-slate-800" onClick={() => !createBusy && setCreateOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-slate-700">Name</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                  placeholder="e.g. Standard MSA"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Type</label>
                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                    className="w-full bg-transparent outline-none text-sm text-slate-900"
                  >
                    <option value="NDA">NDA</option>
                    <option value="MSA">MSA</option>
                    <option value="EMPLOYMENT">Employment</option>
                    <option value="AGENCY_AGREEMENT">Agency Agreement</option>
                    <option value="PROPERTY_MANAGEMENT">Property Management</option>
                    <option value="SERVICE_AGREEMENT">Service Agreement</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Description</label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  className="mt-2 w-full min-h-[96px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200"
                  placeholder="Short summary (optional)"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700">Template Text</label>
                <textarea
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  className="mt-2 w-full min-h-[180px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-200 font-mono"
                  placeholder="Paste the exact template text (.txt) you want to display"
                />
                <p className="text-xs text-slate-500 mt-2">Saved to your template library.</p>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                onClick={() => setCreateOpen(false)}
                disabled={createBusy}
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-2xl bg-[#0F141F] px-4 py-3 text-sm font-semibold text-white"
                onClick={createTemplate}
                disabled={createBusy}
              >
                {createBusy ? 'Creating…' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default TemplateLibrary;
