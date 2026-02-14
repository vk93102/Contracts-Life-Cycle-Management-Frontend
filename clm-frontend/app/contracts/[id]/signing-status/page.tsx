'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, Clock3, Copy, XCircle } from 'lucide-react';
import DashboardLayout from '../../../components/DashboardLayout';
import { ApiClient } from '../../../lib/api-client';

type StepKey = 'invite_sent' | 'recipient_received' | 'signature_pending' | 'completed';

function formatRelative(ms: number): string {
	if (!ms || ms < 0) return '—';
	const s = Math.floor(ms / 1000);
	if (s < 5) return 'just now';
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
	const d = Math.floor(h / 24);
	return `${d} day${d === 1 ? '' : 's'} ago`;
}

function formatMaybeDate(value: any): string {
	if (!value) return '—';
	const d = new Date(String(value));
	if (Number.isNaN(d.getTime())) return String(value);
	return d.toLocaleString();
}

function formatShortId(value: string | null | undefined): { short: string; full: string } {
	const full = String(value || '').trim();
	if (!full) return { short: '—', full: '' };
	if (full.length <= 18) return { short: full, full };
	return { short: `${full.slice(0, 8)}…${full.slice(-6)}`, full };
}

async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// ignore
	}
	try {
		const el = document.createElement('textarea');
		el.value = text;
		el.setAttribute('readonly', 'true');
		el.style.position = 'fixed';
		el.style.left = '-9999px';
		document.body.appendChild(el);
		el.select();
		const ok = document.execCommand('copy');
		el.remove();
		return ok;
	} catch {
		return false;
	}
}

function titleCaseName(value: string): string {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (raw.includes('@')) return raw;
	const parts = raw.split(/\s+/).filter(Boolean);
	return parts
		.map((p) => {
			if (!/^[a-zA-Z]+$/.test(p)) return p;
			return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
		})
		.join(' ');
}

function signerDisplayName(s: any, idx: number): string {
	const name = titleCaseName(String(s?.name || '').trim());
	if (name) return name;
	const email = String(s?.email || '').trim();
	if (email) return email;
	return `Signer ${idx + 1}`;
}

function pickFirst(obj: any, keys: string[]): any {
	for (const k of keys) {
		const v = obj?.[k];
		if (v !== undefined && v !== null && v !== '') return v;
	}
	return null;
}

function toDisplayString(value: any): string {
	if (value === undefined || value === null) return '—';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (typeof value === 'object') {
		const v = value as any;
		const picked = pickFirst(v, ['label', 'name', 'status', 'state', 'value']);
		if (picked !== null) return toDisplayString(picked);
		try {
			return JSON.stringify(value);
		} catch {
			return '—';
		}
	}
	return String(value);
}

function StatusBadge(props: { label: string }) {
	const raw = String(props.label || '').trim();
	const lower = raw.toLowerCase();
	const isDeclined = ['declined', 'rejected', 'canceled', 'cancelled', 'refused'].includes(lower);
	const isSigned = ['signed', 'completed', 'executed', 'done'].includes(lower);
	const isPending = ['sent', 'invited', 'pending', 'in_progress', 'in progress', 'viewed'].includes(lower);
	const badgeClass = isDeclined
		? 'bg-rose-50 text-rose-700 border-rose-200'
		: isSigned
			? 'bg-emerald-50 text-emerald-700 border-emerald-200'
			: isPending
				? 'bg-amber-50 text-amber-800 border-amber-200'
				: 'bg-slate-50 text-slate-700 border-slate-200';
	return <span className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${badgeClass}`}>{raw || '—'}</span>;
}

function initialsForUser(nameOrEmail: string): string {
	const value = String(nameOrEmail || '').trim();
	if (!value) return '?';
	const email = value.includes('@') ? value : '';
	const name = email ? '' : value;
	if (name) {
		const parts = name.split(/\s+/).filter(Boolean);
		const a = parts[0]?.[0] || '';
		const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
		return (a + b).toUpperCase() || '?';
	}
	if (email) {
		const local = email.split('@')[0] || email;
		return local.slice(0, 2).toUpperCase() || '?';
	}
	return value.slice(0, 2).toUpperCase() || '?';
}

function colorForString(input: string): { bg: string; fg: string } {
	const s = String(input || '');
	let hash = 0;
	for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
	const palette = [
		{ bg: 'bg-indigo-100', fg: 'text-indigo-700' },
		{ bg: 'bg-violet-100', fg: 'text-violet-700' },
		{ bg: 'bg-sky-100', fg: 'text-sky-700' },
		{ bg: 'bg-emerald-100', fg: 'text-emerald-700' },
		{ bg: 'bg-amber-100', fg: 'text-amber-800' },
		{ bg: 'bg-rose-100', fg: 'text-rose-700' },
	];
	const idx = Math.abs(hash) % palette.length;
	return palette[idx];
}

function RecipientAvatar(props: { name?: string; email?: string }) {
	const label = String(props.name || props.email || '').trim();
	const { bg, fg } = colorForString(props.email || props.name || label);
	return (
		<div className={`h-10 w-10 rounded-full flex items-center justify-center ${bg} ${fg} font-extrabold text-sm flex-shrink-0`}>
			{initialsForUser(label)}
		</div>
	);
}

function StatusIcon(props: { status: string }) {
	const raw = String(props.status || '').trim().toLowerCase();
	const isDeclined = ['declined', 'rejected', 'canceled', 'cancelled', 'refused', 'failed', 'error'].includes(raw);
	const isSigned = ['signed', 'completed', 'executed', 'done', 'finished'].includes(raw);
	if (isSigned) return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
	if (isDeclined) return <XCircle className="h-4 w-4 text-rose-600" aria-hidden="true" />;
	return <Clock3 className="h-4 w-4 text-amber-600" aria-hidden="true" />;
}

function normalizeFirmaStatusLabel(value: any): string {
	const raw = String(value || '').trim();
	const lc = raw.toLowerCase();
	if (lc === 'finished') return 'completed';
	if (lc === 'not_sent') return 'draft';
	if (lc === 'in_progress') return 'in progress';
	return raw;
}

function isDeclinedStatus(status: any): boolean {
	const raw = String(status || '').trim().toLowerCase();
	return ['declined', 'rejected', 'canceled', 'cancelled', 'refused', 'failed', 'error'].includes(raw);
}

function isSignedStatus(status: any): boolean {
	const raw = String(status || '').trim().toLowerCase();
	return ['signed', 'completed', 'executed', 'done', 'finished'].includes(raw);
}

function signerStatusLabel(s: any): string {
	const raw = String(s?.status || '').trim();
	if (raw) return normalizeFirmaStatusLabel(raw);
	if (s?.has_signed) return 'signed';
	return 'pending';
}

function signerStatusTimestamp(s: any): any {
	const label = String(signerStatusLabel(s) || '').toLowerCase();
	if (isSignedStatus(label)) return s?.signed_at || s?.signedAt;
	// For decline/in-progress/viewed, prefer the backend-provided last status update.
	return s?.status_updated_at || s?.updated_at || s?.updatedAt;
}

function computeSteps(statusData: any): Record<StepKey, boolean> {
	const status = String(statusData?.status || '').toLowerCase();
	const signers = Array.isArray(statusData?.signers) ? statusData.signers : [];
	const anyViewed = signers.some((s: any) => ['viewed', 'in_progress', 'signed'].includes(String(s?.status || '').toLowerCase()) || !!s?.has_signed);
	const allSigned = !!statusData?.all_signed || (signers.length > 0 && signers.every((s: any) => !!s?.has_signed));

	return {
		invite_sent: ['sent', 'in_progress', 'completed', 'declined'].includes(status) || signers.length > 0,
		recipient_received: anyViewed,
		signature_pending: (['sent', 'in_progress'].includes(status) || signers.length > 0) && !allSigned,
		completed: status === 'completed' || allSigned,
	};
}

function StepPill(props: { title: string; active: boolean; subtitle?: string }) {
	return (
		<div className="flex items-center gap-3">
			<div className={`h-10 w-10 rounded-full flex items-center justify-center border ${props.active ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
				<div className={`h-3 w-3 rounded-full ${props.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
			</div>
			<div>
				<div className="text-sm font-semibold text-slate-900">{props.title}</div>
				{props.subtitle ? <div className="text-xs text-slate-500 mt-0.5">{props.subtitle}</div> : null}
			</div>
		</div>
	);
}

function TrackingStepper(props: {
	steps: Record<StepKey, boolean>;
	meta: Partial<Record<StepKey, { subtitle?: string }>>;
}) {
	const items: Array<{ key: StepKey; label: string }> = [
		{ key: 'invite_sent', label: 'Invite Sent' },
		{ key: 'recipient_received', label: 'Recipient Received' },
		{ key: 'signature_pending', label: 'Signature Pending' },
		{ key: 'completed', label: 'Completed' },
	];

	const activeIdx = Math.max(
		0,
		items.reduce((acc, it, idx) => (props.steps[it.key] ? idx : acc), 0)
	);

	return (
		<div className="mt-5">
			<div className="relative">
				<div className="absolute left-6 right-6 top-5 h-[2px] bg-slate-200" />
				<div
					className="absolute left-6 top-5 h-[2px] bg-emerald-400"
					style={{ width: `calc(${(activeIdx / (items.length - 1)) * 100}% - 0px)` }}
				/>
				<div className="grid grid-cols-4 gap-3">
					{items.map((it, idx) => {
						const active = Boolean(props.steps[it.key]);
						const completed = idx < activeIdx;
						const dotClass = completed || active ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300';
						const labelClass = completed || active ? 'text-slate-900' : 'text-slate-400';
						return (
							<div key={it.key} className="flex flex-col items-center text-center">
								<div className={`h-10 w-10 rounded-full border-2 flex items-center justify-center ${dotClass}`}>
									{completed ? (
										<div className="h-4 w-4 rounded-full bg-white" />
									) : (
										<div className={`h-3 w-3 rounded-full ${active ? 'bg-white' : 'bg-slate-300'}`} />
									)}
								</div>
								<div className={`mt-2 text-xs font-semibold ${labelClass}`}>{it.label}</div>
								{props.meta[it.key]?.subtitle ? (
									<div className="mt-0.5 text-[11px] text-slate-400">{props.meta[it.key]?.subtitle}</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function TrackingStepperMobile(props: {
	steps: Record<StepKey, boolean>;
	meta: Partial<Record<StepKey, { subtitle?: string }>>;
}) {
	return (
		<div className="mt-4 space-y-3">
			<StepPill title="Invite Sent" active={!!props.steps.invite_sent} subtitle={props.meta.invite_sent?.subtitle} />
			<StepPill title="Recipient Received" active={!!props.steps.recipient_received} subtitle={props.meta.recipient_received?.subtitle} />
			<StepPill title="Signature Pending" active={!!props.steps.signature_pending} subtitle={props.meta.signature_pending?.subtitle} />
			<StepPill title="Completed" active={!!props.steps.completed} subtitle={props.meta.completed?.subtitle} />
		</div>
	);
}

export default function SigningStatusPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const contractId = params?.id;

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	// NOTE: This page intentionally does NOT call `/api/v1/contracts/:id`.
	// Some deployments return a 404 for that endpoint (e.g. unauthenticated users),
	// which caused noisy repeated 404s because this page polls frequently.

	const [statusData, setStatusData] = useState<any | null>(null);
	const [details, setDetails] = useState<any | null>(null);
	const [reminders, setReminders] = useState<any | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [downloadingCert, setDownloadingCert] = useState(false);
	const [events, setEvents] = useState<Array<{ ts: number; type: string; message?: string; payload?: any }>>([]);
	const [activity, setActivity] = useState<any[] | null>(null);
	const lastStatusSigRef = useRef<string | null>(null);

	const [liveEnabled, setLiveEnabled] = useState(true);
	const [liveState, setLiveState] = useState<'disconnected' | 'connected' | 'error'>('disconnected');
	const [lastEventTs, setLastEventTs] = useState<number | null>(null);
	const [lastRefreshMs, setLastRefreshMs] = useState<number | null>(null);
	const [copiedIdAt, setCopiedIdAt] = useState<number | null>(null);
	const streamCloseRef = useRef<null | (() => void)>(null);
	const pollRef = useRef<number | null>(null);

	const steps = useMemo(() => computeSteps(statusData), [statusData]);
	const declined = useMemo(() => {
		const status = String(statusData?.status || '').toLowerCase();
		const signers = Array.isArray(statusData?.signers) ? statusData.signers : [];
		const anyDeclined = signers.some((s: any) => ['declined', 'rejected', 'canceled', 'cancelled', 'refused'].includes(String(s?.status || '').toLowerCase()));
		return status === 'declined' || anyDeclined;
	}, [statusData]);

	const displayTitle = useMemo(() => {
		const d: any = details as any;
		const s: any = statusData as any;
		const picked =
			d?.title ||
			d?.name ||
			d?.document_title ||
			d?.document_name ||
			d?.document?.title ||
			d?.document?.name ||
			d?.signing_request?.title ||
			d?.signing_request?.name ||
			s?.title ||
			s?.name ||
			s?.document_title ||
			s?.document_name ||
			'Signing status';
		return String(picked || 'Signing status');
	}, [details, statusData]);

	const safeFilenameBase = useMemo(() => {
		const raw = String(displayTitle || contractId || 'contract').trim();
		return raw.replace(/\s+/g, '_');
	}, [displayTitle, contractId]);

	const formattedContractId = useMemo(() => formatShortId(contractId), [contractId]);

	const refreshAll = async () => {
		if (!contractId) return;
		try {
			const client = new ApiClient();

			// Call status FIRST: backend syncs signer states and may write audit logs.
			const sRes = await client.firmaStatus(contractId);
			const [dRes, rRes, aRes] = await Promise.all([
				client.firmaDetails(contractId),
				client.firmaReminders(contractId),
				client.firmaActivityLog(contractId, 50),
			]);

			if (sRes.success) {
				setStatusData(sRes.data);
				try {
					const d: any = sRes.data as any;
					const sig = JSON.stringify({ status: d?.status, all_signed: d?.all_signed, signers: d?.signers || [] });
					if (lastStatusSigRef.current && lastStatusSigRef.current !== sig) {
						setEvents((prev) => [{ ts: Date.now(), type: 'status_update', message: 'Status changed', payload: d }, ...prev].slice(0, 50));
					}
					lastStatusSigRef.current = sig;
				} catch {
					// ignore
				}
			}
			if (dRes.success) setDetails(dRes.data);
			if (rRes.success) setReminders(rRes.data);
			if (aRes.success) setActivity((aRes.data as any)?.results || []);
			if (!sRes.success && !dRes.success && !rRes.success && !aRes.success) {
				throw new Error(sRes.error || dRes.error || rRes.error || aRes.error || 'Failed to load signing status');
			}
			setLastRefreshMs(Date.now());
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load signing status');
		}
	};
	const resendInvites = async () => {
		if (!contractId) return;
		try {
			setError(null);
			const client = new ApiClient();
			const res = await client.firmaResendInvites(contractId);
			if (!res.success) {
				setError(res.error || 'Failed to resend notifications');
				return;
			}
			setEvents((prev) => [{ ts: Date.now(), type: 'invite_resent', message: 'Resent signing notifications' }, ...prev].slice(0, 50));
			void refreshAll();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to resend notifications');
		}
	};


	useEffect(() => {
		if (!contractId) return;
		setLoading(true);
		setError(null);
		void refreshAll().finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [contractId]);

	const cleanupLiveResources = () => {
		try {
			streamCloseRef.current?.();
		} catch {
			// ignore
		}
		streamCloseRef.current = null;
		if (pollRef.current && typeof window !== 'undefined') window.clearInterval(pollRef.current);
		pollRef.current = null;
	};

	const stopLive = () => {
		setLiveEnabled(false);
		setLiveState('disconnected');
		cleanupLiveResources();
	};

	const startLive = () => {
		if (!contractId) return;
		setLiveState('disconnected');
		setLastEventTs(null);
		cleanupLiveResources();

		const client = new ApiClient();
		const sub = client.firmaWebhookStream(contractId, {
			onReady: () => setLiveState('connected'),
			onError: () => setLiveState('error'),
			onEvent: (evt: { event?: string; data?: any; raw?: string }) => {
				setLastEventTs(Date.now());
				setEvents((prev) => [{ ts: Date.now(), type: evt.event || 'firma', payload: evt.data }, ...prev].slice(0, 50));
				void refreshAll();
			},
		});
		streamCloseRef.current = sub.close;

		if (typeof window !== 'undefined') {
			pollRef.current = window.setInterval(() => void refreshAll(), 10000);
		}
	};

	useEffect(() => {
		if (!contractId) return;
		if (!liveEnabled) {
			cleanupLiveResources();
			setLiveState('disconnected');
			return;
		}
		startLive();
		return () => cleanupLiveResources();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [contractId, liveEnabled]);

	const downloadExecuted = async () => {
		if (!contractId) return;
		try {
			setDownloading(true);
			setError(null);
			const client = new ApiClient();
			const res = await client.firmaDownloadExecutedPdf(contractId);
			if (!res.success || !res.data) {
				setError(res.error || 'Failed to download signed PDF');
				return;
			}
			const blobUrl = URL.createObjectURL(res.data);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${safeFilenameBase}_signed.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(blobUrl);
		} finally {
			setDownloading(false);
		}
	};

	const downloadCertificate = async () => {
		if (!contractId) return;
		try {
			setDownloadingCert(true);
			setError(null);
			const client = new ApiClient();
			const res = await client.firmaDownloadCertificate(contractId);
			if (!res.success || !res.data) {
				setError(res.error || 'Failed to download certificate');
				return;
			}
			const blobUrl = URL.createObjectURL(res.data);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${safeFilenameBase}_certificate.pdf`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(blobUrl);
		} finally {
			setDownloadingCert(false);
		}
	};

	return (
		<DashboardLayout>
			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
				<div className="min-w-0">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 break-words sm:truncate">{displayTitle || 'Signing status'}</h1>
						{(() => {
							const statusLabel = declined
								? 'DECLINED'
								: steps.completed
								? 'COMPLETED'
								: steps.signature_pending
									? 'SIGNATURE PENDING'
									: steps.recipient_received
										? 'RECIPIENT RECEIVED'
										: steps.invite_sent
											? 'INVITE SENT'
											: '—';
							const pillClass = declined
								? 'bg-rose-100 text-rose-800'
								: steps.completed
									? 'bg-emerald-100 text-emerald-800'
									: 'bg-amber-100 text-amber-800';
							return (
								<span className={`px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide ${pillClass}`}>{statusLabel}</span>
							);
						})()}
					</div>
					<div className="mt-1 text-xs text-slate-500 space-y-0.5">
						{contractId ? (
							<div className="flex items-center gap-2 flex-wrap">
								<span className="font-semibold text-slate-600">ID:</span>
								<button
									type="button"
									onClick={() => {
										void copyToClipboard(String(contractId)).then((ok) => {
											if (ok) setCopiedIdAt(Date.now());
										});
									}}
									className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-mono text-slate-700 hover:bg-slate-50 max-w-full"
									title={formattedContractId.full}
								>
									<Copy className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" aria-hidden="true" />
									<span className="break-all">{formattedContractId.short}</span>
								</button>
								{copiedIdAt && Date.now() - copiedIdAt < 2000 ? <span className="text-[11px] text-emerald-700 font-semibold">Copied</span> : null}
							</div>
						) : null}
						<div className="flex flex-wrap gap-x-2 gap-y-1">
							{lastRefreshMs ? <span>Last update: {formatRelative(Date.now() - lastRefreshMs)}</span> : null}
							{lastEventTs ? <span>· Last event: {new Date(lastEventTs).toLocaleTimeString()}</span> : null}
						</div>
					</div>
				</div>

				<div className="w-full sm:w-auto">
					<div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
					{steps.completed ? (
						<>
						<button
							type="button"
							onClick={() => void downloadExecuted()}
							disabled={downloading}
							className="col-span-3 sm:col-span-auto h-9 sm:h-10 px-4 rounded-full bg-[#0F141F] text-white text-xs sm:text-sm font-semibold disabled:opacity-60"
						>
							{downloading ? 'Downloading…' : 'Download signed PDF'}
						</button>
						<button
							type="button"
							onClick={() => void downloadCertificate()}
							disabled={downloadingCert}
							className="col-span-3 sm:col-span-auto h-9 sm:h-10 px-4 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
						>
							{downloadingCert ? 'Downloading…' : 'Certificate'}
						</button>
						</>
					) : null}
					<button
						type="button"
						onClick={() => router.push(`/contracts/${contractId}`)}
						className="col-span-1 h-9 sm:h-10 px-3 sm:px-4 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
					>
						Back
					</button>
					<button
						type="button"
						onClick={() => void refreshAll()}
						className="col-span-1 h-9 sm:h-10 px-3 sm:px-4 rounded-full bg-white border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
					>
						Refresh
					</button>
					<button
						type="button"
						onClick={() => void resendInvites()}
						disabled={steps.completed}
						className="col-span-1 h-9 sm:h-10 px-3 sm:px-4 rounded-full bg-rose-500 text-white text-xs sm:text-sm font-semibold hover:bg-rose-600 disabled:opacity-60"
						title={steps.completed ? 'Already completed' : 'Resend signing notifications'}
					>
						<span className="hidden sm:inline">Resend notifications</span>
						<span className="sm:hidden">Resend</span>
					</button>
					</div>
				</div>
			</div>

			{loading ? <div className="py-16 text-center text-slate-500">Loading…</div> : null}
			{error ? <div className="py-2 text-sm text-rose-600">{error}</div> : null}

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 space-y-6">
					<div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
						<div className="text-sm font-extrabold text-slate-900">Signature Tracking</div>
						{declined ? (
							<div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
								A recipient declined the signing request. You can update recipients and click “Resend notifications”.
							</div>
						) : null}
						<div className="sm:hidden">
							<TrackingStepperMobile
								steps={steps}
								meta={{
									invite_sent: { subtitle: '' },
									recipient_received: { subtitle: '' },
									signature_pending: { subtitle: 'In progress' },
									completed: { subtitle: steps.completed ? 'Done' : 'Awaiting' },
								}}
							/>
						</div>
						<div className="hidden sm:block">
							<TrackingStepper
								steps={steps}
								meta={{
									invite_sent: { subtitle: '' },
									recipient_received: { subtitle: '' },
									signature_pending: { subtitle: 'In progress' },
									completed: { subtitle: steps.completed ? 'Done' : 'Awaiting' },
								}}
							/>
						</div>
					</div>

					<div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6">
						<div className="flex items-center justify-between">
							<div className="text-sm font-extrabold text-slate-900">Recipients</div>
							<div className="text-xs text-slate-500">{Array.isArray(statusData?.signers) ? `${statusData.signers.length} signers` : '—'}</div>
						</div>

						<div className="mt-4 space-y-2">
							{Array.isArray(statusData?.signers) && statusData.signers.length > 0 ? (
								statusData.signers.map((s: any, idx: number) => (
									<div key={`${String(s.email || 'signer')}-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-slate-200 p-3">
										<div className="flex items-center gap-3 min-w-0">
											<RecipientAvatar name={String(s.name || '')} email={String(s.email || '')} />
											<div className="min-w-0">
												<div className="text-sm font-semibold text-slate-900 break-words leading-snug">
													{signerDisplayName(s, idx)}
												</div>
												{s?.email ? <div className="text-xs text-slate-500 break-all leading-snug">{String(s.email || '')}</div> : null}
												{(() => {
													const reason = String(s?.declined_reason || s?.reason || '').trim();
													if (!reason) return null;
													if (!isDeclinedStatus(signerStatusLabel(s))) return null;
													return <div className="text-[11px] text-rose-700 mt-0.5 truncate">Reason: {reason}</div>;
												})()}
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-2 sm:justify-end">
											{(() => {
												const label = signerStatusLabel(s);
												const ts = signerStatusTimestamp(s);
												return (
													<>
														<StatusIcon status={String(label)} />
														<StatusBadge label={String(label)} />
														{ts ? <span className="text-[11px] text-slate-400 w-full sm:w-auto">{formatMaybeDate(ts)}</span> : null}
													</>
												);
											})()}
										</div>
									</div>
								))
							) : (
								<div className="text-sm text-slate-500">No recipient info yet.</div>
							)}
						</div>
					</div>

					<div className="bg-white rounded-3xl border border-slate-200 p-6">
						<div className="flex items-center justify-between">
							<div className="text-sm font-extrabold text-slate-900">Summary Details</div>
							<div className="text-xs text-slate-500">
								Live: {liveEnabled ? (liveState === 'connected' ? 'connected' : liveState) : 'off'}
							</div>
						</div>

						<div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="rounded-2xl border border-slate-200 p-4">
								<div className="text-xs font-semibold text-slate-700">Status</div>
								<div className="mt-2 flex items-center gap-2">
									<div className="text-sm font-bold text-slate-900">{String(statusData?.status || '—')}</div>
									{statusData?.all_signed ? <StatusBadge label="all signed" /> : null}
								</div>
								<div className="mt-3 text-xs text-slate-500">
									Signers: {Array.isArray(statusData?.signers) ? statusData.signers.length : 0}
									{statusData?.all_signed ? ' · All signed' : ''}
								</div>
							</div>
							<div className="rounded-2xl border border-slate-200 p-4">
								<div className="text-xs font-semibold text-slate-700">Reminders</div>
								{(() => {
									const r = (reminders as any)?.reminders ?? (reminders as any);
									const enabled = pickFirst(r, ['enabled', 'is_enabled', 'active']);
									const nextAt = pickFirst(r, ['next_scheduled_at', 'next_run_at', 'next_at']);
									const lastAt = pickFirst(r, ['last_sent_at', 'last_run_at', 'last_at']);
									const interval = pickFirst(r, ['interval_days', 'interval', 'frequency']);
									return (
										<div className="mt-2 space-y-1 text-xs text-slate-600">
											<div>Enabled: <span className="font-semibold text-slate-900">{enabled === null ? '—' : String(Boolean(enabled))}</span></div>
											<div>Next: <span className="font-semibold text-slate-900">{formatMaybeDate(nextAt)}</span></div>
											<div>Last: <span className="font-semibold text-slate-900">{formatMaybeDate(lastAt)}</span></div>
											{interval !== null ? <div>Interval: <span className="font-semibold text-slate-900">{String(interval)}</span></div> : null}
										</div>
									);
								})()}
							</div>
						</div>

						<div className="mt-4 rounded-2xl border border-slate-200 p-4">
							<div className="text-xs font-semibold text-slate-700">Signing request details / certificate</div>
							{(() => {
								const sr = (details as any)?.signing_request ?? (details as any)?.data?.signing_request ?? (details as any);
								const requestId = pickFirst(sr, ['id', 'signing_request_id', 'request_id']);
								const status = pickFirst(sr, ['status', 'state']);

								// Prefer the normalized backend status payload (it has *_at fields),
								// but fall back to Firma's documented date_* fields from `details`.
								const createdAt =
									pickFirst(statusData, ['created_at', 'createdAt', 'created']) ??
									pickFirst(sr, ['date_created', 'created_at', 'createdAt', 'created']);
								const completedAt =
									pickFirst(statusData, ['completed_at', 'completedAt', 'executed_at', 'finished_at']) ??
									pickFirst(sr, ['date_finished', 'completed_at', 'executed_at', 'finished_at']);
								const expiresAt =
									pickFirst(statusData, ['expires_at', 'expiresAt', 'expiration']) ??
									pickFirst(sr, ['expires_at', 'expiresAt', 'expiration']);
								const certificateUrl = pickFirst(sr, ['certificate_url', 'certificateUrl', 'audit_trail_url', 'auditTrailUrl']);

								const statusLabel = normalizeFirmaStatusLabel(toDisplayString(status));

								return (
									<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
										<div className="rounded-xl border border-slate-200 p-3">
											<div className="text-[11px] text-slate-500">Signing Request ID</div>
											<div className="mt-1 text-sm font-semibold text-slate-900 break-all">{requestId ? String(requestId) : '—'}</div>
										</div>
										<div className="rounded-xl border border-slate-200 p-3">
											<div className="text-[11px] text-slate-500">Created</div>
											<div className="mt-1 text-sm font-semibold text-slate-900">{formatMaybeDate(createdAt)}</div>
										</div>
										<div className="rounded-xl border border-slate-200 p-3">
											<div className="text-[11px] text-slate-500">Completed</div>
											<div className="mt-1 text-sm font-semibold text-slate-900">{formatMaybeDate(completedAt)}</div>
										</div>
										<div className="rounded-xl border border-slate-200 p-3 md:col-span-2 flex items-center justify-between gap-3">
											<div className="min-w-0">
												<div className="text-[11px] text-slate-500">Expires</div>
												<div className="mt-1 text-sm font-semibold text-slate-900">{formatMaybeDate(expiresAt)}</div>
											</div>
												{certificateUrl ? (
													<a
														href={String(certificateUrl)}
														target="_blank"
														rel="noreferrer"
														className="h-9 px-4 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex-shrink-0"
													>
														View certificate
													</a>
												) : steps.completed ? (
													<button
														type="button"
														onClick={() => void downloadCertificate()}
														disabled={downloadingCert}
														className="h-9 px-4 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex-shrink-0"
													>
														{downloadingCert ? 'Downloading…' : 'Download certificate'}
													</button>
												) : null}
										</div>
									</div>
								);
							})()}
						</div>
					</div>
				</div>

				<div className="space-y-6">
					<div className="bg-white rounded-3xl border border-slate-200 p-6">
						<div className="flex items-center justify-between">
							<div>
								<div className="text-sm font-extrabold text-slate-900">Activity</div>
								<div className="text-xs text-slate-500 mt-1">Signer-level events (audit log) + live SSE.</div>
							</div>
							<button
								type="button"
								onClick={() => (liveEnabled ? stopLive() : startLive())}
								className="h-9 px-4 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
							>
								{liveEnabled ? 'Stop live' : 'Start live'}
							</button>
						</div>

						<div className="mt-4 space-y-3 max-h-[60vh] overflow-auto">
							{Array.isArray(activity) && activity.length > 0 ? (
								activity.map((row: any) => (
									<div key={String(row.id || row.created_at || Math.random())} className="rounded-2xl border border-slate-200 p-3">
										<div className="text-xs text-slate-500">{formatMaybeDate(row.created_at)}</div>
										<div className="mt-1 flex items-center justify-between gap-2">
											<div className="text-sm font-semibold text-slate-900 truncate">{String(row.event || 'event')}</div>
											{row.new_status ? <StatusBadge label={normalizeFirmaStatusLabel(String(row.new_status))} /> : null}
										</div>
										{row.signer ? (
											<div className="mt-1 text-xs text-slate-700 truncate">
												Signer: <span className="font-semibold">{String(row.signer.name || row.signer.email || '')}</span>
												{row.signer.email ? <span className="text-slate-500"> · {String(row.signer.email)}</span> : null}
											</div>
										) : null}
										{row.message ? <div className="mt-1 text-xs text-slate-700 break-words">{String(row.message)}</div> : null}
									</div>
								))
							) : events.length > 0 ? (
								events.map((e, i) => (
									<div key={`${e.ts}-${i}`} className="rounded-2xl border border-slate-200 p-3">
										<div className="text-xs text-slate-500">{new Date(e.ts).toLocaleString()}</div>
										<div className="mt-1 text-sm font-semibold text-slate-900">{e.type}</div>
										{e.message ? <div className="mt-1 text-xs text-slate-700">{e.message}</div> : null}
									</div>
								))
							) : (
								<div className="text-sm text-slate-500">No activity yet.</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</DashboardLayout>
	);
}
