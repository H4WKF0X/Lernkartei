/**
 * Parser für LaTeX-Kartendateien.
 *
 * Der Parser liest nur die Kommandos \frontcard und \backcard. Alles andere
 * in der Datei ist für ihn ohne Bedeutung.
 */

const COMMANDS = ['frontcard', 'backcard'];

const BEGIN_DOCUMENT = '\\begin{document}';
const END_DOCUMENT = '\\end{document}';

const RTF_MAGIC = '{\\rtf1';

/**
 * Fehler für eine Datei, die der Parser nicht lesen kann.
 */
export class DeckFormatError extends Error {
  /**
   * @param {string} message Meldung für die Oberfläche, auf Deutsch.
   */
  constructor(message) {
    super(message);
    this.name = 'DeckFormatError';
  }
}

/**
 * Sagt, ob die Datei echtes RTF ist. Echtes RTF kann kein Parser lesen.
 *
 * @param {string} source Inhalt der Datei.
 * @returns {boolean} true, wenn die Datei mit der RTF-Kennung beginnt.
 */
export function isRichText(source) {
  return source.trimStart().startsWith(RTF_MAGIC);
}

/**
 * Macht aus einem Dateinamen eine Deck-Kennung.
 *
 * @param {string} fileName Name der Datei, mit oder ohne Pfad und Endung.
 * @returns {string} Kennung in Kleinbuchstaben, nur a-z, 0-9 und Bindestrich.
 */
export function slugFromFileName(fileName) {
  const base = fileName.split('/').pop() ?? '';
  const stem = base.replace(/\.[^.]*$/, '');
  return stem
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Schneidet den Dokumentkörper aus der Datei.
 *
 * Der Preamble enthält die Definition von \frontcard und \backcard. Der
 * Parser darf ihn nicht sehen, sonst liest er die Definition als Karte.
 *
 * @param {string} source Inhalt der Datei.
 * @param {string[]} warnings Liste, an die der Parser Warnungen anhängt.
 * @returns {{ text: string, offset: number }} Körper und seine Startposition.
 */
function extractBody(source, warnings) {
  const start = source.indexOf(BEGIN_DOCUMENT);
  const end = source.lastIndexOf(END_DOCUMENT);
  if (start === -1 || end === -1 || end < start) {
    warnings.push(
      'Die Datei hat kein \\begin{document} und \\end{document}. Der Parser liest die ganze Datei.',
    );
    return { text: source, offset: 0 };
  }
  const offset = start + BEGIN_DOCUMENT.length;
  return { text: source.slice(offset, end), offset };
}

/**
 * Liest ein Argument in geschweiften Klammern.
 *
 * Der Scanner zählt die Klammertiefe. Ein Backslash schützt das nächste
 * Zeichen. So bleiben verschachtelte Klammern im Mathe-Inhalt erhalten.
 *
 * @param {string} text Text, in dem der Scanner liest.
 * @param {number} from Position direkt nach dem Kommandonamen oder Argument.
 * @returns {{ value: string, next: number } | null} Argument und Position
 *   danach, oder null bei einem Fehler.
 */
function readArgument(text, from) {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
  }
  if (text[i] !== '{') {
    return null;
  }
  i += 1;
  const start = i;
  let depth = 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        return { value: text.slice(start, i), next: i + 1 };
      }
    }
    i += 1;
  }
  return null;
}

/**
 * Liest die drei Argumente eines Kartenkommandos.
 *
 * @param {string} text Text, in dem der Scanner liest.
 * @param {number} from Position direkt nach dem Kommandonamen.
 * @returns {{ args: string[], next: number } | null} Argumente und Position
 *   danach, oder null bei einem Fehler.
 */
function readThreeArguments(text, from) {
  const args = [];
  let i = from;
  for (let k = 0; k < 3; k += 1) {
    const arg = readArgument(text, i);
    if (arg === null) {
      return null;
    }
    args.push(arg.value);
    i = arg.next;
  }
  return { args, next: i };
}

/**
 * Sucht alle Kartenkommandos eines Namens im Text.
 *
 * @param {string} text Dokumentkörper.
 * @param {string} command Name des Kommandos, ohne Backslash.
 * @param {number} offset Startposition des Körpers in der Datei.
 * @param {string[]} warnings Liste, an die der Parser Warnungen anhängt.
 * @returns {{ args: string[], position: number }[]} Gefundene Kommandos.
 */
function findCommands(text, command, offset, warnings) {
  const needle = `\\${command}`;
  const found = [];
  let i = text.indexOf(needle);
  while (i !== -1) {
    const after = i + needle.length;
    if (/[A-Za-z]/.test(text[after] ?? '')) {
      i = text.indexOf(needle, after);
      continue;
    }
    const parsed = readThreeArguments(text, after);
    if (parsed === null) {
      warnings.push(
        `\\${command} an Position ${offset + i} hat keine drei gültigen Argumente. Der Parser hat das Kommando übersprungen.`,
      );
      i = text.indexOf(needle, after);
      continue;
    }
    found.push({ args: parsed.args, position: offset + i });
    i = text.indexOf(needle, parsed.next);
  }
  return found;
}

/**
 * Baut aus den gefundenen Kommandos eine Map von Kartennummer auf Inhalt.
 *
 * @param {{ args: string[], position: number }[]} entries Gefundene Kommandos.
 * @param {string} command Name des Kommandos, für die Warnungen.
 * @param {string[]} topics Liste, an die der Parser jedes Thema anhängt.
 * @param {string[]} warnings Liste, an die der Parser Warnungen anhängt.
 * @returns {Map<number, string>} Kartennummer auf Inhalt.
 */
function toCardMap(entries, command, topics, warnings) {
  const map = new Map();
  for (const entry of entries) {
    const [rawNumber, topic, content] = entry.args;
    const n = Number.parseInt(rawNumber.trim(), 10);
    if (!Number.isInteger(n)) {
      warnings.push(
        `\\${command} an Position ${entry.position} hat keine Kartennummer: "${rawNumber.trim()}".`,
      );
      continue;
    }
    if (map.has(n)) {
      warnings.push(
        `Karte ${n} hat mehr als ein \\${command}. Der Parser nimmt das letzte.`,
      );
    }
    topics.push(topic.trim());
    map.set(n, content);
  }
  return map;
}

/**
 * Sucht das häufigste Thema aller Karten.
 *
 * @param {string[]} topics Themen aller gefundenen Kommandos.
 * @returns {string} Häufigstes Thema, oder ein leerer String.
 */
function mostCommonTopic(topics) {
  const counts = new Map();
  for (const topic of topics) {
    if (topic.length > 0) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  let best = '';
  let bestCount = 0;
  for (const [topic, count] of counts) {
    if (count > bestCount) {
      best = topic;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Liest eine Kartendatei und liefert das Deck.
 *
 * Die Paarung von Vorder- und Rückseite läuft nur über die Kartennummer.
 * Die Reihenfolge in der Datei hat keine Bedeutung. Eine Karte ohne
 * Gegenstück kommt nicht ins Deck, sondern als Warnung in warnings.
 *
 * @param {string} source Inhalt der Datei.
 * @param {string} fileName Name der Datei, für Kennung und Meldungen.
 * @returns {{ id: string, title: string, cards: { n: number, front: string, back: string }[], warnings: string[] }} Das Deck.
 * @throws {DeckFormatError} Wenn die Datei echtes RTF ist.
 */
export function parseDeck(source, fileName) {
  if (isRichText(source)) {
    throw new DeckFormatError(
      `Datei ${fileName} ist als Rich Text gespeichert. Bitte als reinen Text oder als .tex speichern.`,
    );
  }

  const warnings = [];
  const body = extractBody(source, warnings);
  const topics = [];

  const fronts = toCardMap(
    findCommands(body.text, COMMANDS[0], body.offset, warnings),
    COMMANDS[0],
    topics,
    warnings,
  );
  const backs = toCardMap(
    findCommands(body.text, COMMANDS[1], body.offset, warnings),
    COMMANDS[1],
    topics,
    warnings,
  );

  const cards = [];
  for (const [n, front] of fronts) {
    const back = backs.get(n);
    if (back === undefined) {
      warnings.push(`Karte ${n} hat keine Rückseite.`);
      continue;
    }
    cards.push({ n, front, back });
  }
  for (const n of backs.keys()) {
    if (!fronts.has(n)) {
      warnings.push(`Karte ${n} hat keine Vorderseite.`);
    }
  }
  cards.sort((a, b) => a.n - b.n);

  return {
    id: slugFromFileName(fileName),
    title: mostCommonTopic(topics),
    cards,
    warnings,
  };
}
