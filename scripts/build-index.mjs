/**
 * Schreibt decks/index.json aus den Deck-Dateien.
 *
 * Das Skript benutzt denselben Parser wie die App. Es braucht keine
 * Abhängigkeiten und läuft mit dem Node der GitHub Action.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDeck, slugFromFileName } from '../js/parser.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DECKS_DIR = join(ROOT, 'decks');
const INDEX_FILE = join(DECKS_DIR, 'index.json');
const EXTENSIONS = ['.tex', '.txt', '.rtf'];

/**
 * Sammelt die Namen aller Deck-Dateien.
 *
 * @returns {string[]} Die Dateinamen, alphabetisch sortiert.
 */
function listDeckFiles() {
  return readdirSync(DECKS_DIR)
    .filter((name) => EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Liest eine Deck-Datei und baut ihren Eintrag für den Index.
 *
 * Eine nicht lesbare Datei bekommt ein Feld error. Das Skript bricht nicht ab.
 *
 * @param {string} name Dateiname im Ordner decks.
 * @returns {{ id: string, file: string, title: string, count: number, error?: string }} Der Eintrag.
 */
function buildEntry(name) {
  const file = `decks/${name}`;
  const id = slugFromFileName(name);
  try {
    const deck = parseDeck(readFileSync(join(DECKS_DIR, name), 'utf8'), file);
    if (deck.cards.length === 0) {
      return { id, file, title: deck.title.length > 0 ? deck.title : id, count: 0, error: 'In dieser Datei wurden keine Karten gefunden.' };
    }
    return { id, file, title: deck.title.length > 0 ? deck.title : id, count: deck.cards.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden.';
    return { id, file, title: id, count: 0, error: message };
  }
}

/**
 * Baut den Index und schreibt ihn, wenn er sich geändert hat.
 *
 * @returns {boolean} true, wenn die Datei neu geschrieben wurde.
 */
function main() {
  const entries = listDeckFiles().map(buildEntry);
  const next = `${JSON.stringify(entries, null, 2)}\n`;
  let current = '';
  try {
    current = readFileSync(INDEX_FILE, 'utf8');
  } catch {
    current = '';
  }
  if (current === next) {
    console.log('index.json ist aktuell.');
    return false;
  }
  writeFileSync(INDEX_FILE, next, 'utf8');
  console.log(`index.json geschrieben, ${entries.length} Decks.`);
  return true;
}

main();
