import { backend } from './backend.js';
import { createEngine, COLOURS, HANDS, makeSampleWall, EXAMPLE_BETA } from './engine.js';
import { GRADES, STYLES, GOALS } from '../shared/prompt.js';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const haptic = () => { try { navigator.vibrate?.(8); } catch {} };

const ACCENTS = [
  { n: 'Tape orange', c: '#ff5a1f' }, { n: 'Electric', c: '#2f5bff' }, { n: 'Hot pink', c: '#e3237f' },
  { n: 'Violet', c: '#7b3ff2' }, { n: 'Emerald', c: '#0d9a55' }, { n: 'Ruby', c: '#d91f2b' }
];
const HEIGHTS = ['Under 160 cm', '160–170 cm', '170–180 cm', '180–190 cm', 'Over 190 cm'];
const GOAL_ICONS = { harder: '📈', technique: '🎯', fun: '🙌', comp: '🏆' };
const DRILLS = {
  Crimps:      { i: '🤏', t: 'Crimp ladders', d: 'Pick an easy problem with crimps and climb it 3 times, thumb locked over the index finger. Rest 3 minutes between goes.' },
  Slab:        { i: '🧱', t: 'Silent feet on slab', d: 'Climb two easy slabs placing every foot without a sound. Look at each foothold until your toe is on it.' },
  Overhang:    { i: '⛰️', t: 'Toes on, hips in', d: 'On a steep wall, pause on each move and pull your toes into the holds. If a foot cuts, re-place it before moving on.' },
  Dynos:       { i: '🚀', t: 'Deadpoint drill', d: 'Pick a hold just out of reach and catch it at the top of your jump, the moment you stop rising. Ten catches, then rest.' },
  Slopers:     { i: '🫳', t: 'Low hips on slopers', d: 'Hang off slopers with straight arms and hips low under the hold. Count to five on each hold before moving.' },
  Pinches:     { i: '🦀', t: 'Pinch circuits', d: 'Link four or five pinches on an easy wall, squeezing with your thumb. Climb it twice each session.' },
  'Heel hooks':{ i: '🦶', t: 'Heel hook isolation', d: 'On a steep problem, place a heel and pull with your hamstring to lift a hand off. Hold for three seconds.' },
  Mantles:     { i: '🙆', t: 'Mantle practice', d: 'Find a volume or top-out and practise pressing down with one palm, then the other, before rocking a foot up.' }
};
const GENERAL_DRILLS = ['Slab', 'Overhang', 'Crimps'];

function toast(t) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = t;
  document.body.append(d); setTimeout(() => d.remove(), 2600);
}
function confetti() {
  if (reduceMotion) return;
  const cv = $('#confetti'), c = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
  const cols = [getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff5a1f', '#f2c21b', '#2367c9', '#2e9e4a', '#e35d9c', '#0f1419'];
  const ps = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - .5) * 80, y: H * .45, vx: (Math.random() - .5) * 14, vy: -Math.random() * 15 - 5, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  (function f(t) {
    c.clearRect(0, 0, W, H);
    ps.forEach(p => { p.vy += .45; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.c; c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); c.restore(); });
    if (t - t0 < 2200) requestAnimationFrame(f); else c.clearRect(0, 0, W, H);
  })(t0);
}
function openSheet(html, mount) {
  closeSheet();
  const back = document.createElement('div'); back.className = 'sheet-back'; back.id = 'sheetBack';
  const s = document.createElement('div'); s.className = 'sheet'; s.id = 'sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
  s.innerHTML = `<div class="grab"></div>` + html;
  back.onclick = closeSheet; document.body.append(back, s);
  mount?.(s);
}
function closeSheet() { $('#sheet')?.remove(); $('#sheetBack')?.remove(); }
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
function setAccent(c) {
  document.documentElement.style.setProperty('--accent', c);
  eng.accent = c; if (engineReady) draw();
}
const initial = n => (n || '?').trim().slice(0, 1).toUpperCase();
function paintAvatar(el) {
  el.textContent = '';
  if (backend.mode === 'demo' && backend.claudeUser?.avatarUrl && !LS.get('bl.demoUser', {}).typed) {
    const i = document.createElement('img'); i.src = backend.claudeUser.avatarUrl; i.alt = ''; el.append(i);
  } else el.textContent = initial(profile?.name);
}

/* ================= state ================= */
let profile = null, climbs = [], tab = 'home', engineReady = false;
let currentClimbId = null, ctl = null, qctl = null, climbFilter = 'all';
const eng = createEngine();
const view = $('#view');
const draw = () => eng.render(view, true);
const scan = { colour: 'yellow', grade: 'V3' };

/* ================= screens ================= */
const SCREENS = ['splash', 'welcome', 'auth', 'setup', 'app'];
function show(id) { SCREENS.forEach(s => $('#' + s).hidden = s !== id); $('#tabbar').hidden = id !== 'app'; scrollTo(0, 0); }

/* ---------- boot ---------- */
(async function boot() {
  let g = ''; for (let y = 12; y < 300; y += 24) for (let x = 12; x < 300; x += 24) g += `<circle cx="${x}" cy="${y}" r="1.6"/>`;
  $('#dotgrid').innerHTML = g;
  setAccent(LS.get('bl.accent', '#ff5a1f'));
  const minTime = new Promise(r => setTimeout(r, reduceMotion ? 800 : 3200));
  const skip = new Promise(r => $('#splash').addEventListener('click', r, { once: true }));
  await backend.init();
  await Promise.race([minTime, skip]);
  backend.onAuth(s => { if (s && (!$('#auth').hidden || !$('#splash').hidden)) route(); });
  await route();
  const qs = new URLSearchParams(location.search);
  if (qs.get('upgraded')) { history.replaceState(null, '', location.pathname); setTimeout(() => { confetti(); toast('Welcome to Pro. Unlimited beta unlocked.'); }, 400); }
  if ('serviceWorker' in navigator && backend.mode === 'live') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();

async function route() {
  if (!LS.get('bl.welcomed', false)) return showWelcome();
  if (!backend.isSignedIn()) return showAuth();
  try { profile = await backend.getProfile(); }
  catch { toast("Couldn't load your profile. Check your connection."); profile = await backend.getProfileFallback?.() || { name: '', grade: 'V3', accent: '#ff5a1f', strengths: [], weaknesses: [], onboarded: false, plan: 'free', scansUsed: 0, freeScans: 5, height: '170–180 cm', feetOnRoute: true, goal: 'technique', homeGym: '' }; }
  setAccent(profile.accent); LS.set('bl.accent', profile.accent);
  if (!profile.onboarded) return showSetup();
  enterApp();
}

/* ---------- welcome ---------- */
const slides = $('#slides'); let slideI = 0;
function showWelcome() { slides.scrollLeft = 0; slideI = 0; syncDots(); show('welcome'); }
slides.addEventListener('scroll', () => { const i = Math.round(slides.scrollLeft / slides.clientWidth); if (i !== slideI) { slideI = i; syncDots(); } }, { passive: true });
function syncDots() { [...$('#dots').children].forEach((d, i) => d.classList.toggle('on', i === slideI)); $('#welcomeNext').textContent = slideI === 2 ? "Let's go" : 'Next'; }
function finishWelcome() { LS.set('bl.welcomed', true); haptic(); route(); }
$('#welcomeNext').onclick = () => { haptic(); if (slideI >= 2) return finishWelcome(); slides.scrollTo({ left: (slideI + 1) * slides.clientWidth, behavior: 'smooth' }); };
$('#welcomeSkip').onclick = finishWelcome;

/* ---------- auth ---------- */
const GOOGLE_SVG = '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>';
function showAuth() {
  const card = $('#authCard');
  if (backend.mode === 'live') {
    card.innerHTML = `
      <div class="field"><label class="lbl" for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"></div>
      <button class="btn primary wide" id="emailBtn" type="button">Email me a sign-in link</button>
      <div class="divider">or</div>
      <button class="btn wide" id="googleBtn" type="button">${GOOGLE_SVG}Continue with Google</button>
      <p class="err" id="authErr" hidden></p>`;
    $('#authFine').innerHTML = 'By continuing you agree to our <a href="/terms.html">Terms</a> and <a href="/privacy.html">Privacy Policy</a>.';
    const fail = m => { const e = $('#authErr'); e.hidden = false; e.textContent = m; };
    $('#emailBtn').onclick = async () => {
      const email = $('#email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.');
      $('#emailBtn').disabled = true; $('#emailBtn').textContent = 'Sending…';
      try {
        await backend.signInEmail(email);
        card.innerHTML = `<div class="sent-box"><div class="big">📬</div><h2>Check your inbox</h2><p class="muted">We sent a sign-in link to <b>${esc(email)}</b>. Open it on this phone and you'll land straight back here.</p><button class="btn ghost" id="diffEmail" type="button">Use a different email</button></div>`;
        $('#diffEmail').onclick = showAuth;
      } catch (e) { fail(e.message || "Couldn't send the link. Try again."); $('#emailBtn').disabled = false; $('#emailBtn').textContent = 'Email me a sign-in link'; }
    };
    $('#email').addEventListener('keydown', e => { if (e.key === 'Enter') $('#emailBtn').click(); });
    $('#googleBtn').onclick = async () => { try { await backend.signInGoogle(); } catch (e) { fail(e.message || "Google sign-in isn't set up yet."); } };
  } else {
    const cu = backend.claudeUser;
    card.innerHTML = `
      ${cu?.name ? `<button class="btn primary wide" id="claudeBtn" type="button"><img class="claude-avatar" alt="" src="${esc(cu.avatarUrl)}">Continue as ${esc(cu.name)}</button><div class="divider">or</div>` : ''}
      <div class="field"><label class="lbl" for="demoName">Your first name</label><input class="input" id="demoName" type="text" autocomplete="given-name" placeholder="e.g. Sam"></div>
      <button class="btn ${cu?.name ? '' : 'primary'} wide" id="demoBtn" type="button">Start climbing</button>
      <p class="err" id="authErr" hidden></p>`;
    $('#authFine').textContent = 'Test mode. Your profile stays on this device.';
    if ($('#claudeBtn')) $('#claudeBtn').onclick = () => { backend.demoSignIn(cu.name); haptic(); route(); };
    $('#demoBtn').onclick = () => {
      const n = $('#demoName').value.trim();
      if (!n) { const e = $('#authErr'); e.hidden = false; e.textContent = 'Add your name to continue.'; return; }
      LS.set('bl.demoUser', { name: n, typed: true }); LS.set('bl.profile', { ...LS.get('bl.profile', {}), name: n }); haptic(); route();
    };
    $('#demoName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#demoBtn').click(); });
  }
  show('auth');
}

/* ---------- setup quiz ---------- */
let draft = null, stepI = 0;
const STEPS = [
  { title: 'What should we call you?', sub: "This is how your coach will greet you.",
    html: () => `<input class="input" id="sName" type="text" autocomplete="given-name" placeholder="Your first name" value="${esc(draft.name)}">`,
    mount: () => { const i = $('#sName'); i.focus(); i.oninput = () => { draft.name = i.value.trim(); syncNext(); }; i.onkeydown = e => { if (e.key === 'Enter' && draft.name) next(); }; },
    valid: () => !!draft.name },
  { title: 'Where do you usually climb?', sub: 'Your home wall. You can skip this.', optional: true,
    html: () => `<input class="input" id="sGym" type="text" placeholder="e.g. The Depot, Leeds" value="${esc(draft.homeGym)}">`,
    mount: () => { const i = $('#sGym'); i.oninput = () => { draft.homeGym = i.value.trim(); }; i.onkeydown = e => { if (e.key === 'Enter') next(); }; } },
  { title: 'What grade are you climbing right now?', sub: 'Pick the grade you can usually send in a session or two.',
    html: () => `<div class="grade-grid">${GRADES.map(g => `<button class="chip acc grade-chip" type="button" data-v="${g}" aria-pressed="${draft.grade === g}">${g}</button>`).join('')}</div>`,
    mount: () => pick('.grade-grid .chip', v => draft.grade = v), valid: () => !!draft.grade },
  { title: 'How tall are you?', sub: 'Reach changes the beta, so moves get tailored to you.',
    html: () => `<div class="opt-list">${HEIGHTS.map(h => `<button class="opt" type="button" data-v="${h}" aria-pressed="${draft.height === h}"><span class="ico">📏</span><b>${h}</b></button>`).join('')}</div>`,
    mount: () => pick('.opt', v => draft.height = v), valid: () => !!draft.height },
  { title: 'What are you good at?', sub: 'Pick as many as you like.', optional: true,
    html: () => `<div class="chips">${STYLES.map(s => `<button class="chip acc" type="button" data-v="${s}" aria-pressed="${draft.strengths.includes(s)}">${s}</button>`).join('')}</div>`,
    mount: () => multi('.chips .chip', 'strengths') },
  { title: 'What do you want to get better at?', sub: 'Your coach tips and beta will focus on these.', optional: true,
    html: () => `<div class="chips">${STYLES.map(s => `<button class="chip acc" type="button" data-v="${s}" aria-pressed="${draft.weaknesses.includes(s)}">${s}</button>`).join('')}</div>`,
    mount: () => multi('.chips .chip', 'weaknesses') },
  { title: "What's your main goal?", sub: 'We shape every bit of beta around it.',
    html: () => `<div class="opt-list">${Object.entries(GOALS).map(([k, v]) => `<button class="opt" type="button" data-v="${k}" aria-pressed="${draft.goal === k}"><span class="ico">${GOAL_ICONS[k]}</span><span><b>${v}</b></span></button>`).join('')}</div>`,
    mount: () => pick('.opt', v => draft.goal = v), valid: () => !!draft.goal },
  { title: 'Pick your colour', sub: 'Make the app yours. Change it any time.',
    html: () => `<div class="swatch-grid">${ACCENTS.map(a => `<button class="swatch" type="button" data-v="${a.c}" aria-pressed="${draft.accent === a.c}"><i style="background:${a.c}"></i>${a.n}</button>`).join('')}</div>`,
    mount: () => pick('.swatch', v => { draft.accent = v; setAccent(v); }) }
];
function pick(sel, set) {
  document.querySelectorAll('#setup ' + sel).forEach(b => b.onclick = () => {
    haptic(); set(b.dataset.v);
    document.querySelectorAll('#setup ' + sel).forEach(x => x.setAttribute('aria-pressed', x === b));
    syncNext();
  });
}
function multi(sel, key) {
  document.querySelectorAll('#setup ' + sel).forEach(b => b.onclick = () => {
    haptic(); const v = b.dataset.v, arr = draft[key];
    const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v);
    b.setAttribute('aria-pressed', arr.includes(v));
  });
}
function syncNext() { const s = STEPS[stepI], b = $('#setupNext'); if (b) b.disabled = s.valid ? !s.valid() : false; }
function showSetup() {
  draft = { ...profile, strengths: [...(profile.strengths || [])], weaknesses: [...(profile.weaknesses || [])] };
  if (!draft.name && backend.claudeUser?.name) draft.name = backend.claudeUser.name;
  stepI = 0; renderStep(); show('setup');
}
function renderStep() {
  const s = STEPS[stepI], el = $('#setup');
  el.innerHTML = `
    <div class="topbar"><button class="btn ghost small" id="setupBack" type="button" ${stepI === 0 ? 'style="visibility:hidden"' : ''}>← Back</button>
      <div class="progress" aria-label="Step ${stepI + 1} of ${STEPS.length}"><i style="width:${((stepI + 1) / STEPS.length) * 100}%"></i></div>
      <button class="btn ghost small" id="setupSkip" type="button" ${s.optional ? '' : 'style="visibility:hidden"'}>Skip</button></div>
    <div class="q"><p class="kicker">${stepI + 1} of ${STEPS.length}</p><h1>${s.title}</h1><p class="sub">${s.sub}</p>${s.html()}</div>
    <div class="setup-foot"><button class="btn primary" id="setupNext" type="button">${stepI === STEPS.length - 1 ? 'Finish' : 'Continue'}</button></div>`;
  $('#setupBack').onclick = () => { if (stepI > 0) { stepI--; renderStep(); } };
  $('#setupSkip').onclick = next;
  $('#setupNext').onclick = next;
  s.mount?.(); syncNext();
}
function next() {
  haptic();
  const s = STEPS[stepI]; if (s.valid && !s.valid()) return;
  if (stepI < STEPS.length - 1) { stepI++; renderStep(); return; }
  const el = $('#setup');
  el.innerHTML = `<div class="done"><div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <h1>You're all set, ${esc(draft.name)}</h1><p class="muted">Beta gets tuned to ${esc(draft.grade)}, ${esc(draft.height)}${draft.weaknesses.length ? `, with extra help on ${esc(draft.weaknesses.slice(0, 2).join(' and ').toLowerCase())}` : ''}.</p></div>
    <button class="btn primary wide" id="doneBtn" type="button">Start climbing</button>`;
  confetti();
  $('#doneBtn').onclick = async () => {
    $('#doneBtn').disabled = true;
    profile = { ...profile, ...draft, onboarded: true };
    LS.set('bl.accent', profile.accent);
    try { await backend.saveProfile(profile); } catch { toast("Couldn't save your profile. We'll try again later."); }
    enterApp();
  };
}

/* ---------- app shell ---------- */
async function enterApp() {
  show('app');
  $('#demoBanner').hidden = backend.mode !== 'demo';
  paintHeader();
  scan.grade = profile.grade; $('#feetToggle').checked = profile.feetOnRoute;
  if (!engineReady) bootEngine();
  try { climbs = await backend.listClimbs(); } catch { climbs = []; }
  setTab('home');
}
function paintHeader() {
  paintAvatar($('#avatarBtn'));
  const pill = $('#planPill');
  pill.className = 'plan-pill' + (profile.plan === 'pro' ? ' pro' : '');
  pill.textContent = profile.plan === 'pro' ? 'Pro' : profile.plan === 'demo' ? 'Test' : 'Free';
}
function setTab(t) {
  tab = t; haptic();
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t ? 'page' : 'false'));
  ['home', 'scan', 'climbs', 'tips', 'me'].forEach(x => $('#pane-' + x).hidden = x !== t);
  if (t === 'home') renderHome();
  if (t === 'climbs') renderClimbs();
  if (t === 'tips') renderCoach();
  if (t === 'me') renderMe();
  if (t === 'scan') { buildScanChips(); syncAsk(); }
  scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
$('#avatarBtn').onclick = () => setTab('me');

/* ---------- home ---------- */
const scansLeft = () => Math.max(0, (profile.freeScans || 5) - (profile.scansUsed || 0));
function stats() {
  const sent = climbs.filter(c => c.sent);
  const top = sent.reduce((m, c) => Math.max(m, GRADES.indexOf(c.grade)), -1);
  return { scanned: climbs.length, sent: sent.length, top: top >= 0 ? GRADES[top] : '–' };
}
function todaysDrill() {
  const pool = profile.weaknesses?.length ? profile.weaknesses : GENERAL_DRILLS;
  const day = Math.floor(Date.now() / 864e5);
  const k = pool[day % pool.length]; return { k, ...DRILLS[k] };
}
function renderHome() {
  const h = new Date().getHours(), hi = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  const s = stats(), d = todaysDrill();
  const pane = $('#pane-home');
  pane.innerHTML = `
    <div class="greet"><h1>${hi}, ${esc(profile.name || 'climber')}</h1><p>${profile.homeGym ? esc(profile.homeGym) + ' · ' : ''}Climbing ${esc(profile.grade)}</p></div>
    <div class="hero">
      <svg class="holds" viewBox="0 0 110 110" aria-hidden="true"><polyline points="20,95 60,80 35,55 75,35 55,12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/><g fill="#fff"><circle cx="20" cy="95" r="6"/><circle cx="60" cy="80" r="6"/><circle cx="35" cy="55" r="7"/><circle cx="75" cy="35" r="6"/><circle cx="55" cy="12" r="8"/></g></svg>
      <h2>Stuck on a problem?</h2><p>Snap it, pick the colour, and get beta built for your ${esc(profile.grade)} game.</p>
      <button class="btn" id="heroScan" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>Scan a climb</button>
    </div>
    <div class="stats">
      <div class="stat"><b data-count="${s.scanned}">0</b><span>Scanned</span></div>
      <div class="stat"><b data-count="${s.sent}">0</b><span>Sent</span></div>
      <div class="stat"><b>${s.top}</b><span>Top send</span></div>
    </div>
    ${profile.plan === 'free' ? `<div class="plan-card"><div class="meter"><b>${scansLeft()} of ${profile.freeScans} free scans left</b><div class="bar"><i style="width:${(scansLeft() / profile.freeScans) * 100}%"></i></div></div><button class="btn" id="homePro" type="button">Go Pro</button></div>` : ''}
    <div class="card tip"><span class="ico">${d.i}</span><div><p class="lbl">Today's drill · ${esc(d.k)}</p><h3 style="font-size:18px;margin:4px 0">${esc(d.t)}</h3><p class="muted">${esc(d.d)}</p></div></div>
    <div class="section-h"><h3>Recent climbs</h3>${climbs.length ? '<button class="link" id="seeAll" type="button">See all</button>' : ''}</div>
    ${climbs.length ? `<div class="recent">${climbs.slice(0, 8).map(c => `<button type="button" data-id="${esc(c.id)}"><img alt="" src="${esc(c.imageUrl)}"><span class="cap"><span class="cdot" style="background:${COLOURS[c.colour]?.sw || '#ccc'}"></span>${esc(c.grade)}${c.sent ? ' · Sent' : ''}</span></button>`).join('')}</div>`
      : `<div class="card empty" style="padding:24px"><p>Your scanned climbs will show up here.</p><button class="btn soft" id="tryExample" type="button">Try the example wall</button></div>`}`;
  $('#heroScan').onclick = () => { setTab('scan'); $('#camIn').click(); };
  $('#homePro')?.addEventListener('click', () => openPaywall());
  $('#seeAll')?.addEventListener('click', () => setTab('climbs'));
  $('#tryExample')?.addEventListener('click', () => setTab('scan'));
  pane.querySelectorAll('.recent button').forEach(b => b.onclick = () => openClimb(climbs.find(c => String(c.id) === b.dataset.id)));
  pane.querySelectorAll('[data-count]').forEach(el => countUp(el, +el.dataset.count));
}
function countUp(el, to) {
  if (reduceMotion || to < 2) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 700;
  (function f(t) { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(t0);
}

/* ---------- scan ---------- */
function bootEngine() {
  const wall = makeSampleWall(); eng.load(wall, wall.width, wall.height);
  eng.beta = EXAMPLE_BETA.moves.every(m => m.hold <= eng.holds.length) ? { ...EXAMPLE_BETA } : null;
  engineReady = true; updateCount(); renderBeta(); draw();
}
function updateCount() {
  const nm = COLOURS[eng.colour].name.toLowerCase(), n = eng.holds.length;
  $('#holdCount').textContent = n ? `${n} ${nm} hold${n > 1 ? 's' : ''}` : `No ${nm} holds found`;
}
function buildScanChips() {
  const sw = $('#swatches'); sw.innerHTML = '';
  Object.entries(COLOURS).forEach(([k, v]) => {
    const b = document.createElement('button'); b.className = 'chip colour'; b.type = 'button'; b.setAttribute('aria-pressed', k === eng.colour);
    b.innerHTML = `<span class="dot" style="background:${v.sw}"></span>${v.name}`;
    b.onclick = () => { haptic(); eng.colour = k; onDetectChange(); buildScanChips(); };
    sw.append(b);
  });
  const gr = $('#grades'); gr.innerHTML = '';
  GRADES.forEach(g => {
    const b = document.createElement('button'); b.className = 'chip acc grade-chip'; b.type = 'button'; b.textContent = g; b.setAttribute('aria-pressed', g === scan.grade);
    b.onclick = () => { haptic(); scan.grade = g; buildScanChips(); syncAsk(); };
    gr.append(b);
  });
}
function onDetectChange() { eng.detect(); eng.beta = null; eng.sel = -1; currentClimbId = null; updateCount(); renderBeta(); draw(); syncAsk(); }
function syncAsk() {
  const btn = $('#askBtn'), B = eng.beta;
  btn.textContent = B && !B.example && B.grade !== scan.grade ? `Re-read for ${scan.grade}` : B && !B.example ? 'Read it again' : 'Read the beta';
  btn.disabled = !eng.holds.length || !!ctl;
}
$('#tol').oninput = e => { eng.tol = +e.target.value; onDetectChange(); };
view.addEventListener('click', e => {
  const r = view.getBoundingClientRect();
  if (eng.toggleAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)) { haptic(); draw(); }
});
function useFile(f) {
  if (!f) return;
  if (tab !== 'scan') setTab('scan');
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    eng.load(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(url);
    $('#srcBadge').textContent = 'Your photo'; eng.beta = null; eng.sel = -1; currentClimbId = null;
    updateCount(); renderBeta(); draw(); syncAsk(); setStatus(eng.holds.length ? 'Check the highlighted holds, then read the beta.' : 'No holds of that colour found. Try another colour or loosen the colour match.');
    view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  im.onerror = () => setStatus("That file couldn't be opened as a photo. Try a JPEG or PNG.", true);
  im.src = url;
}
$('#camIn').onchange = e => { useFile(e.target.files[0]); e.target.value = ''; };
$('#libIn').onchange = e => { useFile(e.target.files[0]); e.target.value = ''; };

function setStatus(t, err) { const s = $('#status'); s.className = 'status' + (err ? ' err' : ''); s.textContent = t; }
function setBusy(on, stop) {
  $('#scanline').hidden = !on;
  const s = $('#status');
  if (on) { s.className = 'status'; s.innerHTML = '<span class="busy"><span class="pulse"></span><span>Reading the wall… this can take up to a minute.</span><button class="btn small" type="button" id="stopBtn">Stop</button></span>'; $('#stopBtn').onclick = stop; }
  else s.textContent = '';
}
const ERR = {
  limit: "You've used all your free scans this month.",
  not_granted: "AI isn't allowed in this view. Colour isolation still works.",
  sampling_disabled: "AI isn't available on this account.",
  rate_limited: "Too many requests right now. Try again in a minute.",
  image_rejected: "That photo couldn't be read. Try another.",
  invalid_json: "The answer came back garbled. Tap the button to try again.",
  refused: "We couldn't read beta from this photo. Try a clearer shot of the whole problem.",
  auth: 'Your session ended. Sign in again.',
  no_ai: 'AI beta switches on once the app is live (or open this test link in the Claude app).'
};
const errText = e => ERR[e?.code] || e?.message || "Couldn't reach the coach just now. Try again.";

function betaHTML(B, interactive) {
  const tag = interactive ? 'button' : 'div';
  const steps = B.moves.map((m, i) => `<li><${tag} class="step" ${interactive ? `type="button" data-i="${i}" aria-current="${i === eng.sel}"` : ''} style="animation-delay:${i * 40}ms"><span class="n">${i + 1}</span><span class="limb ${HANDS.has(m.limb) ? 'h' : 'f'}">${m.limb}</span><span>${esc(m.cue)}<br><span class="hold">hold ${m.hold}</span></span></${tag}></li>`).join('');
  return `<h2>The beta <span class="pill">${B.example ? 'Example · V3' : esc(B.grade)}</span></h2><p>${esc(B.read)}</p>
    ${interactive ? '<div class="legend"><span>LH / RH / BH = hands</span><span>LF / RF = feet</span><span>Tap a step to find it</span></div>' : ''}
    ${B.moves.length ? `<ol class="steps">${steps}</ol>` : ''}
    ${B.cruxes?.length ? `<p class="sub-h">Crux</p><ul class="list">${B.cruxes.map(c => `<li><b>Hold ${c.hold}:</b> ${esc(c.fix)}</li>`).join('')}</ul>` : ''}
    ${B.if_struggling?.length ? `<p class="sub-h">If you're struggling</p><ul class="list">${B.if_struggling.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${B.grade_note ? `<p class="sub-h">For your grade</p><p>${esc(B.grade_note)}</p>` : ''}`;
}
function renderBeta() {
  const el = $('#beta'), B = eng.beta;
  $('#followup').hidden = !B || B.example || !backend.aiAvailable;
  if (!B) { el.hidden = true; return; }
  el.hidden = false;
  const c = climbs.find(x => x.id === currentClimbId);
  el.innerHTML = betaHTML(B, true) + (B.example
    ? `<p class="muted" style="font-size:14px">This is an example. Scan your own problem to get beta for you.</p>`
    : currentClimbId ? `<div class="sent-row"><button class="btn ${c?.sent ? 'soft' : 'primary'}" id="sentBtn" type="button">${c?.sent ? '✓ Sent' : '🎉 I sent it!'}</button><button class="btn" id="viewSaved" type="button">Saved</button></div>` : '');
  el.querySelectorAll('.step').forEach(b => b.onclick = () => { const i = +b.dataset.i; eng.sel = eng.sel === i ? -1 : i; haptic(); renderBeta(); draw(); });
  $('#sentBtn')?.addEventListener('click', () => toggleSent(currentClimbId));
  $('#viewSaved')?.addEventListener('click', () => setTab('climbs'));
}
async function toggleSent(id) {
  const c = climbs.find(x => x.id === id); if (!c) return;
  c.sent = !c.sent;
  if (c.sent) { confetti(); toast('Sent! Logged on your climbs.'); haptic(); }
  try { await backend.updateClimb(id, { sent: c.sent }); } catch { toast("Couldn't save that. Check your connection."); }
  if (tab === 'scan') renderBeta(); if (tab === 'climbs') renderClimbs();
}
async function askBeta() {
  if (ctl) return;
  if (!backend.aiAvailable) return setStatus(ERR.no_ai, true);
  if (profile.plan === 'free' && scansLeft() <= 0) return openPaywall();
  ctl = new AbortController(); const my = ctl; syncAsk(); setBusy(true, () => my.abort());
  try {
    const ann = document.createElement('canvas'); eng.render(ann, false);
    const images = [await eng.toBlob(eng.src), await eng.toBlob(ann)];
    const ctx = { colourName: COLOURS[eng.colour].name, grade: scan.grade, note: $('#note').value.trim(), holdList: eng.holdList(), holdCount: eng.holds.length, feetOnRoute: $('#feetToggle').checked };
    const r = await backend.runBeta(ctx, images, profile, my.signal);
    eng.beta = r.beta; eng.sel = -1; $('#answer').hidden = true;
    if (r.usage) { profile.scansUsed = r.usage.used; profile.plan = r.usage.plan; paintHeader(); }
    setBusy(false);
    if (!eng.beta.moves.length) { setStatus(eng.beta.read || 'No sequence came back. Check the colour, then try a clearer photo.', true); }
    else {
      draw();
      try {
        const snap = await eng.snapshot(720, true); const blob = await eng.toBlob(snap, .8);
        const item = await backend.addClimb({ image: blob, colour: eng.colour, colourName: COLOURS[eng.colour].name, grade: scan.grade, beta: eng.beta });
        climbs.unshift(item); currentClimbId = item.id; setStatus('Saved to your climbs.');
      } catch { setStatus("Beta's ready, but it couldn't be saved."); }
      haptic();
      $('#beta').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (e) {
    setBusy(false);
    if (e?.code === 'limit') { if (e.usage) profile.scansUsed = e.usage.used; openPaywall(); }
    else if (e?.code !== 'cancelled' && e?.name !== 'AbortError') setStatus(errText(e), true);
  } finally { ctl = null; renderBeta(); draw(); syncAsk(); }
}
$('#askBtn').onclick = askBeta;
async function askFollow() {
  const q = $('#q').value.trim(); if (!q || !eng.beta || qctl) return;
  qctl = new AbortController(); const my = qctl, out = $('#answer');
  out.hidden = false; out.textContent = 'Thinking…'; $('#qBtn').disabled = true;
  try {
    const snap = await eng.snapshot(1000, true);
    await backend.ask({ colourName: COLOURS[eng.colour].name, grade: scan.grade, question: q, beta: eng.beta }, await eng.toBlob(snap), profile, t => { out.textContent = t; }, my.signal);
  } catch (e) { if (e?.code === 'limit') { out.hidden = true; openPaywall('asks'); } else if (e?.code !== 'cancelled') out.textContent = e?.text ? e.text + '\n\n(Answer cut short.)' : errText(e); }
  finally { qctl = null; $('#qBtn').disabled = false; }
}
$('#qBtn').onclick = askFollow; $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') askFollow(); });

/* ---------- climbs ---------- */
function renderClimbs() {
  const pane = $('#pane-climbs');
  const list = climbs.filter(c => climbFilter === 'all' || (climbFilter === 'sent' ? c.sent : !c.sent));
  pane.innerHTML = `<div class="section-h"><h1 style="font-size:32px">Your climbs</h1></div>
    <div class="chips">${[['all', 'All'], ['projects', 'Projects'], ['sent', 'Sent']].map(([k, v]) => `<button class="chip" type="button" data-f="${k}" aria-pressed="${climbFilter === k}">${v}</button>`).join('')}</div>
    ${list.length ? `<div class="climb-grid">${list.map(c => `<button class="climb-card" type="button" data-id="${esc(c.id)}"><div class="img"><img alt="" src="${esc(c.imageUrl)}" loading="lazy">${c.sent ? '<span class="sentflag">SENT</span>' : ''}</div>
      <span class="cap"><span class="cdot" style="background:${COLOURS[c.colour]?.sw || '#ccc'}"></span>${esc(c.colourName)} · ${esc(c.grade)}</span><span class="date">${new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></button>`).join('')}</div>`
      : `<div class="empty"><div class="big"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></div>
         <p>${climbFilter === 'sent' ? 'Nothing sent yet. Tap "I sent it!" after you top a problem.' : 'Every problem you scan gets saved here with its beta.'}</p><button class="btn primary" id="emptyScan" type="button">Scan a climb</button></div>`}`;
  pane.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { climbFilter = b.dataset.f; haptic(); renderClimbs(); });
  pane.querySelectorAll('.climb-card').forEach(b => b.onclick = () => openClimb(climbs.find(c => String(c.id) === b.dataset.id)));
  $('#emptyScan')?.addEventListener('click', () => { setTab('scan'); $('#camIn').click(); });
}
function openClimb(c) {
  if (!c) return;
  openSheet(`<img class="full" alt="Saved climb with its beta drawn on" src="${esc(c.imageUrl)}">
    <div class="beta">${betaHTML(c.beta, false)}</div>
    <div class="sent-row"><button class="btn ${c.sent ? 'soft' : 'primary'}" id="sSent" type="button">${c.sent ? '✓ Sent' : '🎉 I sent it!'}</button><button class="btn" id="sDel" type="button">Delete</button></div>
    <button class="btn ghost" id="sClose" type="button">Close</button>`, s => {
    s.querySelector('#sSent').onclick = async () => { await toggleSent(c.id); openClimb(c); };
    let armed = false;
    s.querySelector('#sDel').onclick = async e => {
      if (!armed) { armed = true; e.currentTarget.textContent = 'Tap again to delete'; return; }
      try { await backend.deleteClimb(c.id); climbs = climbs.filter(x => x.id !== c.id); closeSheet(); toast('Climb deleted.'); if (tab === 'climbs') renderClimbs(); else if (tab === 'home') renderHome(); }
      catch { toast("Couldn't delete that. Try again."); }
    };
    s.querySelector('#sClose').onclick = closeSheet;
  });
}

/* ---------- coach ---------- */
function renderCoach() {
  const pool = profile.weaknesses?.length ? profile.weaknesses : GENERAL_DRILLS;
  const pane = $('#pane-tips');
  pane.innerHTML = `<div class="greet"><h1>Your coach</h1><p>Drills picked for ${profile.weaknesses?.length ? 'what you want to improve' : 'all-round climbing'}. Change your focus on your profile.</p></div>
    ${pool.map(k => { const d = DRILLS[k]; return `<div class="card tip"><span class="ico">${d.i}</span><div><p class="lbl">${esc(k)}</p><h3 style="font-size:18px;margin:4px 0">${esc(d.t)}</h3><p class="muted">${esc(d.d)}</p></div></div>`; }).join('')}
    <div class="card"><label class="lbl" for="coachQ">Ask your coach anything</label>
      <div class="ask-row"><input class="input" id="coachQ" type="text" placeholder="How do I warm up for crimpy problems?"><button class="btn dark" id="coachBtn" type="button">Ask</button></div>
      <p class="answer" id="coachA" hidden></p></div>`;
  const go = async () => {
    const q = $('#coachQ').value.trim(); if (!q) return;
    const out = $('#coachA'); out.hidden = false; out.textContent = 'Thinking…'; $('#coachBtn').disabled = true;
    try { await backend.ask({ general: true, grade: profile.grade, question: q }, null, profile, t => { out.textContent = t; }); }
    catch (e) { if (e?.code === 'limit') { out.hidden = true; openPaywall('asks'); } else out.textContent = errText(e); }
    finally { $('#coachBtn').disabled = false; }
  };
  $('#coachBtn').onclick = go; $('#coachQ').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ---------- me ---------- */
let saveTimer = null;
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try { await backend.saveProfile(profile); toast('Saved'); } catch { toast("Couldn't save. Check your connection."); } }, 600); }
function planHTML() {
  const p = backend.config.prices || {};
  if (profile.plan === 'pro') return `<div class="pro-card"><h3>You're on Pro ⚡</h3><p style="color:#d7dce0">Unlimited beta, follow-up questions and coaching.</p><button class="btn" id="manageBtn" type="button" style="background:#fff;color:var(--ink);border-color:#fff">Manage subscription</button></div>`;
  return `<div class="pro-card"><h3>Beta Lens Pro</h3>
    <ul><li>Unlimited scans and beta</li><li>Unlimited questions to your coach</li><li>Your full climb history, on every device</li></ul>
    ${profile.plan === 'free' ? `<p style="color:#d7dce0;font-size:14px">${scansLeft()} of ${profile.freeScans} free scans left this month.</p>` : ''}
    <div class="price-row"><button class="btn primary" id="buyYear" type="button">Yearly<small>${esc(p.yearly || '£29.99 a year')}</small></button><button class="btn alt" id="buyMonth" type="button">Monthly<small>${esc(p.monthly || '£3.99 a month')}</small></button></div></div>`;
}
function wirePlan(root) {
  const buy = async interval => { try { await backend.checkout(interval); } catch (e) { toast(e.code === 'demo' ? 'Payments switch on once the app is live.' : errText(e)); } };
  root.querySelector('#buyYear')?.addEventListener('click', () => buy('year'));
  root.querySelector('#buyMonth')?.addEventListener('click', () => buy('month'));
  root.querySelector('#manageBtn')?.addEventListener('click', async () => { try { await backend.portal(); } catch (e) { toast(errText(e)); } });
}
function openPaywall(kind) {
  openSheet(`<h2 style="font-size:28px">${kind === 'asks' ? "You've used your free questions" : "You've used your free scans"}</h2>
    <p class="muted">Free accounts get ${profile.freeScans} scans a month. They reset on the 1st, or go Pro for unlimited beta.</p>${planHTML()}<button class="btn ghost" id="pwClose" type="button">Maybe later</button>`,
    s => { wirePlan(s); s.querySelector('#pwClose').onclick = closeSheet; });
}
function renderMe() {
  const pane = $('#pane-me');
  pane.innerHTML = `
    <div class="me-head"><div class="avatar" id="meAvatar"></div><div><h2>${esc(profile.name || 'Climber')}</h2><p class="muted">${esc(profile.homeGym || 'No home wall set')} · ${esc(profile.grade)}</p>${backend.email() ? `<p class="muted" style="font-size:13px">${esc(backend.email())}</p>` : ''}</div></div>
    ${planHTML()}
    <div class="card">
      <h3 style="font-size:20px">Your climbing</h3>
      <div class="row2">
        <div class="field"><label class="lbl" for="mName">Name</label><input class="input" id="mName" type="text" value="${esc(profile.name)}"></div>
        <div class="field"><label class="lbl" for="mGym">Home wall</label><input class="input" id="mGym" type="text" value="${esc(profile.homeGym)}" placeholder="Optional"></div>
        <div class="field"><label class="lbl" for="mGrade">Usual grade</label><select class="input" id="mGrade">${GRADES.map(g => `<option${g === profile.grade ? ' selected' : ''}>${g}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl" for="mHeight">Height</label><select class="input" id="mHeight">${HEIGHTS.map(h => `<option${h === profile.height ? ' selected' : ''}>${h}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label class="lbl" for="mGoal">Main goal</label><select class="input" id="mGoal">${Object.entries(GOALS).map(([k, v]) => `<option value="${k}"${k === profile.goal ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><span class="lbl">Good at</span><div class="chips" id="mStr">${STYLES.map(s => `<button class="chip acc" type="button" data-v="${s}" aria-pressed="${profile.strengths.includes(s)}">${s}</button>`).join('')}</div></div>
      <div class="field"><span class="lbl">Want to improve</span><div class="chips" id="mWeak">${STYLES.map(s => `<button class="chip acc" type="button" data-v="${s}" aria-pressed="${profile.weaknesses.includes(s)}">${s}</button>`).join('')}</div></div>
      <label class="toggle" for="mFeet"><span>Feet stay on the route colour by default</span><input type="checkbox" id="mFeet" ${profile.feetOnRoute ? 'checked' : ''}></label>
    </div>
    <div class="card"><h3 style="font-size:20px">App colour</h3><div class="swatch-grid" id="mAcc">${ACCENTS.map(a => `<button class="swatch" type="button" data-v="${a.c}" aria-pressed="${profile.accent === a.c}"><i style="background:${a.c}"></i>${a.n}</button>`).join('')}</div></div>
    <button class="btn wide" id="replayBtn" type="button">Replay the intro</button>
    <button class="btn wide" id="signOutBtn" type="button">Sign out</button>
    <p class="fine">${backend.mode === 'live' ? '<a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a> · ' : ''}Beta Lens 1.0</p>`;
  paintAvatar($('#meAvatar'));
  wirePlan(pane);
  const bind = (id, key, after) => { $(id).onchange = $(id).oninput = e => { profile[key] = e.target.value.trim ? e.target.value.trim() : e.target.value; after?.(); queueSave(); }; };
  bind('#mName', 'name', paintHeader); bind('#mGym', 'homeGym'); bind('#mGrade', 'grade', () => { scan.grade = profile.grade; }); bind('#mHeight', 'height'); bind('#mGoal', 'goal');
  const multiMe = (sel, key) => pane.querySelectorAll(sel + ' .chip').forEach(b => b.onclick = () => {
    haptic(); const arr = profile[key], v = b.dataset.v, i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); b.setAttribute('aria-pressed', arr.includes(v)); queueSave();
  });
  multiMe('#mStr', 'strengths'); multiMe('#mWeak', 'weaknesses');
  $('#mFeet').onchange = e => { profile.feetOnRoute = e.target.checked; $('#feetToggle').checked = e.target.checked; queueSave(); };
  pane.querySelectorAll('#mAcc .swatch').forEach(b => b.onclick = () => {
    haptic(); profile.accent = b.dataset.v; setAccent(profile.accent); LS.set('bl.accent', profile.accent);
    pane.querySelectorAll('#mAcc .swatch').forEach(x => x.setAttribute('aria-pressed', x === b)); paintHeader(); queueSave();
  });
  $('#replayBtn').onclick = () => { LS.set('bl.welcomed', false); showWelcome(); };
  $('#signOutBtn').onclick = async () => { await backend.signOut(); profile = null; climbs = []; showAuth(); };
}
