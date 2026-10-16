import './style.css';
import {
  loadDeployment, loadDemo, readContract, connectWallet, getWalletAddress,
  sendWrite, resumePending, getPending, txUrl,
} from './chain.js';

const app = document.querySelector('#app');
const sourceRepo = 'https://github.com/ytao7420-cmyk/genlayer-learning/tree/main/releaseproof';
const state = {
  mode: 'recorded', config: {}, demo: null, reviews: [], review: null, challenges: [],
  activeId: '', tab: 'findings', source: 'release', selectedRevision: 0, compareFrom: 1,
  loading: true, busy: false, wallet: '', status: null, notice: null, modal: null,
  formError: '', loadEpoch: 0, search: '', highlight: [],
  draft: { repo: 'fastify/fastify', tag: 'v5.0.0', commit_sha: '6bde7d7b0a51010d56df901cab9be5d9351b0d91', changelog_path: 'docs/Guides/Migration-Guide-V5.md', integration_context: 'We currently run a Fastify v4 application on Node.js 18 inside a Linux container. The application contains reply.redirect(301, url) calls. We intend to upgrade to Fastify v5.0.0. No other runtime, API, build, packaging, installation, deployment or operational configuration details have been supplied.' },
  challengeDraft: '',
};
const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  external: '<path d="M14 4h6v6m0-6L10 14M20 14v6H4V4h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  document: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m12-10v3c0 4-12 0-12 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6M2 17l10 6 10-6"/>',
  wallet: '<path d="M20 8H5a2 2 0 0 1 0-4h13v4M4 6v14h16V8m0 4h-5v4h5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  flag: '<path d="M5 21V3m0 1h13l-3 4 3 4H5"/>',
  compare: '<path d="M9 4H4v16h5m6-16h5v16h-5M12 2v20"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 4H4v12"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.document}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short = (value, front = 8, back = 6) => { const text = String(value || ''); return text.length > front + back + 3 ? `${text.slice(0, front)}…${back ? text.slice(-back) : ''}` : text; };
const disabled = condition => condition ? ' disabled' : '';
const label = value => ({ NEEDS_CHANGE: 'Changes required', UNKNOWN: 'Not established', NO_CHANGE: 'No change identified', CREATED: 'Sources needed', SNAPSHOTTED: 'Ready for review', ASSESSED: 'Reviewed', CHALLENGED: 'Challenge pending', PENDING: 'Pending', RESOLVED: 'Resolved', INITIAL: 'Initial review', CHALLENGE: 'Challenge review', UPHELD: 'Challenge upheld', REJECTED: 'Challenge rejected', INCONCLUSIVE: 'Inconclusive' }[value] || String(value || 'Not reviewed').replaceAll('_',' ').toLowerCase());
const pill = value => `<span class="pill ${String(value || '').toLowerCase().replace(/[^a-z_]/g,'')}"><i></i>${esc(label(value))}</span>`;
const errorText = err => String(err?.shortMessage || err?.message || err || 'The operation could not be completed.').slice(0, 850);
const safeUrl = value => { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const external = (url, text, cls = '') => safeUrl(url) ? `<a class="text-link ${cls}" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(text)} ${icon('external')}</a>` : `<span>${esc(text)}</span>`;
const transactionLink = (hash, text = 'View transaction') => hash ? external(txUrl(hash), text) : '';
const sameWallet = (a,b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
const creator = () => sameWallet(state.wallet, state.review?.creator);
const configured = () => Boolean(state.config.deployed && /^0x[0-9a-fA-F]{40}$/.test(state.config.address || ''));
const writable = () => state.mode === 'live' && configured() && state.wallet && !state.busy && !state.loading && !getPending();
const selected = () => (state.review?.revisions || []).find(r => Number(r.number) === Number(state.selectedRevision)) || state.review?.head;
const pendingChallenge = () => state.challenges.find(c => c.id === state.review?.pending_challenge_id);
const dateText = value => { try { const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value || '') : `${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})} · ${d.toISOString().slice(11,16)} UTC`; } catch { return String(value || ''); } };

function render() {
  app.innerHTML = `<header class="topbar"><a class="wordmark" href="#" data-action="home" aria-label="ReleaseProof home"><span class="brand-glyph">${icon('branch')}</span>Release<span>Proof</span><span class="beta">STUDIONET</span></a><nav class="top-nav" aria-label="Project links">${external(`${sourceRepo}/docs/architecture.md`,'How it works')}${external(sourceRepo,'Source code')}</nav><button class="button wallet" data-action="connect"${disabled(state.busy)}>${icon('wallet')}<span>${state.wallet ? esc(short(state.wallet,6,4)) : 'Connect MetaMask'}</span></button></header>
  <main class="workspace"><aside class="rail"><div class="rail-title"><span class="eyebrow">DEPENDENCY REVIEWS</span><span class="rail-count">${state.reviews.length.toString().padStart(2,'0')}</span></div><button class="button primary new-button" data-action="new"${disabled(state.busy || state.loading)}>New review ${icon('plus')}</button><label class="search-box">${icon('search')}<input type="search" id="review-search" aria-label="Search reviews" placeholder="Find repository…" value="${esc(state.search)}"></label><div id="review-list" class="review-list">${reviewList()}</div><div class="rail-footer"><span class="rail-orbit">${icon('shield')}</span><strong>Evidence before upgrade.</strong><p>A review can be challenged.<br>Its history cannot be rewritten.</p><div class="rail-network"><i></i>GENLAYER / 61999</div></div></aside>
  <section class="main-workbench"><div class="workspace-topline"><div><span class="breadcrumb">WORKSPACE</span><span class="slash">/</span><span>Release review</span></div><div class="mode-switch" role="group" aria-label="Data source"><button data-action="recorded" class="${state.mode === 'recorded' ? 'active' : ''}" aria-pressed="${state.mode === 'recorded'}"${disabled(state.busy)}>Recorded evidence</button><button data-action="live" class="${state.mode === 'live' ? 'active' : ''}" aria-pressed="${state.mode === 'live'}"${disabled(state.busy)}><i></i>Live contract</button></div></div>
  ${modeBanner()}<div id="notice">${noticeMarkup()}</div><div id="transaction-status">${statusMarkup()}</div>${recoveryBanner()}
  ${state.loading ? '<div class="loading-panel" role="status"><span class="spinner"></span><h1>Reading review records</h1><p>Loading source evidence and revision history…</p></div>' : state.review ? reviewPage() : emptyPage()}
  <footer class="workspace-footer"><span>ReleaseProof <span class="mono">/ v0.1</span></span><p>Advisory text analysis. Does not prove code safety, compatibility, or supply-chain integrity. No payments.</p>${state.config.address ? external(`${state.config.explorer}/address/${state.config.address}`,'Contract') : '<span>Deployment not configured</span>'}</footer></section></main>${modalMarkup()}`;
  if (state.modal) {
    const modal = document.querySelector('dialog');
    modal.showModal();
    modal.addEventListener('cancel', e => { if (state.busy) e.preventDefault(); else state.modal = null; });
  }
}
function modeBanner() {
  if (state.mode === 'recorded') return `<div class="mode-banner"><span class="archive-icon">${icon('clock')}</span><div><strong>Recorded chain evidence</strong><span>${state.demo ? `Archived ${esc(dateText(state.demo.recordedAt))}. ` : ''}Read-only; no transactions are sent. Demonstration actors are self-controlled, and integration scenarios are test data.</span></div><span class="read-only">READ ONLY</span></div>`;
  return `<div class="mode-banner live"><span class="archive-icon">${icon('layers')}</span><div><strong>${configured() ? 'Connected to live Studionet data' : 'Contract deployment is not configured'}</strong><span>${configured() ? 'All review context and challenge text becomes public on-chain. Use public or synthetic data only.' : 'Live actions are unavailable until a deployed contract is configured.'}</span></div><button class="icon-button" data-action="refresh" aria-label="Refresh live records"${disabled(state.busy || state.loading || !configured())}>${icon('refresh')}</button></div>`;
}
function noticeMarkup() { return state.notice ? `<div class="notice ${esc(state.notice.kind)}" role="${state.notice.kind === 'error' ? 'alert' : 'status'}"><p>${esc(state.notice.message)}</p><button class="icon-button" data-action="dismiss-notice" aria-label="Dismiss notification">${icon('close')}</button></div>` : ''; }
function statusMarkup() {
  if (!state.status) return '';
  return `<div class="transaction-status ${state.busy ? 'working' : ''}" role="status" aria-live="polite">${state.busy ? '<span class="spinner"></span>' : icon(state.status.status === 'error' ? 'flag' : 'check')}<div><strong>${state.busy ? 'Chain operation in progress' : state.status.status === 'error' ? 'Operation needs attention' : 'Latest chain operation'}</strong><p>${esc(state.status.message)}</p>${transactionLink(state.status.hash)}</div>${!state.busy ? '<button class="icon-button" data-action="dismiss-status" aria-label="Dismiss transaction status">' + icon('close') + '</button>' : ''}</div>`;
}
function updateStatus(progress) {
  state.status = typeof progress === 'string' ? {message:progress,status:'pending'} : progress;
  const target = document.querySelector('#transaction-status');
  if (target) target.innerHTML = statusMarkup();
  const modalTarget = document.querySelector('#modal-progress');
  if (modalTarget) modalTarget.innerHTML = statusMarkup();
}
function recoveryBanner() {
  const pending = getPending();
  if (!pending || state.busy) return '';
  return `<div class="recovery-banner"><div><strong>A previous transaction still needs confirmation.</strong><p>Resume checks its existing receipt and reads the resulting state. It does not send another transaction.</p>${transactionLink(pending.hash)}</div><button class="button secondary" data-action="resume">Resume transaction</button></div>`;
}
function reviewList() {
  const records = state.reviews.filter(r => `${r.repo} ${r.tag} ${r.id}`.toLowerCase().includes(state.search.toLowerCase()));
  if (!records.length) return `<div class="list-empty">${icon('document')}<p>${state.loading ? 'Loading reviews…' : state.search ? 'No matching repositories.' : 'No review records yet.'}</p></div>`;
  return records.map(r => `<button class="review-list-item ${r.id === state.activeId ? 'active' : ''}" data-action="select-review" data-id="${esc(r.id)}" aria-current="${r.id === state.activeId}"${disabled(state.busy)}><span class="item-top"><span class="repo-owner">${esc((r.repo || '').split('/')[0])}</span><span class="rev-label">R${Number(r.current_revision || 0)}</span></span><strong>${esc((r.repo || r.id).split('/').at(-1))}</strong><span class="item-bottom"><span class="tag mono">${esc(r.tag)}</span><span class="item-status">${esc(label(r.status))}</span></span></button>`).join('');
}
function emptyPage() {
  return `<div class="empty-state"><div class="empty-diagram"><span>${icon('code')}</span><i></i><span>${icon('shield')}</span><i></i><span>${icon('branch')}</span></div><span class="eyebrow">PIN. REVIEW. CHALLENGE.</span><h1>${state.mode === 'recorded' ? 'No archived reviews yet.' : 'Make the upgrade decision traceable.'}</h1><p>${state.mode === 'recorded' ? 'A completed on-chain workflow will appear here when its evidence archive is available. No review results have been invented.' : 'Pin a GitHub release and a source document to a commit. Ask validators what changes your integration requires, then preserve every challenge and revision.'}</p><button class="button primary" data-action="${state.mode === 'recorded' ? 'live' : 'new'}"${disabled(state.busy)}>${state.mode === 'recorded' ? 'Open live workspace' : 'Create first review'} ${icon('arrow')}</button></div>`;
}
function reviewPage() {
  const r = state.review;
  const rev = selected();
  return `<div class="review-header"><div><div class="review-kicker"><span class="eyebrow">${esc(r.repo?.split('/')[0] || 'REPOSITORY')}</span><span class="tiny-divider"></span><span class="mono">${esc(short(r.id))}</span>${state.mode === 'recorded' ? '<span class="archive-chip">ARCHIVE</span>' : ''}</div><h1>${esc(r.repo?.split('/').at(-1) || 'Dependency review')}<span class="release-tag">${esc(r.tag)}</span></h1><p>A dependency decision with sources you can inspect.</p></div><div class="header-outcome"><span class="eyebrow">CURRENT ASSESSMENT · R${Number(r.current_revision || 0)}</span>${pill(r.head?.verdict || r.status)}<span class="acknowledgement">${r.acknowledged_revision ? `${icon('check')} Creator acknowledged R${Number(r.acknowledged_revision)}` : 'No creator acknowledgement yet'}</span></div></div>
  ${workflow()}
  <div class="review-meta"><span>${icon('branch')}<span>Commit <strong class="mono" title="${esc(r.commit_sha)}">${esc(short(r.commit_sha,12,0).replace(/…$/,'…'))}</strong></span></span><span>${icon('wallet')}<span>Creator <strong class="mono" title="${esc(r.creator)}">${esc(short(r.creator,6,4))}</strong>${creator() ? ' · you' : ''}</span></span><span>${icon('layers')}<span>${r.revisions?.length || 0} immutable ${r.revisions?.length === 1 ? 'revision' : 'revisions'}</span></span></div>
  <div class="review-tabs" role="group" aria-label="Review view"><button data-action="tab" data-tab="findings" class="${state.tab === 'findings' ? 'active' : ''}" aria-pressed="${state.tab === 'findings'}">${icon('shield')}Consensus review</button><button data-action="tab" data-tab="sources" class="${state.tab === 'sources' ? 'active' : ''}" aria-pressed="${state.tab === 'sources'}">${icon('code')}Source evidence <span>${r.snapshot?.sources?.length || 0}</span></button><button data-action="tab" data-tab="history" class="${state.tab === 'history' ? 'active' : ''}" aria-pressed="${state.tab === 'history'}">${icon('branch')}Revision history <span>${r.revisions?.length || 0}</span></button><button data-action="tab" data-tab="transactions" class="${state.tab === 'transactions' ? 'active' : ''}" aria-pressed="${state.tab === 'transactions'}">${icon('layers')}Chain evidence</button></div>
  ${state.tab === 'sources' ? sourcePanel() : state.tab === 'history' ? historyPanel() : state.tab === 'transactions' ? transactionsPanel() : findingsPanel(rev)}`;
}
function workflow() {
  const r = state.review;
  const steps = [
    { name:'Pin sources', description:'Release + commit', done:Boolean(r.snapshot), action:'snapshot', available:!r.snapshot, button:'Capture sources' },
    { name:'Reach consensus', description:'Three review dimensions', done:Boolean(r.head), action:'assess', available:Boolean(r.snapshot) && !r.head, button:'Run consensus review' },
    { name:'Challenge & revise', description:'Reconsider frozen sources', done:r.revisions?.some(x=>x.kind==='CHALLENGE'), action:'challenge', available:!creator() && Boolean(r.head) && !r.pending_challenge_id && Number(r.current_revision)<4, button:'Challenge review' },
    { name:'Acknowledge', description:'Creator records the decision', done:Number(r.acknowledged_revision)>0 && r.acknowledged_revision===r.current_revision, action:'acknowledge', available:creator() && Boolean(r.head) && !r.pending_challenge_id && r.acknowledged_revision!==r.current_revision, button:'Acknowledge revision' },
  ];
  return `<div class="workflow">${steps.map((s,i)=>`<div class="workflow-step ${s.done ? 'complete' : ''}"><span class="step-number">${s.done ? icon('check') : String(i+1).padStart(2,'0')}</span><div><strong>${s.name}</strong><span>${s.description}</span>${state.mode==='live' && s.available ? `<button class="step-action" data-action="${s.action}"${disabled(!writable())}>${s.button} ${icon('arrow')}</button>` : ''}</div></div>`).join('')}</div>`;
}
function findingsPanel(rev) {
  const r = state.review;
  return `<div class="findings-layout"><section class="findings-main"><div class="section-header"><div><span class="eyebrow">VALIDATOR FINDINGS</span><h2>What does this upgrade change?</h2></div>${rev ? revisionSelector() : '<span class="mono subtle">NOT ASSESSED</span>'}</div>${rev && Number(rev.number)!==Number(r.current_revision) ? `<div class="historical-notice">Viewing historical revision R${Number(rev.number)}. Current revision is R${Number(r.current_revision)}. <button data-action="latest">View latest</button></div>` : ''}
  ${rev ? `<p class="consensus-scope">Validators independently agree on dimension statuses and challenge outcomes, and check that the proposed original-source citations support those decisions. Valid evidence may use different line selections. Explanations are leader-authored; their wording is not independently agreed.</p><div class="findings-list">${['runtime','api','deployment'].map((dim,i)=>findingRow((rev.items||[]).find(x=>x.dimension===dim),dim,i)).join('')}</div><div class="revision-footnote"><span>${icon('branch')}Revision ${Number(rev.number)} · ${esc(label(rev.kind))}</span><span class="mono" title="${esc(rev.digest)}">DIGEST ${esc(short(rev.digest))}</span></div>${rev.kind==='CHALLENGE' ? `<div class="resolution-note"><span class="eyebrow">CHALLENGE RESOLUTION</span><strong>${esc(label(rev.challenge_outcome))}</strong><p>${esc(rev.reason || 'No additional resolution reason was recorded.')}</p></div>` : ''}` : `<div class="awaiting-state">${icon('shield')}<h3>${r.snapshot ? 'Sources are ready for consensus.' : 'Start with a pinned source snapshot.'}</h3><p>${r.snapshot ? 'Validators will assess runtime, API, and deployment changes against the recorded integration context.' : 'The contract will fetch the official release and a document at the exact commit, storing source text and hashes.'}</p>${state.mode==='live' ? `<button class="button primary" data-action="${r.snapshot ? 'assess' : 'snapshot'}"${disabled(!writable())}>${r.snapshot ? 'Run consensus review' : 'Capture sources'}</button><small>Any connected wallet can ${r.snapshot ? 'start the initial assessment' : 'capture the sources'}.</small>` : ''}</div>`}
  ${challengeSection()}</section><aside class="context-panel"><div class="context-heading"><span class="eyebrow">RECORDED CONTEXT</span>${icon('document')}</div><h3>The integration being reviewed</h3><p class="context-copy">${esc(r.integration_context)}</p><div class="context-divider"></div><span class="eyebrow">SOURCE PROVENANCE</span><div class="provenance-mini"><span class="provenance-symbol">${icon('code')}</span><div><strong>${r.snapshot ? 'Snapshot captured' : 'Not captured yet'}</strong><span>${r.snapshot ? 'Release snapshot + commit-pinned document' : 'The review has no source evidence yet'}</span></div></div>${r.snapshot ? `<dl class="metadata-list"><div><dt>Release</dt><dd>${esc(r.snapshot.release?.tag_name || r.tag)}</dd></div><div><dt>Commit</dt><dd class="mono" title="${esc(r.snapshot.commit_sha || r.commit_sha)}">${esc(short(r.snapshot.commit_sha || r.commit_sha))}</dd></div><div><dt>Snapshot digest</dt><dd class="mono" title="${esc(r.snapshot.digest)}">${esc(short(r.snapshot.digest))}</dd></div></dl><button class="button full secondary" data-action="tab" data-tab="sources">Inspect source evidence ${icon('arrow')}</button>` : ''}<div class="scope-note">${icon('flag')}<p><strong>Scope matters.</strong> A source-backed text review is advisory. Run your own build, tests, and security review before upgrading.</p></div></aside></div>`;
}
function revisionSelector() {
  return `<label class="revision-select"><span class="sr-only">Displayed revision</span><select id="revision-select">${[...(state.review.revisions || [])].reverse().map(rev=>`<option value="${Number(rev.number)}"${Number(selected()?.number)===Number(rev.number)?' selected':''}>Revision ${Number(rev.number)}${Number(rev.number)===Number(state.review.current_revision)?' · latest':''}</option>`).join('')}</select></label>`;
}
function findingRow(item, dimension, i) {
  const titles = {runtime:'Runtime requirements',api:'API & integration changes',deployment:'Deployment assumptions'};
  return `<article class="finding-row"><div class="finding-index">0${i+1}</div><div class="finding-body"><div class="finding-title"><h3>${titles[dimension]}</h3>${pill(item?.status || 'UNKNOWN')}</div><p>${esc(item?.reason || 'No finding has been recorded for this dimension.')}</p>${item?.citations?.length ? `<div class="citations">${item.citations.map(c=>`<button class="citation" data-action="citation" data-source="${esc(c.source_id)}" data-lines="${esc((c.line_ids||[]).join(','))}" title="Inspect the cited source lines"><span class="citation-label">${icon('document')}${esc(c.source_id)} <b>${(c.line_ids||[]).map(x=>'L'+esc(x)).join(', ')}</b>${icon('arrow')}</span><q>${esc(c.quote)}</q></button>`).join('')}</div>` : '<span class="no-citation">No source citation recorded.</span>'}</div></article>`;
}
function challengeSection() {
  const r = state.review;
  const pending = pendingChallenge();
  if (pending) return `<section class="challenge-box pending-challenge"><div class="challenge-symbol">${icon('flag')}</div><div><span class="eyebrow">OPEN CHALLENGE · BASE R${Number(pending.base_revision)}</span><h3>A counterclaim is waiting for consensus.</h3><p>${esc(pending.explanation)}</p><span class="mono subtle">Challenger ${esc(short(pending.challenger))}</span>${state.mode==='live' ? `<button class="button primary" data-action="resolve" data-id="${esc(pending.id)}"${disabled(!writable())}>Resolve challenge ${icon('arrow')}</button>` : ''}</div></section>`;
  if (!r.head) return '';
  return `<section class="challenge-box"><div class="challenge-symbol">${icon('flag')}</div><div><span class="eyebrow">A REVIEW IS NOT THE LAST WORD</span><h3>Disagree with the evidence?</h3><p>A different wallet can challenge the current revision. Validators evaluate the counterclaim against the same frozen sources, then append a new revision.</p>${state.mode==='live' ? `<button class="button secondary" data-action="challenge"${disabled(!writable() || creator() || Number(r.current_revision)>=4)}>Challenge current revision ${icon('arrow')}</button><small>${creator() ? 'Use a different wallet. Creators cannot challenge their own review.' : Number(r.current_revision)>=4 ? 'This review has reached its revision limit.' : 'A challenge records your identity and its base revision on-chain.'}</small>` : '<span class="mono subtle">SWITCH TO LIVE TO PARTICIPATE</span>'}</div></section>`;
}
function sourcePanel() {
  const r = state.review;
  const sources = r.snapshot?.sources || [];
  if (!sources.length) return '<div class="awaiting-state">'+icon('code')+'<h2>No sources captured yet.</h2><p>Capture the official GitHub release and commit-pinned document before running consensus.</p></div>';
  const source = sources.find(s=>s.id===state.source) || sources[0];
  return `<section class="sources-view"><div class="section-header"><div><span class="eyebrow">FROZEN SOURCE SNAPSHOT</span><h2>Read what the validators read.</h2></div><span class="source-count">${sources.length} source documents</span></div><div class="source-provenance"><div><span class="eyebrow">ORIGIN</span>${external(source.url,`${r.repo} / ${source.id === 'release' ? 'GitHub release' : r.changelog_path}`)}</div><div><span class="eyebrow">PINNED COMMIT</span><code title="${esc(r.commit_sha)}">${esc(r.commit_sha)}</code></div><div><span class="eyebrow">SOURCE SHA-256</span><code title="${esc(source.sha256)}">${esc(source.sha256)}</code></div></div><div class="code-window"><div class="code-toolbar"><div class="source-tabs" role="group" aria-label="Source document">${sources.map(s=>`<button data-action="source" data-source="${esc(s.id)}" class="${s.id===source.id?'active':''}" aria-pressed="${s.id===source.id}">${icon(s.id==='release'?'document':'code')}${s.id==='release'?'Release notes':'Pinned source document'}</button>`).join('')}</div><span class="mono">${String(source.text||'').split('\n').length} lines</span></div>${state.highlight.length ? `<div class="line-highlight-notice">Highlighted citation: ${state.highlight.map(x=>'L'+esc(x)).join(', ')}<button data-action="clear-highlight">Clear</button></div>` : ''}<div class="source-lines" tabindex="0" aria-label="${esc(source.id)} source with line numbers">${String(source.text||'').split('\n').map((line,i)=>`<div class="source-line ${state.highlight.includes(i+1)?'highlighted':''}" id="source-line-${i+1}"><span class="line-number">${i+1}</span><code>${esc(line) || ' '}</code></div>`).join('')}</div></div><div class="source-footnote">${icon('shield')}The document text is frozen in the contract snapshot. External links may change; the stored text, hashes, and pinned commit preserve the reviewed evidence.</div></section>`;
}
function historyPanel() {
  const revisions = state.review.revisions || [];
  if (!revisions.length) return `<div class="awaiting-state">${icon('branch')}<h2>No revisions yet.</h2><p>Run an initial consensus review to establish the first revision.</p></div>`;
  const current = state.review.head || revisions.at(-1);
  const previous = revisions.find(x=>Number(x.number)===Number(state.compareFrom)) || revisions[0];
  return `<section class="history-view"><div class="section-header"><div><span class="eyebrow">APPEND-ONLY REVIEW HISTORY</span><h2>Changes remain visible.</h2></div><span class="source-count">${revisions.length} ${revisions.length===1?'revision':'revisions'}</span></div><div class="history-layout"><div class="timeline">${[...revisions].reverse().map(rev=>{const challenge=state.challenges.find(c=>c.id===rev.challenge_id);return `<article class="timeline-event"><span class="timeline-dot">${rev.kind==='INITIAL'?icon('shield'):icon('flag')}</span><div class="timeline-meta"><span class="mono">REVISION ${Number(rev.number)}</span>${pill(rev.verdict)}</div><h3>${esc(label(rev.kind))}${Number(rev.number)===Number(state.review.current_revision)?'<span class="latest-label">LATEST</span>':''}</h3>${challenge?`<div class="challenge-quote"><span class="eyebrow">COUNTERCLAIM</span><p>${esc(challenge.explanation)}</p><span class="mono">${esc(short(challenge.challenger))} · base R${Number(challenge.base_revision)}</span></div><p class="timeline-reason"><strong>${esc(label(rev.challenge_outcome))}.</strong> ${esc(rev.reason)}</p>`:'<p class="timeline-reason">The first assessment of the frozen sources and integration context.</p>'}<dl class="digest-list"><div><dt>Revision digest</dt><dd title="${esc(rev.digest)}">${esc(short(rev.digest,14,10))}</dd></div><div><dt>Parent digest</dt><dd title="${esc(rev.parent_digest)}">${esc(rev.parent_digest ? short(rev.parent_digest,14,10) : 'Initial revision')}</dd></div></dl><button class="text-button" data-action="view-revision" data-revision="${Number(rev.number)}">Inspect findings ${icon('arrow')}</button></article>`;}).join('')}</div><aside class="revision-comparison"><div class="comparison-header">${icon('compare')}<h3>Compare revisions</h3></div>${revisions.length<2?'<p class="muted-copy">A second revision is needed to compare changes. A challenge from another wallet can create one.</p>':`<div class="compare-select"><label>From<select id="compare-from">${revisions.filter(x=>Number(x.number)!==Number(current.number)).map(x=>`<option value="${Number(x.number)}"${Number(x.number)===Number(previous.number)?' selected':''}>Revision ${Number(x.number)}</option>`).join('')}</select></label>${icon('arrow')}<div><span>To</span><strong>R${Number(current.number)} · latest</strong></div></div>${['runtime','api','deployment'].map(dim=>{const a=previous.items?.find(x=>x.dimension===dim); const b=current.items?.find(x=>x.dimension===dim);const changed=a?.status!==b?.status || a?.reason!==b?.reason || JSON.stringify(a?.citations)!==JSON.stringify(b?.citations);return `<div class="compare-row"><div><strong>${dim==='api'?'API':dim[0].toUpperCase()+dim.slice(1)}</strong><span class="change-label ${changed?'changed':''}">${changed?'Updated':'Unchanged'}</span></div><span>${esc(label(a?.status))} ${icon('arrow')} ${esc(label(b?.status))}</span>${changed?`<p>${esc(b?.reason)}</p>`:''}</div>`;}).join('')}`}<div class="scope-note">${icon('branch')}<p>Revisions link to their parent digest. Resolving a challenge preserves the original assessment and its evidence.</p></div></aside></div></section>`;
}
function transactionsPanel() {
  const transactions = state.mode==='recorded' ? (state.demo?.transactions || []).filter(t=>!t.review_id || t.review_id===state.activeId) : [];
  return `<section class="transactions-view"><div class="section-header"><div><span class="eyebrow">AUDIT THE WORKFLOW</span><h2>Receipts, sources, and state.</h2></div>${external(`${state.config.explorer}/address/${state.config.address}`,'Open contract')}</div><div class="audit-summary"><div><span class="eyebrow">CONTRACT</span><code>${esc(state.config.address || state.demo?.contractAddress || 'Not configured')}</code></div><div><span class="eyebrow">NETWORK</span><strong>${esc(state.config.network || 'GenLayer Studionet')}</strong><span class="mono">Chain 61999 · testnet</span></div><div><span class="eyebrow">EVIDENCE MODE</span><strong>${state.mode==='recorded'?'Recorded receipts':'Live contract state'}</strong><span>${state.mode==='recorded'?esc(dateText(state.demo?.recordedAt)):'Read directly from the configured RPC'}</span></div></div>${transactions.length?`<div class="transaction-table"><div class="transaction-table-head"><span>OPERATION</span><span>RECORDED STATUS</span><span>TRANSACTION</span></div>${transactions.map((t,i)=>`<div class="transaction-row"><div><span class="tx-index">${String(i+1).padStart(2,'0')}</span><strong>${esc(String(t.method || t.action || t.label || 'Contract interaction').replaceAll('_',' '))}</strong></div><span class="mono tx-status">${esc(t.status || t.statusName || 'See receipt')}</span>${transactionLink(t.hash || t.transactionHash,short(t.hash || t.transactionHash))}</div>`).join('')}</div>`:`<div class="audit-empty">${icon('layers')}<p>${state.mode==='recorded'?'No transaction archive has been attached.':'Live mode shows contract state rather than reconstructing transaction history. Inspect the contract explorer, the latest transaction banner, or the recorded evidence archive.'}</p></div>`}<div class="audit-links">${external(`${sourceRepo}/public/evidence/demo.json`,'Read evidence archive')}${external(`${sourceRepo}/public/deployment.json`,'Deployment record')}${external(sourceRepo,'Read source and reproduction steps')}</div><p class="audit-disclaimer">Archive status labels reflect the time of recording. The explorer may show a newer status. Demonstration wallets are controlled by the project; these records do not establish independent adoption.</p></section>`;
}
function modalMarkup() {
  if (!state.modal) return '';
  const isNew=state.modal==='new';
  const isChallenge=state.modal==='challenge';
  const title=isNew?'Create a dependency review':isChallenge?'Challenge the current revision':'Acknowledge this revision';
  return `<dialog class="entry-dialog" aria-labelledby="dialog-title"><form id="entry-form"><div class="dialog-header"><div><span class="eyebrow">${isNew?'PIN THE EVIDENCE':isChallenge?'ON-CHAIN COUNTERCLAIM':'CREATOR ACKNOWLEDGEMENT'}</span><h2 id="dialog-title">${title}</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Close dialog"${disabled(state.busy)}>${icon('close')}</button></div><div class="dialog-body">${isNew ? newForm() : isChallenge ? challengeForm() : acknowledgementForm()}<div id="form-error" class="form-error" role="alert">${esc(state.formError)}</div><div id="modal-progress">${state.busy?statusMarkup():''}</div></div><div class="dialog-footer"><span>${icon('layers')}Public · Studionet · zero-value transaction</span><button type="submit" class="button primary"${disabled(state.busy || !writable())}>${state.busy?'<span class="spinner"></span>Processing…':isNew?'Create review':isChallenge?'Submit challenge':'Acknowledge R'+Number(state.review?.current_revision)}${!state.busy?icon('arrow'):''}</button></div></form></dialog>`;
}
function newForm() {
  return `<p class="dialog-intro">The repository, tag, commit and integration context are fixed at creation. The next step captures official source text for validators.</p><div class="form-grid"><label>GitHub repository<input name="repo" id="repo-input" required maxlength="180" placeholder="owner/repository" value="${esc(state.draft.repo)}"${disabled(state.busy)}><small>Public repository in owner/repository format.</small></label><label>Release tag<input name="tag" required maxlength="128" placeholder="v5.0.0" value="${esc(state.draft.tag)}"${disabled(state.busy)}></label></div><label>Exact commit SHA<input name="commit_sha" required pattern="[0-9a-fA-F]{40}" minlength="40" maxlength="40" class="mono" placeholder="40-character Git commit SHA" value="${esc(state.draft.commit_sha)}"${disabled(state.busy)}><small>Use the commit associated with the release being reviewed.</small></label><label>Source document path<input name="changelog_path" required maxlength="220" placeholder="docs/Guides/Migration-Guide-V5.md" value="${esc(state.draft.changelog_path)}"${disabled(state.busy)}><small>A text or Markdown document at that commit, such as an official migration guide.</small></label><label>Integration context<textarea name="integration_context" required minlength="30" maxlength="3000" rows="5" placeholder="State your runtime, APIs in use, and deployment assumptions…"${disabled(state.busy)}>${esc(state.draft.integration_context)}</textarea><small>Describe concrete behavior. Use only public or synthetic test details; this text is permanent and public.</small></label>`;
}
function challengeForm() {
  return `<div class="challenge-target"><span class="eyebrow">${esc(state.review?.repo)} · ${esc(state.review?.tag)}</span><strong>Challenging revision ${Number(state.review?.current_revision)}</strong><span class="mono">${esc(short(state.review?.head?.digest,16,12))}</span></div><p class="dialog-intro">Explain a specific error or omission using the frozen evidence. Validators will review this counterclaim and append a new revision. Submitting a challenge does not guarantee the verdict changes.</p><label>Counterclaim<textarea name="challenge" required minlength="20" maxlength="2000" rows="6" placeholder="Identify the disputed dimension and cite relevant source lines…"${disabled(state.busy)}>${esc(state.challengeDraft)}</textarea><small>Use a wallet different from the review creator. The claim and your address become public.</small></label>`;
}
function acknowledgementForm() {
  return `<div class="challenge-target"><span class="eyebrow">CURRENT REVISION</span><strong>${esc(state.review?.repo)} · ${esc(state.review?.tag)}</strong>${pill(state.review?.head?.verdict)}<span class="mono">R${Number(state.review?.current_revision)} · ${esc(short(state.review?.head?.digest,16,12))}</span></div><p class="dialog-intro">Record that the creator has read this exact revision. This is an acknowledgement of the review, not proof that an upgrade is safe or that code changes have been implemented. A later revision requires its own acknowledgement.</p>`;
}

function archiveReviews(data) {
  if (Array.isArray(data?.reviews)) return data.reviews;
  if (data?.review) return [data.review];
  if (Array.isArray(data?.state?.reviews)) return data.state.reviews;
  return [];
}
async function loadWorkspace(preferredId = state.activeId) {
  const epoch=++state.loadEpoch;
  state.loading=true;
  render();
  try {
    let records;
    if(state.mode==='recorded') {
      if(!state.demo) state.demo=await loadDemo();
      records=archiveReviews(state.demo);
    } else records=configured()?await readContract('get_reviews'):[];
    if(epoch!==state.loadEpoch) return;
    state.reviews=Array.isArray(records)?records:[];
    state.activeId=state.reviews.some(r=>r.id===preferredId)?preferredId:(state.reviews[0]?.id || '');
    if(state.activeId) await loadDetail(state.activeId,epoch); else {state.review=null;state.challenges=[];}
  } catch(err) {
    if(epoch!==state.loadEpoch) return;
    state.notice={kind:'error',message:errorText(err)};
    state.reviews=[];state.review=null;state.challenges=[];
  } finally {if(epoch===state.loadEpoch){state.loading=false;render();}}
}
async function loadDetail(id,epoch=state.loadEpoch) {
  let review, challenges;
  if(state.mode==='recorded') {
    review=archiveReviews(state.demo).find(r=>r.id===id);
    const all=Array.isArray(state.demo?.challenges)?state.demo.challenges:[];
    challenges=all.filter(c=>c.review_id===id);
    if(!challenges.length && Array.isArray(review?.challenges)) challenges=review.challenges;
  } else [review,challenges]=await Promise.all([readContract('get_review',[id]),readContract('get_challenges',[id])]);
  if(epoch!==state.loadEpoch) return;
  state.review=review;state.challenges=Array.isArray(challenges)?challenges:[];
  state.selectedRevision=Number(review?.current_revision || review?.head?.number || 0);
  state.compareFrom=1;
}
async function chooseReview(id) {
  const epoch=++state.loadEpoch;
  state.activeId=id;state.loading=true;state.highlight=[];render();
  try {await loadDetail(id,epoch);} catch(err) {if(epoch===state.loadEpoch){state.notice={kind:'error',message:errorText(err)};state.review=null;}}
  finally {if(epoch===state.loadEpoch){state.loading=false;render();}}
}
async function connect() {
  if(state.busy)return;
  state.busy=true;render();
  try {const value=await connectWallet();state.wallet=getWalletAddress() || value?.address || value;state.notice={kind:'info',message:'MetaMask connected to GenLayer Studio. Transactions use public test data.'};}
  catch(err){state.notice={kind:'error',message:errorText(err)};}
  finally{state.busy=false;render();}
}
async function perform(method,args,{newId}={}) {
  if(!writable()) throw new Error('Switch to Live, connect MetaMask, and resolve any pending transaction first.');
  state.busy=true;state.formError='';state.status={status:'signing',message:'Review the zero-value Studionet transaction in MetaMask.'};render();
  try {
    const result=await sendWrite(method,args,updateStatus);
    state.modal=null;
    state.status={status:'success',message:'Execution succeeded and contract state was verified.',hash:result?.hash || state.status?.hash};
    state.busy=false;
    await loadWorkspace(newId || state.activeId);
  } catch(err) {
    state.formError=errorText(err);
    state.status={status:'error',message:errorText(err),hash:state.status?.hash};
    state.busy=false;render();
  }
}
async function resume() {
  if(state.busy)return;
  state.busy=true;state.status={status:'pending',message:'Resuming the existing transaction. No new transaction is being sent.',hash:getPending()?.hash};render();
  try {const pending=await resumePending(updateStatus);state.status={status:'success',message:'Transaction completed and contract state was verified.',hash:pending?.hash || state.status?.hash};state.modal=null;state.mode='live';state.busy=false;await loadWorkspace();}
  catch(err){state.status={status:'error',message:errorText(err),hash:state.status?.hash};state.busy=false;render();}
}
function openModal(kind) {state.modal=kind;state.formError='';render();}
async function changeMode(mode) {state.mode=mode;state.notice=null;state.highlight=[];state.modal=null;await loadWorkspace();}

app.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');
  if(!target || target.disabled)return;
  const action=target.dataset.action;
  try {
    if(action==='home'){event.preventDefault();return;}
    if(action==='connect')return await connect();
    if(action==='recorded' || action==='live'){if(!state.busy)return await changeMode(action);return;}
    if(action==='refresh')return await loadWorkspace();
    if(action==='select-review')return await chooseReview(target.dataset.id);
    if(action==='dismiss-notice'){state.notice=null;document.querySelector('#notice').innerHTML='';return;}
    if(action==='dismiss-status'){state.status=null;document.querySelector('#transaction-status').innerHTML='';return;}
    if(action==='resume')return await resume();
    if(action==='new') {
      if(state.mode!=='live')await changeMode('live');
      if(!configured())throw new Error('A deployed contract is required to create a review.');
      if(!state.wallet)await connect();
      if(!state.wallet)return;
      if(getPending())throw new Error('Resume the pending transaction before creating another review.');
      return openModal('new');
    }
    if(action==='close-modal'){if(!state.busy){state.modal=null;render();}return;}
    if(action==='tab'){state.tab=target.dataset.tab;render();return;}
    if(action==='source'){state.source=target.dataset.source;state.highlight=[];render();return;}
    if(action==='clear-highlight'){state.highlight=[];render();return;}
    if(action==='citation'){
      state.source=target.dataset.source;state.highlight=String(target.dataset.lines).split(',').map(Number).filter(Number.isInteger);state.tab='sources';render();
      document.querySelector(`#source-line-${state.highlight[0]}`)?.scrollIntoView({block:'center',behavior:'smooth'});return;
    }
    if(action==='view-revision'){state.selectedRevision=Number(target.dataset.revision);state.tab='findings';render();return;}
    if(action==='latest'){state.selectedRevision=Number(state.review.current_revision);render();return;}
    if(action==='snapshot')return await perform('snapshot_sources',[state.activeId]);
    if(action==='assess')return await perform('assess',[state.activeId]);
    if(action==='challenge'){state.challengeDraft='';return openModal('challenge');}
    if(action==='acknowledge')return openModal('acknowledge');
    if(action==='resolve')return await perform('resolve_challenge',[target.dataset.id]);
  } catch(err) {state.notice={kind:'error',message:errorText(err)};render();}
});
app.addEventListener('input',event=>{
  const field=event.target;
  if(field.id==='review-search'){state.search=field.value;document.querySelector('#review-list').innerHTML=reviewList();}
  if(Object.hasOwn(state.draft,field.name))state.draft[field.name]=field.value;
  if(field.name==='challenge')state.challengeDraft=field.value;
});
app.addEventListener('change',event=>{
  if(event.target.id==='revision-select'){state.selectedRevision=Number(event.target.value);render();}
  if(event.target.id==='compare-from'){state.compareFrom=Number(event.target.value);render();}
});
app.addEventListener('submit',async event=>{
  if(event.target.id!=='entry-form')return;
  event.preventDefault();
  if(state.busy || !event.target.reportValidity())return;
  try {
    if(state.modal==='new') {
      const d=state.draft;
      if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(d.repo.trim()))throw new Error('Enter a GitHub repository in owner/repository format.');
      const id=crypto.randomUUID();
      await perform('create_review',[id,d.repo.trim(),d.tag.trim(),d.commit_sha.trim().toLowerCase(),d.changelog_path.trim(),d.integration_context.trim()],{newId:id});
    } else if(state.modal==='challenge')await perform('challenge',[state.activeId,crypto.randomUUID(),state.challengeDraft.trim(),Number(state.review.current_revision)]);
    else if(state.modal==='acknowledge')await perform('acknowledge_revision',[state.activeId,Number(state.review.current_revision)]);
  } catch(err){state.formError=errorText(err);render();}
});

async function init() {
  try {
    state.config=await loadDeployment();
    if(state.config.example){state.draft={...state.draft,...state.config.example};}
    state.wallet=getWalletAddress() || '';
    try {state.demo=await loadDemo();} catch {state.mode='live';}
    await loadWorkspace();
  } catch(err){state.loading=false;state.notice={kind:'error',message:errorText(err)};render();}
}
render();
init();
