/**
 * Liest und schreibt Einstellungen und Sessions in localStorage.
 *
 * Jeder Zugriff läuft in try/catch. Safari im privaten Modus wirft beim
 * Schreiben. Die App muss dann trotzdem laufen.
 */

const PREFIX = 'nawi:';
const SETTINGS_KEY = `${PREFIX}settings`;
const SCHEMA_VERSION = 1;

const ORDERS = ['random', 'sequential'];
const THEMES = ['auto', 'light', 'dark'];

/**
 * @typedef {{ schemaVersion: number, requiredCorrect: number, order: string, theme: string }} Settings
 * @typedef {{ schemaVersion: number, deckId: string, deckTitle: string, startedAt: number, updatedAt: number, counts: Record<string, number>, queue: number[], total: number }} StoredSession
 */

/** @type {Settings} */
export const DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  requiredCorrect: 2,
  order: 'random',
  theme: 'auto',
};

/**
 * Sagt, ob localStorage benutzbar ist.
 *
 * @returns {boolean} true, wenn Lesen und Schreiben geht.
 */
export function isAvailable() {
  try {
    const probe = `${PREFIX}probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Liest einen JSON-Eintrag.
 *
 * @param {string} key Vollständiger Schlüssel.
 * @returns {unknown} Der Wert, oder null bei Fehler und fehlendem Eintrag.
 */
function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Schreibt einen JSON-Eintrag.
 *
 * @param {string} key Vollständiger Schlüssel.
 * @param {unknown} value Wert, der gespeichert wird.
 * @returns {boolean} true, wenn das Schreiben geklappt hat.
 */
function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Entfernt einen Eintrag.
 *
 * @param {string} key Vollständiger Schlüssel.
 * @returns {void}
 */
function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* Ein fehlgeschlagenes Löschen darf die App nicht stoppen. */
  }
}

/**
 * Sagt, ob der Wert eine ganze Zahl im Bereich ist.
 *
 * @param {unknown} value Zu prüfender Wert.
 * @param {number} min Kleinster erlaubter Wert.
 * @param {number} max Größter erlaubter Wert.
 * @returns {boolean} true, wenn der Wert passt.
 */
function isIntegerInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Liest die Einstellungen.
 *
 * Ein fehlender, fehlerhafter oder unbekannter Eintrag liefert die
 * Standardwerte. Einzelne ungültige Felder fallen auf den Standard zurück.
 *
 * @returns {Settings} Die gültigen Einstellungen.
 */
export function readSettings() {
  const raw = readJson(SETTINGS_KEY);
  if (raw === null || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }
  const data = /** @type {Record<string, unknown>} */ (raw);
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    requiredCorrect: isIntegerInRange(data.requiredCorrect, 1, 5)
      ? /** @type {number} */ (data.requiredCorrect)
      : DEFAULT_SETTINGS.requiredCorrect,
    order: ORDERS.includes(/** @type {string} */ (data.order))
      ? /** @type {string} */ (data.order)
      : DEFAULT_SETTINGS.order,
    theme: THEMES.includes(/** @type {string} */ (data.theme))
      ? /** @type {string} */ (data.theme)
      : DEFAULT_SETTINGS.theme,
  };
}

/**
 * Schreibt die Einstellungen.
 *
 * @param {Settings} settings Die neuen Einstellungen.
 * @returns {boolean} true, wenn das Schreiben geklappt hat.
 */
export function writeSettings(settings) {
  return writeJson(SETTINGS_KEY, { ...settings, schemaVersion: SCHEMA_VERSION });
}

/**
 * Baut den Schlüssel einer Session.
 *
 * @param {string} deckId Kennung des Decks.
 * @returns {string} Vollständiger Schlüssel.
 */
function sessionKey(deckId) {
  return `${PREFIX}session:${deckId}`;
}

/**
 * Liest die offene Session eines Decks.
 *
 * Ein Eintrag mit unbekannter schemaVersion oder falschem Aufbau wird
 * verworfen.
 *
 * @param {string} deckId Kennung des Decks.
 * @returns {StoredSession | null} Die Session, oder null.
 */
export function readSession(deckId) {
  const raw = readJson(sessionKey(deckId));
  if (raw === null || typeof raw !== 'object') {
    return null;
  }
  const data = /** @type {Record<string, unknown>} */ (raw);
  if (data.schemaVersion !== SCHEMA_VERSION) {
    removeKey(sessionKey(deckId));
    return null;
  }
  if (!Array.isArray(data.queue) || typeof data.counts !== 'object' || data.counts === null) {
    removeKey(sessionKey(deckId));
    return null;
  }
  const queue = data.queue.filter((n) => typeof n === 'number' && Number.isInteger(n));
  /** @type {Record<string, number>} */
  const counts = {};
  for (const [key, value] of Object.entries(data.counts)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      counts[key] = value;
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    deckId,
    deckTitle: typeof data.deckTitle === 'string' ? data.deckTitle : deckId,
    startedAt: typeof data.startedAt === 'number' ? data.startedAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    counts,
    queue,
    total: typeof data.total === 'number' ? data.total : Object.keys(counts).length,
  };
}

/**
 * Schreibt die offene Session eines Decks.
 *
 * @param {StoredSession} session Die Session.
 * @returns {boolean} true, wenn das Schreiben geklappt hat.
 */
export function writeSession(session) {
  return writeJson(sessionKey(session.deckId), { ...session, schemaVersion: SCHEMA_VERSION });
}

/**
 * Löscht die offene Session eines Decks.
 *
 * @param {string} deckId Kennung des Decks.
 * @returns {void}
 */
export function deleteSession(deckId) {
  removeKey(sessionKey(deckId));
}

/**
 * Liest alle offenen Sessions.
 *
 * @returns {StoredSession[]} Die Sessions, neueste zuerst.
 */
export function readAllSessions() {
  /** @type {string[]} */
  const ids = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith(`${PREFIX}session:`)) {
        ids.push(key.slice(`${PREFIX}session:`.length));
      }
    }
  } catch {
    return [];
  }
  /** @type {StoredSession[]} */
  const sessions = [];
  for (const id of ids) {
    const session = readSession(id);
    if (session !== null) {
      sessions.push(session);
    }
  }
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  return sessions;
}

/**
 * Löscht alle Einträge der App.
 *
 * @returns {void}
 */
export function clearAll() {
  /** @type {string[]} */
  const keys = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key !== null && key.startsWith(PREFIX)) {
        keys.push(key);
      }
    }
  } catch {
    return;
  }
  for (const key of keys) {
    removeKey(key);
  }
}
