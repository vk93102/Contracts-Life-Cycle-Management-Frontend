'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const contractId = searchParams?.get('id') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);

  // Templates
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
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
        setTemplateSearch(search);
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
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  }, [contractId, templateSearch]);

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
      if (!contractId) {
        setLoading(false);
        setError('Missing contract id');
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const client = new ApiClient();
        const [res, contentRes] = await Promise.all([
          client.getContractById(contractId),
          client.getContractContent(contractId),
        ]);
        if (!alive) return;

        if (res.success) {
          const raw: any = res.data as any;
          const unwrapped: any = unwrapContractLike(raw);
          setContract(unwrapped as any);

          // Initialize editor state BEFORE rendering the editor to avoid a mount-with-empty flash.
          const c = unwrapped as any;
          const md = normalizeMetadata(c?.metadata);

          const content: any = contentRes?.success ? (contentRes.data as any) : null;
          const backendClientMs =
            Number(content?.client_updated_at_ms || md?.editor_client_updated_at_ms || 0) || 0;

          const renderedHtml: string | undefined =
            content?.rendered_html || c?.rendered_html || md?.rendered_html;
          const renderedText: string =
            content?.rendered_text ||
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

    const existingHtmlRaw = editorApiRef.current?.getHTML?.() ?? editorHtml;
    const existingText = String(editorApiRef.current?.getText?.() ?? editorText ?? '').trim();
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

      ed.commands.setContent(nextHtml, { emitUpdate: false });
      setEditorHtml(nextHtml);
      setEditorText(content);

      setDirty(true);
      setEditTick((t) => t + 1);
      await saveNow();
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : 'Failed to apply template');
    } finally {
      setTemplateApplying(false);
    }
  };

  const openSigningModal = () => {
    setSignError(null);
    setSigningUrl(null);
    setSignStatus(null);
    setSignOpen(true);
  };

  const validateSigningUrl = (url: string) => {
    const u = (url || '').trim();
    if (!u) return 'Signing URL is missing';

    if (u.startsWith('/')) return null;
    if (/^https?:\/\//i.test(u)) return null;
    return 'Signing URL is invalid.';
  };

  const refreshSigningStatus = async () => {
    if (!contractId) return;
    try {
      setSignStatusLoading(true);
      setSignError(null);
      const client = new ApiClient();
      const res = await client.inhouseStatus(contractId);
      if (!res.success) {
        const msg = res.error || 'Failed to fetch status';
        setSignError(msg);
        return;
      }
      setSignStatus(res.data as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch status';
      setSignError(msg);
    } finally {
      setSignStatusLoading(false);
    }
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
      const client = new ApiClient();

      const res = await client.inhouseStart({
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

      // Move user to the dedicated progress page right away.
      setSignOpen(false);
      router.push(`/contracts/signing-status?id=${encodeURIComponent(contractId)}`);
      return;
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
    if (!completed || !allSigned) {
      setSignError('Signing is not completed yet.');
      return;
    }
    const client = new ApiClient();
    const res = await client.inhouseDownloadExecutedPdf(contractId);
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
      <div className="space-y-6">

        {/* ── HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={async () => {
                try { await saveIfDirty(); } finally { router.back(); }
              }}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300 transition shrink-0"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 truncate">{title}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border shrink-0 ${
                  saving
                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                    : dirty
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${saving ? 'bg-blue-400 animate-pulse' : dirty ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                  {saving ? 'Saving…' : dirty ? 'Unsaved' : updatedAt ? `Saved` : 'Saved'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate font-mono">ID: {contractId}</p>
              {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openSigningModal}
              className="h-9 px-4 rounded-2xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:border-slate-300 hover:bg-slate-50 transition"
              type="button"
            >
              Send for signature
            </button>
            <button
              onClick={downloadPdf}
              className="h-9 px-4 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
              type="button"
            >
              Download PDF
            </button>
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="w-9 h-9 rounded-2xl hover:bg-slate-100 flex items-center justify-center text-slate-500 transition"
                aria-label="More options"
                type="button"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-11 w-48 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden z-20">
                  <button onClick={() => { setMoreOpen(false); downloadPdf(); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50" type="button">Download PDF</button>
                  <button onClick={() => { setMoreOpen(false); downloadTxt(); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50" type="button">Download TXT</button>
                  <button onClick={() => { setMoreOpen(false); void saveNow(); }} className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50" type="button">Save now</button>
                  <div className="h-px bg-slate-100" />
                  <button onClick={() => { setMoreOpen(false); void deleteContract(); }} className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50" type="button">Delete contract</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {/* ── MAIN GRID ── */}
        <div className="grid grid-cols-12 gap-6">

          {/* ── EDITOR PANEL ── */}
          <section className="col-span-12 lg:col-span-8 bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold text-slate-800">Editor</p>
              {rehydrating && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />
                  Restoring template…
                </span>
              )}
            </div>
            <div className="px-6 py-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  Loading contract…
                </div>
              ) : !contract ? (
                <p className="text-sm text-slate-400">No contract found.</p>
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
                    if (snapshotTimerRef.current) {
                      window.clearTimeout(snapshotTimerRef.current);
                    }
                    snapshotTimerRef.current = window.setTimeout(() => {
                      writeLocalSnapshot({ html, text, client_updated_at_ms: now });
                    }, 250);
                  }}
                  editorClassName="min-h-[60vh] rounded-2xl border border-slate-200 bg-white px-5 py-4 text-[13px] leading-6 text-slate-900 font-serif outline-none"
                />
              )}
            </div>
          </section>

          {/* ── RIGHT PANEL ── */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
              <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                <p className="text-sm font-extrabold text-slate-800">Add Template</p>
                <p className="text-xs text-slate-400 mt-1">Applying a template replaces current editor content.</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="relative">
                  <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="Search templates…"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                  />
                </div>

                {templatesError && <p className="text-xs text-red-500">{templatesError}</p>}

                <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-0.5">
                  {templatesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                      <div className="w-4 h-4 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />
                      Loading templates…
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">No templates found.</p>
                  ) : (
                    filteredTemplates.map((t) => (
                      <div key={t.filename} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{t.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate font-mono">{t.filename}</p>
                            {t.mine && (
                              <span className="inline-block text-[10px] font-bold tracking-wider text-blue-600 mt-1">MY TEMPLATE</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => applyTemplateToEditor(t.filename)}
                            disabled={templateApplying}
                            className="h-8 px-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition disabled:opacity-60 shrink-0"
                          >
                            Apply
                          </button>
                        </div>
                        {t.description && (
                          <p className="text-xs text-slate-400 mt-2 line-clamp-2">{t.description}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ── SIGN MODAL ── */}
        {signOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">

              {/* Modal header */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6-6m-6 6v3h3l6.5-6.5a2.121 2.121 0 00-3-3L9 13z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-slate-900">Send for Signature</p>
                    <p className="text-xs text-slate-400 mt-0.5">Invite signers to sign this contract.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSignOpen(false)}
                  className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-5">

                {/* Signing order */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Signing order</p>
                    <p className="text-xs text-slate-400 mt-0.5">Sequential = one-by-one · Parallel = all at once</p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    <button
                      type="button"
                      onClick={() => setSigningOrder('sequential')}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
                        signingOrder === 'sequential' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >Sequential</button>
                    <button
                      type="button"
                      onClick={() => setSigningOrder('parallel')}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
                        signingOrder === 'parallel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >Parallel</button>
                  </div>
                </div>

                {/* Signers */}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">Signers</p>
                  <button
                    type="button"
                    onClick={() => setSigners((prev) => [...prev, { email: '', name: '' }])}
                    className="h-8 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
                  >
                    + Add signer
                  </button>
                </div>

                <div className="space-y-2.5">
                  {signers.map((s, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        className="col-span-5 h-10 rounded-2xl bg-slate-50 border border-slate-200 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="Name"
                        value={s.name}
                        onChange={(e) =>
                          setSigners((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                        }
                      />
                      <input
                        className="col-span-6 h-10 rounded-2xl bg-slate-50 border border-slate-200 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-200"
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
                        className="col-span-1 w-9 h-9 rounded-xl hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition disabled:opacity-40"
                        aria-label="Remove signer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m2 0V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {signError && <p className="text-xs text-red-500">{signError}</p>}

                {signingUrl && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Signing Link</p>
                    <p className="mt-1 break-all text-sm text-slate-900">{signingUrl}</p>
                  </div>
                )}

                {signStatus && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
                        <p className="text-sm font-extrabold text-slate-900 mt-0.5">{String((signStatus as any)?.status || 'unknown').toUpperCase()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={downloadExecuted}
                        disabled={(() => {
                          const statusVal = String((signStatus as any)?.status || '').toLowerCase();
                          const allSigned = Boolean((signStatus as any)?.all_signed);
                          return !(statusVal === 'completed' || statusVal === 'executed') || !allSigned;
                        })()}
                        className="h-9 px-4 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        Download signed PDF
                      </button>
                    </div>

                    {(signStatus as any)?.signers?.length ? (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {(signStatus as any).signers.map((s: any) => {
                          const raw = String(s.status || '').trim();
                          const lower = raw.toLowerCase();
                          const isDeclined = ['declined', 'rejected', 'canceled', 'cancelled', 'refused'].includes(lower);
                          const isSigned = ['signed', 'completed', 'executed', 'done'].includes(lower) || Boolean(s.has_signed);
                          const isPending = ['sent', 'invited', 'pending', 'in_progress', 'in progress', 'viewed'].includes(lower);
                          const label = raw || (isSigned ? 'signed' : isDeclined ? 'declined' : 'pending');
                          const badgeClass = isDeclined
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : isSigned
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isPending
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200';
                          return (
                            <div key={String(s.email)} className="flex items-center justify-between text-xs gap-3">
                              <span className="text-slate-600 truncate">{String(s.name || s.email)}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${badgeClass}`}>{label}</span>
                                {s.signed_at ? <span className="text-[11px] text-slate-400">{String(s.signed_at)}</span> : null}
                              </div>
                            </div>
                          );
                        })}

                        {(signStatus as any).signers.some((x: any) =>
                          ['declined', 'rejected', 'canceled', 'cancelled', 'refused'].includes(String(x?.status || '').toLowerCase())
                        ) && (
                          <p className="text-[11px] text-red-500 pt-1">One or more signers declined. Update and restart.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Footer actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={refreshSigningStatus}
                    disabled={signStatusLoading}
                    className="h-10 px-4 rounded-2xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-60"
                  >
                    {signStatusLoading ? 'Checking…' : 'Check status'}
                  </button>
                  <button
                    type="button"
                    onClick={startSigning}
                    disabled={signing}
                    className="h-10 px-4 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
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
