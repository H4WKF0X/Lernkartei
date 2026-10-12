/**
 * Die Logik des Probetests.
 *
 * Ein Probetest fragt jede Karte genau einmal. Am Ende steht ein Ergebnis
 * in Prozent. Dieses Modul rechnet nur. Es liest keine Dateien, keine Uhr
 * und kein localStorage.
 */

import { shuffle } from './session.js';

/**
 * @typedef {{ n: number, front: string, back: string }} Card
 * @typedef {{ id: string, title: string, cards: Card[] }} Deck
 * @typedef {{ deckId: string, n: number, front: string, back: string }} Question
 */

/**
 * Sammelt die Karten der gewählten Decks in einem Topf.
 *
 * Jede Frage behält ihre Deck-Kennung. Zwei Decks dürfen dieselbe
 * Kartennummer haben, die Nummer allein ist also keine Kennung.
 *
 * @param {Deck[]} decks Die gelesenen Decks.
 * @param {string[]} deckIds Kennungen der gewählten Decks.
 * @returns {Question[]} Alle Karten der gewählten Decks.
 */
export function buildPool(decks, deckIds) {
  const wanted = new Set(deckIds);
  /** @type {Question[]} */
  const pool = [];
  for (const deck of decks) {
    if (!wanted.has(deck.id)) {
      continue;
    }
    for (const card of deck.cards) {
      pool.push({ deckId: deck.id, n: card.n, front: card.front, back: card.back });
    }
  }
  return pool;
}

/**
 * Baut die Fragen eines Probetests.
 *
 * Alle Karten der gewählten Decks kommen in einen Topf. Daraus zieht die
 * Funktion zufällig. Ein großes Deck liefert darum mehr Fragen als ein
 * kleines.
 *
 * @param {Deck[]} decks Die gelesenen Decks.
 * @param {string[]} deckIds Kennungen der gewählten Decks.
 * @param {number} count Gewünschte Anzahl der Fragen.
 * @param {() => number} random Zufallsquelle, Werte von 0 bis unter 1.
 * @returns {Question[]} Die Fragen in der Reihenfolge des Tests.
 */
export function buildQuestions(decks, deckIds, count, random) {
  const pool = buildPool(decks, deckIds);
  const limit = Math.min(Math.max(0, Math.floor(count)), pool.length);
  return shuffle(pool, random).slice(0, limit);
}

/**
 * Rechnet das Ergebnis in Prozent aus.
 *
 * @param {number} correct Anzahl der richtigen Antworten.
 * @param {number} total Anzahl der Fragen.
 * @returns {number} Ganze Prozent von 0 bis 100.
 */
export function scoreOf(correct, total) {
  if (total <= 0) {
    return 0;
  }
  return Math.round((correct / total) * 100);
}

/**
 * Gibt die aktuelle Frage.
 *
 * @param {{ questions: Question[], index: number }} test Der Testlauf.
 * @returns {Question | null} Die Frage, oder null am Ende des Tests.
 */
export function currentQuestion(test) {
  return test.index < test.questions.length ? test.questions[test.index] : null;
}

/**
 * Verarbeitet eine Antwort und geht zur nächsten Frage.
 *
 * @param {{ questions: Question[], index: number, correct: number }} test Der
 *   Testlauf. Er bleibt unverändert.
 * @param {boolean} correct true bei "Gewusst".
 * @returns {{ questions: Question[], index: number, correct: number }} Der
 *   neue Stand.
 */
export function answerQuestion(test, correct) {
  if (currentQuestion(test) === null) {
    return test;
  }
  return {
    questions: test.questions,
    index: test.index + 1,
    correct: test.correct + (correct ? 1 : 0),
  };
}
