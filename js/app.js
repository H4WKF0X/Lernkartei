/**
 * Steuert die Oberfläche: Ansichten, Ereignisse und die Anbindung der
 * anderen Module.
 */

import { parseDeck, DeckFormatError } from './parser.js';
import { renderCard } from './render.js';
import * as store from './store.js';
import * as learn from './session.js';

/**
 * @typedef {{ id: string, file: string, title: string, count: number, error?: string }} DeckEntry
 * @typedef {{ n: number, front: string, back: string }} Card
 * @typedef {{ entry: DeckEntry, title: string, cards: Map<number, Card>, state: learn.SessionState, startedAt: number, revealed: boolean }} Active
 */

const INDEX_FILE = 'decks/index.json';

/**
 * Holt ein Element nach seiner Kennung.
 *
 * @param {string} id Kennung im HTML.
 * @returns {HTMLElement} Das Element.
 */
function byId(id) {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`Element ${id} fehlt im HTML.`);
  }
  return node;
}

const ui = {
  storageHint: byId('storage-hint'),
  viewHome: byId('view-home'),
  viewSession: byId('view-session'),
  viewDone: byId('view-done'),
  homeMessage: byId('home-message'),
  reloadIndex: byId('reload-index'),
  deckGrid: byId('deck-grid'),
  openSessions: byId('open-sessions'),
  sessionGrid: byId('session-grid'),
  sessionTitle: byId('session-title'),
  sessionProgress: byId('session-progress'),
  sessionWarnings: byId('session-warnings'),
  card: /** @type {HTMLButtonElement} */ (byId('card')),
  cardInner: byId('card-inner'),
  frontNumber: byId('front-number'),
  frontText: byId('front-text'),
  backNumber: byId('back-number'),
  backText: byId('back-text'),
  answerWrong: /** @type {HTMLButtonElement} */ (byId('answer-wrong')),
  answerRight: /** @type {HTMLButtonElement} */ (byId('answer-right')),
  doneMessage: byId('done-message'),
  restart: byId('restart'),
  toHome: byId('to-home'),
  settings: /** @type {HTMLDialogElement} */ (byId('settings')),
  openSettings: byId('open-settings'),
  openSettingsSession: byId('open-settings-session'),
  settingRequired: /** @type {HTMLInputElement} */ (byId('setting-required')),
  settingOrder: /** @type {HTMLSelectElement} */ (byId('setting-order')),
  settingTheme: /** @type {HTMLSelectElement} */ (byId('setting-theme')),
  clearProgress: byId('clear-progress'),
  resume: /** @type {HTMLDialogElement} */ (byId('resume')),
  resumeMessage: byId('resume-message'),
  resumeContinue: byId('resume-continue'),
  resumeRestart: byId('resume-restart'),
  leaveSession: byId('leave-session'),
};

const app = {
  /** @type {store.Settings} */
  settings: { ...store.DEFAULT_SETTINGS },
  /** @type {DeckEntry[]} */
  decks: [],
  /** @type {Active | null} */
  active: null,
  /** @type {string} */
  view: 'home',
  storageOk: true,
};

/**
 * Gibt die KaTeX-Bibliothek.
 *
 * @returns {{ renderToString: (src: string, options: object) => string }} KaTeX.
 */
function katexLib() {
  const lib = /** @type {{ renderToString?: (src: string, options: object) => string }} */ (
    /** @type {unknown} */ (window).katex
  );
  if (lib === undefined || typeof lib.renderToString !== 'function') {
    throw new Error('KaTeX ist nicht geladen.');
  }
  return /** @type {{ renderToString: (src: string, options: object) => string }} */ (lib);
}

/**
 * Setzt das Farbschema auf das Wurzelelement.
 *
 * @param {string} theme "auto", "light" oder "dark".
 * @returns {void}
 */
function applyTheme(theme) {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
    return;
  }
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Macht aus einem Zeitpunkt eine Angabe wie "vor 2 Tagen".
 *
 * @param {number} then Zeitpunkt in Millisekunden.
 * @param {number} now Jetzt, in Millisekunden.
 * @returns {string} Die Angabe auf Deutsch.
 */
export function relativeTime(then, now) {
  const diff = Math.max(0, now - then);
  const minute = 60000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) {
    return 'gerade eben';
  }
  const format = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
  if (diff < hour) {
    return format.format(-Math.round(diff / minute), 'minute');
  }
  if (diff < day) {
    return format.format(-Math.round(diff / hour), 'hour');
  }
  return format.format(-Math.round(diff / day), 'day');
}

/**
 * Schaltet auf eine Ansicht um.
 *
 * @param {string} name "home", "session" oder "done".
 * @param {boolean} push true, wenn ein History-Eintrag entsteht.
 * @returns {void}
 */
function showView(name, push) {
  app.view = name;
  ui.viewHome.hidden = name !== 'home';
  ui.viewSession.hidden = name !== 'session';
  ui.viewDone.hidden = name !== 'done';
  if (push) {
    history.pushState({ view: name }, '');
  }
}

/**
 * Zeigt eine Meldung auf der Startseite.
 *
 * @param {string} text Die Meldung, oder ein leerer String.
 * @param {boolean} withReload true, wenn ein Neu-laden-Knopf dazu gehört.
 * @returns {void}
 */
function setHomeMessage(text, withReload) {
  ui.homeMessage.textContent = text;
  ui.homeMessage.hidden = text.length === 0;
  ui.reloadIndex.hidden = !withReload;
}

/**
 * Baut eine Kachel.
 *
 * @param {string} title Titel der Kachel.
 * @param {string} meta Kleingedruckte Zeile darunter.
 * @param {boolean} enabled false macht die Kachel unklickbar.
 * @param {() => void} onClick Aktion beim Klick.
 * @returns {HTMLButtonElement} Die Kachel.
 */
function buildTile(title, meta, enabled, onClick) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'tile';
  const head = document.createElement('span');
  head.className = 'tile-title';
  head.textContent = title;
  const info = document.createElement('span');
  info.className = 'meta';
  info.textContent = meta;
  tile.append(head, info);
  tile.disabled = !enabled;
  if (enabled) {
    tile.addEventListener('click', onClick);
  }
  return tile;
}

/**
 * Zeichnet die Startseite neu.
 *
 * @returns {void}
 */
function renderHome() {
  ui.deckGrid.replaceChildren();
  for (const entry of app.decks) {
    const broken = typeof entry.error === 'string' && entry.error.length > 0;
    const meta = broken ? entry.error : `${entry.count} Karten`;
    const tile = buildTile(entry.title, meta, !broken, () => {
      void openDeck(entry);
    });
    tile.dataset.deckId = entry.id;
    ui.deckGrid.append(tile);
  }

  const known = new Map(app.decks.map((entry) => [entry.id, entry]));
  const sessions = store.readAllSessions().filter((session) => known.has(session.deckId));
  ui.sessionGrid.replaceChildren();
  const now = Date.now();
  for (const session of sessions) {
    const entry = known.get(session.deckId);
    if (entry === undefined) {
      continue;
    }
    const done = learn.doneCount(
      { counts: session.counts, queue: session.queue, total: session.total },
      app.settings.requiredCorrect,
    );
    const meta = `${done}/${session.total} · ${relativeTime(session.updatedAt, now)}`;
    ui.sessionGrid.append(
      buildTile(session.deckTitle, meta, true, () => {
        void startSession(entry, true);
      }),
    );
  }
  ui.openSessions.hidden = sessions.length === 0;
}

/**
 * Lädt die Deck-Liste und zeichnet die Startseite.
 *
 * @returns {Promise<void>} Erfüllt, wenn die Liste verarbeitet ist.
 */
async function loadIndex() {
  try {
    const response = await fetch(INDEX_FILE, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(String(response.status));
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Kein Array.');
    }
    app.decks = data.filter(
      (entry) => typeof entry === 'object' && entry !== null && typeof entry.id === 'string',
    );
    setHomeMessage(
      app.decks.length === 0
        ? 'Noch keine Decks vorhanden. Lege eine .tex-Datei im Ordner decks/ ab.'
        : '',
      false,
    );
  } catch {
    app.decks = [];
    setHomeMessage('Deck-Liste konnte nicht geladen werden.', true);
  }
  renderHome();
}

/**
 * Markiert die Kachel eines Decks als fehlerhaft.
 *
 * @param {string} deckId Kennung des Decks.
 * @param {string} message Die Meldung für die Kachel.
 * @returns {void}
 */
function markDeckBroken(deckId, message) {
  const tiles = ui.deckGrid.querySelectorAll('.tile');
  for (const tile of tiles) {
    if (tile instanceof HTMLButtonElement && tile.dataset.deckId === deckId) {
      tile.disabled = true;
      const meta = tile.querySelector('.meta');
      if (meta !== null) {
        meta.textContent = message;
      }
    }
  }
}

/**
 * Lädt eine Deck-Datei und liest sie.
 *
 * @param {DeckEntry} entry Eintrag aus der Deck-Liste.
 * @returns {Promise<{ id: string, title: string, cards: Card[], warnings: string[] }>} Das Deck.
 */
async function fetchDeck(entry) {
  const response = await fetch(entry.file, { cache: 'no-store' });
  if (!response.ok) {
    throw new DeckFormatError(
      `Datei ${entry.file} ist nicht erreichbar (Fehler ${response.status}).`,
    );
  }
  return parseDeck(await response.text(), entry.file);
}

/**
 * Reagiert auf einen Klick auf eine Deck-Kachel.
 *
 * @param {DeckEntry} entry Eintrag aus der Deck-Liste.
 * @returns {Promise<void>} Erfüllt, wenn die Session läuft oder eine
 *   Meldung steht.
 */
async function openDeck(entry) {
  const stored = store.readSession(entry.id);
  if (stored === null) {
    await startSession(entry, false);
    return;
  }
  const done = learn.doneCount(
    { counts: stored.counts, queue: stored.queue, total: stored.total },
    app.settings.requiredCorrect,
  );
  ui.resumeMessage.textContent =
    `Für ${stored.deckTitle} ist eine Session offen: ${done} von ${stored.total} Karten fertig.`;
  ui.resume.returnValue = '';
  ui.resume.showModal();
  ui.resumeContinue.onclick = () => {
    ui.resume.close();
    void startSession(entry, true);
  };
  ui.resumeRestart.onclick = () => {
    ui.resume.close();
    void startSession(entry, false);
  };
}

/**
 * Startet oder setzt eine Session fort.
 *
 * @param {DeckEntry} entry Eintrag aus der Deck-Liste.
 * @param {boolean} resume true, wenn der gespeicherte Stand gilt.
 * @returns {Promise<void>} Erfüllt, wenn die Ansicht steht.
 */
async function startSession(entry, resume) {
  /** @type {{ id: string, title: string, cards: Card[], warnings: string[] }} */
  let deck;
  try {
    deck = await fetchDeck(entry);
  } catch (error) {
    const message =
      error instanceof DeckFormatError
        ? error.message
        : `Datei ${entry.file} konnte nicht gelesen werden.`;
    markDeckBroken(entry.id, message);
    setHomeMessage(message, false);
    return;
  }

  if (deck.cards.length === 0) {
    const message = `In der Datei ${entry.file} wurden keine Karten gefunden.`;
    markDeckBroken(entry.id, message);
    setHomeMessage(message, false);
    return;
  }

  const numbers = deck.cards.map((card) => card.n);
  const title = deck.title.length > 0 ? deck.title : entry.title;
  /** @type {string[]} */
  const notes = deck.warnings.slice();
  /** @type {learn.SessionState} */
  let state;
  let startedAt = Date.now();

  const stored = resume ? store.readSession(entry.id) : null;
  if (stored !== null) {
    const result = learn.reconcile(
      { counts: stored.counts, queue: stored.queue, total: stored.total },
      numbers,
      app.settings.requiredCorrect,
    );
    state = result.state;
    startedAt = stored.startedAt;
    if (result.added > 0 || result.removed > 0) {
      notes.push(
        `Das Deck wurde geändert: ${result.added} Karten neu, ${result.removed} entfernt.`,
      );
    }
  } else {
    state = learn.createState(numbers, app.settings.order, Math.random);
  }

  app.active = {
    entry,
    title,
    cards: new Map(deck.cards.map((card) => [card.n, card])),
    state,
    startedAt,
    revealed: false,
  };

  ui.sessionTitle.textContent = title;
  ui.sessionWarnings.hidden = notes.length === 0;
  ui.sessionWarnings.textContent = notes.join(' ');
  persist();

  if (learn.currentCard(state) === null) {
    showDone(true);
    return;
  }
  showView('session', true);
  showCurrentCard(false);
}

/**
 * Schreibt den Stand der laufenden Session.
 *
 * @returns {void}
 */
function persist() {
  const active = app.active;
  if (active === null) {
    return;
  }
  const ok = store.writeSession({
    schemaVersion: 1,
    deckId: active.entry.id,
    deckTitle: active.title,
    startedAt: active.startedAt,
    updatedAt: Date.now(),
    counts: active.state.counts,
    queue: active.state.queue,
    total: active.state.total,
  });
  if (!ok && app.storageOk) {
    app.storageOk = false;
    ui.storageHint.hidden = false;
  }
}

/**
 * Setzt den Fortschritt in der Kopfzeile.
 *
 * @returns {void}
 */
function updateProgress() {
  const active = app.active;
  if (active === null) {
    return;
  }
  const done = learn.doneCount(active.state, app.settings.requiredCorrect);
  ui.sessionProgress.textContent = `${done}/${active.state.total} fertig`;
}

/**
 * Setzt die Höhe der Karte auf die höhere der beiden Seiten.
 *
 * Beide Seiten sind absolut positioniert. Ohne diese Messung springt das
 * Layout beim Drehen.
 *
 * @returns {void}
 */
function measureCard() {
  const faces = ui.card.querySelectorAll('.card-face');
  let content = 0;
  let frame = 0;
  for (const face of faces) {
    const body = face.querySelector('.card-body');
    if (body !== null) {
      content = Math.max(content, body.scrollHeight);
    }
    const style = window.getComputedStyle(face);
    frame = Math.max(
      frame,
      Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
    );
  }
  const height = `${Math.ceil(content + frame)}px`;
  if (ui.card.style.height !== height) {
    ui.card.style.height = height;
  }
}

/**
 * Zeigt die vorderste Karte mit der Frageseite nach oben.
 *
 * @param {boolean} fade true, wenn die neue Karte eingeblendet wird.
 * @returns {void}
 */
function showCurrentCard(fade) {
  const active = app.active;
  if (active === null) {
    return;
  }
  const n = learn.currentCard(active.state);
  if (n === null) {
    showDone(true);
    return;
  }
  const card = active.cards.get(n);
  if (card === undefined) {
    return;
  }

  /** @type {{ renderToString: (src: string, options: object) => string }} */
  let katex;
  try {
    katex = katexLib();
  } catch {
    setHomeMessage('KaTeX fehlt im Ordner vendor/. Die App kann keine Karten anzeigen.', false);
    goHome();
    return;
  }
  active.revealed = false;
  setAnswersEnabled(false);
  ui.frontNumber.textContent = String(n);
  ui.backNumber.textContent = String(n);
  ui.frontText.innerHTML = renderCard(card.front, katex);
  ui.backText.innerHTML = renderCard(card.back, katex);

  ui.cardInner.classList.add('instant');
  ui.cardInner.classList.remove('flipped');
  if (fade) {
    ui.card.classList.add('fading');
    void ui.card.offsetHeight;
  }
  measureCard();
  updateProgress();

  window.requestAnimationFrame(() => {
    ui.cardInner.classList.remove('instant');
    ui.card.classList.remove('fading');
    measureCard();
  });
}

/**
 * Schaltet die Antwort-Knöpfe.
 *
 * @param {boolean} enabled true macht sie klickbar.
 * @returns {void}
 */
function setAnswersEnabled(enabled) {
  ui.answerWrong.disabled = !enabled;
  ui.answerRight.disabled = !enabled;
}

/**
 * Dreht die Karte.
 *
 * @returns {void}
 */
function flipCard() {
  const active = app.active;
  if (active === null) {
    return;
  }
  const flipped = ui.cardInner.classList.toggle('flipped');
  if (flipped) {
    active.revealed = true;
    setAnswersEnabled(true);
  }
}

/**
 * Verarbeitet eine Antwort.
 *
 * @param {boolean} correct true bei "Gewusst".
 * @returns {void}
 */
function submitAnswer(correct) {
  const active = app.active;
  if (active === null || !active.revealed) {
    return;
  }
  active.state = learn.answer(
    active.state,
    correct,
    app.settings.requiredCorrect,
    app.settings.order,
    Math.random,
  );
  persist();
  if (learn.currentCard(active.state) === null) {
    showDone(true);
    return;
  }
  showCurrentCard(true);
}

/**
 * Zeigt die Abschluss-Ansicht und löscht die Session.
 *
 * @param {boolean} push true, wenn ein History-Eintrag entsteht.
 * @returns {void}
 */
function showDone(push) {
  const active = app.active;
  if (active === null) {
    return;
  }
  ui.doneMessage.textContent = `Fertig — ${active.state.total} von ${active.state.total} Karten.`;
  store.deleteSession(active.entry.id);
  showView('done', push);
  renderHome();
}

/**
 * Geht zur Startseite zurück. Die Session bleibt gespeichert.
 *
 * @returns {void}
 */
function goHome() {
  app.active = null;
  renderHome();
  showView('home', true);
}

/**
 * Übernimmt geänderte Einstellungen.
 *
 * @returns {void}
 */
function onSettingsChanged() {
  const required = Number.parseInt(ui.settingRequired.value, 10);
  app.settings = {
    schemaVersion: 1,
    requiredCorrect: Number.isInteger(required) ? Math.min(5, Math.max(1, required)) : 2,
    order: ui.settingOrder.value,
    theme: ui.settingTheme.value,
  };
  ui.settingRequired.value = String(app.settings.requiredCorrect);
  store.writeSettings(app.settings);
  applyTheme(app.settings.theme);

  const active = app.active;
  if (active !== null) {
    const before = learn.currentCard(active.state);
    active.state = learn.resyncQueue(active.state, app.settings.requiredCorrect);
    persist();
    updateProgress();
    if (learn.currentCard(active.state) === null) {
      showDone(true);
    } else if (learn.currentCard(active.state) !== before) {
      showCurrentCard(true);
    }
  }
  renderHome();
}

/**
 * Verbindet alle Ereignisse.
 *
 * @returns {void}
 */
function wireEvents() {
  ui.card.addEventListener('click', flipCard);
  ui.answerRight.addEventListener('click', () => submitAnswer(true));
  ui.answerWrong.addEventListener('click', () => submitAnswer(false));
  ui.leaveSession.addEventListener('click', goHome);
  ui.toHome.addEventListener('click', goHome);
  ui.reloadIndex.addEventListener('click', () => {
    void loadIndex();
  });
  ui.restart.addEventListener('click', () => {
    const active = app.active;
    if (active !== null) {
      void startSession(active.entry, false);
    }
  });

  ui.storageHint.addEventListener('click', () => {
    ui.storageHint.hidden = true;
  });
  ui.sessionWarnings.addEventListener('click', () => {
    ui.sessionWarnings.hidden = true;
  });

  for (const button of [ui.openSettings, ui.openSettingsSession]) {
    button.addEventListener('click', () => {
      ui.settingRequired.value = String(app.settings.requiredCorrect);
      ui.settingOrder.value = app.settings.order;
      ui.settingTheme.value = app.settings.theme;
      ui.settings.showModal();
    });
  }
  ui.settings.addEventListener('click', (event) => {
    if (event.target === ui.settings) {
      ui.settings.close();
    }
  });
  ui.resume.addEventListener('click', (event) => {
    if (event.target === ui.resume) {
      ui.resume.close();
    }
  });
  for (const field of [ui.settingRequired, ui.settingOrder, ui.settingTheme]) {
    field.addEventListener('change', onSettingsChanged);
  }
  ui.clearProgress.addEventListener('click', () => {
    if (!window.confirm('Den gesamten Fortschritt löschen?')) {
      return;
    }
    store.clearAll();
    app.settings = { ...store.DEFAULT_SETTINGS };
    applyTheme(app.settings.theme);
    ui.settingRequired.value = String(app.settings.requiredCorrect);
    ui.settingOrder.value = app.settings.order;
    ui.settingTheme.value = app.settings.theme;
    app.active = null;
    renderHome();
    showView('home', false);
    ui.settings.close();
  });

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('popstate', (event) => {
    const data = /** @type {{ view?: string } | null} */ (event.state);
    const wanted = data !== null && typeof data.view === 'string' ? data.view : 'home';
    const active = app.active;
    const runs = active !== null && learn.currentCard(active.state) !== null;
    const name = wanted === 'session' && !runs ? 'home' : wanted;
    if (name === 'home') {
      app.active = null;
      renderHome();
    }
    showView(name, false);
  });

  if (window.ResizeObserver !== undefined) {
    const observer = new ResizeObserver(() => measureCard());
    for (const body of ui.card.querySelectorAll('.card-body')) {
      observer.observe(body);
    }
  }
  if (document.fonts !== undefined) {
    void document.fonts.ready.then(() => measureCard());
  }
}

/**
 * Behandelt die Tastatur.
 *
 * @param {KeyboardEvent} event Das Ereignis.
 * @returns {void}
 */
function onKeyDown(event) {
  if (ui.settings.open || ui.resume.open) {
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
    return;
  }
  if (event.key === 'Escape') {
    if (app.view !== 'home') {
      goHome();
    }
    return;
  }
  if (app.view !== 'session') {
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    if (target instanceof HTMLButtonElement) {
      return;
    }
    event.preventDefault();
    flipCard();
    return;
  }
  if (event.key === 'ArrowRight' || event.key === '2') {
    event.preventDefault();
    submitAnswer(true);
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === '1') {
    event.preventDefault();
    submitAnswer(false);
  }
}

/**
 * Meldet den Service Worker an.
 *
 * @returns {void}
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
    return;
  }
  void navigator.serviceWorker.register('sw.js').catch(() => {
    /* Ohne Service Worker läuft die App weiter, nur nicht offline. */
  });
}

/**
 * Startet die App.
 *
 * @returns {void}
 */
function start() {
  app.storageOk = store.isAvailable();
  ui.storageHint.hidden = app.storageOk;
  app.settings = store.readSettings();
  applyTheme(app.settings.theme);
  wireEvents();
  history.replaceState({ view: 'home' }, '');
  showView('home', false);
  void loadIndex();
  registerServiceWorker();
}

start();
