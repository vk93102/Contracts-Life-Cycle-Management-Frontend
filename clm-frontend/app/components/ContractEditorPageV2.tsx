'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from './DashboardLayout';
import RichTextEditor from './RichTextEditor';
import { ApiClient, Contract } from '@/app/lib/api-client';
import { sanitizeEditorHtml } from '@/app/lib/sanitize-html';

type TemplateListItem = {
  filename: string;
  name: string;
  description?: string;
  mine?: boolean;
};

type SignerDraft = {
  email: string;
  name: string;
};

type GenerationContext = {
  contractId: string;
  template: string;
  fieldValues: Record<string, string>;
  selectedClauseIds: string[];
  customClauses: Array<{ title?: string; content: string }>;
  constraints: Array<{ name: string; value: string }>;
  updatedAt: number;
  createdAt: number;
};

const ContractEditorPageV2: React.FC = () => {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const contractId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);

  // Templates
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateInsertMode, setTemplateInsertMode] = useState<'replace' | 'cursor'>('replace');
  const [templateApplying, setTemplateApplying] = useState(false);

  const editorApiRef = useRef<Editor | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [editorInitialized, setEditorInitialized] = useState(false);
  const [editorHtml, setEditorHtml] = useState('');
  const [editorText, setEditorText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editTick, setEditTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Autosave ordering controls: prevent out-of-order responses from overwriting newer content.
  const lastLocalEditMsRef = useRef<number>(0);
  const saveSeqRef = useRef<number>(0);
  const saveAbortRef = useRef<AbortController | null>(null);

  // Local snapshot: protects against API hiccups and gives "real-time" persistence.
  const snapshotTimerRef = useRef<number | null>(null);
  const snapshotKey = useMemo(
    () => (contractId ? `clm:contractEditor:snapshot:v2:${contractId}` : null),
    [contractId]
  );

  // E-sign
  const [signOpen, setSignOpen] = useState(false);
  const [signers, setSigners] = useState<SignerDraft[]>([{ email: '', name: '' }]);
  const [signProvider, setSignProvider] = useState<'firma' | 'signnow'>('firma');
  const [signingOrder, setSigningOrder] = useState<'sequential' | 'parallel'>('sequential');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [signStatusLoading, setSignStatusLoading] = useState(false);
  const [signStatus, setSignStatus] = useState<any | null>(null);

  const [generationCtx, setGenerationCtx] = useState<GenerationContext | null>(null);
  const [rehydrating, setRehydrating] = useState(false);
  const rehydratedOnceRef = useRef(false);

  const unwrapContractLike = (raw: any) => {
    // Some backend endpoints return { contract: {...} } or { data: {...} }.
    // Be defensive so we don't accidentally set wrapper objects as the contract.
    return raw?.contract ?? raw?.data?.contract ?? raw?.data ?? raw;
  };

  const writeLocalSnapshot = (payload: { html: string; text: string; client_updated_at_ms: number }) => {
    if (typeof window === 'undefined') return;
    if (!snapshotKey) return;
    try {
      localStorage.setItem(
        snapshotKey,
        JSON.stringify({
          html: payload.html,
          text: payload.text,
          client_updated_at_ms: payload.client_updated_at_ms,
          saved_at_ms: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  };

  const readLocalSnapshot = (): { html: string; text: string; client_updated_at_ms: number } | null => {
    if (typeof window === 'undefined') return null;
    if (!snapshotKey) return null;
    try {
      const raw = localStorage.getItem(snapshotKey);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      const html = typeof (obj as any).html === 'string' ? (obj as any).html : '';
      const text = typeof (obj as any).text === 'string' ? (obj as any).text : '';
      const ms = Number((obj as any).client_updated_at_ms || 0);
      if (!ms || ms < 0) return null;
      return { html, text, client_updated_at_ms: ms };
    } catch {
      return null;
    }
  };

  // Persist Add Template panel UI state across reload/logout.
  useEffect(() => {
    if (!contractId) return;
    if (typeof window === 'undefined') return;
    const key = `clm:contractEditor:addTemplate:v1:${contractId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        const search = typeof (obj as any).templateSearch === 'string' ? (obj as any).templateSearch : '';
        const mode = (obj as any).templateInsertMode === 'cursor' ? 'cursor' : 'replace';
        setTemplateSearch(search);
        setTemplateInsertMode(mode);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  useEffect(() => {
    if (!contractId) return;
    if (typeof window === 'undefined') return;
    const key = `clm:contractEditor:addTemplate:v1:${contractId}`;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          templateSearch,
          templateInsertMode,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  }, [contractId, templateSearch, templateInsertMode]);

  const escapeHtml = (s: string) =>
    (s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const normalizeMetadata = (value: unknown) => {
    let md: any = value;
    if (typeof md === 'string') {
      try {
        md = JSON.parse(md);
      } catch {
        md = {};
      }
    }
    return md && typeof md === 'object' ? md : {};
  };

  const isMeaningfullyEmptyHtml = (html: unknown) => {
    const raw = String(html || '').trim();
    if (!raw) return true;
    // Common TipTap/ProseMirror empty-doc forms.
    const normalized = raw
      .replace(/\s+/g, '')
      .replace(/&nbsp;/g, '')
      .toLowerCase();
    const empties = new Set([
      '<p></p>',
      '<p><br></p>',
      '<p><br/></p>',
      '<p><br/></p><p><br/></p>',
      '<p></p><p></p>',
    ]);
    if (empties.has(normalized)) return true;
    // If it only contains tags and no text, treat it as empty.
    const textOnly = normalized.replace(/<[^>]*>/g, '');
    return textOnly.length === 0;
  };

  const textToHtml = (text: string) => {
    const safe = escapeHtml(text || '');
    // Preserve newlines. Split on double newlines into paragraphs.
    const paras = safe
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, '<br/>'))
      .filter((p) => p.trim().length > 0);

    return paras.length ? paras.map((p) => `<p>${p}</p>`).join('') : '<p></p>';
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!contractId) return;
      try {
        setLoading(true);
        setError(null);
        const client = new ApiClient();
        const res = await client.getContractById(contractId);
        if (!alive) return;

        if (res.success) {
          const raw: any = res.data as any;
          const unwrapped: any = unwrapContractLike(raw);
          setContract(unwrapped as any);

          // Initialize editor state BEFORE rendering the editor to avoid a mount-with-empty flash.
          const c = unwrapped as any;
          const md = normalizeMetadata(c?.metadata);
          const backendClientMs = Number(md?.editor_client_updated_at_ms || 0) || 0;

          const renderedHtml: string | undefined = c?.rendered_html || md?.rendered_html;
          const renderedText: string =
            c?.rendered_text ||
            md?.rendered_text ||
            c?.raw_text ||
            md?.raw_text ||
            '';

          const backendHtml = renderedHtml && String(renderedHtml).trim().length > 0 ? String(renderedHtml) : '';
          const backendText = String(renderedText || '');

          const snap = readLocalSnapshot();
          const snapIsNewer = !!snap && snap.client_updated_at_ms > backendClientMs;
          const snapHasContent = !!snap && (!isMeaningfullyEmptyHtml(snap.html) || String(snap.text || '').trim().length > 0);

          const chosenHtml = snapIsNewer && snapHasContent ? snap!.html : backendHtml;
          const chosenText = snapIsNewer && snapHasContent ? snap!.text : backendText;

          const initialHtml = !isMeaningfullyEmptyHtml(chosenHtml)
            ? String(chosenHtml)
            : textToHtml(String(chosenText || ''));

          setEditorHtml(initialHtml || '');
          setEditorText(String(chosenText || ''));
          setDirty(false);
          setSaveError(null);
          setEditorInitialized(true);
        } else {
          setError(res.error || 'Failed to load contract');
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load contract');
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [contractId]);

  useEffect(() => {
    if (!contractId) return;
    try {
      const raw = localStorage.getItem(`clm:contractGenerationContext:v1:${contractId}`);
      if (!raw) {
        setGenerationCtx(null);
        return;
      }
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') {
        setGenerationCtx(null);
        return;
      }
      setGenerationCtx({
        contractId: String((obj as any).contractId || contractId),
        template: String((obj as any).template || ''),
        fieldValues: ((obj as any).fieldValues || {}) as Record<string, string>,
        selectedClauseIds: (Array.isArray((obj as any).selectedClauseIds) ? (obj as any).selectedClauseIds : []) as string[],
        customClauses: (Array.isArray((obj as any).customClauses) ? (obj as any).customClauses : []) as any,
        constraints: (Array.isArray((obj as any).constraints) ? (obj as any).constraints : []) as any,
        updatedAt: Number((obj as any).updatedAt || 0),
        createdAt: Number((obj as any).createdAt || 0),
      });
    } catch {
      setGenerationCtx(null);
    }
  }, [contractId]);

  // Fallback initialization path: only run if the editor wasn't initialized during load().
  useEffect(() => {
    if (editorInitialized) return;
    if (!contractId) return;
    if (!contract) return;
    const c = contract as any;
    const md = normalizeMetadata(c?.metadata);

    const renderedHtml: string | undefined = c?.rendered_html || md?.rendered_html;
    const renderedText: string = c?.rendered_text || md?.rendered_text || c?.raw_text || md?.raw_text || '';
    const initialHtml = renderedHtml && String(renderedHtml).trim().length > 0 ? String(renderedHtml) : textToHtml(renderedText);

    setEditorHtml(initialHtml || '');
    setEditorText(String(renderedText || ''));
    setDirty(false);
    setSaveError(null);
    setEditorInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorInitialized, contractId, (contract as any)?.id]);

  // If a contract was created from a filesystem template but has empty content, rehydrate content from template + stored inputs.
  useEffect(() => {
    if (!contractId) return;
    if (loading) return;
    if (!contract) return;
    if (rehydratedOnceRef.current) return;

    const c: any = contract as any;
    const md = normalizeMetadata(c?.metadata);

    const existingHtmlRaw = c?.rendered_html || md?.rendered_html || '';
    const existingText = String(c?.rendered_text || md?.rendered_text || c?.raw_text || md?.raw_text || '').trim();
    if (!isMeaningfullyEmptyHtml(existingHtmlRaw) || !!existingText) {
      rehydratedOnceRef.current = true;
      return;
    }

    const templateFilename = String(
      md?.template_filename ||
        md?.template ||
        c?.template_filename ||
        // Fallback to generator context (localStorage)
        generationCtx?.template ||
        ''
    ).trim();
    if (!templateFilename) return;

    const structuredInputs =
      (c?.form_inputs && typeof c.form_inputs === 'object'
        ? c.form_inputs
        : md?.form_inputs && typeof md.form_inputs === 'object'
          ? md.form_inputs
          : generationCtx?.fieldValues || {}) || {};
    const clauseList: any[] = Array.isArray(c?.clauses) ? c.clauses : [];

    const selectedClausesFromContract: string[] = clauseList
      .filter((x) => x && x.kind === 'library' && typeof x.clause_id === 'string')
      .map((x) => String(x.clause_id));
    const constraintsFromContract: Array<{ name: string; value: string }> = clauseList
      .filter((x) => x && x.kind === 'constraint')
      .map((x) => ({ name: String(x.name || ''), value: String(x.value || '') }))
      .filter((x) => x.name.trim() && x.value.trim());
    const customClausesFromContract: Array<{ title?: string; content: string }> = clauseList
      .filter((x) => x && x.kind === 'custom')
      .map((x) => ({ title: String(x.title || 'Custom Clause'), content: String(x.content || '') }))
      .filter((x) => x.content.trim());

    const selectedClauses = Array.from(
      new Set([
        ...selectedClausesFromContract,
        ...(Array.isArray(generationCtx?.selectedClauseIds) ? generationCtx!.selectedClauseIds.map(String) : []),
      ])
    );
    const constraints = (constraintsFromContract.length
      ? constraintsFromContract
      : Array.isArray(generationCtx?.constraints)
        ? generationCtx!.constraints
        : []) as Array<{ name: string; value: string }>;
    const customClauses = (customClausesFromContract.length
      ? customClausesFromContract
      : Array.isArray(generationCtx?.customClauses)
        ? generationCtx!.customClauses
        : []) as Array<{ title?: string; content: string }>;

    (async () => {
      try {
        setRehydrating(true);
        const client = new ApiClient();
        const res = await client.previewContractFromFile({
          filename: templateFilename,
          structuredInputs,
          selectedClauses,
          customClauses,
          constraints,
        });
        if (!res.success) return;
        const nextText = String((res.data as any)?.rendered_text || '').trim();
        if (!nextText) return;

        const nextHtml = textToHtml(nextText);
        editorApiRef.current?.commands.setContent(nextHtml, { emitUpdate: false });
        setEditorHtml(nextHtml);
        setEditorText(nextText);
        setDirty(true);
        setEditTick((t) => t + 1);
        await saveNow();
        rehydratedOnceRef.current = true;
      } catch {
        // ignore
      } finally {
        setRehydrating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, loading, (contract as any)?.id, generationCtx?.template]);

  useEffect(() => {
    let alive = true;
    async function loadTemplates() {
      try {
        setTemplatesLoading(true);
        setTemplatesError(null);
        const client = new ApiClient();

        const [mineRes, publicRes] = await Promise.all([
          client.listMyTemplateFiles(),
          client.listTemplateFiles(),
        ]);
        if (!alive) return;

        const mine = (mineRes.success ? (mineRes.data as any)?.results : []) || [];
        const pub = (publicRes.success ? (publicRes.data as any)?.results : []) || [];

        const merged: TemplateListItem[] = [];
        const seen = new Set<string>();

        for (const x of mine) {
          const filename = String(x?.filename || '').trim();
          if (!filename || seen.has(filename)) continue;
          seen.add(filename);
          merged.push({
            filename,
            name: String(x?.name || x?.filename || 'Untitled'),
            description: x?.description ? String(x.description) : undefined,
            mine: true,
          });
        }

        for (const x of pub) {
          const filename = String(x?.filename || '').trim();
          if (!filename || seen.has(filename)) continue;
          seen.add(filename);
          merged.push({
            filename,
            name: String(x?.name || x?.filename || 'Untitled'),
            description: x?.description ? String(x.description) : undefined,
            mine: false,
          });
        }

        setTemplates(merged);
      } catch (e) {
        if (!alive) return;
        setTemplatesError(e instanceof Error ? e.message : 'Failed to load templates');
      } finally {
        if (alive) setTemplatesLoading(false);
      }
    }

    loadTemplates();
    return () => {
      alive = false;
    };
  }, []);

  const title = (contract as any)?.title || (contract as any)?.name || 'Contract';
  const updatedAt = (contract as any)?.updated_at ? new Date((contract as any).updated_at).toLocaleString() : null;

  const saveNow = async () => {
    if (!contractId) return;
    const rawHtml = editorApiRef.current?.getHTML() ?? editorHtml;
    const rawText = editorApiRef.current?.getText() ?? editorText;

    const html = sanitizeEditorHtml(rawHtml);
    const text = String(rawText || '');

    // Prevent accidental wipes (e.g. editor briefly initializes empty and autosave fires).
    if (isMeaningfullyEmptyHtml(html) && text.trim().length === 0) {
      setSaveError('Refusing to auto-save empty content. Type something or refresh if this was unexpected.');
      return;
    }

    // Snapshot a monotonic timestamp for this content.
    const clientUpdatedAtMs = Math.max(Date.now(), lastLocalEditMsRef.current || 0);
    const seq = ++saveSeqRef.current;

    // Abort any older in-flight save. (Even if the request reached the server,
    // the backend also rejects stale client_updated_at_ms writes.)
    try {
      saveAbortRef.current?.abort();
    } catch {
      // ignore
    }
    const controller = new AbortController();
    saveAbortRef.current = controller;

    try {
      setSaving(true);
      setSaveError(null);
      const client = new ApiClient();
      const res = await client.updateContractContent(contractId, {
        rendered_html: html,
        rendered_text: text,
        client_updated_at_ms: clientUpdatedAtMs,
      }, {
        signal: controller.signal,
      });

      // Ignore any response from an older save attempt.
      if (seq !== saveSeqRef.current) return;

      if (res.success) {
        const next = unwrapContractLike(res.data as any);
        setContract(next as any);

        // Update local snapshot as a durable client-side fallback.
        writeLocalSnapshot({ html, text, client_updated_at_ms: clientUpdatedAtMs });

        // Let other pages (e.g. contracts list) refresh instantly.
        try {
          window.dispatchEvent(
            new CustomEvent('contracts:changed', {
              detail: { id: contractId, updated_at: (next as any)?.updated_at || null },
            })
          );
        } catch {
          // ignore
        }
        // Only clear dirty if nothing newer has been typed since this save snapshot.
        if ((lastLocalEditMsRef.current || 0) <= clientUpdatedAtMs) {
          setDirty(false);
        }
      } else {
        setSaveError(res.error || 'Failed to save');
      }
    } catch (e) {
      // AbortError is expected when typing quickly; don't surface as an error.
      const msg = e instanceof Error ? e.message : 'Failed to save';
      if (!String(msg).toLowerCase().includes('abort')) {
        setSaveError(msg);
      }
    } finally {
      // Only clear saving state if this is the latest save.
      if (seq === saveSeqRef.current) setSaving(false);
    }
  };

  const saveIfDirty = async () => {
    if (!dirty) return;
    // Fire-and-forget is OK; saveNow handles aborting older saves.
    await saveNow();
  };

  // Flush changes when tab is backgrounded (user refreshes/closes/navigates).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') {
        void saveIfDirty();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, contractId]);

  // Auto-save with a small debounce.
  useEffect(() => {
    if (!editorReady) return;
    if (!dirty) return;
    if (!editorInitialized) return;
    const t = window.setTimeout(() => {
      saveNow();
    }, 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTick, dirty, editorReady, contractId]);

  const applyTemplateToEditor = async (filename: string) => {
    const ed = editorApiRef.current;
    if (!ed) return;
    try {
      setTemplateApplying(true);
      setTemplatesError(null);
      const client = new ApiClient();
      const res = await client.getTemplateFileContent(filename);
      if (!res.success) {
        setTemplatesError(res.error || 'Failed to load template content');
        return;
      }

      const content = String((res.data as any)?.content || '');
      const nextHtml = textToHtml(content);

      if (templateInsertMode === 'replace') {
        ed.commands.setContent(nextHtml, { emitUpdate: false });
        setEditorHtml(nextHtml);
        setEditorText(content);
      } else {
        ed.chain().focus().insertContent(nextHtml).run();
        setEditorHtml(ed.getHTML());
        setEditorText(ed.getText());
      }

      setDirty(true);
      setEditTick((t) => t + 1);
      await saveNow();
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : 'Failed to apply template');
    } finally {
      setTemplateApplying(false);
    }
  };


  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollStartedAtRef = useRef<number>(0);
  const pollDelayRef = useRef<number>(2000);

  const [liveStatus, setLiveStatus] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  const stopLiveStatus = () => {
    try {
      pollAbortRef.current?.abort();
    } catch {
      // ignore
    }
    pollAbortRef.current = null;
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
    setLiveStatus(false);
  };

  const openSignNow = () => {
    setSignError(null);
    setSigningUrl(null);
    setSignStatus(null);
    setPollError(null);
    setLiveStatus(false);
    setSignOpen(true);
  };

  useEffect(() => {
    if (!signOpen) {
      stopLiveStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signOpen]);

  const validateSigningUrl = (url: string) => {
    const u = (url || '').trim();
    if (!u) return 'Signing URL is missing';
    // Production safety: reject localhost/mock links.
    const lower = u.toLowerCase();
    if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('/firma/mock')) {
      return 'Firma returned a localhost/mock signing link. Disable FIRMA_MOCK and configure real FIRMA_BASE_URL + FIRMA_API on the backend.';
    }
    // Enforce absolute URL.
    if (!/^https?:\/\//i.test(u)) {
      return 'Signing URL is invalid (expected absolute URL).';
    }
    return null;
  };

  const refreshSigningStatus = async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
    if (!contractId) return;
    try {
      if (!opts?.silent) setSignStatusLoading(true);
      setSignError(null);
      if (!opts?.silent) setPollError(null);
      const client = new ApiClient();
      const res =
        signProvider === 'firma'
          ? await client.firmaStatus(contractId, { signal: opts?.signal })
          : await client.esignStatus(contractId);
      if (!res.success) {
        const msg = res.error || 'Failed to fetch status';
        if (!opts?.silent) setSignError(msg);
        setPollError(msg);
        return;
      }
      setSignStatus(res.data as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch status';
      if (!opts?.silent) setSignError(msg);
      setPollError(msg);
    } finally {
      if (!opts?.silent) setSignStatusLoading(false);
    }
  };

  const startLiveStatus = () => {
    if (!contractId) return;
    if (polling) return;
    setLiveStatus(true);
    setPolling(true);
    setPollError(null);
    pollStartedAtRef.current = Date.now();
    pollDelayRef.current = 2000;

    const tick = async () => {
      if (!contractId) return;
      if (!signOpen) return;

      // stop after 10 minutes
      if (Date.now() - pollStartedAtRef.current > 10 * 60 * 1000) {
        setPollError('Live status stopped (timeout). Click “Check status” to refresh.');
        setPolling(false);
        return;
      }

      const controller = new AbortController();
      pollAbortRef.current = controller;

      await refreshSigningStatus({ silent: true, signal: controller.signal });

      const statusVal = String((signStatus as any)?.status || '').toLowerCase();
      const allSigned = Boolean((signStatus as any)?.all_signed);
      const completed = statusVal === 'completed' || statusVal === 'executed';

      if (completed && (allSigned || (signProvider !== 'firma' && completed))) {
        setPolling(false);
        return;
      }

      // backoff up to 10s
      pollDelayRef.current = Math.min(10000, Math.floor(pollDelayRef.current * 1.25));
      pollTimerRef.current = window.setTimeout(tick, pollDelayRef.current);
    };

    // immediate first poll
    void tick();
  };

  const startSigning = async () => {
    if (!contractId) return;
    const cleaned = signers
      .map((s) => ({ email: s.email.trim(), name: s.name.trim() }))
      .filter((s) => s.email && s.name);
    if (cleaned.length === 0) {
      setSignError('Add at least one signer (name + email)');
      return;
    }
    try {
      setSigning(true);
      setSignError(null);
      setPollError(null);
      const client = new ApiClient();
      const res =
        signProvider === 'firma'
          ? await client.firmaStart({
              contract_id: contractId,
              signers: cleaned,
              signing_order: signingOrder,
            })
          : await client.esignStart({
              contract_id: contractId,
              signers: cleaned,
              signing_order: signingOrder,
            });
      if (!res.success) {
        setSignError(res.error || 'Failed to start signing');
        return;
      }

      const url = String((res.data as any)?.signing_url || '');
      const urlErr = validateSigningUrl(url);
      if (urlErr) {
        setSignError(urlErr);
        setSigningUrl(null);
        return;
      }

      setSigningUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Start live polling immediately after launching signing.
      startLiveStatus();
    } catch (e) {
      setSignError(e instanceof Error ? e.message : 'Failed to start signing');
    } finally {
      setSigning(false);
    }
  };

  const downloadExecuted = async () => {
    if (!contractId) return;
    const statusVal = String((signStatus as any)?.status || '').toLowerCase();
    const allSigned = Boolean((signStatus as any)?.all_signed);
    const completed = statusVal === 'completed' || statusVal === 'executed';
    if (!completed || (signProvider === 'firma' && !allSigned)) {
      setSignError('Signing is not completed yet.');
      return;
    }
    const client = new ApiClient();
    const res = signProvider === 'firma' ? await client.firmaDownloadExecutedPdf(contractId) : await client.esignDownloadExecutedPdf(contractId);
    if (res.success && res.data) {
      triggerDownload(res.data, `${title.replace(/\s+/g, '_')}_signed.pdf`);
    } else {
      setSignError(res.error || 'Failed to download signed PDF');
    }
  };

  const downloadPdf = async () => {
    if (!contractId) return;
    const client = new ApiClient();
    const res = await client.downloadContractPdf(contractId);
    if (res.success && res.data) {
      triggerDownload(res.data, `${title.replace(/\s+/g, '_')}.pdf`);
    } else {
      setError(res.error || 'Failed to download PDF');
    }
  };

  const downloadTxt = async () => {
    if (!contractId) return;
    const client = new ApiClient();
    const res = await client.downloadContractTxt(contractId);
    if (res.success && res.data) {
      triggerDownload(res.data, `${title.replace(/\s+/g, '_')}.txt`);
    } else {
      setError(res.error || 'Failed to download TXT');
    }
  };

  const deleteContract = async () => {
    if (!contractId) return;
    const ok = window.confirm('Delete this contract? This cannot be undone.');
    if (!ok) return;
    try {
      setSaving(true);
      setSaveError(null);
      const client = new ApiClient();
      const res = await client.deleteContract(contractId);
      if (!res.success) {
        setSaveError(res.error || 'Failed to delete contract');
        return;
      }
      router.push('/contracts');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to delete contract');
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      const hay = `${t.filename} ${t.name} ${t.description || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [templates, templateSearch]);

  return (
    <DashboardLayout>
      <div className="bg-[#F2F0EB]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={async () => {
                try {
                  await saveIfDirty();
                } finally {
                  router.back();
                }
              }}
              className="w-10 h-10 rounded-full bg-white border border-black/10 shadow-sm grid place-items-center text-black/45 hover:text-black"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-[#111827] truncate">{title}</h1>
                {updatedAt && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-black/45 font-medium">
                      {saving ? 'Saving…' : dirty ? 'Unsaved changes' : `Updated ${updatedAt}`}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-black/40 mt-1 truncate">Contract ID: {String(contractId || '')}</p>
              {saveError && <p className="text-xs text-rose-600 mt-1">{saveError}</p>}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl">
            {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Editor */}
          <section className="col-span-12 lg:col-span-8 bg-white rounded-[28px] border border-black/5 shadow-sm overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-black/5 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#111827]">Editor</div>
              <div className="flex items-center gap-2 relative">
                <button
                  onClick={openSignNow}
                  className="h-10 px-4 rounded-full bg-white border border-black/10 text-[#0F141F] text-sm font-semibold hover:bg-black/5"
                  type="button"
                >
                  Sign Now
                </button>
                <button
                  onClick={downloadPdf}
                  className="h-10 px-4 rounded-full bg-[#0F141F] text-white text-sm font-semibold"
                  type="button"
                >
                  Download
                </button>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="w-10 h-10 rounded-full hover:bg-black/5 text-black/45"
                  aria-label="More"
                  type="button"
                >
                  <svg className="w-6 h-6 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                </button>

                {moreOpen && (
                  <div className="absolute right-0 top-12 w-48 bg-white rounded-2xl border border-black/10 shadow-lg overflow-hidden z-20">
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        downloadPdf();
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-black/5"
                      type="button"
                    >
                      Download PDF
                    </button>
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        downloadTxt();
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-black/5"
                      type="button"
                    >
                      Download TXT
                    </button>
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        saveNow();
                      }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-black/5"
                      type="button"
                    >
                      Save now
                    </button>
                    <div className="h-px bg-black/5" />
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        deleteContract();
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
                      type="button"
                    >
                      Delete contract
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {loading ? (
                <div className="text-sm text-black/45">Loading contract…</div>
              ) : !contract ? (
                <div className="text-sm text-black/45">No contract found.</div>
              ) : rehydrating ? (
                <div className="text-sm text-black/45">Restoring template content…</div>
              ) : (
                <RichTextEditor
                  valueHtml={editorHtml}
                  disabled={false}
                  onEditorReady={(ed) => {
                    editorApiRef.current = ed;
                    setEditorReady(!!ed);
                  }}
                  onChange={(html, text) => {
                    setEditorHtml(html);
                    setEditorText(text);
                    const now = Date.now();
                    lastLocalEditMsRef.current = now;
                    setDirty(true);
                    setEditTick((t) => t + 1);

                    // Throttled local snapshot write.
                    if (snapshotTimerRef.current) {
                      window.clearTimeout(snapshotTimerRef.current);
                    }
                    snapshotTimerRef.current = window.setTimeout(() => {
                      writeLocalSnapshot({ html, text, client_updated_at_ms: now });
                    }, 250);
                  }}
                  editorClassName="min-h-[60vh] rounded-2xl border border-black/10 bg-white px-5 py-4 text-[13px] leading-6 text-slate-900 font-serif outline-none"
                />
              )}
            </div>
          </section>

          {/* Right Panel */}
          <aside className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[28px] border border-black/5 shadow-sm overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-black/5">
                <p className="text-sm font-semibold text-[#111827]">Add Template</p>
                <p className="text-xs text-black/45 mt-1">Insert a template into the editor, then edit manually.</p>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 bg-[#F6F3ED] rounded-full px-4 py-2">
                  <svg className="w-4 h-4 text-black/35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    className="bg-transparent outline-none text-sm w-full"
                    placeholder="Search templates…"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-black/45 font-semibold">Insert mode</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTemplateInsertMode('replace')}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                        templateInsertMode === 'replace'
                          ? 'bg-[#0F141F] text-white border-[#0F141F]'
                          : 'bg-white text-black/70 border-black/10 hover:bg-black/5'
                      }`}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateInsertMode('cursor')}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                        templateInsertMode === 'cursor'
                          ? 'bg-[#0F141F] text-white border-[#0F141F]'
                          : 'bg-white text-black/70 border-black/10 hover:bg-black/5'
                      }`}
                    >
                      At cursor
                    </button>
                  </div>
                </div>

                {templatesError && <div className="text-xs text-rose-600 mt-3">{templatesError}</div>}

                <div className="mt-4 space-y-3 max-h-[38vh] overflow-y-auto pr-1">
                  {templatesLoading ? (
                    <div className="text-sm text-black/45">Loading templates…</div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="text-sm text-black/45">No templates found.</div>
                  ) : (
                    filteredTemplates.map((t) => (
                      <div key={t.filename} className="rounded-2xl border border-black/5 bg-[#F6F3ED] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#111827] truncate">{t.name}</p>
                            <p className="text-[11px] text-black/45 mt-1 truncate">{t.filename}</p>
                            {t.mine ? <p className="text-[10px] mt-1 font-bold tracking-wider text-[#FF5C7A]">MY TEMPLATE</p> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => applyTemplateToEditor(t.filename)}
                            disabled={templateApplying}
                            className="h-9 px-3 rounded-full bg-white border border-black/10 text-sm font-semibold text-[#0F141F] hover:bg-black/5 disabled:opacity-60"
                          >
                            Add
                          </button>
                        </div>
                        {t.description ? <p className="text-xs text-black/45 mt-2 line-clamp-2">{t.description}</p> : null}
                      </div>
                    ))
                  )}
                </div>

              </div>
            </div>
          </aside>
        </div>

        {signOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-xl bg-white rounded-[28px] border border-black/10 shadow-2xl overflow-hidden">
              <div className="px-6 pt-6 pb-4 border-b border-black/5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-[#111827]">Sign Now</p>
                  <p className="text-xs text-black/45 mt-1">Invite signers and open the signing link.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSignOpen(false)}
                  className="w-10 h-10 rounded-full hover:bg-black/5 text-black/45"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#111827]">Signers</div>
                  <button
                    type="button"
                    onClick={() => setSigners((prev) => [...prev, { email: '', name: '' }])}
                    className="h-9 px-3 rounded-full bg-white border border-black/10 text-sm font-semibold text-[#0F141F] hover:bg-black/5"
                  >
                    + Add signer
                  </button>
                </div>

                <div className="space-y-3">
                  {signers.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        className="col-span-5 h-10 rounded-2xl bg-white border border-black/10 px-4 text-sm outline-none"
                        placeholder="Name"
                        value={s.name}
                        onChange={(e) =>
                          setSigners((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                        }
                      />
                      <input
                        className="col-span-6 h-10 rounded-2xl bg-white border border-black/10 px-4 text-sm outline-none"
                        placeholder="Email"
                        value={s.email}
                        onChange={(e) =>
                          setSigners((prev) => prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setSigners((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={signers.length <= 1}
                        className="col-span-1 w-10 h-10 rounded-full hover:bg-rose-50 text-rose-600 disabled:opacity-40"
                        aria-label="Remove signer"
                      >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m2 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-[#111827]">Signing order</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSignProvider('firma')}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                        signProvider === 'firma'
                          ? 'bg-[#0F141F] text-white border-[#0F141F]'
                          : 'bg-white text-black/70 border-black/10 hover:bg-black/5'
                      }`}
                    >
                      Firma
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignProvider('signnow')}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                        signProvider === 'signnow'
                          ? 'bg-[#0F141F] text-white border-[#0F141F]'
                          : 'bg-white text-black/70 border-black/10 hover:bg-black/5'
                      }`}
                    >
                      SignNow
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSigningOrder('sequential')}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                        signingOrder === 'sequential'
                          ? 'bg-[#0F141F] text-white border-[#0F141F]'
                          : 'bg-white text-black/70 border-black/10 hover:bg-black/5'
                      }`}
                    >
                      Sequential
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigningOrder('parallel')}
                      className={`h-8 px-3 rounded-full text-xs font-semibold border ${
                        signingOrder === 'parallel'
                          ? 'bg-[#0F141F] text-white border-[#0F141F]'
                          : 'bg-white text-black/70 border-black/10 hover:bg-black/5'
                      }`}
                    >
                      Parallel
                    </button>
                  </div>
                </div>

                {signError && <div className="text-xs text-rose-600">{signError}</div>}

                {signingUrl ? (
                  <div className="rounded-2xl border border-black/10 bg-[#F6F3ED] p-4">
                    <div className="text-xs text-black/45 font-semibold">Signing link</div>
                    <div className="mt-1 break-all text-sm text-[#111827]">{signingUrl}</div>
                  </div>
                ) : null}

                {signStatus ? (
                  <div className="rounded-2xl border border-black/10 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-black/45 font-semibold">Status</div>
                        <div className="text-sm font-semibold text-[#111827]">{String((signStatus as any)?.status || 'unknown')}</div>
                      </div>
                      <button
                        type="button"
                        onClick={downloadExecuted}
                        disabled={(() => {
                          const statusVal = String((signStatus as any)?.status || '').toLowerCase();
                          const allSigned = Boolean((signStatus as any)?.all_signed);
                          const completed = statusVal === 'completed' || statusVal === 'executed';
                          return !completed || (signProvider === 'firma' && !allSigned);
                        })()}
                        className="h-9 px-3 rounded-full bg-[#0F141F] text-white text-sm font-semibold"
                      >
                        Download signed PDF
                      </button>
                    </div>

                    {(signStatus as any)?.signers?.length ? (
                      <div className="mt-3 space-y-2">
                        {(signStatus as any).signers.map((s: any) => (
                          <div key={String(s.email)} className="flex items-center justify-between text-xs">
                            <div className="text-black/70 truncate">{String(s.name || s.email)}</div>
                            {(() => {
                              const raw = String(s.status || '').trim();
                              const lower = raw.toLowerCase();
                              const signedAt = s.signed_at ? String(s.signed_at) : '';

                              const isDeclined = ['declined', 'rejected', 'canceled', 'cancelled', 'refused'].includes(lower);
                              const isSigned = ['signed', 'completed', 'executed', 'done'].includes(lower) || Boolean(s.has_signed);
                              const isPending = ['sent', 'invited', 'pending', 'in_progress', 'in progress', 'viewed'].includes(lower);

                              const label = raw || (isSigned ? 'signed' : isDeclined ? 'declined' : isPending ? 'pending' : 'unknown');
                              const badgeClass = isDeclined
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : isSigned
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : isPending
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-slate-50 text-slate-700 border-slate-200';

                              return (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${badgeClass}`}>{label}</span>
                                  {signedAt ? <span className="text-[11px] text-black/40">{signedAt}</span> : null}
                                </div>
                              );
                            })()}
                          </div>
                        ))}

                        {(() => {
                          const signersArr = Array.isArray((signStatus as any)?.signers) ? (signStatus as any).signers : [];
                          const anyDeclined = signersArr.some((x: any) => {
                            const s = String(x?.status || '').toLowerCase();
                            return ['declined', 'rejected', 'canceled', 'cancelled', 'refused'].includes(s);
                          });
                          return anyDeclined ? (
                            <div className="mt-2 text-[11px] text-rose-700">
                              One or more signers declined. Start signing again after updating recipients or document.
                            </div>
                          ) : null;
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {pollError ? <div className="text-xs text-amber-700">{pollError}</div> : null}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => refreshSigningStatus()}
                    disabled={signStatusLoading}
                    className="h-10 px-4 rounded-full bg-white border border-black/10 text-black/70 text-sm font-semibold hover:bg-black/5 disabled:opacity-60"
                  >
                    {signStatusLoading ? 'Checking…' : 'Check status'}
                  </button>

                  {liveStatus ? (
                    <button
                      type="button"
                      onClick={stopLiveStatus}
                      className="h-10 px-4 rounded-full bg-white border border-black/10 text-black/70 text-sm font-semibold hover:bg-black/5"
                    >
                      Stop live status
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startLiveStatus}
                      disabled={polling}
                      className="h-10 px-4 rounded-full bg-white border border-black/10 text-black/70 text-sm font-semibold hover:bg-black/5 disabled:opacity-60"
                    >
                      {polling ? 'Starting…' : 'Live status'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={startSigning}
                    disabled={signing}
                    className="h-10 px-4 rounded-full bg-[#FF5C7A] text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {signing ? 'Starting…' : 'Start signing'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ContractEditorPageV2;
