import { drawingScoreDetails } from './scoring.mjs';
import { drawStroke, fillSpans } from './drawing.mjs';
import { wordPage } from './prompt-picker.mjs';

const app = document.querySelector('#app');
const connection = document.querySelector('#connection');
const slots = ['character', 'action', 'object'];
const colors = ['#172033', '#ffffff', '#e53935', '#ef9b24', '#f4d438', '#13816a', '#24bfd1', '#3478e5', '#7057ff', '#ee5b75', '#915c38'];
let library;
let session = readStored('sketchy-session');
let state = null;
let stageKey = '';
let roomCodeVisible = false;
let strokes = [];
let claim = null;
let activePicker = null;
let avatarDirty = false;
let pickerScrollPosition = null;
const compactPickerQuery = matchMedia('(max-width: 900px), (max-height: 500px) and (orientation: landscape)');
let penColor = colors[0];
let penWidth = 4;
let drawingTool = 'pencil';
let penOpacity = 1;
let redoStrokes = [];
let drawingPointer = null;
let activeStroke = null;
let dirtyDrawing = false;
let rerollPending = false;
let streamController = null;
let connected = false;
let clockOffset = 0;
let saving = false;
let actionQueue = Promise.resolve();
let toastTimer;

function readStored(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

function store(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* Server state still works if the browser blocks session storage. */ }
}

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function sentence(prompt) {
  return slots.map((slot) => library[slot].find((word) => word.id === prompt?.[slot])?.label ?? '').join(' ');
}

function name(id) {
  return state.players.find((player) => player.id === id)?.name ?? 'Player';
}

function notify(message) {
  const toast = document.querySelector('#notification');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

const gameEndpoint = '/.netlify/functions/game';

async function api(path, payload, authenticated = true, signal = undefined) {
  const token = authenticated ? session?.token : null;
  const body = JSON.stringify({ ...payload, op: path, room: authenticated ? session?.code : payload.code, requestId: crypto.randomUUID() });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(gameEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body, signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw Object.assign(new Error('The game backend is unavailable. Check that Netlify built the function.'), { status: response.status });
      }
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.error || 'Could not save. Try again.'), { status: response.status });
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || (error.status && error.status < 500 && error.status !== 429) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

/** Serialize local submissions so autosaves cannot overwrite a final drawing. */
function send(action, payload = {}, quiet = false) {
  const round = state?.round;
  const gameId = state?.gameId;
  const task = actionQueue.catch(() => {}).then(async () => {
    const result = await api('action', { action, gameId, round, ...payload });
    accept(result);
    return result;
  });
  actionQueue = task;
  task.catch((error) => { if (!quiet) notify(error.message); });
  return task;
}

function rules() {
  return `<details class="rules"><summary>How to play</summary><ol>
    <li><strong>Draw the phrase</strong></li>
    <li><strong>Keep it or change a word</strong></li>
    <li><strong>Guess who's lying and who's honest</strong></li>
    </ol><p><strong><span class="points">+500</span> per correct vote<br><span class="points">+300</span> when someone votes truth on your work</strong></p></details>`;
}

function renderHome() {
  closeWordPicker(false);
  stageKey = '';
  roomCodeVisible = false;
  const invite = new URL(location.href).searchParams.get('room') ?? '';
  app.innerHTML = `<div class="setup"><section><p class="eyebrow">2–8 PLAYERS</p>
    <h1>Draw Now.<br><span class="highlight">Lie Later.</span></h1>


    <div class="home-doodle" aria-hidden="true"><svg class="home-face" viewBox="220 30 1020 770"><image href="/mascot.png" width="2064" height="864"/></svg></div>
    ${rules()}</section><section class="panel join-sheet"><form id="join-form">
    <div class="field"><label class="form-label" for="nickname">Your nickname</label><input id="nickname" name="nickname" autocomplete="nickname" maxlength="20" placeholder="Something suspicious" required></div>
    <div class="field"><label class="form-label" for="room-code">Room code</label><input id="room-code" name="code" maxlength="6" minlength="6" value="${escape(invite)}" placeholder="- - - - - -" autocomplete="off" autocapitalize="characters"></div>
    <button class="primary wide" type="submit">${invite.trim() ? 'Join room' : 'Create room'}</button>
    </form></section></div>`;
  connection.textContent = '';
}

async function enterRoom(create, input = null) {
  const nameValue = input?.name ?? document.querySelector('#nickname')?.value.trim();
  const code = input?.code ?? document.querySelector('#room-code')?.value.trim().toUpperCase();
  if (!nameValue) throw new Error('Enter your nickname first.');
  if (!create && !/^[A-Z2-9]{6}$/.test(code)) throw new Error('Enter a six-character room code.');
  session = await api(create ? 'create' : 'join', { name: nameValue, code }, false);
  store('sketchy-session', session);
  history.replaceState(null, '', `?room=${session.code}`);
  app.innerHTML = '<div class="panel"><h2>Connecting to your room…</h2></div>';
  void connectRoom();
  return { roomCode: session.code, playerId: session.playerId };
}

async function connectRoom() {
  streamController?.abort();
  const controller = new AbortController();
  streamController = controller;
  while (!controller.signal.aborted && session) {
    try {
      const next = await api('state', { since: state?.version }, true, controller.signal);
      if (controller.signal.aborted) return;
      connected = true;
      connection.textContent = '';
      if (next.unchanged) clockOffset = next.serverTime - Date.now();
      else accept(next);
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') return;
      if (error.status === 401 || error.status === 404) {
        clearSession();
        notify(error.message);
        return;
      }
      connected = false;
      connection.textContent = 'RECONNECTING…';
    }
    await new Promise((resolve) => setTimeout(resolve, document.hidden ? 5000 : 1500));
  }
}

function clearSession() {
  streamController?.abort();
  session = null;
  state = null;
  connected = false;
  strokes = [];
  store('sketchy-session', null);
  store('sketchy-drawing', null);
  store('sketchy-claim', null);
  history.replaceState(null, '', location.pathname);
  renderHome();
}

function accept(next) {
  if (state && next.version < state.version) return;
  clockOffset = next.serverTime - Date.now();
  const previous = state;
  state = next;
  // Capture the lobby draft before the drawing phase replaces the shared strokes.
  if (previous?.phase === 'lobby' && state.phase !== 'lobby' && avatarDirty) {
    void savePortrait(structuredClone(strokes)).catch(() => {});
  }
  const nextKey = `${state.code}:${state.gameId}:${state.round}:${state.phase}`;
  if (stageKey !== nextKey) {
    if (state.phase === 'lobby') {
      const avatar = state.players.find((player) => player.id === state.meId)?.avatar ?? [];
      const draft = readStored('sketchy-avatar');
      strokes = draft?.playerId === state.meId ? draft.strokes : structuredClone(avatar);
      redoStrokes = [];
      avatarDirty = JSON.stringify(strokes) !== JSON.stringify(avatar);
    }
    if (state.phase === 'draw') {
      const draft = readStored('sketchy-drawing');
      redoStrokes = [];
      strokes = draft?.key === nextKey && !state.me.drawingDone ? draft.strokes : structuredClone(state.me.strokes);
      dirtyDrawing = strokes.length > state.me.strokes.length;
    }
    if (state.phase === 'claim') {
      const draft = readStored('sketchy-claim');
      claim = draft?.key === nextKey && !state.me.claimDone ? draft.claim : { ...state.me.claim };
    }
    stageKey = nextKey;
    renderRoom();
  } else {
    renderScores();
    updateHostControls();
    if (state.phase === 'lobby') updateLobby();
    else if (state.phase === 'finished' || (state.phase === 'reveal' && previous.revealStep !== state.revealStep)) renderStage();
    else if (state.phase === 'draw') {
      if (previous?.me.drawingDone !== state.me.drawingDone) renderStage();
      const prompt = document.querySelector('#assigned-prompt');
      if (prompt) prompt.textContent = sentence(state.me.original);
      updateReady();
    } else if (state.phase === 'claim') {
      if (previous?.me.claimDone !== state.me.claimDone) renderStage();
      updateReady();
    } else if (state.phase === 'judge') {
      if (previous.gallery.map((entry) => entry.playerId).join() !== state.gallery.map((entry) => entry.playerId).join()) renderStage();
      else updateVotes();
      updateReady();
    }
  }
  updateTimer();
}

function renderRoom() {
  app.innerHTML = `<div class="room-bar"><a class="room-brand" href="/" aria-label="Retcon home">RETCON</a><div class="inline"><button class="secondary small-button landscape-room-toggle" popovertarget="landscape-room-panel" aria-label="Room controls and players">Room</button><button type="button" class="room-code" data-action="toggle-code" aria-label="${roomCodeVisible ? 'Hide' : 'Reveal'} room code" aria-pressed="${roomCodeVisible}">${roomCodeVisible ? state.code : '••••••'}</button><button class="secondary small-button" data-action="copy-code">Copy code</button><button class="secondary small-button" data-action="copy-link">Copy invite</button><button class="secondary small-button" data-action="leave">Leave game</button></div></div>
    <div id="landscape-room-panel" class="landscape-room-panel" popover="auto" aria-labelledby="landscape-room-title"><h3 id="landscape-room-title">Room</h3><div class="room-menu-code"><code>${state.code}</code><button class="secondary small-button" data-action="copy-code">Copy code</button></div><div class="room-menu-roster" aria-label="Players"></div></div>
    <div class="layout phase-${state.phase}"><section id="stage"></section><aside id="scores" class="panel scoreboard" aria-label="Players and scores"></aside></div>`;
  renderScores();
  renderStage();
}

function renderScores() {
  const scoreboard = document.querySelector('#scores');
  if (!scoreboard) return;
  const roomRoster = document.querySelector('.room-menu-roster');
  if (roomRoster) roomRoster.innerHTML = state.players.map((player) => `<div><span>${escape(player.name)}${player.id === state.meId ? ' (you)' : ''}</span><small>${!player.connected ? 'Offline' : player.ready ? 'Ready' : player.id === state.hostId ? 'Host' : ''}</small></div>`).join('');
  const compact = ['draw', 'claim', 'judge'].includes(state.phase);
  const players = [...state.players].sort((first, second) => compact ? 0 : second.score - first.score);
  scoreboard.classList.toggle('player-strip', compact);
  scoreboard.hidden = state.phase === 'lobby' || state.phase === 'finished' || (state.phase === 'reveal' && state.settings?.revealMode === 'guided' && !revealComplete());
  scoreboard.innerHTML = `<h3>${compact ? 'Players' : 'Standings'}</h3>${players.map((player, index) => {
    const gain = state.result?.gains[player.id];
    const status = !player.connected ? 'Offline' : player.ready ? 'Ready' : 'Drawing';
    const phaseStatus = status === 'Drawing' ? ({ draw: 'Drawing', claim: 'Choosing', judge: 'Voting' })[state.phase] : status;
    return `<div class="score-row ${player.ready ? 'is-ready' : ''} ${!player.connected ? 'is-offline' : ''}">${compact ? '' : `<span class="score-rank">${index + 1}</span>`}${portraitMarkup(player)}<span class="score-name">${escape(player.name)}${player.id === state.meId ? '<span class="you-label">you</span>' : ''}${compact ? '' : `<small>${gain ? `<span class="points">+${gain.judging + gain.belief}</span>` : player.id === state.hostId ? 'Host' : ''}</small>`}</span>${compact ? `<span class="presence" role="img" aria-label="${phaseStatus}">${player.ready ? '✓' : !player.connected ? '−' : '•'}</span>` : `<span class="score-value">${player.score.toLocaleString()}</span>`}</div>`;
  }).join('')}`;
  paintPortraits();
}

function portraitMarkup(player) {
  if (!player) return '';
  return `<span class="avatar" aria-hidden="true">${player.avatar?.length ? `<canvas width="800" height="500" data-avatar="${player.id}"></canvas>` : escape(player.name.slice(0, 1).toUpperCase())}</span>`;
}

function paintPortraits() {
  document.querySelectorAll('[data-avatar]').forEach((canvas) => {
    paint(canvas, state.players.find((player) => player.id === canvas.dataset.avatar)?.avatar ?? []);
  });
}

function updateLobby() {
  const players = document.querySelector('#lobby-players');
  if (!players) return;
  players.innerHTML = state.players.map((player) => `<div class="lobby-player">${portraitMarkup(player)}<div><strong>${escape(player.name)}${player.id === state.meId ? ' (you)' : ''}</strong><small>${player.id === state.hostId ? 'Host · ' : ''}${player.connected ? 'Here' : 'Disconnected'}</small></div>${state.hostId === state.meId && player.id !== state.meId ? `<button class="danger small-button" data-action="remove" data-player="${player.id}" aria-label="Remove ${escape(player.name)}">Remove</button>` : ''}</div>`).join('');
  document.querySelector('#lobby-count').textContent = `${state.players.length} / 8 players`;
  const host = state.hostId === state.meId;
  const canStart = state.players.length >= 2 && state.players.every((player) => player.connected);
  const start = document.querySelector('#lobby-start');
  start.hidden = !host;
  start.disabled = !canStart;
  document.querySelector('#lobby-wait').textContent = !host ? `${name(state.hostId)} will start the game.` : canStart ? 'Everyone in? Start when you’re ready.' : state.players.length < 2 ? 'Waiting for at least one more player.' : 'Waiting for players to reconnect.';
  const settings = document.querySelector('#lobby-settings-fields');
  if (settings.dataset.host !== state.hostId) {
    const options = { rounds: [['3', '3 rounds'], ['5', '5 rounds']], drawSeconds: [['30', '30 seconds'], ['60', '60 seconds'], ['90', '90 seconds'], ['120', '120 seconds']], wordPool: [['all', 'Full library'], ['familiar', 'Familiar words']], revealMode: [['all', 'All at once'], ['guided', 'One drawing at a time']] };
    const labels = { rounds: 'Game length', drawSeconds: 'Drawing time', wordPool: 'Word library', revealMode: 'Reveal' };
    settings.innerHTML = Object.entries(options).map(([key, values]) => `<label>${labels[key]}<select aria-label="${labels[key]}" data-setting="${key}" ${host ? '' : 'disabled'}>${values.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>`).join('');
    settings.dataset.host = state.hostId;
  }
  settings.querySelectorAll('[data-setting]').forEach((select) => {
    if (document.activeElement !== select) select.value = String(state.settings[select.dataset.setting]);
  });
  document.querySelector('#avatar-status').textContent = avatarDirty ? 'Not saved' : state.players.find((player) => player.id === state.meId)?.avatar?.length ? 'Saved' : '';
  paintPortraits();
}

app.addEventListener('change', (event) => {
  const key = event.target.dataset.setting;
  if (!key) return;
  const value = ['rounds', 'drawSeconds'].includes(key) ? Number(event.target.value) : event.target.value;
  void send('settings', { settings: { [key]: value } }).catch(() => updateLobby());
});

function heading(title = '', subtitle = '') {
  const phase = { draw: 'Draw', claim: 'Bluff', judge: 'Vote', reveal: 'The reveal' }[state.phase] ?? title;
  return `<div class="stage-top"><div class="phase-heading"><h1>${phase}</h1><p class="eyebrow" aria-label="Round ${state.round} of ${state.totalRounds}">${state.round} / ${state.totalRounds}</p>${subtitle ? `<p class="phase-hint">${subtitle}</p>` : ''}</div>${state.deadline ? '<span class="timer" aria-label="Time remaining">1:00</span>' : ''}</div>`;
}

function updateTimer() {
  const shuffle = document.querySelector('[data-action="reroll-prompt"]');
  if (shuffle) shuffle.disabled = rerollPending || state.me.drawingDone || Date.now() + clockOffset < (state.me.rerollReadyAt ?? 0) || Date.now() + clockOffset >= state.deadline;
  const timer = document.querySelector('.timer');
  if (!timer || !state?.deadline) return;
  const seconds = Math.max(0, Math.ceil((state.deadline - Date.now() - clockOffset) / 1000));
  timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  timer.classList.toggle('urgent', seconds <= 10);
}

function readyMarkup() {
  return `<p class="muted" id="ready-count">${state.players.filter((player) => player.connected && player.ready).length} / ${state.players.filter((player) => player.connected).length} ready</p>`;
}

function updateReady() {
  const counter = document.querySelector('#ready-count');
  if (counter) counter.textContent = `${state.players.filter((player) => player.connected && player.ready).length} / ${state.players.filter((player) => player.connected).length} ready`;
}

function updateHostControls() {
  const host = state.hostId === state.meId;
  document.querySelectorAll('[data-host-only]').forEach((button) => { button.hidden = !host; });
  document.querySelectorAll('[data-wait-host]').forEach((element) => { element.hidden = host; });
}

function renderStage() {
  closeWordPicker(false);
  const stage = document.querySelector('#stage');
  if (state.phase === 'lobby') {
    if (drawingTool === 'bucket') drawingTool = 'pencil';
    stage.innerHTML = `<div class="lobby-heading"><div><h1>Make yourself known.</h1></div><span id="lobby-count"></span></div>
      <div class="lobby-grid"><section class="lobby-gathering" aria-label="Players and invitations">
        <div class="lobby-invite"><button class="invite-qr-button" data-action="copy-link" aria-label="Copy invite link" title="Click to copy invite link"><img class="invite-qr" src="${gameEndpoint}?op=invite-qr&room=${state.code}" alt="Scan to join this room" width="144" height="144"><span>Click to copy link</span></button><div class="invite-code-area"><button class="invite-code" data-action="copy-code" aria-label="Copy room code ${state.code}" title="Click to copy room code">${state.code}</button></div></div>
        <div id="lobby-players" class="lobby-players"></div>
        <details class="lobby-settings"><summary>Game settings</summary><div id="lobby-settings-fields"></div></details>
        <div class="footer-actions"><p id="lobby-wait" class="muted"></p><button class="primary" id="lobby-start" data-action="start">Start game</button></div>${rules()}
      </section><section class="panel portrait-editor" aria-label="Draw your portrait"><h2>Draw yourself.</h2><div class="canvas-wrap portrait-canvas"><canvas id="avatar-canvas" width="800" height="500" class="drawing" aria-label="Draw your portrait"></canvas></div>
        ${drawingTools(['pencil', 'eraser', 'undo', 'redo'])}
        <div class="portrait-inks">${colors.filter((color) => color !== '#ffffff').map((color) => `<button class="swatch ${color === penColor ? 'selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="Portrait color ${color}" aria-pressed="${color === penColor}"></button>`).join('')}</div>
        <div class="portrait-actions"><button class="secondary small-button" data-action="clear-avatar">Clear</button><span id="avatar-status" role="status"></span><button class="primary" data-action="save-avatar">Save portrait</button></div>
      </section></div>`;
    paint(document.querySelector('#avatar-canvas'), strokes);
    attachDrawing(document.querySelector('#avatar-canvas'));
    updateLobby();
    return;
  }
  if (state.phase === 'draw') {
    stage.innerHTML = `${heading()}<div class="prompt assigned-prompt"><button class="secondary shuffle-prompt" data-action="reroll-prompt" aria-label="Shuffle prompt" title="Shuffle prompt" ${state.me.drawingDone ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 4-3 6-6s4-6 6-6h3M17 2l4 4-4 4"/></svg></button><span id="assigned-prompt">${escape(sentence(state.me.original))}</span></div>
      <div class="drawing-workspace ${state.me.drawingDone ? 'drawing-locked' : ''}"><div class="canvas-wrap"><canvas id="draw-canvas" width="800" height="500" class="${state.me.drawingDone ? '' : 'drawing'}" aria-label="Your drawing"></canvas></div>
      </div>
      <div class="drawing-controls ${state.me.drawingDone ? 'drawing-locked' : ''}">${drawingTools()}<div class="brush-settings"><div class="tools">${colors.map((color) => `<button class="swatch ${color === penColor ? 'selected' : ''}" style="--swatch:${color}" data-color="${color}" aria-label="${({ '#172033': 'Black', '#ffffff': 'White', '#7057ff': 'Purple', '#ee5b75': 'Pink', '#13816a': 'Green', '#ef9b24': 'Orange', '#e53935': 'Red', '#f4d438': 'Yellow', '#24bfd1': 'Cyan', '#3478e5': 'Blue', '#915c38': 'Brown' })[color]}" aria-pressed="${color === penColor}"></button>`).join('')}</div>
      <div class="brush-controls"><label>Thickness <output id="size-value">${penWidth} px</output><input id="pen-size" type="range" min="1" max="64" value="${penWidth}"></label><label>Opacity <output id="opacity-value">${Math.round(penOpacity * 100)}%</output><input id="pen-opacity" type="range" min="1" max="100" value="${Math.round(penOpacity * 100)}"></label><span class="brush-preview" aria-hidden="true"><i id="brush-dot" style="width:${penWidth}px;height:${penWidth}px;opacity:${penOpacity};background:${penColor}"></i></span></div></div>${state.me.drawingDone ? '<div class="locked-notice">Drawing locked</div>' : ''}</div>
      <div class="footer-actions drawing-footer">${readyMarkup()}${state.me.drawingDone ? '<button class="secondary" data-action="unlock-drawing">Unsubmit</button>' : `<button class="primary" data-action="done-drawing">Submit</button>`}</div>`;
    const canvas = document.querySelector('#draw-canvas');
    paint(canvas, strokes);
    if (!state.me.drawingDone) attachDrawing(canvas);
    return;
  }
  if (state.phase === 'claim') {
    stage.innerHTML = `${heading('', 'Change the character or object. Keep the action.')}<div class="claim-layout"><div class="claim-drawing"><div class="canvas-wrap"><canvas id="claim-canvas" width="800" height="500" aria-label="Your locked drawing"></canvas></div>
        ${state.me.active ? `<div class="footer-actions claim-footer"><button class="secondary reset-claim" data-action="reset-claim" aria-label="Reset prompt to original" title="Reset prompt to original" ${state.me.claimDone ? 'style="visibility:hidden" disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg></button><button class="${state.me.claimDone ? 'secondary' : 'primary'}" data-action="${state.me.claimDone ? 'unlock-claim' : 'done-claim'}">${state.me.claimDone ? 'Unsubmit' : 'Submit'}</button></div>` : ''}</div>
      ${!state.me.active ? '<div class="waiting">No drawing · You can still guess</div>' : `<div class="claim-workspace">
        <div id="claim-preview" class="prompt claim-sentence"></div>
        <dialog id="word-picker" class="word-picker" aria-labelledby="picker-title">
          <div class="picker-heading"><strong id="picker-title"></strong><button class="secondary picker-close" data-action="close-picker" aria-label="Close word picker">×</button></div>
          <p id="picker-context" class="picker-context"></p>
          <input id="picker-search" class="search" type="search" aria-label="Search words" autocomplete="off">
          <div class="picker-body"><details class="picker-families"><summary>Browse families</summary><div id="picker-families"></div></details>
          <div id="picker-results"></div>
          </div>
        </dialog>
      </div>`}</div><div class="footer-actions">${readyMarkup()}</div>`;
    paint(document.querySelector('#claim-canvas'), state.me.strokes);
    if (state.me.active) updateClaimPreview();
    return;
  }
  if (state.phase === 'judge') {
    const targets = state.gallery.filter((entry) => entry.playerId !== state.meId);
    stage.innerHTML = `${heading()}<div class="gallery">${targets.map((entry) => `<article class="drawing-card"><canvas width="800" height="500" data-gallery="${entry.playerId}" aria-label="Drawing by ${escape(name(entry.playerId))}"></canvas><div class="card-info"><div class="card-head">${portraitMarkup(state.players.find((player) => player.id === entry.playerId))}<strong>${escape(name(entry.playerId))}</strong></div><div class="prompt">${escape(sentence(entry.claim))}</div><div class="vote-buttons"><button class="choice" data-vote="true" data-player="${entry.playerId}"><span class="vote-mark" aria-hidden="true">✓</span>Truth</button><button class="choice lie" data-vote="false" data-player="${entry.playerId}"><span class="vote-mark" aria-hidden="true">✓</span>Lie</button></div></div></article>`).join('')}</div>
      ${targets.length === 0 ? '<div class="waiting">No other drawings to judge. Waiting for the others…</div>' : ''}<div class="footer-actions vote-footer" ${targets.length ? '' : 'hidden'}><button class="primary" data-action="finish-votes">Submit</button></div><div class="footer-actions">${readyMarkup()}</div>`;
    paintGallery(state.gallery);
    updateVotes();
    return;
  }
  if (state.phase === 'reveal') {
    const result = state.result;
    const gain = result.gains[state.meId];
    const guided = state.settings?.revealMode === 'guided' && result.entries.length > 0;
    const complete = revealComplete();
    const step = state.revealStep ?? 0;
    const current = result.entries[Math.floor(step / 3)];
    const summary = `<div class="round-summary"><div class="round-total"><span>You earned</span><strong>+${gain.judging + gain.belief}</strong></div><div class="round-breakdown"><span>Correct votes <b>+${gain.judging}</b></span><span>Believed by others <b>+${gain.belief}</b></span></div></div>`;
    stage.innerHTML = `${heading()}${!guided || complete ? summary : ''}${guided ? `<p class="reveal-progress">Drawing ${Math.floor(step / 3) + 1} / ${result.entries.length}</p>` : ''}<div class="gallery ${guided ? 'guided-gallery' : ''}">${guided ? revealCard(current, step % 3) : result.entries.map((entry) => revealCard(entry)).join('')}</div>
      ${result.entries.length ? '' : '<div class="waiting">No drawings · <span class="points">+0</span></div>'}<div class="footer-actions"><p class="muted" data-wait-host>Waiting for ${escape(name(state.hostId))}</p>${guided && !complete ? `<button class="primary" data-action="reveal-next" data-host-only>${['Reveal truth', 'Show votes', 'Next drawing'][step % 3]}</button>` : `<button class="primary" data-action="next" data-host-only>${state.round === state.totalRounds ? 'Final scores' : 'Next round'}</button>`}</div>`;
    paintGallery(result.entries);
    updateHostControls();
    return;
  }
  if (state.phase === 'finished') {
    const winners = state.winners.map((id) => name(id));
    const players = [...state.players].sort((first, second) => second.score - first.score);
    stage.innerHTML = `<div class="panel"><div class="winner"><p class="eyebrow">${state.totalRounds} / ${state.totalRounds}</p><h1>${winners.length > 1 ? 'Joint winners' : 'Winner'}</h1><p class="winner-names">${winners.map(escape).join(' & ')}</p></div><table class="score-table"><thead><tr><th>Player</th><th>Points</th></tr></thead><tbody>${players.map((player) => `<tr><td>${escape(player.name)} ${state.winners.includes(player.id) ? '★' : ''}</td><td>${player.score.toLocaleString()}</td></tr>`).join('')}</tbody></table><div class="footer-actions"><button class="primary" data-action="rematch" data-host-only>Play again</button><p class="muted" data-wait-host>Waiting for the host to open a rematch.</p></div></div>`;
    updateHostControls();
  }
}

function revealComplete() {
  return !state.result?.entries.length || (state.revealStep ?? 0) >= state.result.entries.length * 3 - 1;
}

function revealCard(entry, level = 2) {
  const own = entry.playerId === state.meId;
  const details = drawingScoreDetails(entry, state.meId, name);
  return `<article class="drawing-card"><canvas width="800" height="500" data-gallery="${entry.playerId}" aria-label="Drawing by ${escape(name(entry.playerId))}"></canvas><div class="card-info"><div class="card-head"><strong>${escape(name(entry.playerId))}${own ? ' (you)' : ''}</strong>${level >= 1 ? `<span class="badge ${entry.truth ? '' : 'lie'}">${entry.truth ? 'TRUTH' : 'LIE'}</span>` : '<span class="muted">Truth or lie?</span>'}</div><div class="prompt">${escape(sentence(entry.claim))}</div>${level < 1 || entry.truth ? '' : `<p class="reveal-line">Original: <strong>${escape(sentence(entry.original))}</strong></p>`}${level >= 2 ? `<div class="score-details">${own ? '<span class="score-caption">Truth votes → you</span>' : ''}${details.map((detail) => `<div class="score-detail-row"><span>${own ? escape(detail.playerName) : 'You'} <span class="muted">${detail.choice === 'No vote' ? 'skipped' : `guessed ${escape(detail.choice)}`}</span></span><strong class="${detail.points ? 'round-gain' : 'muted'}">${!own && detail.outcome === 'Correct' ? '<span aria-label="Correct">✓</span> ' : ''}+${detail.points}</strong></div>`).join('')}</div>` : ''}</div></article>`;
}

function closeWordPicker(restoreFocus = true) {
  const slot = activePicker?.slot;
  const dialog = document.querySelector('#word-picker');
  if (dialog?.open) dialog.close();
  restorePickerPage();
  activePicker = null;
  document.querySelectorAll('[data-edit-slot]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
  if (restoreFocus && slot) document.querySelector(`[data-edit-slot="${slot}"]`)?.focus({ preventScroll: true });
}

function restorePickerPage() {
  if (pickerScrollPosition !== null) {
    document.body.classList.remove('picker-open');
    document.body.style.removeProperty('top');
    document.documentElement.style.removeProperty('--picker-height');
    document.documentElement.style.removeProperty('--picker-top');
    window.scrollTo(0, pickerScrollPosition);
    pickerScrollPosition = null;
  }
}

function pickerWords(slot) {
  return library[slot].filter((word) => state.settings?.wordPool !== 'familiar' || word.familiar);
}

function updatePickerViewport() {
  if (pickerScrollPosition === null) return;
  const viewport = window.visualViewport;
  document.documentElement.style.setProperty('--picker-height', `${viewport?.height ?? innerHeight}px`);
  document.documentElement.style.setProperty('--picker-top', `${viewport?.offsetTop ?? 0}px`);
}

function updatePickerLayout() {
  if (!activePicker) return;
  if (compactPickerQuery.matches) {
    if (pickerScrollPosition === null) {
      pickerScrollPosition = window.scrollY;
      document.body.style.top = `-${pickerScrollPosition}px`;
      document.body.classList.add('picker-open');
    }
    updatePickerViewport();
  } else restorePickerPage();
}

function openWordPicker(slot) {
  if (state.phase !== 'claim' || state.me.claimDone || state.me.lockedSlot === slot) return;
  closeWordPicker(false);
  activePicker = { slot, query: '', family: '', page: 0 };
  const dialog = document.querySelector('#word-picker');
  document.querySelector('#picker-title').textContent = `Change ${slot}`;
  document.querySelector('#picker-context').innerHTML = slots.map((part) => {
    const label = escape(library[part].find((entry) => entry.id === claim[part]).label);
    return part === slot ? `<span>${label}</span>` : label;
  }).join(' ');
  const search = document.querySelector('#picker-search');
  search.value = '';
  search.placeholder = `Search ${pickerWords(slot).length} ${slot === 'character' ? 'characters' : slot === 'action' ? 'actions' : 'objects'}`;
  document.querySelector('.picker-families').open = false;
  document.querySelector('#picker-families').innerHTML = [...new Set(pickerWords(slot).map((entry) => entry.family))].sort()
    .map((family) => `<button class="word-button" data-family="${escape(family)}">${escape(family)}</button>`).join('');
  renderPickerResults();
  document.querySelector(`[data-edit-slot="${slot}"]`).setAttribute('aria-expanded', 'true');
  // Keep the drawing and choices in separate panes, including above a phone keyboard.
  updatePickerLayout();
  dialog.show();
  if (compactPickerQuery.matches) {
    dialog.querySelector('.picker-body').scrollTop = 0;
    dialog.querySelector('.picker-close').focus({ preventScroll: true });
  } else {
    search.focus();
  }
}

function renderPickerResults() {
  if (!activePicker) return;
  const { slot, query, family } = activePicker;
  const result = wordPage(pickerWords(slot), { ...activePicker, originalId: state.me.original[slot] });
  activePicker.page = result.page;
  const label = query.trim() ? `${result.total} match${result.total === 1 ? '' : 'es'}` : family || 'Similar shapes';
  document.querySelector('#picker-results').innerHTML = `<p class="picker-caption" role="status">${escape(label)}</p>
    <div class="picker-words">${result.entries.map((entry) => `<button class="word-button ${claim[slot] === entry.id ? 'selected' : ''}" data-slot="${slot}" data-word="${entry.id}" aria-pressed="${claim[slot] === entry.id}">${escape(entry.label)}</button>`).join('') || '<p class="muted">No matches. Try another word.</p>'}</div>
    ${result.pages > 1 ? `<div class="picker-pages"><button class="secondary" data-picker-page="-1" ${result.page === 0 ? 'disabled' : ''} aria-label="Previous words">←</button><span>${result.page + 1} / ${result.pages}</span><button class="secondary" data-picker-page="1" ${result.page === result.pages - 1 ? 'disabled' : ''} aria-label="Next words">→</button></div>` : ''}`;
  document.querySelectorAll('[data-family]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.family === family)));
}

function updateClaimPreview() {
  const changed = slots.filter((slot) => claim[slot] !== state.me.original[slot]).length;
  document.querySelector('#claim-preview').innerHTML = `<div>${slots.map((slot) => {
    const label = escape(library[slot].find((entry) => entry.id === claim[slot]).label);
    return state.me.lockedSlot === slot
      ? `<span class="claim-fixed" title="This part is locked">${label}</span>`
      : `<button class="claim-word" data-edit-slot="${slot}" aria-label="Change ${slot}: ${label}" aria-haspopup="dialog" aria-controls="word-picker" aria-expanded="false" ${state.me.claimDone ? 'disabled' : ''}>${label}</button>`;
  }).join(' ')}</div><div class="claim-feedback"><span class="badge ${changed ? 'lie' : ''}">${changed ? 'LIE' : 'TRUTH'}</span><span class="claim-status">${changed ? `${changed} part${changed > 1 ? 's' : ''} changed` : 'Original prompt'}</span></div>`;
  store('sketchy-claim', { key: stageKey, claim });
}

function updateVotes() {
  const targets = state.gallery.filter((entry) => entry.playerId !== state.meId);
  const voted = targets.filter((entry) => typeof state.me.votes[entry.playerId] === 'boolean').length;
  document.querySelectorAll('[data-vote]').forEach((button) => {
    const selected = state.me.votes[button.dataset.player] === (button.dataset.vote === 'true');
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = state.me.votesDone;
  });
  const finish = document.querySelector('[data-action="finish-votes"], [data-action="unlock-votes"]');
  if (finish) {
    finish.disabled = !state.me.votesDone && voted !== targets.length;
    finish.textContent = state.me.votesDone ? 'Unsubmit' : 'Submit';
    finish.dataset.action = state.me.votesDone ? 'unlock-votes' : 'finish-votes';
  }
}

function drawingTools(tools = ['pencil', 'eraser', 'undo', 'redo', 'bucket']) {
  const icons = {
    pencil: '<path d="m4 16 12-12 4 4-12 12-5 1zM13 7l4 4"/>',
    eraser: '<path d="m4 14 9-10 7 7-9 10H7zM9 9l7 7M11 21h10"/>',
    undo: '<path d="m9 5-5 5 5 5M4 10h10a6 6 0 0 1 0 12"/>',
    redo: '<path d="m15 5 5 5-5 5M20 10H10a6 6 0 0 0 0 12"/>',
    bucket: '<path d="m4 12 8-8 8 8-8 8zM8 2l6 6M3 12h18M20 16s-3 3-3 5a3 3 0 0 0 6 0c0-2-3-5-3-5z"/>',
  };
  return `<div class="tool-rail" aria-label="Drawing tools">${tools.map((tool) => `<button class="secondary drawing-tool" data-action="${tool}" aria-label="${tool[0].toUpperCase() + tool.slice(1)}" ${['undo', 'redo'].includes(tool) ? (tool === 'undo' ? !strokes.length : !redoStrokes.length) ? 'disabled' : '' : `aria-pressed="${drawingTool === tool}"`}><svg viewBox="0 0 26 26" aria-hidden="true">${icons[tool]}</svg><span>${tool[0].toUpperCase() + tool.slice(1)}</span></button>`).join('')}</div>`;
}

function updateDrawingTools() {
  for (const tool of ['pencil', 'eraser', 'bucket']) {
    document.querySelector(`[data-action="${tool}"]`)?.setAttribute('aria-pressed', String(drawingTool === tool));
  }
  for (const tool of ['undo', 'redo']) {
    const button = document.querySelector(`[data-action="${tool}"]`);
    if (button) button.disabled = tool === 'undo' ? !strokes.length : !redoStrokes.length;
  }
  document.querySelectorAll('[data-color]').forEach((swatch) => {
    swatch.classList.toggle('selected', swatch.dataset.color === penColor);
    swatch.setAttribute('aria-pressed', String(swatch.dataset.color === penColor));
  });
  const size = document.querySelector('#size-value');
  const opacity = document.querySelector('#opacity-value');
  const dot = document.querySelector('#brush-dot');
  if (size) size.value = `${penWidth} px`;
  if (opacity) opacity.value = `${Math.round(penOpacity * 100)}%`;
  if (dot) Object.assign(dot.style, { width: `${penWidth}px`, height: `${penWidth}px`, opacity: penOpacity, background: drawingTool === 'eraser' ? '#ffffff' : penColor });
}

function paint(canvas, paths) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 800, 500);
  for (const stroke of paths) drawStroke(context, stroke);
}

function paintGallery(entries) {
  paintPortraits();
  document.querySelectorAll('[data-gallery]').forEach((canvas) => {
    paint(canvas, entries.find((entry) => entry.playerId === canvas.dataset.gallery)?.strokes ?? []);
  });
}

function saveDraft() {
  if (state?.phase === 'lobby') {
    avatarDirty = true;
    store('sketchy-avatar', { playerId: state.meId, strokes });
    const status = document.querySelector('#avatar-status');
    if (status) status.textContent = 'Not saved';
    return;
  }
  dirtyDrawing = true;
  store('sketchy-drawing', { key: stageKey, strokes });
}

async function savePortrait(snapshot) {
  await send('avatar', { strokes: snapshot });
  avatarDirty = state.phase === 'lobby' && JSON.stringify(strokes) !== JSON.stringify(snapshot);
  const status = document.querySelector('#avatar-status');
  if (status) status.textContent = avatarDirty ? 'Not saved' : 'Saved';
}

function attachDrawing(canvas) {
  const portrait = canvas.id === 'avatar-canvas';
  const pointLimit = portrait ? 1500 : 12000;
  drawingPointer = null;
  activeStroke = null;
  function point(event) {
    const bounds = canvas.getBoundingClientRect();
    return [Math.max(0, Math.min(800, (event.clientX - bounds.left) / bounds.width * 800)), Math.max(0, Math.min(500, (event.clientY - bounds.top) / bounds.height * 500))];
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (drawingPointer !== null || (!portrait && (state.phase !== 'draw' || state.me.drawingDone)) || (portrait && state.phase !== 'lobby') || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (strokes.length >= (portrait ? 60 : 250)) { notify('The drawing is full. Undo a stroke to continue.'); return; }
    if (!portrait && drawingTool === 'bucket') {
      const context = canvas.getContext('2d');
      const [x, y] = point(event);
      const remaining = 12000 - strokes.reduce((count, stroke) => count + (stroke.spans?.length ?? 0), 0);
      try {
        const spans = fillSpans(context.getImageData(0, 0, 800, 500).data, 800, 500, x, y, remaining);
        strokes.push({ type: 'fill', color: penColor, opacity: penOpacity, spans });
        redoStrokes = [];
        paint(canvas, strokes);
        saveDraft();
        updateDrawingTools();
      } catch (error) { notify(error.message); }
      return;
    }
    if (strokes.reduce((count, stroke) => count + (stroke.points?.length ?? 0), 0) >= pointLimit) return;
    drawingPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    activeStroke = { color: drawingTool === 'eraser' ? '#ffffff' : penColor, width: penWidth, opacity: penOpacity, points: [point(event)] };
    redoStrokes = [];
    strokes.push(activeStroke);
    drawStroke(canvas.getContext('2d'), activeStroke);
    saveDraft();
    updateDrawingTools();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drawingPointer || !activeStroke) return;
    if (activeStroke.points.length >= (portrait ? 1500 : 2000) || strokes.reduce((count, stroke) => count + (stroke.points?.length ?? 0), 0) >= pointLimit) return;
    const next = point(event);
    const last = activeStroke.points.at(-1);
    if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
    activeStroke.points.push(next);
    // Replay the active stroke once so overlapping pointer samples preserve opacity.
    paint(canvas, strokes);
    if (portrait) saveDraft();
    else dirtyDrawing = true;
  });
  function end(event) {
    if (event.pointerId !== drawingPointer) return;
    drawingPointer = null;
    activeStroke = null;
    saveDraft();
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

async function withButton(button, operation) {
  button.disabled = true;
  try { await operation(); } catch (error) { notify(error.message); } finally {
    if (button.isConnected) button.disabled = false;
  }
}

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'join-form') return;
  event.preventDefault();
  const button = event.target.querySelector('[type="submit"]');
  const create = !event.target.querySelector('#room-code').value.trim();
  void withButton(button, () => enterRoom(create));
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'pen-size') penWidth = Number(event.target.value);
  if (event.target.id === 'pen-opacity') penOpacity = Number(event.target.value) / 100;
  if (event.target.id === 'pen-size' || event.target.id === 'pen-opacity') updateDrawingTools();
  if (event.target.id === 'room-code') {
    document.querySelector('#join-form [type="submit"]').textContent = event.target.value.trim() ? 'Join room' : 'Create room';
  }
  if (event.target.id === 'picker-search' && activePicker) {
    activePicker.query = event.target.value;
    activePicker.page = 0;
    renderPickerResults();
  }
});

app.addEventListener('change', (event) => {
  if (event.target.id === 'pen-size') penWidth = Number(event.target.value);
});

app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.color) {
    penColor = button.dataset.color;
    if (drawingTool === 'eraser') drawingTool = 'pencil';
    updateDrawingTools();
    return;
  }
  if (button.dataset.editSlot) return openWordPicker(button.dataset.editSlot);
  if (button.dataset.family && activePicker) {
    activePicker.family = button.dataset.family;
    activePicker.query = '';
    activePicker.page = 0;
    document.querySelector('#picker-search').value = '';
    document.querySelector('.picker-families').open = false;
    renderPickerResults();
    document.querySelector('.picker-words button')?.focus();
    return;
  }
  if (button.dataset.pickerPage && activePicker) {
    activePicker.page += Number(button.dataset.pickerPage);
    renderPickerResults();
    const direction = button.dataset.pickerPage;
    const nextButton = document.querySelector(`[data-picker-page="${direction}"]:not(:disabled)`)
      ?? document.querySelector('[data-picker-page]:not(:disabled)');
    nextButton?.focus();
    return;
  }
  if (button.dataset.word && activePicker && !state.me.claimDone && button.dataset.slot === activePicker.slot) {
    const slot = activePicker.slot;
    claim[slot] = button.dataset.word;
    closeWordPicker(false);
    updateClaimPreview();
    document.querySelector(`[data-edit-slot="${slot}"]`)?.focus();
    return;
  }
  if (button.dataset.vote) {
    button.disabled = true;
    try { await send('vote', { targetId: button.dataset.player, truth: button.dataset.vote === 'true' }); } catch { /* send displays the failure. */ }
    finally { if (button.isConnected) updateVotes(); }
    return;
  }
  const action = button.dataset.action;
  if (action === 'save-avatar') return void withButton(button, async () => {
    await savePortrait(structuredClone(strokes));
  });
  if (action === 'clear-avatar') {
    strokes = [];
    redoStrokes = [];
    saveDraft();
    paint(document.querySelector('#avatar-canvas'), strokes);
    updateDrawingTools();
    return;
  }
  if (action === 'reveal-next') return void withButton(button, () => send('reveal-next', { step: state.revealStep }));
  if (action === 'close-picker') return closeWordPicker();
  if (action === 'toggle-code') {
    roomCodeVisible = !roomCodeVisible;
    button.textContent = roomCodeVisible ? state.code : '••••••';
    button.setAttribute('aria-label', `${roomCodeVisible ? 'Hide' : 'Reveal'} room code`);
    button.setAttribute('aria-pressed', String(roomCodeVisible));
    return;
  }

  if (action === 'copy-code' || action === 'copy-link') {
    const value = action === 'copy-code' ? state.code : `${location.origin}/?room=${state.code}`;
    try { await navigator.clipboard.writeText(value); notify(action === 'copy-code' ? 'Room code copied.' : 'Invite link copied.'); }
    catch { notify(`Copy this: ${value}`); }
    return;
  }
  if (action === 'leave') {
    return void withButton(button, async () => { await api('leave', {}); clearSession(); });
  }
  if (['pencil', 'eraser', 'bucket'].includes(action)) {
    drawingTool = action;
    updateDrawingTools();
    return;
  }
  if (action === 'undo' || action === 'redo') {
    if (action === 'undo' && strokes.length) redoStrokes.push(strokes.pop());
    if (action === 'redo' && redoStrokes.length) strokes.push(redoStrokes.pop());
    drawingPointer = null;
    activeStroke = null;
    paint(document.querySelector(state.phase === 'lobby' ? '#avatar-canvas' : '#draw-canvas'), strokes);
    saveDraft();
    updateDrawingTools();
    return;
  }
  if (action === 'reset-claim') {
    closeWordPicker(false);
    claim = { ...state.me.original };
    updateClaimPreview();
    return;
  }
  if (action === 'reroll-prompt') {
    rerollPending = true;
    button.disabled = true;
    try { await send('reroll-prompt'); } catch { /* send displays the failure. */ }
    finally { rerollPending = false; updateTimer(); }
    return;
  }
  if (action === 'done-drawing') {
    drawingPointer = null;
    activeStroke = null;
    const snapshot = structuredClone(strokes);
    return void withButton(button, async () => {
      await send('drawing', { strokes: snapshot, done: true });
      dirtyDrawing = false;
    });
  }
  if (action === 'done-claim') {
    closeWordPicker(false);
    return void withButton(button, () => send('claim', { claim: { ...claim } }));
  }
  if (['start', 'next', 'rematch', 'finish-votes', 'unlock-drawing', 'unlock-claim', 'unlock-votes'].includes(action)) return void withButton(button, () => send(action));
  if (action === 'remove') return void withButton(button, () => send('remove', { playerId: button.dataset.player }));
});

setInterval(updateTimer, 250);
setInterval(async () => {
  if (!connected || !dirtyDrawing || saving || state?.phase !== 'draw' || state.me.drawingDone) return;
  saving = true;
  dirtyDrawing = false;
  try { await send('drawing', { strokes: structuredClone(strokes), done: false }, true); }
  catch { if (state?.phase === 'draw') dirtyDrawing = true; }
  finally { saving = false; }
}, 1000);

window.addEventListener('pagehide', () => {
  if (state?.phase === 'draw') store('sketchy-drawing', { key: stageKey, strokes });
  streamController?.abort();
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && session) void connectRoom();
});


async function boot() {
  try {
    const response = await fetch(`${gameEndpoint}?op=vocabulary`);
    if (!response.ok) throw new Error('Could not load the word library.');
    library = await response.json();
    renderHome();
    if (session) {
      app.innerHTML = '<div class="panel"><h2>Rejoining your room…</h2></div>';
      void connectRoom();
    }
    const registry = document.modelContext;
    if (registry?.registerTool) {
      const lifecycle = new AbortController();
      window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
      const tools = [
        { name: 'read_game_state', description: 'Read the current player-visible phase, score, and room. Private information follows the game rules.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => state ? structuredClone(state) : { phase: 'home' } },
        { name: 'create_game_room', description: 'Create a room and join it with a nickname. Only available before joining a room.', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 20 } }, required: ['name'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input) => { if (session || typeof input?.name !== 'string') throw new Error('Enter a nickname before joining a room.'); return enterRoom(true, input); } },
      ];
      for (const tool of tools) {
        try { await registry.registerTool(tool, { signal: lifecycle.signal }); } catch { /* Unsupported optional tooling does not interrupt gameplay. */ }
      }
    }
  } catch (error) {
    app.innerHTML = `<div class="panel"><h2>Could not connect.</h2><p>${escape(error.message)}</p><p>Refresh once the local server is running.</p></div>`;
  }
}

void boot();

// The compact picker shares its viewport with the drawing instead of covering it.
app.addEventListener('cancel', (event) => {
  if (event.target.id === 'word-picker') {
    event.preventDefault();
    closeWordPicker();
  }
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && activePicker) {
    event.preventDefault();
    closeWordPicker();
  }
  if (event.key === 'Tab' && activePicker && compactPickerQuery.matches) {
    const controls = [...document.querySelector('.claim-layout').querySelectorAll('button:not(:disabled), input, summary')]
      .filter((control) => control.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
document.addEventListener('click', (event) => {
  if (activePicker && !event.target.closest('#word-picker, [data-edit-slot]')) closeWordPicker(false);
  else if (activePicker && event.target.id === 'word-picker') {
    const bounds = event.target.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeWordPicker();
  }
}, true);
compactPickerQuery.addEventListener('change', updatePickerLayout);
window.visualViewport?.addEventListener('resize', updatePickerViewport);
window.visualViewport?.addEventListener('scroll', updatePickerViewport);
