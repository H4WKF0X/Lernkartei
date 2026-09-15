/**
 * Die Lernlogik.
 *
 * Ein zählerbasiertes Leitner-System. Jede Karte hat einen Zähler correct.
 * Dieses Modul rechnet nur. Es liest keine Dateien, keine Uhr und kein
 * localStorage.
 */

/**
 * @typedef {{ counts: Record<string, number>, queue: number[], total: number }} SessionState
 */

/**
 * Mischt eine Liste mit dem Verfahren von Fisher und Yates.
 *
 * @param {number[]} values Die Liste. Sie bleibt unverändert.
 * @param {() => number} random Zufallsquelle, Werte von 0 bis unter 1.
 * @returns {number[]} Eine neue, gemischte Liste.
 */
export function shuffle(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

/**
 * Baut die Startreihenfolge einer Session.
 *
 * @param {number[]} numbers Alle Kartennummern.
 * @param {string} order "random" oder "sequential".
 * @param {() => number} random Zufallsquelle.
 * @returns {number[]} Die Warteschlange.
 */
export function buildQueue(numbers, order, random) {
  const sorted = numbers.slice().sort((a, b) => a - b);
  return order === 'sequential' ? sorted : shuffle(sorted, random);
}

/**
 * Baut den Anfangszustand einer Session.
 *
 * @param {number[]} numbers Alle Kartennummern des Decks.
 * @param {string} order "random" oder "sequential".
 * @param {() => number} random Zufallsquelle.
 * @returns {SessionState} Der Zustand mit allen Zählern auf 0.
 */
export function createState(numbers, order, random) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const n of numbers) {
    counts[String(n)] = 0;
  }
  return { counts, queue: buildQueue(numbers, order, random), total: numbers.length };
}

/**
 * Sagt, ob eine Karte fertig ist.
 *
 * @param {SessionState} state Der Zustand.
 * @param {number} n Kartennummer.
 * @param {number} requiredCorrect Anzahl richtiger Antworten bis fertig.
 * @returns {boolean} true, wenn die Karte den Zielwert erreicht hat.
 */
export function isDone(state, n, requiredCorrect) {
  return (state.counts[String(n)] ?? 0) >= requiredCorrect;
}

/**
 * Zählt die fertigen Karten.
 *
 * @param {SessionState} state Der Zustand.
 * @param {number} requiredCorrect Anzahl richtiger Antworten bis fertig.
 * @returns {number} Anzahl der fertigen Karten.
 */
export function doneCount(state, requiredCorrect) {
  let done = 0;
  for (const value of Object.values(state.counts)) {
    if (value >= requiredCorrect) {
      done += 1;
    }
  }
  return done;
}

/**
 * Gibt die aktuelle Karte.
 *
 * @param {SessionState} state Der Zustand.
 * @returns {number | null} Nummer der vordersten Karte, oder null.
 */
export function currentCard(state) {
  return state.queue.length > 0 ? state.queue[0] : null;
}

/**
 * Setzt eine Karte zurück in die Warteschlange.
 *
 * Bei "random" landet die Karte an einer zufälligen Stelle in der hinteren
 * Hälfte. So entsteht keine feste Rotation.
 *
 * @param {number[]} queue Warteschlange ohne die Karte.
 * @param {number} n Kartennummer.
 * @param {string} order "random" oder "sequential".
 * @param {() => number} random Zufallsquelle.
 * @returns {number[]} Eine neue Warteschlange mit der Karte.
 */
function reinsert(queue, n, order, random) {
  const result = queue.slice();
  if (order !== 'random') {
    result.push(n);
    return result;
  }
  const start = Math.floor(result.length / 2);
  const index = start + Math.floor(random() * (result.length - start + 1));
  result.splice(index, 0, n);
  return result;
}

/**
 * Verarbeitet eine Antwort zur vordersten Karte.
 *
 * "Gewusst" erhöht den Zähler. "Nicht gewusst" setzt ihn auf 0. Eine
 * fertige Karte kommt nicht zurück in die Warteschlange.
 *
 * @param {SessionState} state Der Zustand. Er bleibt unverändert.
 * @param {boolean} correct true bei "Gewusst".
 * @param {number} requiredCorrect Anzahl richtiger Antworten bis fertig.
 * @param {string} order "random" oder "sequential".
 * @param {() => number} random Zufallsquelle.
 * @returns {SessionState} Der neue Zustand.
 */
export function answer(state, correct, requiredCorrect, order, random) {
  const n = currentCard(state);
  if (n === null) {
    return state;
  }
  const key = String(n);
  const counts = { ...state.counts };
  counts[key] = correct ? (counts[key] ?? 0) + 1 : 0;
  const rest = state.queue.slice(1);
  const next = { counts, queue: rest, total: state.total };
  if (counts[key] >= requiredCorrect) {
    return next;
  }
  return { counts, queue: reinsert(rest, n, order, random), total: state.total };
}

/**
 * Richtet die Warteschlange an requiredCorrect neu aus.
 *
 * Die Zähler bleiben. Beim Hochsetzen kommen fertige Karten zurück in die
 * Warteschlange. Beim Runtersetzen fallen Karten sofort heraus.
 *
 * @param {SessionState} state Der Zustand. Er bleibt unverändert.
 * @param {number} requiredCorrect Anzahl richtiger Antworten bis fertig.
 * @returns {SessionState} Der neue Zustand.
 */
export function resyncQueue(state, requiredCorrect) {
  const inQueue = new Set(state.queue);
  const queue = state.queue.filter((n) => (state.counts[String(n)] ?? 0) < requiredCorrect);
  const returning = Object.keys(state.counts)
    .map((key) => Number.parseInt(key, 10))
    .filter((n) => !inQueue.has(n) && (state.counts[String(n)] ?? 0) < requiredCorrect)
    .sort((a, b) => a - b);
  return { counts: state.counts, queue: queue.concat(returning), total: state.total };
}

/**
 * Gleicht eine gespeicherte Session mit dem aktuellen Deck ab.
 *
 * Neue Kartennummern kommen mit Zähler 0 hinten in die Warteschlange.
 * Verschwundene Nummern fallen aus Zählern und Warteschlange heraus.
 *
 * @param {SessionState} state Der Zustand. Er bleibt unverändert.
 * @param {number[]} numbers Alle Kartennummern des aktuellen Decks.
 * @param {number} requiredCorrect Anzahl richtiger Antworten bis fertig.
 * @returns {{ state: SessionState, added: number, removed: number }} Der neue
 *   Zustand und die Anzahl der neuen und entfernten Karten.
 */
export function reconcile(state, numbers, requiredCorrect) {
  const present = new Set(numbers);
  /** @type {Record<string, number>} */
  const counts = {};
  let removed = 0;
  for (const [key, value] of Object.entries(state.counts)) {
    if (present.has(Number.parseInt(key, 10))) {
      counts[key] = value;
    } else {
      removed += 1;
    }
  }
  const queue = state.queue.filter((n) => present.has(n));
  /** @type {number[]} */
  const added = [];
  for (const n of numbers.slice().sort((a, b) => a - b)) {
    if (!(String(n) in counts)) {
      counts[String(n)] = 0;
      added.push(n);
    }
  }
  const next = { counts, queue: queue.concat(added), total: numbers.length };
  return { state: resyncQueue(next, requiredCorrect), added: added.length, removed };
}
