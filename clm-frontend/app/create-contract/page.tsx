'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import { useAuth } from '../lib/auth-context';
import {
  ApiClient,
  Clause,
  FileTemplateItem,
  TemplateFileSchemaResponse,
  TemplateSchemaField,
  TemplateSchemaSection,
} from '../lib/api-client';
import DashboardLayout from '../components/DashboardLayout';
import RichTextEditor from '../components/RichTextEditor';
import { ChevronLeft, FileText, Search, Sparkles } from 'lucide-react';
import { sanitizeEditorHtml } from '../lib/sanitize-html';

// Types
type Template = FileTemplateItem;

type Mode = 'templates' | 'ai';
type AiStep = 'select' | 'edit';

type CustomClause = { title?: string; content: string };
type Constraint = { name: string; value: string };
type ConstraintTemplate = { key: string; label: string; category?: string; default?: string };

type TemplateDraft = {
  template: string;
  fieldValues: Record<string, string>;
  selectedClauseIds: string[];
  customClauses: CustomClause[];
  constraints: Constraint[];
  updatedAt: number;
};

type GenerationContext = TemplateDraft & {
  contractId: string;
  createdAt: number;
};

const STANDARD_TEMPLATES_ORDER = [
  'Mutual_NDA.txt',
  'MSA_Master_Services.txt',
  'SOW_Statement_of_Work.txt',
  'Contractor_Agreement.txt',
];

const TEMPLATE_CARD_META: Record<
  string,
  { title: string; subtitle: string; pill: string; eta: string; iconBg: string; icon: React.ReactNode }
> = {
  'Mutual_NDA.txt': {
    title: 'Mutual NDA',
    subtitle: 'Protect confidential information between two parties.',
    pill: 'Standard',
    eta: '~5 mins',
    iconBg: 'bg-blue-50 text-blue-600',
    icon: <FileText className="w-5 h-5" />,
  },
  'MSA_Master_Services.txt': {
    title: 'MSA (Master Services)',
    subtitle: 'Framework agreement for ongoing service relationships.',
    pill: 'Complex',
    eta: '~15 mins',
    iconBg: 'bg-orange-50 text-orange-600',
    icon: <FileText className="w-5 h-5" />,
  },
  'SOW_Statement_of_Work.txt': {
    title: 'SOW (Statement of Work)',
    subtitle: 'Define specific project deliverables and timelines.',
    pill: 'Project',
    eta: '~10 mins',
    iconBg: 'bg-blue-50 text-blue-600',
    icon: <FileText className="w-5 h-5" />,
  },
  'Contractor_Agreement.txt': {
    title: 'Contractor Agreement',
    subtitle: 'Terms for independent contractors and freelancers.',
    pill: 'HR',
    eta: '~8 mins',
    iconBg: 'bg-blue-50 text-blue-700',
    icon: <FileText className="w-5 h-5" />,
  },
};

const CreateContractInner = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateQuery, setTemplateQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schema, setSchema] = useState<TemplateFileSchemaResponse | null>(null);

  const [clausesLoading, setClausesLoading] = useState(false);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [clauseQuery, setClauseQuery] = useState('');
  const [selectedClauseIds, setSelectedClauseIds] = useState<string[]>([]);

  const [customClauses, setCustomClauses] = useState<CustomClause[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);

  const [constraintLibrary, setConstraintLibrary] = useState<ConstraintTemplate[]>([]);
  const [constraintLibraryLoading, setConstraintLibraryLoading] = useState(false);
  const [constraintLibraryQuery, setConstraintLibraryQuery] = useState('');

  const [previewText, setPreviewText] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const [templateDraftUpdatedAt, setTemplateDraftUpdatedAt] = useState<number | null>(null);
  const [templateDraftRestored, setTemplateDraftRestored] = useState(false);

  const [aiStep, setAiStep] = useState<AiStep>('select');
  const [aiTitle, setAiTitle] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBaseText, setAiBaseText] = useState('');
  const [aiBaseHtml, setAiBaseHtml] = useState('');
  const [aiSuggestionText, setAiSuggestionText] = useState('');
  const [aiTemplateQuery, setAiTemplateQuery] = useState('');
  const [aiLoadingTemplate, setAiLoadingTemplate] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraftUpdatedAt, setAiDraftUpdatedAt] = useState<number | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiEditorApiRef = useRef<Editor | null>(null);
  const aiAutoStartTemplateRef = useRef<string>('');

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const aiChatScrollRef = useRef<HTMLDivElement | null>(null);
  const aiChatStickToBottomRef = useRef(true);
  const aiActiveAssistantMsgIdRef = useRef<string>('');

  const scrollAiChatToBottom = () => {
    const el = aiChatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  type AiDraft = {
    template: string;
    title: string;
    html: string;
    text: string;
    updatedAt: number;
  };

  type AiMessageRole = 'user' | 'assistant' | 'system';
  type AiMessage = {
    id: string;
    role: AiMessageRole;
    content: string;
    createdAt: number;
  };

  const userDraftKey = useMemo(() => {
    const u: any = user as any;
    return String(u?.user_id || u?.id || u?.email || 'anon');
  }, [user]);

  const getAiDraftStorageKey = (templateFilename: string) => `clm:aiBuilderDraft:v1:${userDraftKey}:${templateFilename}`;

  const getAiChatStorageKey = (templateFilename: string) => `clm:aiBuilderChat:v1:${userDraftKey}:${templateFilename}`;

  const getTemplateDraftStorageKey = (templateFilename: string) =>
    `clm:templateGeneratorDraft:v1:${userDraftKey}:${templateFilename}`;

  const readTemplateDraft = (templateFilename: string): TemplateDraft | null => {
    try {
      const raw = localStorage.getItem(getTemplateDraftStorageKey(templateFilename));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return {
        template: String((obj as any).template || templateFilename),
        fieldValues: ((obj as any).fieldValues || {}) as Record<string, string>,
        selectedClauseIds: (Array.isArray((obj as any).selectedClauseIds) ? (obj as any).selectedClauseIds : []) as string[],
        customClauses: (Array.isArray((obj as any).customClauses) ? (obj as any).customClauses : []) as CustomClause[],
        constraints: (Array.isArray((obj as any).constraints) ? (obj as any).constraints : []) as Constraint[],
        updatedAt: Number((obj as any).updatedAt || 0),
      };
    } catch {
      return null;
    }
  };

  const writeTemplateDraft = (templateFilename: string, draft: TemplateDraft) => {
    try {
      localStorage.setItem(getTemplateDraftStorageKey(templateFilename), JSON.stringify(draft));
    } catch {
      // Ignore storage quota/availability issues.
    }
  };

  const clearTemplateDraft = (templateFilename: string) => {
    try {
      localStorage.removeItem(getTemplateDraftStorageKey(templateFilename));
    } catch {
      // Ignore.
    }
  };

  const getGenerationContextKey = (contractId: string) => `clm:contractGenerationContext:v1:${contractId}`;

  const writeGenerationContext = (ctx: GenerationContext) => {
    try {
      localStorage.setItem(getGenerationContextKey(ctx.contractId), JSON.stringify(ctx));
    } catch {
      // Ignore.
    }
  };

  const readAiDraft = (templateFilename: string): AiDraft | null => {
    try {
      const raw = localStorage.getItem(getAiDraftStorageKey(templateFilename));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return {
        template: String((obj as any).template || templateFilename),
        title: String((obj as any).title || ''),
        html: String((obj as any).html || ''),
        text: String((obj as any).text || ''),
        updatedAt: Number((obj as any).updatedAt || 0),
      };
    } catch {
      return null;
    }
  };

  const writeAiDraft = (templateFilename: string, draft: AiDraft) => {
    try {
      localStorage.setItem(getAiDraftStorageKey(templateFilename), JSON.stringify(draft));
    } catch {
      // Ignore storage quota/availability issues.
    }
  };

  const clearAiDraft = (templateFilename: string) => {
    try {
      localStorage.removeItem(getAiDraftStorageKey(templateFilename));
    } catch {
      // Ignore.
    }
  };

  const readAiChat = (templateFilename: string): AiMessage[] => {
    try {
      const raw = localStorage.getItem(getAiChatStorageKey(templateFilename));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((m: any) => ({
          id: String(m?.id || ''),
          role: (m?.role as AiMessageRole) || 'user',
          content: String(m?.content || ''),
          createdAt: Number(m?.createdAt || 0),
        }))
        .filter((m: AiMessage) => !!m.id && !!m.role);
    } catch {
      return [];
    }
  };

  const writeAiChat = (templateFilename: string, messages: AiMessage[]) => {
    try {
      localStorage.setItem(getAiChatStorageKey(templateFilename), JSON.stringify(messages));
    } catch {
      // Ignore storage quota/availability issues.
    }
  };

  const clearAiChat = (templateFilename: string) => {
    try {
      localStorage.removeItem(getAiChatStorageKey(templateFilename));
    } catch {
      // Ignore.
    }
  };

  const newMessageId = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  };

  const escapeHtml = (s: string) =>
    (s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const textToHtml = (text: string) => {
    const safe = escapeHtml(text || '');
    return `<p>${safe.replace(/\n/g, '<br/>')}</p>`;
  };

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const filename = searchParams.get('template');
    if (filename) setSelectedTemplate(filename);
  }, [searchParams]);

  useEffect(() => {
    const m = (searchParams.get('mode') || searchParams.get('builder') || '').toLowerCase();
    if (m === 'ai') setMode('ai');
  }, [searchParams]);

  useEffect(() => {
    if (!selectedTemplate) {
      setSchema(null);
      setFieldValues({});
      setSelectedClauseIds([]);
      setCustomClauses([]);
      setConstraints([]);
      setPreviewText('');

      setTemplateDraftUpdatedAt(null);
      setTemplateDraftRestored(false);

      setAiStep('select');
      setAiTitle('');
      setAiPrompt('');
      setAiBaseText('');
      setAiBaseHtml('');
      setAiSuggestionText('');
      setAiError(null);
      setAiDraftUpdatedAt(null);
      return;
    }

    const loadSchemaAndClauses = async () => {
      try {
        setSchemaLoading(true);
        const client = new ApiClient();
        const schemaRes = await client.getTemplateFileSchema(selectedTemplate);
        if (!schemaRes.success) {
          setSchema(null);
          return;
        }

        const s = schemaRes.data as any as TemplateFileSchemaResponse;
        setSchema(s);

        // Ensure fieldValues has keys for required schema fields.
        const requiredKeys: string[] = [];
        for (const section of s.sections || []) {
          for (const field of section.fields || []) {
            if (field?.key) requiredKeys.push(field.key);
          }
        }
        setFieldValues((prev) => {
          const next: Record<string, string> = { ...prev };
          for (const k of requiredKeys) {
            if (next[k] === undefined) next[k] = '';
          }
          return next;
        });

        setClausesLoading(true);
        const clausesRes = await client.getClauses({ contract_type: s.template_type });
        if (clausesRes.success) {
          const data: any = clausesRes.data as any;
          const list = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
          setClauses(list);
        } else {
          setClauses([]);
        }

        setConstraintLibraryLoading(true);
        const consRes = await client.getConstraintsLibrary({});
        if (consRes.success) {
          const data: any = consRes.data as any;
          const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
          setConstraintLibrary(list);
        } else {
          setConstraintLibrary([]);
        }
      } finally {
        setSchemaLoading(false);
        setClausesLoading(false);
        setConstraintLibraryLoading(false);
      }
    };

    loadSchemaAndClauses();
  }, [selectedTemplate]);

  // Restore template-mode draft when selecting a template (only if current state is empty).
  useEffect(() => {
    if (mode !== 'templates') return;
    if (!user) return;
    if (!selectedTemplate) return;
    const empty =
      Object.keys(fieldValues || {}).length === 0 &&
      (selectedClauseIds || []).length === 0 &&
      (customClauses || []).length === 0 &&
      (constraints || []).length === 0;
    if (!empty) return;

    const draft = readTemplateDraft(selectedTemplate);
    if (!draft) {
      setTemplateDraftUpdatedAt(null);
      setTemplateDraftRestored(false);
      return;
    }

    setFieldValues(draft.fieldValues || {});
    setSelectedClauseIds(draft.selectedClauseIds || []);
    setCustomClauses(draft.customClauses || []);
    setConstraints(draft.constraints || []);
    setTemplateDraftUpdatedAt(draft.updatedAt || null);
    setTemplateDraftRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, user, selectedTemplate]);

  // Auto-save template-mode draft locally.
  useEffect(() => {
    if (mode !== 'templates') return;
    if (!user) return;
    if (!selectedTemplate) return;

    const t = window.setTimeout(() => {
      const draft: TemplateDraft = {
        template: selectedTemplate,
        fieldValues: fieldValues || {},
        selectedClauseIds: selectedClauseIds || [],
        customClauses: customClauses || [],
        constraints: constraints || [],
        updatedAt: Date.now(),
      };
      writeTemplateDraft(selectedTemplate, draft);
      setTemplateDraftUpdatedAt(draft.updatedAt);
    }, 350);

    return () => window.clearTimeout(t);
  }, [mode, user, selectedTemplate, fieldValues, selectedClauseIds, customClauses, constraints]);

  useEffect(() => {
    if (mode !== 'ai') return;
    if (!selectedTemplate) {
      setAiDraftUpdatedAt(null);
      return;
    }
    const d = readAiDraft(selectedTemplate);
    setAiDraftUpdatedAt(d?.updatedAt ? d.updatedAt : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTemplate, userDraftKey]);

  // Restore AI Builder chat history per template.
  useEffect(() => {
    if (mode !== 'ai') return;
    if (!selectedTemplate) {
      setAiMessages([]);
      return;
    }
    setAiMessages(readAiChat(selectedTemplate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTemplate, userDraftKey]);

  // Auto-save AI Builder chat history locally.
  useEffect(() => {
    if (mode !== 'ai') return;
    if (!selectedTemplate) return;
    const t = window.setTimeout(() => {
      writeAiChat(selectedTemplate, aiMessages);
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTemplate, aiMessages]);

  // Keep chat pinned to bottom while user hasn't scrolled up.
  useEffect(() => {
    if (mode !== 'ai') return;
    if (!aiChatStickToBottomRef.current) return;
    scrollAiChatToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, aiMessages.length]);

  // Auto-resume saved AI Builder drafts (and optionally auto-start from query params).
  useEffect(() => {
    if (mode !== 'ai') return;
    if (!selectedTemplate) return;

    const draft = readAiDraft(selectedTemplate);
    if (draft && (draft.html || draft.text)) {
      setAiError(null);
      setAiTitle(draft.title || String(selectedTemplateObj?.name || selectedTemplate));
      setAiBaseText(draft.text || '');
      setAiBaseHtml(draft.html || textToHtml(draft.text || ''));
      setAiSuggestionText('');
      setAiStep('edit');
      setAiDraftUpdatedAt(draft.updatedAt || Date.now());
      return;
    }

    const shouldAutoStart =
      (searchParams.get('mode') || '').toLowerCase() === 'ai' || (searchParams.get('autostart') || '') === '1';
    if (!shouldAutoStart) return;
    if (aiStep !== 'select') return;
    if (aiAutoStartTemplateRef.current === selectedTemplate) return;
    aiAutoStartTemplateRef.current = selectedTemplate;
    // Fire and forget.
    startAiBuilder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedTemplate, aiStep, searchParams, userDraftKey]);

  // Auto-save AI Builder editor progress locally (so refresh/redirect resumes).
  useEffect(() => {
    if (mode !== 'ai') return;
    if (aiStep !== 'edit') return;
    if (!selectedTemplate) return;
    if (!aiBaseHtml && !aiBaseText) return;

    const t = window.setTimeout(() => {
      const draft: AiDraft = {
        template: selectedTemplate,
        title: String(aiTitle || selectedTemplateObj?.name || selectedTemplate),
        html: aiBaseHtml,
        text: aiBaseText,
        updatedAt: Date.now(),
      };
      writeAiDraft(selectedTemplate, draft);
      setAiDraftUpdatedAt(draft.updatedAt);
    }, 650);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, aiStep, selectedTemplate, aiTitle, aiBaseHtml, aiBaseText]);

  const startAiBuilder = async () => {
    if (!selectedTemplate) return;
    try {
      const existing = readAiDraft(selectedTemplate);
      if (existing && (existing.html || existing.text)) {
        setAiError(null);
        setAiTitle(existing.title || String(selectedTemplateObj?.name || selectedTemplate));
        setAiBaseText(existing.text || '');
        setAiBaseHtml(existing.html || textToHtml(existing.text || ''));
        setAiSuggestionText('');
        setAiStep('edit');
        setAiDraftUpdatedAt(existing.updatedAt || Date.now());
        return;
      }

      setAiError(null);
      setAiLoadingTemplate(true);
      const client = new ApiClient();
      const res = await client.getTemplateFileContent(selectedTemplate);
      if (!res.success) {
        setAiError(res.error || 'Failed to load template');
        return;
      }
      const content = String((res.data as any)?.content || '');
      const name = String((res.data as any)?.name || '') || String(selectedTemplate || 'Template');
      setAiTitle(name);
      setAiBaseText(content);
      setAiBaseHtml(textToHtml(content));
      setAiSuggestionText('');
      setAiStep('edit');

      const draft: AiDraft = {
        template: selectedTemplate,
        title: name,
        html: textToHtml(content),
        text: content,
        updatedAt: Date.now(),
      };
      writeAiDraft(selectedTemplate, draft);
      setAiDraftUpdatedAt(draft.updatedAt);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to load template');
    } finally {
      setAiLoadingTemplate(false);
    }
  };

  const applyAiPrompt = async () => {
    if (aiGenerating) return;
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiError('Please enter a prompt');
      return;
    }
    const current = aiEditorApiRef.current?.getText() ?? aiBaseText;
    if (!current.trim()) {
      setAiError('Template content is empty');
      return;
    }

    aiAbortRef.current?.abort();
    const aborter = new AbortController();
    aiAbortRef.current = aborter;

    try {
      setAiError(null);
      setAiGenerating(true);
      let nextText = '';
      setAiSuggestionText('');

      const userMsg: AiMessage = {
        id: newMessageId(),
        role: 'user',
        content: prompt,
        createdAt: Date.now(),
      };
      const assistantMsgId = newMessageId();
      aiActiveAssistantMsgIdRef.current = assistantMsgId;
      const assistantMsg: AiMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
      };
      setAiMessages((prev) => [...prev, userMsg, assistantMsg]);
      setAiPrompt('');

      const client = new ApiClient();
      await client.streamTemplateAiGenerate(
        {
          prompt,
          current_text: current,
          contract_type: schema?.template_type || selectedTemplateObj?.contract_type,
          messages: [...aiMessages, userMsg]
            .filter((m) => (m?.content || '').trim().length > 0)
            .slice(-24)
            .map((m) => ({
              role: m.role,
              content: m.content,
            })),
        },
        {
          signal: aborter.signal,
          onDelta: (delta) => {
            nextText += delta;
            setAiSuggestionText(nextText);
            const id = aiActiveAssistantMsgIdRef.current;
            if (id) {
              setAiMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: nextText } : m)));
            }
          },
          onDone: () => {
            setAiSuggestionText(nextText);
            const id = aiActiveAssistantMsgIdRef.current;
            if (id) {
              setAiMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: nextText } : m)));
            }
          },
          onError: (err) => {
            setAiError(err || 'AI generation failed');
            const msg: AiMessage = {
              id: newMessageId(),
              role: 'system',
              content: err || 'AI generation failed',
              createdAt: Date.now(),
            };
            setAiMessages((prev) => [...prev, msg]);
          },
        }
      );
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      setAiError(e instanceof Error ? e.message : 'AI generation failed');

      const msg: AiMessage = {
        id: newMessageId(),
        role: 'system',
        content: e instanceof Error ? e.message : 'AI generation failed',
        createdAt: Date.now(),
      };
      setAiMessages((prev) => [...prev, msg]);
    } finally {
      setAiGenerating(false);
    }
  };

  const stopAi = () => {
    aiAbortRef.current?.abort();
    setAiGenerating(false);
  };

  const acceptAiSuggestion = () => {
    const next = (aiSuggestionText || '').trim();
    if (!next) return;
    setAiBaseText(next);
    setAiBaseHtml(textToHtml(next));
    setAiSuggestionText('');
  };

  const rejectAiSuggestion = () => {
    setAiSuggestionText('');
  };

  const createDraftFromAi = async () => {
    try {
      setAiError(null);

      if (!user) {
        setAiError('Please sign in to create a draft.');
        return;
      }

      setLoading(true);
      const client = new ApiClient();
      const renderedText = aiEditorApiRef.current?.getText() ?? aiBaseText;
      const renderedHtmlRaw = aiEditorApiRef.current?.getHTML() ?? aiBaseHtml;
      const renderedHtml = sanitizeEditorHtml(renderedHtmlRaw);
      const title = (aiTitle || selectedTemplateObj?.name || 'Contract').trim();
      const res = await client.createContractFromContent({
        title,
        contract_type: schema?.template_type || selectedTemplateObj?.contract_type,
        rendered_text: renderedText,
        rendered_html: renderedHtml,
        metadata: selectedTemplate
          ? {
              source: 'ai_builder',
              template_filename: selectedTemplate,
              template: selectedTemplate,
              form_inputs: fieldValues || {},
              selected_clause_ids: selectedClauseIds || [],
              selected_clauses: selectedClauseIds || [],
              custom_clauses: customClauses || [],
              constraints: constraints || [],
              editor_client_updated_at_ms: Date.now(),
            }
          : {
              source: 'ai_builder',
              editor_client_updated_at_ms: Date.now(),
            },
      });
      if (!res.success) {
        setAiError(res.error || 'Failed to create draft');
        return;
      }
      const id = String((res.data as any)?.id || '');
      if (!id) {
        setAiError('Draft created but no contract id returned');
        return;
      }

      if (selectedTemplate) {
        // Persist generation context so the editor + signing flow can access template inputs/clauses.
        writeGenerationContext({
          contractId: String(id),
          template: selectedTemplate,
          fieldValues: fieldValues || {},
          selectedClauseIds: selectedClauseIds || [],
          customClauses: customClauses || [],
          constraints: constraints || [],
          updatedAt: aiDraftUpdatedAt || Date.now(),
          createdAt: Date.now(),
        });
      }

      if (selectedTemplate) {
        clearAiDraft(selectedTemplate);
        setAiDraftUpdatedAt(null);
      }
      router.push(`/contracts/editor?id=${encodeURIComponent(id)}`);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to create draft');
    } finally {
      setLoading(false);
    }
  };

  const filteredClauses = useMemo(() => {
    const list = Array.isArray(clauses) ? clauses : [];
    const q = clauseQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const hay = `${c.clause_id} ${c.name} ${c.content}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clauses, clauseQuery]);

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const client = new ApiClient();
      const templatesResponse = await client.listTemplateFiles();

      if (!templatesResponse.success) {
        setError(templatesResponse.error || 'Failed to load templates');
        setTemplates([]);
      } else {
        const templateList = (templatesResponse.data as any)?.results || [];
        setTemplates(templateList);

        const templateFromQuery = searchParams.get('template');
        if (!templateFromQuery && templateList.length > 0) {
          const firstStandard = templateList.find((t: any) => STANDARD_TEMPLATES_ORDER.includes(t.filename))
          setSelectedTemplate((firstStandard || templateList[0]).filename);
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedTemplate || mode !== 'templates') return;
    if (!user) return;

    const timer = window.setTimeout(async () => {
      try {
        setPreviewLoading(true);
        const client = new ApiClient();
        const res = await client.previewContractFromFile({
          filename: selectedTemplate,
          structuredInputs: fieldValues,
          selectedClauses: selectedClauseIds,
          customClauses,
          constraints,
        });
        if (res.success) {
          setPreviewText(((res.data as any)?.rendered_text as string) || '');
        }
      } finally {
        setPreviewLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [selectedTemplate, fieldValues, selectedClauseIds, customClauses, constraints, mode, user]);

  const setField = (key: string, value: string) => {
    setFieldValues((p) => ({ ...p, [key]: value }));
  };

  const toggleClause = (clauseId: string) => {
    setSelectedClauseIds((prev) =>
      prev.includes(clauseId) ? prev.filter((c) => c !== clauseId) : [...prev, clauseId]
    );
  };

  const addCustomClause = () => setCustomClauses((p) => [...p, { title: '', content: '' }]);
  const addConstraint = () => setConstraints((p) => [...p, { name: '', value: '' }]);

  const addConstraintFromLibrary = (t: ConstraintTemplate) => {
    const name = (t?.label || t?.key || '').trim();
    if (!name) return;
    setConstraints((prev) => {
      const exists = prev.some((c) => (c.name || '').trim().toLowerCase() === name.toLowerCase());
      if (exists) return prev;
      return [...prev, { name, value: String(t?.default || '') }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) {
      setError('Please select a template');
      return;
    }

    const templateMetaTitle =
      (selectedTemplate && (TEMPLATE_CARD_META[selectedTemplate]?.title || selectedTemplateObj?.name)) || 'Contract';
    const partyHint =
      fieldValues.party_a_name ||
      fieldValues.party_b_name ||
      fieldValues.company_name ||
      fieldValues.client_name ||
      fieldValues.disclosing_party_name ||
      fieldValues.receiving_party_name ||
      '';
    const derivedTitle = partyHint ? `${templateMetaTitle} — ${partyHint}` : templateMetaTitle;

    setLoading(true);
    setError(null);

    try {
      const client = new ApiClient();
      const response = await client.generateContractFromFile({
        filename: selectedTemplate,
        title: derivedTitle,
        selectedClauses: selectedClauseIds,
        customClauses,
        constraints,
        structuredInputs: fieldValues,
      });

      if (!response.success) {
        setError(response.error || 'Failed to create contract');
        return;
      }

      const contractId = (response.data as any)?.contract?.id;
      if (contractId) {
        // Persist generation context so the editor can show template/clauses/inputs.
        writeGenerationContext({
          contractId: String(contractId),
          template: selectedTemplate,
          fieldValues: fieldValues || {},
          selectedClauseIds: selectedClauseIds || [],
          customClauses: customClauses || [],
          constraints: constraints || [],
          updatedAt: templateDraftUpdatedAt || Date.now(),
          createdAt: Date.now(),
        });

        // Clear local draft after successful generation.
        clearTemplateDraft(selectedTemplate);
        setTemplateDraftRestored(false);
        setTemplateDraftUpdatedAt(null);
        router.push(`/contracts/editor?id=${encodeURIComponent(String(contractId))}`);
      } else {
        router.push('/contracts');
      }
    } catch (err) {
      console.error('Failed to create contract:', err);
      setError(err instanceof Error ? err.message : 'Failed to create contract');
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplateObj = templates.find((t) => t.filename === selectedTemplate) || null;

  const allTemplatesOrdered = useMemo(() => {
    const standardSet = new Set(STANDARD_TEMPLATES_ORDER);
    const pinned: Template[] = [];
    const byFilename = new Map<string, Template>();
    for (const t of templates) byFilename.set(t.filename, t);
    for (const f of STANDARD_TEMPLATES_ORDER) {
      const t = byFilename.get(f);
      if (t) pinned.push(t);
    }
    const rest = templates.filter((t) => !standardSet.has(t.filename));
    return [...pinned, ...rest];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    if (!q) return allTemplatesOrdered;
    return allTemplatesOrdered.filter((t) => {
      const hay = `${t.filename || ''} ${t.name || ''} ${t.description || ''} ${t.contract_type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allTemplatesOrdered, templateQuery]);

  const aiFilteredTemplates = useMemo(() => {
    const q = aiTemplateQuery.trim().toLowerCase();
    if (!q) return allTemplatesOrdered;
    return allTemplatesOrdered.filter((t) => {
      const hay = `${t.filename || ''} ${t.name || ''} ${t.description || ''} ${t.contract_type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allTemplatesOrdered, aiTemplateQuery]);

  const sections: TemplateSchemaSection[] = schema?.sections || [];

  const isCreateDisabled = !user || !selectedTemplateObj || loading || mode !== 'templates';

  const pageTitle = 'Contract Generator';
  const pageSubtitle = 'Select a template and autofill details to generate contracts instantly.';

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* ── PAGE HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{pageTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">{pageSubtitle}</p>
          </div>

          {/* Mode switcher */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1">
            <button
              type="button"
              onClick={() => setMode('templates')}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition ${
                mode === 'templates' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Template Based
            </button>
            <button
              type="button"
              onClick={() => setMode('ai')}
              className={`px-5 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
                mode === 'ai' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-4 h-4" /> AI Builder
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-2xl text-sm">
            {error}
          </div>
        )}

        {mode === 'ai' ? (
          <div className="space-y-5">
              {aiStep === 'select' ? (
                <div className="grid grid-cols-12 gap-6">

                  {/* Template picker sidebar */}
                  <aside className="col-span-12 lg:col-span-3 bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="px-5 pt-5 pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-slate-800">AI Builder</p>
                          <p className="text-xs text-slate-400">Pick a template to start</p>
                        </div>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200"
                          placeholder="Search templates…"
                          value={aiTemplateQuery}
                          onChange={(e) => setAiTemplateQuery(e.target.value)}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">
                        {aiTemplateQuery.trim() ? `${aiFilteredTemplates.length} result${aiFilteredTemplates.length === 1 ? '' : 's'}` : `${aiFilteredTemplates.length} templates`}
                      </p>
                    </div>

                    <div className="p-4 space-y-2 overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                      {aiFilteredTemplates.length === 0 ? (
                        <p className="text-sm text-slate-400 p-2">No templates match.</p>
                      ) : (
                        aiFilteredTemplates.map((t) => {
                          const isSelected = selectedTemplate === t.filename;
                          return (
                            <button
                              key={t.filename}
                              type="button"
                              onClick={() => setSelectedTemplate(t.filename)}
                              className={`w-full text-left rounded-2xl border p-3.5 transition ${
                                isSelected ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              <p className={`text-sm font-semibold truncate ${ isSelected ? 'text-blue-700' : 'text-slate-800' }`}>{t.name || t.filename}</p>
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.description || t.contract_type || ''}</p>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>

                  {/* Get started panel */}
                  <section className="col-span-12 lg:col-span-9 bg-white rounded-3xl border border-slate-200 overflow-hidden">

                    {/* Hero */}
                    <div className="px-8 py-10 border-b border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
                        <div className="max-w-lg">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 mb-4">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-blue-700">AI-Powered Drafting</span>
                          </div>
                          <h2 className="text-2xl font-extrabold text-slate-900">Draft with AI assistance</h2>
                          <p className="mt-2 text-sm text-slate-500 leading-relaxed">Open any template in the intelligent editor. Describe what you need — the AI proposes a full revision. Accept, reject, or refine until it's exactly right.</p>
                          <div className="mt-5 flex items-center gap-4 flex-wrap">
                            <button
                              type="button"
                              onClick={startAiBuilder}
                              disabled={!selectedTemplate || aiLoadingTemplate}
                              className="inline-flex items-center gap-2 h-11 px-6 rounded-2xl bg-blue-600 text-white text-sm font-extrabold hover:bg-blue-700 transition disabled:opacity-60"
                            >
                              {aiLoadingTemplate ? (
                                <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Loading…</>
                              ) : aiDraftUpdatedAt ? (
                                'Resume Draft →'
                              ) : 'Get Started →'}
                            </button>
                            {!selectedTemplate && <p className="text-xs text-slate-400">← Select a template first</p>}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 shrink-0">
                          {[
                            { label: 'Templates', value: String(templates.length) },
                            { label: 'AI steps', value: 'Instant' },
                            { label: 'Formats', value: 'Rich Text' },
                            { label: 'Export', value: 'Editor' },
                          ].map((s) => (
                            <div key={s.label} className="bg-slate-50 rounded-2xl border border-slate-200 px-4 py-3 text-center">
                              <p className="text-lg font-extrabold text-slate-900">{s.value}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {aiDraftUpdatedAt && (
                        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                          <p className="text-xs text-blue-700 font-semibold">
                            Draft auto-saved — last updated {new Date(aiDraftUpdatedAt).toLocaleString()}
                          </p>
                          <button
                            type="button"
                            onClick={() => { if (selectedTemplate) { clearAiDraft(selectedTemplate); setAiDraftUpdatedAt(null); } }}
                            className="ml-auto text-xs text-blue-600 hover:underline font-semibold"
                          >
                            Clear
                          </button>
                        </div>
                      )}

                      {aiError && (
                        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-sm">{aiError}</div>
                      )}
                    </div>

                    {/* Selected template preview */}
                    <div className="px-8 py-6">
                      <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-3">Selected Template</p>
                      {selectedTemplateObj ? (
                        <div className="flex items-start gap-4 bg-slate-50 rounded-2xl border border-slate-200 p-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-extrabold text-slate-800">{selectedTemplateObj.name || selectedTemplateObj.filename}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{selectedTemplateObj.description || 'Template preview will open in the AI editor.'}</p>
                            <p className="text-[11px] text-slate-300 font-mono mt-1">{selectedTemplateObj.filename}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-2xl border border-slate-200 border-dashed p-6 text-center">
                          <p className="text-sm text-slate-400">Select a template from the sidebar to see a preview here.</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-5">

                  {/* AI edit header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => { stopAi(); setAiStep('select'); }}
                        className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300 transition shrink-0"
                        aria-label="Back"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-xl font-extrabold text-slate-900 truncate">{aiTitle || selectedTemplateObj?.name || 'AI Builder'}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">Template: {selectedTemplate}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={createDraftFromAi}
                      disabled={loading || aiGenerating || !aiBaseText.trim() || !user}
                      className="inline-flex items-center gap-2 h-10 px-5 rounded-2xl bg-blue-600 text-white text-sm font-extrabold hover:bg-blue-700 transition disabled:opacity-60 shrink-0"
                    >
                      {loading ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Creating…</> : 'Create Draft →'}
                    </button>
                  </div>

                  {aiError && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm">{aiError}</div>
                  )}

                  <div className="grid grid-cols-12 gap-6">

                    {/* Template Editor */}
                    <section className="col-span-12 lg:col-span-8 bg-white rounded-3xl border border-slate-200 overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                        <p className="text-sm font-extrabold text-slate-800">Template Editor</p>
                        <span className={`text-xs ${ aiGenerating ? 'text-blue-500 font-semibold' : 'text-slate-400' }`}>
                          {aiGenerating ? 'AI generating…' : 'Edit freely · Accept AI suggestions on the right'}
                        </span>
                      </div>
                      <div className="px-6 py-5 overflow-y-auto max-h-[calc(100vh-280px)]">
                        <RichTextEditor
                          valueHtml={aiBaseHtml}
                          disabled={aiGenerating}
                          onEditorReady={(ed) => { aiEditorApiRef.current = ed; }}
                          onChange={(html: string, text: string) => { setAiBaseHtml(html); setAiBaseText(text); }}
                          editorClassName={`min-h-[55vh] rounded-2xl border border-slate-200 bg-white px-5 py-4 text-[13px] leading-6 text-slate-900 font-serif outline-none ${ aiGenerating ? 'opacity-75' : '' }`}
                        />
                      </div>
                    </section>

                    {/* AI Suggestions Panel */}
                    <aside className="col-span-12 lg:col-span-4 lg:sticky lg:top-6 self-start">
                      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 180px)' }}>

                        {/* Panel header */}
                        <div className="px-5 py-4 border-b border-slate-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                                <Sparkles className="w-3.5 h-3.5 text-white" />
                              </div>
                              <p className="text-sm font-extrabold text-slate-800">AI Suggestions</p>
                            </div>
                            {aiGenerating && <span className="text-[11px] text-blue-500 font-semibold animate-pulse">Streaming…</span>}
                          </div>
                          <p className="text-xs text-slate-400 mt-1.5">Describe changes · AI proposes a full revision · Accept or reject.</p>
                        </div>

                        {/* Chat history */}
                        <div className="flex flex-col flex-1 min-h-0 p-4 space-y-3">
                          <div className="rounded-2xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0" style={{ minHeight: '160px' }}>
                            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                              <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">History</p>
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={scrollAiChatToBottom} className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold">↓ Latest</button>
                                <button type="button" onClick={() => { if (!selectedTemplate) return; clearAiChat(selectedTemplate); setAiMessages([]); }} className="text-[11px] text-blue-600 hover:underline font-semibold">Clear</button>
                              </div>
                            </div>
                            <div
                              ref={aiChatScrollRef}
                              onScroll={(e) => { const el = e.currentTarget; aiChatStickToBottomRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 32; }}
                              className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
                            >
                              {aiMessages.length === 0 ? (
                                <p className="text-sm text-slate-400">Your prompts and AI responses will appear here.</p>
                              ) : (
                                aiMessages.map((m) => {
                                  const isUser = m.role === 'user';
                                  const isAssistant = m.role === 'assistant';
                                  return (
                                    <div key={m.id}>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${ isUser ? 'bg-slate-800 text-white' : isAssistant ? 'bg-blue-600 text-white' : 'bg-red-100 text-red-600' }`}>
                                          {isUser ? 'You' : isAssistant ? 'AI' : 'System'}
                                        </span>
                                        <span className="text-[10px] text-slate-300">{m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ''}</span>
                                      </div>
                                      <div className={`rounded-2xl border px-3 py-2.5 text-xs whitespace-pre-wrap break-words ${ isUser ? 'bg-slate-50 border-slate-200 text-slate-800' : isAssistant ? 'bg-white border-slate-200 text-slate-800' : 'bg-red-50 border-red-200 text-red-600' }`}>
                                        {m.content || (isAssistant && aiGenerating ? '…' : '')}
                                      </div>
                                      {isUser && (
                                        <button type="button" onClick={() => setAiPrompt(m.content)} className="text-[10px] text-slate-400 hover:text-blue-600 mt-1 ml-1">↑ Reuse</button>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          {/* Prompt area */}
                          <div className="space-y-2.5">
                            <textarea
                              value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !aiGenerating && aiPrompt.trim()) applyAiPrompt(); }}
                              placeholder="e.g., Add a 30-day termination clause and update payment terms to Net 45…"
                              className="w-full min-h-[90px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                              disabled={aiGenerating}
                            />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={applyAiPrompt}
                                disabled={aiGenerating || !aiPrompt.trim()}
                                className="flex-1 h-9 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition disabled:opacity-60"
                              >
                                {aiGenerating ? 'Generating…' : 'Generate Suggestion'}
                              </button>
                              {aiGenerating ? (
                                <button type="button" onClick={stopAi} className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Stop</button>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={acceptAiSuggestion}
                                disabled={!aiSuggestionText.trim() || aiGenerating}
                                className="h-9 rounded-xl bg-blue-600 text-white text-xs font-extrabold hover:bg-blue-700 transition disabled:opacity-50"
                              >Accept ✓</button>
                              <button
                                type="button"
                                onClick={rejectAiSuggestion}
                                disabled={!aiSuggestionText.trim() || aiGenerating}
                                className="h-9 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition disabled:opacity-50"
                              >Reject ✕</button>
                            </div>

                            <p className="text-[10px] text-slate-400 text-center">Tip: be specific — mention sections, numbers, jurisdictions · ⌘↵ to send</p>
                          </div>
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ── TEMPLATE PICKER ── */}
              <div className="bg-white rounded-3xl border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <p className="text-sm font-extrabold text-slate-800">Choose a template</p>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      value={templateQuery}
                      onChange={(e) => setTemplateQuery(e.target.value)}
                      placeholder="Search templates…"
                      className="w-full sm:w-[280px] bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                </div>

                {templatesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                    <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    Loading templates…
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="text-sm text-slate-400 py-4">No templates match your search.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {filteredTemplates.map((t) => {
                      const isSelected = selectedTemplate === t.filename;
                      const meta = TEMPLATE_CARD_META[t.filename] || {
                        title: t.name,
                        subtitle: t.description || 'Template',
                        pill: t.contract_type || 'Template',
                        eta: '~5 mins',
                        iconBg: 'bg-slate-100 text-slate-600',
                        icon: <FileText className="w-5 h-5" />,
                      };
                      const createdByYou = user && ((t as any)?.created_by_id && String((t as any).created_by_id) === String((user as any)?.user_id));

                      return (
                        <button
                          key={t.filename}
                          type="button"
                          onClick={() => setSelectedTemplate(t.filename)}
                          className={`text-left rounded-2xl border p-4 transition w-full group ${
                            isSelected ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-500/15' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-blue-600 text-white' : meta.iconBg
                            }`}>{meta.icon}</div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                              isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                            }`}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                          </div>
                          <p className={`text-sm font-extrabold truncate ${ isSelected ? 'text-blue-700' : 'text-slate-900' }`}>{meta.title}</p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{meta.subtitle}</p>
                          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>{meta.pill}</span>
                            <span className="text-[10px] text-slate-400">{meta.eta}</span>
                            {createdByYou && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Mine</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* ── LEFT: DATA ENTRY ── */}
                <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 overflow-hidden">

                  {/* Panel header */}
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-extrabold">1</div>
                      <p className="text-sm font-extrabold text-slate-800">Data Entry</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFieldValues({});
                        setSelectedClauseIds([]);
                        setCustomClauses([]);
                        setConstraints([]);
                        if (selectedTemplate) {
                          clearTemplateDraft(selectedTemplate);
                          setTemplateDraftUpdatedAt(null);
                          setTemplateDraftRestored(false);
                        }
                      }}
                      className="text-xs font-semibold text-slate-400 hover:text-red-500 transition"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Draft banner */}
                  {templateDraftUpdatedAt && (
                    <div className="mx-5 mt-4 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        {templateDraftRestored ? 'Draft restored' : 'Auto-saved'} &mdash; {new Date(templateDraftUpdatedAt).toLocaleString()}
                      </p>
                      {selectedTemplate && (
                        <button type="button" onClick={() => { clearTemplateDraft(selectedTemplate); setTemplateDraftUpdatedAt(null); setTemplateDraftRestored(false); }} className="text-xs font-semibold text-slate-600 hover:underline">
                          Clear draft
                        </button>
                      )}
                    </div>
                  )}

                  <div className="p-5 overflow-y-auto max-h-[calc(100vh-260px)] space-y-6">
                    {!selectedTemplate ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                          <FileText className="w-5 h-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-semibold text-slate-500">Select a template above to begin</p>
                      </div>
                    ) : schemaLoading ? (
                      <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                        <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                        Loading fields…
                      </div>
                    ) : (
                      <>
                        {(sections.length ? sections : [{ title: 'Details', fields: [] }]).map((section) => (
                          <div key={section.title}>
                            <p className="text-[10px] tracking-widest font-extrabold text-slate-400 uppercase mb-3">{section.title}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {(section.fields || []).map((f: TemplateSchemaField) => (
                                <div key={f.key}>
                                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                    {f.label}{f.required && <span className="text-blue-500 ml-0.5">*</span>}
                                  </label>
                                  {f.type === 'select' ? (
                                    <select
                                      value={fieldValues[f.key] || ''}
                                      onChange={(e) => setField(f.key, e.target.value)}
                                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    >
                                      <option value="">Select…</option>
                                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type={f.type}
                                      value={fieldValues[f.key] || ''}
                                      onChange={(e) => setField(f.key, e.target.value)}
                                      placeholder={f.label}
                                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Clause Library */}
                        <div>
                          <p className="text-[10px] tracking-widest font-extrabold text-slate-400 uppercase mb-3">Clause Library</p>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="relative mb-3">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input value={clauseQuery} onChange={(e) => setClauseQuery(e.target.value)} placeholder="Search clauses…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </div>
                            <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                              {clausesLoading ? <p className="text-sm text-slate-400">Loading…</p> : filteredClauses.length === 0 ? <p className="text-sm text-slate-400">No clauses found.</p> : filteredClauses.slice(0, 50).map((c) => {
                                const checked = selectedClauseIds.includes(c.clause_id);
                                return (
                                  <label key={`${c.clause_id}-${c.version}`} className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-blue-200 transition">
                                    <input type="checkbox" checked={checked} onChange={() => toggleClause(c.clause_id)} className="mt-0.5 accent-blue-600" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                                      <p className="text-[11px] text-slate-400 font-mono">{c.clause_id}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Constraints */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] tracking-widest font-extrabold text-slate-400 uppercase">Constraints</p>
                            <button type="button" onClick={addConstraint} className="text-xs font-semibold text-blue-600 hover:underline">+ Add custom</button>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input value={constraintLibraryQuery} onChange={(e) => setConstraintLibraryQuery(e.target.value)} placeholder="Search constraint library…" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </div>
                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                              {constraintLibraryLoading ? <p className="text-sm text-slate-400">Loading…</p> : constraintLibrary.filter((x) => { const q = constraintLibraryQuery.trim().toLowerCase(); if (!q) return true; return `${x.label} ${x.key} ${x.category || ''}`.toLowerCase().includes(q); }).slice(0, 40).map((x) => (
                                <button key={x.key} type="button" onClick={() => addConstraintFromLibrary(x)} className="w-full text-left bg-white rounded-xl border border-slate-200 px-3 py-2.5 hover:border-blue-200 transition flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-800 truncate">{x.label}</p>
                                    <p className="text-[11px] text-slate-400">{x.category || 'General'}{x.default ? ` · ${String(x.default)}` : ''}</p>
                                  </div>
                                  <span className="text-xs font-extrabold text-blue-600 shrink-0">+ Add</span>
                                </button>
                              ))}
                            </div>
                            {constraints.length > 0 && (
                              <div className="pt-2 border-t border-slate-200 space-y-2">
                                {constraints.map((c, idx) => (
                                  <div key={idx} className="flex gap-2">
                                    <input value={c.name} onChange={(e) => setConstraints((p) => p.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} placeholder="Name" className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                    <input value={c.value} onChange={(e) => setConstraints((p) => p.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))} placeholder="Value" className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                    <button type="button" onClick={() => setConstraints((p) => p.filter((_, i) => i !== idx))} className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center transition">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Custom Clauses */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] tracking-widest font-extrabold text-slate-400 uppercase">Custom Clauses</p>
                            <button type="button" onClick={addCustomClause} className="text-xs font-semibold text-blue-600 hover:underline">+ Add clause</button>
                          </div>
                          {customClauses.length === 0 ? (
                            <p className="text-sm text-slate-400">Add bespoke clauses like non-solicit, SLA, data retention, etc.</p>
                          ) : (
                            <div className="space-y-3">
                              {customClauses.map((c, idx) => (
                                <div key={idx} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <div className="flex gap-2 mb-2">
                                    <input value={c.title || ''} onChange={(e) => setCustomClauses((p) => p.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))} placeholder="Clause title" className="flex-1 px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                    <button type="button" onClick={() => setCustomClauses((p) => p.filter((_, i) => i !== idx))} className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center transition">✕</button>
                                  </div>
                                  <textarea value={c.content} onChange={(e) => setCustomClauses((p) => p.map((x, i) => (i === idx ? { ...x, content: e.target.value } : x)))} placeholder="Clause content…" className="w-full px-3 py-3 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[80px]" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: LIVE PREVIEW ── */}
                <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 overflow-hidden lg:sticky lg:top-6 self-start flex flex-col">

                  {/* Preview header */}
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <p className="text-sm font-extrabold text-slate-800">Live Preview</p>
                      {previewLoading && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="w-3 h-3 rounded-full border-2 border-blue-300 border-t-transparent animate-spin" />
                          Updating…
                        </span>
                      )}
                    </div>
                    {schema?.template_type && (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                        {schema.template_type}
                      </span>
                    )}
                  </div>

                  {/* Document body */}
                  <div className="flex-1 p-5">
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden h-full">
                      {/* Accent stripe */}
                      <div className="h-1.5 bg-gradient-to-r from-blue-700 to-blue-400" />

                      <div className="p-5 overflow-y-auto max-h-[calc(100vh-360px)]">
                        {!selectedTemplate ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 rounded-3xl bg-white border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
                              <FileText className="w-7 h-7 text-slate-300" />
                            </div>
                            <p className="text-sm font-semibold text-slate-400">Select a template to see a preview</p>
                            <p className="text-xs text-slate-300 mt-1">Your document will appear here as you fill the form</p>
                          </div>
                        ) : previewLoading && !previewText ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
                            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                            Generating preview…
                          </div>
                        ) : previewText ? (
                          <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-800 font-serif">
                            {previewText}
                          </pre>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-sm text-slate-400">Start filling fields to see a live preview</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer CTA */}
                  <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-4">
                    <p className="text-xs text-slate-400">
                      {!user ? 'Please sign in to create contracts.' : 'Ready to generate your contract from this template.'}
                    </p>
                    <button
                      type="submit"
                      disabled={isCreateDisabled}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-2xl text-sm font-extrabold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {loading ? (
                        <><span className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin" /> Creating…</>
                      ) : 'Move to Editor →'}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
      </div>
    </DashboardLayout>
  );
};

const CreateContractPage = () => {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-[20px] shadow-sm p-6 text-gray-600">
              Loading...
            </div>
          </div>
        </div>
      }
    >
      <CreateContractInner />
    </Suspense>
  );
};

export default CreateContractPage;