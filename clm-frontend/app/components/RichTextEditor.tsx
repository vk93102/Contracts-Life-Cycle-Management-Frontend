'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  Quote,
  Highlighter,
  Eraser,
  Braces,
} from 'lucide-react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

import { FontSizeExtension } from './tiptap/FontSizeExtension';
import { ResizableImageExtension, type ImageAlign } from './tiptap/ResizableImageExtension';

type Props = {
  valueHtml: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  editorClassName?: string;
  contentWrapperClassName?: string;
  toolbarVariant?: 'light' | 'dark';
  toolbarPlacement?: 'top' | 'floating';
  onEditorReady?: (editor: Editor | null) => void;
};

const FONT_FAMILIES: Array<{ label: string; value: string }> = [
  { label: 'Default', value: '' },
  { label: 'Sans', value: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial' },
  { label: 'Serif', value: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
];

const FONT_SIZES: number[] = [12, 13, 14, 16, 18, 20, 24, 28, 32];

type TiptapImageAttrs = {
  src?: string;
  alt?: string;
  title?: string;
  width?: string;
  align?: ImageAlign;
};

export default function RichTextEditor({
  valueHtml,
  onChange,
  placeholder,
  disabled,
  className,
  editorClassName,
  contentWrapperClassName,
  toolbarVariant = 'light',
  toolbarPlacement = 'top',
  onEditorReady,
}: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageOpen, setImageOpen] = useState(false);
  const imageFileRef = useRef<HTMLInputElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSizeExtension,
      Subscript,
      Superscript,
      ResizableImageExtension.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-xl border border-black/10',
        },
      }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing…',
      }),
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: valueHtml || '',
    editable: !disabled,
    // Next.js may pre-render/hydrate client components; TipTap needs this to avoid hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          editorClassName ||
          'min-h-[60vh] rounded-2xl border border-black/10 bg-white px-5 py-4 text-[13px] leading-6 text-slate-900 outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText());
    },
  });

  // Keep editable in sync.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Expose editor instance.
  useEffect(() => {
    onEditorReady?.(editor || null);
    return () => onEditorReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Sync external HTML changes into the editor (AI updates, initial load, etc).
  useEffect(() => {
    if (!editor) return;
    const next = valueHtml || '';
    const current = editor.getHTML();
    if (next && next !== current) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
    if (!next && current) {
      editor.commands.setContent('', { emitUpdate: false });
    }
  }, [editor, valueHtml]);

  const currentFontFamily = editor?.getAttributes('textStyle')?.fontFamily || '';
  const currentFontSize = editor?.getAttributes('textStyle')?.fontSize || null;

  const disabledUi = !editor || !!disabled;

  const toolbarIsDark = toolbarVariant === 'dark';
  const toolbarShellClass = toolbarIsDark
    ? 'bg-[#111827] border-white/10 text-white'
    : 'bg-white border-black/10 text-[#0F141F]';

  const toolbarButtonActiveClass = toolbarIsDark
    ? 'bg-white/15 border-white/20 text-white'
    : 'bg-[#0F141F] border-[#0F141F] text-white';
  const toolbarButtonIdleClass = toolbarIsDark
    ? 'bg-transparent border-white/10 text-white/85 hover:bg-white/10'
    : 'bg-white border-black/10 text-black/70 hover:bg-black/5';

  const ToolbarIconButton = ({
    label,
    active,
    disabled,
    onClick,
    children,
  }: {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full border transition grid place-items-center ${
        active ? toolbarButtonActiveClass : toolbarButtonIdleClass
      } disabled:opacity-60`}
    >
      {children}
    </button>
  );

  const toggleLink = () => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      setLinkUrl('');
      return;
    }
    setLinkUrl(String(editor.getAttributes('link')?.href || ''));
    setLinkOpen(true);
    setImageOpen(false);
    setMoreOpen(false);
  };

  const applyLink = (href: string) => {
    if (!editor) return;
    const url = href.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      setLinkUrl('');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkUrl('');
  };

  const insertPlaceholder = () => {
    if (!editor) return;
    // Common contract placeholder format.
    editor.chain().focus().insertContent('{{  }}').run();
  };

  const onPickImageFile = async (file: File) => {
    if (!editor) return;
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Failed to read image'));
      r.readAsDataURL(file);
    });
    if (!dataUrl.startsWith('data:image/')) return;

    // `setImage` is provided by our image extension.
    editor.chain().focus().setImage({ src: dataUrl }).run();
    editor.chain().focus().setImageWidth('60%').setImageAlign('center').run();
    setImageOpen(false);
  };

  const isImageActive = !!editor?.isActive('image');
  const imageAttrs = (editor?.getAttributes('image') || {}) as TiptapImageAttrs;
  const currentImageAlign = imageAttrs.align;
  const currentImageWidth = imageAttrs.width;

  const currentImageWidthPercent = (() => {
    const raw = String(currentImageWidth || '').trim();
    const m = raw.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
    const parsed = m ? Number(m[1]) : NaN;
    const base = Number.isFinite(parsed) ? parsed : 60;
    return Math.max(10, Math.min(100, Math.round(base)));
  })();

  const setImageWidthPercent = (next: number) => {
    if (!editor) return;
    const v = Math.max(10, Math.min(100, Math.round(next)));
    editor.chain().focus().setImageWidth(`${v}%`).run();
  };

  return (
    <div className={className}>
      <div
        className={`border-b ${toolbarIsDark ? 'border-white/10' : 'border-black/5'} ${
          toolbarPlacement === 'floating' ? 'bg-transparent px-0 pt-0 pb-3' : 'p-4'
        }`}
      >
        <div
          className={`w-full sm:w-auto flex flex-nowrap sm:flex-wrap items-center justify-start gap-2 rounded-2xl sm:rounded-full border px-3 py-2 shadow-sm overflow-x-auto sm:overflow-visible ${toolbarShellClass} ${
            toolbarPlacement === 'floating' ? 'mx-auto' : ''
          }`}
        >
          <ToolbarIconButton
            label="Undo"
            disabled={disabledUi || !editor?.can().chain().focus().undo().run()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 className="w-4 h-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Redo"
            disabled={disabledUi || !editor?.can().chain().focus().redo().run()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 className="w-4 h-4" />
          </ToolbarIconButton>

          <div className={`w-px h-6 ${toolbarIsDark ? 'bg-white/15' : 'bg-black/10'} mx-1 flex-none`} />

          <ToolbarIconButton
            label="Bold"
            active={!!editor?.isActive('bold')}
            disabled={disabledUi}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="w-4 h-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Italic"
            active={!!editor?.isActive('italic')}
            disabled={disabledUi}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="w-4 h-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Underline"
            active={!!editor?.isActive('underline')}
            disabled={disabledUi}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarIconButton>

          <div className={`w-px h-6 ${toolbarIsDark ? 'bg-white/15' : 'bg-black/10'} mx-1 flex-none`} />

          <div className={`h-8 sm:h-9 rounded-full border px-3 flex items-center gap-2 flex-none ${toolbarIsDark ? 'border-white/10 bg-transparent' : 'border-black/10 bg-white'}`}>
            <Type className={`w-4 h-4 ${toolbarIsDark ? 'text-white/75' : 'text-black/45'}`} />
            <select
              className={`h-8 sm:h-9 bg-transparent text-xs sm:text-sm outline-none ${toolbarIsDark ? 'text-white' : 'text-black/70'}`}
              value={
                editor?.isActive('heading', { level: 1 })
                  ? 'h1'
                  : editor?.isActive('heading', { level: 2 })
                    ? 'h2'
                    : editor?.isActive('heading', { level: 3 })
                      ? 'h3'
                      : 'p'
              }
              onChange={(e) => {
                const v = e.target.value;
                if (!editor) return;
                if (v === 'p') editor.chain().focus().setParagraph().run();
                if (v === 'h1') editor.chain().focus().setHeading({ level: 1 }).run();
                if (v === 'h2') editor.chain().focus().setHeading({ level: 2 }).run();
                if (v === 'h3') editor.chain().focus().setHeading({ level: 3 }).run();
              }}
              disabled={disabledUi}
              aria-label="Heading level"
            >
              <option value="p">Normal</option>
              <option value="h1">H1</option>
              <option value="h2">H2</option>
              <option value="h3">H3</option>
            </select>
          </div>

          <div className={`w-px h-6 ${toolbarIsDark ? 'bg-white/15' : 'bg-black/10'} mx-1 flex-none`} />

          <ToolbarIconButton
            label="Bulleted list"
            active={!!editor?.isActive('bulletList')}
            disabled={disabledUi}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="w-4 h-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="Numbered list"
            active={!!editor?.isActive('orderedList')}
            disabled={disabledUi}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="w-4 h-4" />
          </ToolbarIconButton>

          <ToolbarIconButton
            label="Link"
            active={!!editor?.isActive('link')}
            disabled={disabledUi}
            onClick={toggleLink}
          >
            <Link2 className="w-4 h-4" />
          </ToolbarIconButton>

          <ToolbarIconButton
            label="Insert image"
            disabled={disabledUi}
            onClick={() => {
              if (disabledUi) return;
              setImageOpen((v) => !v);
              setLinkOpen(false);
            }}
          >
            <ImagePlus className="w-4 h-4" />
          </ToolbarIconButton>

          <ToolbarIconButton label="Insert {{ }} placeholder" disabled={disabledUi} onClick={insertPlaceholder}>
            <Braces className="w-4 h-4" />
          </ToolbarIconButton>

          <ToolbarIconButton
            label={moreOpen ? 'Close more tools' : 'More tools'}
            disabled={disabledUi}
            onClick={() => {
              setMoreOpen((v) => !v);
              setLinkOpen(false);
              setImageOpen(false);
            }}
          >
            <ChevronDown className={`w-4 h-4 transition ${moreOpen ? 'rotate-180' : ''}`} />
          </ToolbarIconButton>
        </div>

        {moreOpen && !disabledUi ? (
          <div className={`mt-3 rounded-2xl border p-3 shadow-sm ${toolbarShellClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <ToolbarIconButton
                label="Strikethrough"
                active={!!editor?.isActive('strike')}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="w-4 h-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Subscript"
                active={!!editor?.isActive('subscript')}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().toggleSubscript().run()}
              >
                <SubscriptIcon className="w-4 h-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Superscript"
                active={!!editor?.isActive('superscript')}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().toggleSuperscript().run()}
              >
                <SuperscriptIcon className="w-4 h-4" />
              </ToolbarIconButton>

              <ToolbarIconButton
                label="Blockquote"
                active={!!editor?.isActive('blockquote')}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().toggleBlockquote().run()}
              >
                <Quote className="w-4 h-4" />
              </ToolbarIconButton>

              <div className={`w-px h-6 ${toolbarIsDark ? 'bg-white/15' : 'bg-black/10'} mx-1`} />

              <select
                className={`h-9 rounded-full border px-3 text-sm outline-none ${
                  toolbarIsDark ? 'border-white/10 bg-transparent text-white' : 'border-black/10 bg-white text-black/70'
                }`}
                value={editor ? currentFontFamily : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!editor) return;
                  if (!v) editor.chain().focus().unsetFontFamily().run();
                  else editor.chain().focus().setFontFamily(v).run();
                }}
                disabled={disabledUi}
                aria-label="Font family"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                className={`h-9 rounded-full border px-3 text-sm outline-none ${
                  toolbarIsDark ? 'border-white/10 bg-transparent text-white' : 'border-black/10 bg-white text-black/70'
                }`}
                value={editor && currentFontSize ? String(currentFontSize) : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!editor) return;
                  if (!v) editor.chain().focus().unsetFontSize().run();
                  else editor.chain().focus().setFontSize(v).run();
                }}
                disabled={disabledUi}
                aria-label="Font size"
              >
                <option value="">Size</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={String(s)}>
                    {s}px
                  </option>
                ))}
              </select>

              <label
                className={`h-9 rounded-full border px-3 text-sm flex items-center gap-2 ${
                  toolbarIsDark ? 'border-white/10 bg-transparent text-white/85' : 'border-black/10 bg-white text-black/70'
                }`}
              >
                <span className="text-xs">Color</span>
                <input
                  type="color"
                  className="w-6 h-6 p-0 border-0 bg-transparent"
                  onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
                  disabled={disabledUi}
                  aria-label="Text color"
                />
              </label>

              <ToolbarIconButton
                label="Highlight"
                active={!!editor?.isActive('highlight')}
                disabled={disabledUi}
                onClick={() => {
                  if (!editor) return;
                  if (editor.isActive('highlight')) {
                    editor.chain().focus().unsetHighlight().run();
                  } else {
                    editor.chain().focus().setHighlight({ color: '#FEF08A' }).run();
                  }
                }}
              >
                <Highlighter className="w-4 h-4" />
              </ToolbarIconButton>

              <div className={`w-px h-6 ${toolbarIsDark ? 'bg-white/15' : 'bg-black/10'} mx-1`} />

              <ToolbarIconButton
                label="Align left"
                active={!!editor?.isActive({ textAlign: 'left' })}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().setTextAlign('left').run()}
              >
                <AlignLeft className="w-4 h-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Align center"
                active={!!editor?.isActive({ textAlign: 'center' })}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().setTextAlign('center').run()}
              >
                <AlignCenter className="w-4 h-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Align right"
                active={!!editor?.isActive({ textAlign: 'right' })}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().setTextAlign('right').run()}
              >
                <AlignRight className="w-4 h-4" />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Justify"
                active={!!editor?.isActive({ textAlign: 'justify' })}
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
              >
                <AlignJustify className="w-4 h-4" />
              </ToolbarIconButton>

              <ToolbarIconButton
                label="Clear formatting"
                disabled={disabledUi}
                onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
              >
                <Eraser className="w-4 h-4" />
              </ToolbarIconButton>

              {isImageActive ? (
                <>
                  <div className={`w-px h-6 ${toolbarIsDark ? 'bg-white/15' : 'bg-black/10'} mx-1`} />

                  <div className={`text-xs font-semibold ${toolbarIsDark ? 'text-white/80' : 'text-black/50'}`}>Image</div>

                  <button
                    type="button"
                    className={`h-9 w-9 rounded-full border text-sm font-bold transition ${
                      toolbarIsDark
                        ? 'border-white/10 bg-transparent text-white hover:bg-white/10'
                        : 'border-black/10 bg-white text-black/70 hover:bg-black/5'
                    }`}
                    onClick={() => setImageWidthPercent(currentImageWidthPercent - 10)}
                    disabled={disabledUi}
                    aria-label="Reduce image size"
                    title="Reduce image size"
                  >
                    −
                  </button>

                  <div className={`text-xs font-semibold tabular-nums ${toolbarIsDark ? 'text-white/80' : 'text-black/50'}`}>
                    {currentImageWidthPercent}%
                  </div>

                  <button
                    type="button"
                    className={`h-9 w-9 rounded-full border text-sm font-bold transition ${
                      toolbarIsDark
                        ? 'border-white/10 bg-transparent text-white hover:bg-white/10'
                        : 'border-black/10 bg-white text-black/70 hover:bg-black/5'
                    }`}
                    onClick={() => setImageWidthPercent(currentImageWidthPercent + 10)}
                    disabled={disabledUi}
                    aria-label="Increase image size"
                    title="Increase image size"
                  >
                    +
                  </button>

                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={currentImageWidthPercent}
                    onChange={(e) => setImageWidthPercent(Number(e.target.value))}
                    disabled={disabledUi}
                    className="w-36"
                    aria-label="Image size"
                  />

                  <select
                    className={`h-9 rounded-full border px-3 text-sm outline-none ${
                      toolbarIsDark
                        ? 'border-white/10 bg-transparent text-white'
                        : 'border-black/10 bg-white text-black/70'
                    }`}
                    value={currentImageWidth || '60%'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!editor) return;
                      editor.chain().focus().setImageWidth(v === 'auto' ? null : v).run();
                    }}
                    disabled={disabledUi}
                    aria-label="Image size"
                  >
                    <option value="25%">25%</option>
                    <option value="40%">40%</option>
                    <option value="60%">60%</option>
                    <option value="80%">80%</option>
                    <option value="100%">100%</option>
                    <option value="auto">Auto</option>
                  </select>

                  <select
                    className={`h-9 rounded-full border px-3 text-sm outline-none ${
                      toolbarIsDark
                        ? 'border-white/10 bg-transparent text-white'
                        : 'border-black/10 bg-white text-black/70'
                    }`}
                    value={currentImageAlign || 'center'}
                    onChange={(e) => {
                      const v = e.target.value as ImageAlign;
                      if (!editor) return;
                      editor.chain().focus().setImageAlign(v).run();
                    }}
                    disabled={disabledUi}
                    aria-label="Image alignment"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {linkOpen && !disabledUi ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              className="h-10 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm outline-none"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLink(linkUrl);
                if (e.key === 'Escape') {
                  setLinkOpen(false);
                  setLinkUrl('');
                }
              }}
              autoFocus
            />
            <button
              type="button"
              className="h-10 px-4 rounded-full bg-[#0F141F] text-white text-sm font-semibold"
              onClick={() => {
                applyLink(linkUrl);
              }}
            >
              Apply
            </button>
            <button
              type="button"
              className="h-10 px-4 rounded-full bg-white border border-black/10 text-black/70 text-sm font-semibold"
              onClick={() => {
                setLinkOpen(false);
                setLinkUrl('');
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}

        {imageOpen && !disabledUi ? (
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={imageFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await onPickImageFile(f);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              className="h-10 px-4 rounded-full bg-[#0F141F] text-white text-sm font-semibold"
              onClick={() => imageFileRef.current?.click()}
            >
              Upload
            </button>
            <button
              type="button"
              className="h-10 px-4 rounded-full bg-white border border-black/10 text-black/70 text-sm font-semibold"
              onClick={() => {
                setImageOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div className={contentWrapperClassName || 'p-4 bg-[#F6F3ED]'}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
