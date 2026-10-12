/**
 * Steuert die Oberfläche: Ansichten, Ereignisse und die Anbindung der
 * anderen Module.
 */

import { parseDeck, DeckFormatError } from './parser.js';
import { renderCard } from './render.js';
import * as store from './store.js';
import * as learn from './session.js';
import * as quiz from './test.js';

/**
 * @typedef {{ id: string, file: string, title: string, count: number, error?: string }} DeckEntry
 * @typedef {{ n: number, front: string, back: string }} Card
 * @typedef {{ entry: DeckEntry, title: string, cards: Map<number, Card>, state: learn.SessionState, startedAt: number }} Active
 * @typedef {{ deckIds: string[], questions: quiz.Question[], index: number, correct: number, startedAt: number }} RunningTest
 */

const INDEX_FILE = 'decks/index.json';

const DEFAULT_TEST_COUNT = 10;

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
  openTest: byId('open-test'),
  leaveTestSetup: byId('leave-test-setup'),
  openSettingsTest: byId('open-settings-test'),
  testTopics: byId('test-topics'),
  testCount: /** @type {HTMLInputElement} */ (byId('test-count')),
  testAvailable: byId('test-available'),
  testStart: /** @type {HTMLButtonElement} */ (byId('test-start')),
  testScore: byId('test-score'),
  testResult: byId('test-result'),
  testAgain: byId('test-again'),
  testToHome: byId('test-to-home'),
};

const app = {
  /** @type {store.Settings} */
  settings: { ...store.DEFAULT_SETTINGS },
  /** @type {DeckEntry[]} */
  decks: [],
  /** @type {Active | null} */
  active: null,
  /** @type {RunningTest | null} */
  test: null,
  /** @type {string[]} */
  lastTestDecks: [],
  /** @type {string} */
  mode: 'learn',
  /** @type {string} */
  view: 'home',
  revealed: false,
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
  for (const section of document.querySelectorAll('.view')) {
    section.hidden = section.id !== `view-${name}`;
  }
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
  const openTest = store.readTest();
  if (openTest !== null) {
    const meta = `${openTest.index}/${openTest.questions.length} · ${relativeTime(openTest.updatedAt, now)}`;
    ui.sessionGrid.append(
      buildTile('Probetest', meta, true, () => {
        resumeTest(openTest);
      }),
    );
  }
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
  ui.openSessions.hidden = sessions.length === 0 && openTest === null;
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
  };
  app.mode = 'learn';
  app.test = null;

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
 * Zeigt eine Karte mit der Frageseite nach oben.
 *
 * Diese Funktion gilt für die Session und für den Probetest.
 *
 * @param {Card} card Die Karte.
 * @param {boolean} fade true, wenn die neue Karte eingeblendet wird.
 * @returns {void}
 */
function showCard(card, fade) {
  /** @type {{ renderToString: (src: string, options: object) => string }} */
  let katex;
  try {
    katex = katexLib();
  } catch {
    setHomeMessage('KaTeX fehlt im Ordner vendor/. Die App kann keine Karten anzeigen.', false);
    goHome();
    return;
  }
  app.revealed = false;
  setAnswersEnabled(false);
  ui.frontNumber.textContent = String(card.n);
  ui.backNumber.textContent = String(card.n);
  ui.frontText.innerHTML = renderCard(card.front, katex);
  ui.backText.innerHTML = renderCard(card.back, katex);

  ui.cardInner.classList.add('instant');
  ui.cardInner.classList.remove('flipped');
  if (fade) {
    ui.card.classList.add('fading');
    void ui.card.offsetHeight;
  }
  measureCard();

  window.requestAnimationFrame(() => {
    ui.cardInner.classList.remove('instant');
    ui.card.classList.remove('fading');
    measureCard();
  });
}

/**
 * Zeigt die vorderste Karte der Session mit der Frageseite nach oben.
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
  showCard(card, fade);
  updateProgress();
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
  if (app.active === null && app.test === null) {
    return;
  }
  const flipped = ui.cardInner.classList.toggle('flipped');
  if (flipped) {
    app.revealed = true;
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
  if (!app.revealed) {
    return;
  }
  if (app.mode === 'test') {
    submitTestAnswer(correct);
    return;
  }
  const active = app.active;
  if (active === null) {
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
  app.test = null;
  app.mode = 'learn';
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
 * Gibt die Kennungen der angekreuzten Themen.
 *
 * @returns {string[]} Die Kennungen in der Reihenfolge der Liste.
 */
function selectedDeckIds() {
  const boxes = ui.testTopics.querySelectorAll('input[type="checkbox"]');
  /** @type {string[]} */
  const ids = [];
  for (const box of boxes) {
    if (box instanceof HTMLInputElement && box.checked) {
      ids.push(box.value);
    }
  }
  return ids;
}

/**
 * Zählt die Karten der angekreuzten Themen.
 *
 * @returns {number} Anzahl der Karten.
 */
function availableCards() {
  const ids = new Set(selectedDeckIds());
  let total = 0;
  for (const entry of app.decks) {
    if (ids.has(entry.id)) {
      total += typeof entry.count === 'number' ? entry.count : 0;
    }
  }
  return total;
}

/**
 * Richtet das Zahlenfeld an der Anzahl der gewählten Karten aus.
 *
 * @param {boolean} reset true setzt den Vorgabewert.
 * @returns {void}
 */
function updateTestLimits(reset) {
  const available = availableCards();
  ui.testCount.max = String(Math.max(1, available));
  ui.testAvailable.textContent =
    available > 0
      ? `${available} Karten stehen zur Wahl.`
      : 'Wähle mindestens ein Thema.';
  const typed = Number.parseInt(ui.testCount.value, 10);
  const wanted = reset || !Number.isInteger(typed) ? DEFAULT_TEST_COUNT : typed;
  ui.testCount.value = available > 0 ? String(Math.min(available, Math.max(1, wanted))) : '';
  ui.testStart.disabled = available === 0;
}

/**
 * Zeichnet die Themenliste des Probetests.
 *
 * @param {string[]} selected Kennungen, die angekreuzt sein sollen.
 * @returns {void}
 */
function renderTopics(selected) {
  ui.testTopics.replaceChildren();
  for (const entry of app.decks) {
    if (typeof entry.error === 'string' && entry.error.length > 0) {
      continue;
    }
    const row = document.createElement('label');
    row.className = 'topic';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = entry.id;
    box.checked = selected.includes(entry.id);
    box.addEventListener('change', () => updateTestLimits(false));
    const title = document.createElement('span');
    title.className = 'topic-title';
    title.textContent = entry.title;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${entry.count} Karten`;
    row.append(box, title, meta);
    ui.testTopics.append(row);
  }
}

/**
 * Zeigt die Auswahl für einen Probetest.
 *
 * @param {string[]} selected Kennungen, die angekreuzt sein sollen.
 * @returns {void}
 */
function showTestSetup(selected) {
  renderTopics(selected);
  updateTestLimits(true);
  showView('test-setup', true);
}

/**
 * Reagiert auf den Knopf "Probetest starten".
 *
 * Läuft schon ein Test, fragt die App zuerst nach.
 *
 * @returns {void}
 */
function openTestSetup() {
  const stored = store.readTest();
  if (stored === null) {
    showTestSetup([]);
    return;
  }
  ui.resumeMessage.textContent =
    `Ein Probetest ist offen: Frage ${stored.index + 1} von ${stored.questions.length}.`;
  ui.resume.showModal();
  ui.resumeContinue.onclick = () => {
    ui.resume.close();
    resumeTest(stored);
  };
  ui.resumeRestart.onclick = () => {
    ui.resume.close();
    store.deleteTest();
    showTestSetup(stored.deckIds);
  };
}

/**
 * Schreibt den Stand des laufenden Probetests.
 *
 * @returns {void}
 */
function persistTest() {
  const test = app.test;
  if (test === null) {
    return;
  }
  const ok = store.writeTest({
    schemaVersion: 1,
    startedAt: test.startedAt,
    updatedAt: Date.now(),
    deckIds: test.deckIds,
    questions: test.questions,
    index: test.index,
    correct: test.correct,
  });
  if (!ok && app.storageOk) {
    app.storageOk = false;
    ui.storageHint.hidden = false;
  }
}

/**
 * Setzt den Fortschritt des Probetests in die Kopfzeile.
 *
 * @returns {void}
 */
function updateTestProgress() {
  const test = app.test;
  if (test === null) {
    return;
  }
  ui.sessionProgress.textContent = `Frage ${test.index + 1} von ${test.questions.length}`;
}

/**
 * Zeigt die aktuelle Frage des Probetests.
 *
 * @param {boolean} fade true, wenn die neue Karte eingeblendet wird.
 * @returns {void}
 */
function showTestCard(fade) {
  const test = app.test;
  if (test === null) {
    return;
  }
  const question = quiz.currentQuestion(test);
  if (question === null) {
    finishTest(true);
    return;
  }
  showCard(question, fade);
  updateTestProgress();
}

/**
 * Wechselt in die Test-Ansicht.
 *
 * @returns {void}
 */
function enterTestRun() {
  app.mode = 'test';
  app.active = null;
  ui.sessionTitle.textContent = 'Probetest';
  ui.sessionWarnings.hidden = true;
  showView('session', true);
  showTestCard(false);
}

/**
 * Startet einen Probetest mit der getroffenen Auswahl.
 *
 * @returns {Promise<void>} Erfüllt, wenn der Test läuft oder eine Meldung
 *   steht.
 */
async function startTest() {
  const ids = selectedDeckIds();
  if (ids.length === 0) {
    return;
  }
  /** @type {{ id: string, title: string, cards: Card[] }[]} */
  const decks = [];
  for (const entry of app.decks.filter((item) => ids.includes(item.id))) {
    try {
      decks.push(await fetchDeck(entry));
    } catch (error) {
      const message =
        error instanceof DeckFormatError
          ? error.message
          : `Datei ${entry.file} konnte nicht gelesen werden.`;
      markDeckBroken(entry.id, message);
      setHomeMessage(message, false);
      goHome();
      return;
    }
  }
  const typed = Number.parseInt(ui.testCount.value, 10);
  const count = Number.isInteger(typed) ? typed : DEFAULT_TEST_COUNT;
  const questions = quiz.buildQuestions(decks, ids, count, Math.random);
  if (questions.length === 0) {
    setHomeMessage('In den gewählten Themen wurden keine Karten gefunden.', false);
    goHome();
    return;
  }
  app.test = { deckIds: ids, questions, index: 0, correct: 0, startedAt: Date.now() };
  persistTest();
  enterTestRun();
}

/**
 * Setzt einen gespeicherten Probetest fort.
 *
 * @param {store.StoredTest} stored Der gespeicherte Stand.
 * @returns {void}
 */
function resumeTest(stored) {
  app.test = {
    deckIds: stored.deckIds,
    questions: stored.questions,
    index: stored.index,
    correct: stored.correct,
    startedAt: stored.startedAt,
  };
  enterTestRun();
}

/**
 * Verarbeitet eine Antwort im Probetest.
 *
 * @param {boolean} correct true bei "Gewusst".
 * @returns {void}
 */
function submitTestAnswer(correct) {
  const test = app.test;
  if (test === null) {
    return;
  }
  const next = quiz.answerQuestion(test, correct);
  app.test = { ...test, index: next.index, correct: next.correct };
  persistTest();
  if (quiz.currentQuestion(app.test) === null) {
    finishTest(true);
    return;
  }
  showTestCard(true);
}

/**
 * Zeigt das Ergebnis und löscht den Probetest.
 *
 * @param {boolean} push true, wenn ein History-Eintrag entsteht.
 * @returns {void}
 */
function finishTest(push) {
  const test = app.test;
  if (test === null) {
    return;
  }
  const total = test.questions.length;
  ui.testScore.textContent = `${quiz.scoreOf(test.correct, total)} %`;
  ui.testResult.textContent = `${test.correct} von ${total} richtig.`;
  app.lastTestDecks = test.deckIds;
  store.deleteTest();
  app.test = null;
  app.mode = 'learn';
  showView('test-done', push);
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
  ui.openTest.addEventListener('click', openTestSetup);
  ui.leaveTestSetup.addEventListener('click', goHome);
  ui.testToHome.addEventListener('click', goHome);
  ui.testAgain.addEventListener('click', () => showTestSetup(app.lastTestDecks));
  ui.testStart.addEventListener('click', () => {
    void startTest();
  });
  ui.testCount.addEventListener('change', () => updateTestLimits(false));
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

  for (const button of [ui.openSettings, ui.openSettingsSession, ui.openSettingsTest]) {
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
    app.test = null;
    app.mode = 'learn';
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
    const runsSession = active !== null && learn.currentCard(active.state) !== null;
    const runsTest = app.test !== null && quiz.currentQuestion(app.test) !== null;
    const name = wanted === 'session' && !runsSession && !runsTest ? 'home' : wanted;
    if (name === 'home') {
      app.active = null;
      app.test = null;
      app.mode = 'learn';
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
