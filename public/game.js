'use strict';

// 훈민정음: 혼자 점수 도전 + 방 코드 온라인 대결. 사전과 판정은 서버가 맡는다.
(() => {
const H = window.Hangul;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const spaced = (initials) => [...initials].join(' ');

// ---------- 저장·소리 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const session = {
  get() { try { return JSON.parse(sessionStorage.getItem('chosungRoom')); } catch (_) { return null; } },
  set(v) { try { sessionStorage.setItem('chosungRoom', JSON.stringify(v)); } catch (_) {} },
  clear() { try { sessionStorage.removeItem('chosungRoom'); } catch (_) {} },
};
let muted = store.get('chosungMuted') === '1';
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  ok: (c = 0) => { tone(620 + Math.min(c, 8) * 40, 0.09, 'sine', 0.12, 240); setTimeout(() => tone(930 + Math.min(c, 8) * 40, 0.1, 'sine', 0.1), 70); },
  bad: () => tone(170, 0.14, 'square', 0.06, -50),
  tick: () => tone(1000, 0.04, 'square', 0.05),
  lose: () => [400, 300, 220].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sawtooth', 0.07), i * 110)),
  turn: () => { tone(880, 0.08, 'triangle', 0.09); setTimeout(() => tone(1175, 0.1, 'triangle', 0.09), 80); },
  word: () => tone(560, 0.06, 'triangle', 0.06, 120),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 100)),
};
function setMute(m) { muted = m; store.set('chosungMuted', m ? '1' : '0'); $('sMute').textContent = $('rMute').textContent = m ? '🔇' : '🔊'; }
$('sMute').onclick = $('rMute').onclick = (e) => { e.currentTarget.blur(); setMute(!muted); };
setMute(muted);

// ---------- 화면 ----------
function show(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id)); }
const renderTiles = (el, initials) => { el.innerHTML = [...initials].map((c) => `<div class="tile">${c}</div>`).join(''); };
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function setMsg(el, text, kind = '') { el.textContent = text; el.className = 'msg ' + kind; }

// 한글 입력기는 Enter 로 마지막 글자를 확정하면서 입력 이벤트를 한 번 더 보내거나, 지운 칸에 글자를 되살리는 경우가 있다.
// 제출 직후 마지막 글자 하나만 되살아나면 지운다.
function wireInput(input, form, onSubmit) {
  let last = { text: '', at: 0 };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    input.value = '';
    if (!v) return;
    last = { text: v, at: performance.now() };
    onSubmit(v);
  });
  input.addEventListener('input', () => {
    if (performance.now() - last.at < 150 && input.value.length === 1 && last.text.endsWith(input.value)) input.value = '';
  });
  form.querySelector('button').addEventListener('pointerdown', (e) => e.preventDefault());   // 키보드가 내려가지 않게
}

async function api(path) {
  try {
    const r = await fetch(path, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

const levelOf = (correct) => 1 + Math.floor(correct / 4);
let best = Number(store.get('chosungBest')) || 0;
function saveBest(score) { if (score > best) { best = score; store.set('chosungBest', String(best)); refreshHome(); } }
function refreshHome() {
  const t = $('bestTag');
  t.hidden = !best;
  t.textContent = `🏆 혼자 도전 최고 ${best.toLocaleString()}점`;
}

// =====================================================================
// 혼자 도전
// =====================================================================
const solo = {};
function newSolo() {
  Object.assign(solo, { lives: 3, score: 0, correct: 0, combo: 0, passes: 2, used: new Set(), recent: [], found: [], p: null, deadline: 0, total: 20, phase: 'idle', busy: false, pausedRemain: 0, lastTickSec: -1, timerId: 0 });
}
newSolo();

function soloHud() {
  $('sLives').textContent = '❤️'.repeat(solo.lives) + '🖤'.repeat(3 - solo.lives);
  $('sScore').textContent = solo.score.toLocaleString();
  $('sLevel').textContent = `Lv ${levelOf(solo.correct)}`;
  $('sPassLeft').textContent = solo.passes;
  $('sPass').disabled = solo.passes <= 0 || solo.phase !== 'input';
  setMsg($('sCombo'), solo.combo >= 2 ? `🔥 ${solo.combo}콤보!` : '', 'good');
  $('sWords').innerHTML = solo.found.slice().reverse().map((f) => `<span class="chip ${f.rare ? 'rare' : ''}">${esc(f.w)}</span>`).join('');
}

function startSolo() {
  newSolo();
  show('solo');
  $('sVeil').classList.remove('on');
  soloHud();
  soloNext();
}

async function soloNext() {
  solo.phase = 'loading';
  soloHud();
  const r = await api(`api/prompt?level=${levelOf(solo.correct)}&used=${encodeURIComponent(solo.recent.join(','))}`);
  if (!r) return soloOffline();
  solo.p = r;
  solo.recent.push(r.initials); if (solo.recent.length > 6) solo.recent.shift();
  renderTiles($('sTiles'), r.initials);
  solo.total = r.time;
  solo.deadline = performance.now() + r.time * 1000;
  solo.lastTickSec = -1;
  solo.phase = 'input';
  setMsg($('sMsg'), `${r.letters}글자 단어를 말해요`);
  $('sInput').value = '';
  $('sInput').focus();
  soloHud();
  cancelAnimationFrame(solo.timerId);
  solo.timerId = requestAnimationFrame(soloTick);
}

function soloTick() {
  if (solo.phase !== 'input') return;
  const remain = (solo.deadline - performance.now()) / 1000;
  const bar = $('sTimer');
  bar.firstElementChild.style.transform = `scaleX(${Math.max(0, remain / solo.total)})`;
  bar.classList.toggle('low', remain < 4);
  const sec = Math.ceil(remain);
  if (remain < 5 && sec !== solo.lastTickSec && remain > 0) { solo.lastTickSec = sec; sfx.tick(); }
  if (remain <= 0) return soloTimeout();
  solo.timerId = requestAnimationFrame(soloTick);
}

wireInput($('sInput'), $('sForm'), async (w) => {
  if (solo.phase !== 'input' || solo.busy) return;
  const bad = (text) => { setMsg($('sMsg'), text, 'bad'); shake($('sTiles')); sfx.bad(); $('sInput').focus(); };
  if (solo.used.has(w)) return bad('이미 쓴 말이에요');
  if (!H.matches(w, solo.p.initials)) return bad(`${spaced(solo.p.initials)} 에 맞는 ${solo.p.letters}글자를 써요`);
  solo.busy = true;
  const r = await api(`api/check?i=${encodeURIComponent(solo.p.initials)}&w=${encodeURIComponent(w)}`);
  solo.busy = false;
  if (solo.phase !== 'input') return;                      // 확인하는 사이 시간이 다 됐다
  if (!r) return bad('서버에 연결할 수 없어요');
  if (!r.ok) return bad('사전에 없는 말이에요');
  // 맞았다: 기본 100점 + 남은 시간 + 흔치 않은 말 보너스, 콤보가 쌓일수록 배율
  const remain = Math.max(0, (solo.deadline - performance.now()) / 1000);
  const gain = Math.round((100 + Math.round(remain * 10) + (r.rare ? 50 : 0)) * (1 + Math.min(solo.combo, 10) * 0.1));
  solo.phase = 'good';
  solo.combo++; solo.correct++; solo.score += gain;
  solo.used.add(w); solo.found.push({ w, rare: r.rare });
  saveBest(solo.score);
  setMsg($('sMsg'), `+${gain}${r.rare ? ' ✨ 흔치 않은 말!' : ''}`, 'good');
  sfx.ok(solo.combo);
  if (levelOf(solo.correct) > levelOf(solo.correct - 1)) setMsg($('sMsg'), `+${gain} · 레벨 업! 🎉`, 'good');
  soloHud();
  setTimeout(soloNext, 550);
});

async function soloTimeout() {
  solo.phase = 'fail';
  solo.lives--; solo.combo = 0;
  sfx.lose();
  $('sTimer').firstElementChild.style.transform = 'scaleX(0)';
  soloHud();
  const h = await api(`api/hint?i=${encodeURIComponent(solo.p.initials)}`);
  setMsg($('sMsg'), `시간 초과! 예) ${h && h.examples.length ? h.examples.join(' · ') : '…'}`, 'bad');
  shake($('sTiles'));
  setTimeout(() => (solo.lives <= 0 ? soloOver() : soloNext()), 2400);
}

$('sPass').onclick = () => {
  if (solo.phase !== 'input' || solo.passes <= 0) return;
  solo.passes--; solo.combo = 0;
  sfx.bad();
  soloNext();
};

function soloOver() {
  solo.phase = 'over';
  saveBest(solo.score);
  const isBest = solo.score > 0 && solo.score >= best;
  const rare = solo.found.filter((f) => f.rare).length;
  const veil = $('sVeil');
  veil.innerHTML = `
    <h2 class="inked">게임 끝!</h2>
    <div class="code" style="font-size:52px">${solo.score.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${best.toLocaleString()}`}</span>
    <div class="card" style="text-align:center">레벨 ${levelOf(solo.correct)} · 맞힌 단어 ${solo.correct}개${rare ? ` (✨ ${rare}개)` : ''}</div>
    <div class="words">${solo.found.map((f) => `<span class="chip ${f.rare ? 'rare' : ''}">${esc(f.w)}</span>`).join('')}</div>
    <button id="sAgain">한 번 더</button>
    <button class="alt" id="sHome">처음으로</button>`;
  veil.classList.add('on');
  sfx.win();
  $('sAgain').onclick = startSolo;
  $('sHome').onclick = goHome;
}

function soloOffline() {
  solo.phase = 'offline';
  const veil = $('sVeil');
  veil.innerHTML = `<h2 class="inked">연결 실패</h2><p class="sub">서버에 연결할 수 없어요.<br>잠시 후 다시 해 주세요.</p><button id="sRetry">다시 시도</button><button class="alt" id="sHome2">처음으로</button>`;
  veil.classList.add('on');
  $('sRetry').onclick = () => { veil.classList.remove('on'); soloNext(); };
  $('sHome2').onclick = goHome;
}

// 앱을 잠깐 떠나면 시간을 멈춘다 (돌아왔더니 시간 초과가 되지 않게)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && $('solo').classList.contains('on') && solo.phase === 'input') {
    solo.pausedRemain = solo.deadline - performance.now();
    solo.phase = 'paused';
    cancelAnimationFrame(solo.timerId);
    const veil = $('sVeil');
    veil.innerHTML = `<h2 class="inked">일시정지</h2><button id="sResume">계속하기</button>`;
    veil.classList.add('on');
    $('sResume').onclick = () => {
      veil.classList.remove('on');
      solo.deadline = performance.now() + solo.pausedRemain;
      solo.phase = 'input';
      $('sInput').focus();
      solo.timerId = requestAnimationFrame(soloTick);
    };
  }
});

$('sQuit').onclick = () => { solo.phase = 'idle'; cancelAnimationFrame(solo.timerId); goHome(); };

// =====================================================================
// 온라인 대결
// =====================================================================
let ws = null, wsOpen = false, retryTimer = 0;
let room = null, deadlineLocal = 0, lastTurnKey = '', lastWordCount = 0, lastRoundKey = '', tickSec = -1, timerId2 = 0;
let intent = null;        // 연결이 열리면 보낼 첫 요청 { t, ... }
const NAME_KEY = 'chosungName';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${location.pathname.replace(/index\.html$/, '')}`;
}
const wsSend = (t, o = {}) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t, ...o })); };

function connect() {
  clearTimeout(retryTimer);
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    wsOpen = true;
    wsSend('hello', { name: $('lName').value.trim() || store.get(NAME_KEY) || '' });
    const saved = session.get();
    if (intent) { const i = intent; intent = null; wsSend(i.t, i); }
    else if (saved) wsSend('resume', saved);
    clearInterval(connect.pulse);
    connect.pulse = setInterval(() => wsSend('pulse'), 20000);
  };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (m.t === 'room') applyRoom(m);
    else if (m.t === 'reject') onReject(m);
    else if (m.t === 'error') { setLobbyErr(m.msg); if (!room) show('lobby'); }
    else if (m.t === 'queued') setLobbyErr('상대를 찾는 중… (다른 사람이 빠른 대전을 누르면 바로 시작해요)', true);
    else if (m.t === 'resumeFailed') { session.clear(); room = null; hideVeil(); if ($('room').classList.contains('on')) { show('lobby'); setLobbyErr('방이 없어졌어요. 새로 만들어 주세요.'); } }
  };
  ws.onclose = () => {
    wsOpen = false;
    clearInterval(connect.pulse);
    if (session.get() && room) {                    // 방에 있던 중이면 다시 붙어 본다
      showVeil('연결이 끊겼어요', '<p class="sub">다시 연결하는 중…</p>');
      retryTimer = setTimeout(connect, 1500);
    }
  };
}

function setLobbyErr(text, info = false) { const e = $('lErr'); e.textContent = text; e.className = 'msg ' + (info ? 'good' : 'bad'); }

function openLobby(code) {
  show('lobby');
  $('lName').value = store.get(NAME_KEY) || '';
  if (code) $('lCode').value = code;
  setLobbyErr('');
}
function ensureName() {
  const n = $('lName').value.trim();
  if (n) store.set(NAME_KEY, n);
  return n;
}
function go(req) {
  ensureName();
  setLobbyErr('');
  if (ws && ws.readyState === 1) { wsSend('hello', { name: $('lName').value.trim() }); wsSend(req.t, req); }
  else { intent = req; connect(); }
}
$('lCreate').onclick = () => go({ t: 'create' });
$('lQuick').onclick = () => go({ t: 'quick' });
$('lJoin').onclick = () => {
  const code = $('lCode').value.trim().toUpperCase();
  if (code.length !== 4) return setLobbyErr('방 코드 4자리를 입력해 주세요.');
  go({ t: 'join', code });
};
$('lCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lJoin').click(); });
$('lBack').onclick = () => { wsSend('leave'); goHome(); };

function showVeil(title, bodyHtml) {
  const v = $('rVeil');
  v.innerHTML = `<h2 class="inked">${title}</h2>${bodyHtml}`;
  v.classList.add('on');
}
const hideVeil = () => $('rVeil').classList.remove('on');

function applyRoom(m) {
  const prev = room;
  room = m;
  session.set({ code: m.code, token: m.token });
  deadlineLocal = performance.now() + m.remain;
  show('room');
  const waiting = m.state === 'waiting';
  $('rWait').style.display = waiting ? 'flex' : 'none';
  $('rPlay').style.display = waiting ? 'none' : 'flex';
  $('rRound').textContent = waiting ? `방 ${m.code}` : `라운드 ${m.roundNo}`;
  waiting ? renderWaiting() : renderPlaying(prev);
  if (m.state === 'playing' || m.state === 'waiting') hideVeil();
}

function playerChip(p, i, extra = '') {
  const hearts = '❤️'.repeat(Math.max(0, room.faultsMax - p.faults)) + '🖤'.repeat(Math.min(room.faultsMax, p.faults));
  const cls = ['pl', i === room.you ? 'me' : '', p.out ? 'out' : '', !p.online ? 'off' : '', extra].filter(Boolean).join(' ');
  return `<div class="${cls}"><b>${esc(p.name)}</b>${i === room.host ? ' 👑' : ''}<small>${p.out ? '탈락' : hearts}${p.online ? '' : ' · 연결 끊김'}</small></div>`;
}

function renderWaiting() {
  $('rCode').textContent = room.code;
  $('rWaitPlayers').innerHTML = room.players.map((p, i) => playerChip(p, i)).join('');
  const isHost = room.you === room.host, enough = room.players.filter((p) => p.online).length >= 2;
  $('rStart').style.display = isHost ? '' : 'none';
  $('rStart').disabled = !enough;
  $('rWaitNote').textContent = isHost
    ? (enough ? '준비됐으면 시작해요!' : '두 명 이상 모이면 시작할 수 있어요')
    : '방장이 시작하길 기다려요';
}

function renderPlaying(prev) {
  const m = room;
  $('rPlayers').innerHTML = m.players.map((p, i) => playerChip(p, i, m.state === 'playing' && i === m.turn ? 'turn' : '')).join('');
  renderTiles($('rTiles'), m.initials);
  const myTurn = m.state === 'playing' && m.turn === m.you && !m.players[m.you].out;
  const inp = $('rInput');
  inp.disabled = !myTurn;
  $('rSend').disabled = !myTurn;
  inp.placeholder = myTurn ? `${m.initials.length}글자 단어를 입력해요` : '내 차례에 입력해요';
  if (m.state === 'playing') {
    $('rTurn').textContent = myTurn ? '🎤 내 차례! 단어를 말해요' : `⏳ ${m.players[m.turn].name}님 차례`;
  } else $('rTurn').textContent = '';
  $('rWords').innerHTML = m.words.map((x) => `<span class="chip ${x.rare ? 'rare' : ''}"><span class="by">${esc(m.players[x.by] ? m.players[x.by].name : '')}</span>${esc(x.w)}</span>`).join('');

  // 소리·포커스: 내 차례가 새로 왔을 때, 다른 사람이 단어를 말했을 때
  const turnKey = `${m.roundNo}:${m.turn}:${m.words.length}:${m.state}`;
  if (turnKey !== lastTurnKey) {
    if (myTurn) { sfx.turn(); inp.value = ''; inp.focus(); setMsg($('rMsg'), ''); }
    else if (m.state === 'playing' && m.words.length > lastWordCount && lastRoundKey === String(m.roundNo)) sfx.word();
    lastTurnKey = turnKey;
  }
  lastWordCount = m.words.length;
  lastRoundKey = String(m.roundNo);
  tickSec = -1;

  if (m.state === 'roundEnd' && m.lastLoss) {
    const l = m.lastLoss, p = m.players[l.seat];
    sfx.lose();
    showVeil(l.reason === 'timeout' ? '시간 초과!' : '패!', `
      <div class="tiles">${[...l.initials].map((c) => `<div class="tile" style="width:52px;height:64px;font-size:34px">${c}</div>`).join('')}</div>
      <p class="sub"><b>${esc(p.name)}</b>님 패!<br>${p.out ? '💀 패 3개로 탈락했어요' : `남은 하트 ${'❤️'.repeat(m.faultsMax - p.faults)}`}</p>
      <div class="card" style="text-align:center">이런 말이 있었어요<br><b>${l.examples.map(esc).join(' · ')}</b></div>
      <p class="sub">잠시 뒤 다음 라운드!</p>`);
  } else if (m.state === 'over') {
    const w = m.players[m.winner];
    sfx.win();
    const isHost = m.you === m.host;
    showVeil(w ? '🏆 우승!' : '게임 끝', `
      ${w ? `<div class="code" style="font-size:38px">${esc(w.name)}</div>` : ''}
      <div class="players">${m.players.map((p, i) => playerChip(p, i)).join('')}</div>
      ${isHost ? '<button id="rAgain">한 판 더</button>' : '<p class="sub">방장이 다시 시작하길 기다려요</p>'}
      <button class="alt" id="rExit">나가기</button>`);
    if ($('rAgain')) $('rAgain').onclick = () => wsSend('start');
    $('rExit').onclick = leaveRoom;
  }
  if (!prev || prev.state !== m.state || prev.roundNo !== m.roundNo) requestAnimationFrame(onlineTick);
}

function onlineTick() {
  cancelAnimationFrame(timerId2);
  if (!room || room.state !== 'playing') { $('rTimer').firstElementChild.style.transform = 'scaleX(1)'; return; }
  const remain = (deadlineLocal - performance.now()) / 1000;
  const total = Math.max(6, 13 - 0.6 * room.words.length);
  $('rTimer').firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, remain / total))})`;
  $('rTimer').classList.toggle('low', remain < 3);
  const sec = Math.ceil(remain);
  if (room.turn === room.you && remain < 4 && sec !== tickSec && remain > 0) { tickSec = sec; sfx.tick(); }
  timerId2 = requestAnimationFrame(onlineTick);
}

wireInput($('rInput'), $('rForm'), (w) => {
  if (!room || room.state !== 'playing' || room.turn !== room.you) return;
  if (!H.matches(w, room.initials)) { onReject({ reason: 'shape' }); return; }     // 서버까지 안 가도 아는 실수는 바로 알려 준다
  wsSend('answer', { w });
});

function onReject(m) {
  const text = { shape: room ? `${spaced(room.initials)} 에 맞는 ${room.initials.length}글자를 써요` : '초성이 안 맞아요', unknown: '사전에 없는 말이에요', used: '이미 나온 말이에요' }[m.reason] || '다시 해 보세요';
  setMsg($('rMsg'), text, 'bad');
  shake($('rTiles'));
  sfx.bad();
  $('rInput').focus();
}

function leaveRoom() {
  wsSend('leave');
  session.clear();
  room = null;
  hideVeil();
  openLobby();
}
$('rLeave').onclick = leaveRoom;
$('rStart').onclick = () => wsSend('start');
$('rCopy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${room.code}`;
  const done = () => { $('rCopy').textContent = '✅ 복사했어요'; setTimeout(() => { $('rCopy').textContent = '🔗 초대 링크 복사'; }, 1500); };
  if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: '훈민정음 한 판 해요!', url }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('링크를 복사하세요', url));
  else prompt('링크를 복사하세요', url);
};

// =====================================================================
// 처음 화면·시작
// =====================================================================
function goHome() {
  cancelAnimationFrame(solo.timerId);
  cancelAnimationFrame(timerId2);
  show('home');
  refreshHome();
}
$('goSolo').onclick = startSolo;
$('goOnline').onclick = () => openLobby();

refreshHome();
const params = new URLSearchParams(location.search);
if (session.get()) { show('room'); showVeil('다시 연결하는 중…', ''); room = { faultsMax: 3 }; connect(); }
else if (params.get('room')) openLobby(params.get('room').toUpperCase().slice(0, 4));

// 테스트용
window.__ch = { get solo() { return solo; }, get room() { return room; }, startSolo, soloNext, show };
})();
