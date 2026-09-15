/**
 * Macht aus einem rohen Kartentext HTML.
 *
 * Nur KaTeX darf HTML erzeugen. Jeder andere Teil des Textes läuft durch
 * das Escaping.
 */

/**
 * @typedef {{ kind: 'text', value: string }} TextSegment
 * @typedef {{ kind: 'math', value: string, display: boolean }} MathSegment
 * @typedef {TextSegment | MathSegment} Segment
 */

/**
 * Zerlegt einen Kartentext in Text- und Mathe-Abschnitte.
 *
 * Die Trenner sind \( \) für inline und \[ \] für abgesetzte Formeln. Ein
 * doppelter Backslash ist ein Zeilenumbruch in LaTeX, kein Trenner. Der
 * Scanner liest darum Zeichen für Zeichen. Ein Trenner ohne Gegenstück
 * bleibt Text, damit kein Inhalt verloren geht.
 *
 * @param {string} source Roher Kartentext.
 * @returns {Segment[]} Die Abschnitte in der Reihenfolge des Textes.
 */
export function splitSegments(source) {
  const segments = [];
  let text = '';
  let i = 0;

  const pushText = () => {
    if (text.length > 0) {
      segments.push({ kind: 'text', value: text });
      text = '';
    }
  };

  while (i < source.length) {
    if (source[i] !== '\\') {
      text += source[i];
      i += 1;
      continue;
    }
    const next = source[i + 1];
    if (next !== '(' && next !== '[') {
      text += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    const display = next === '[';
    const closer = display ? '\\]' : '\\)';
    const end = findCloser(source, i + 2, closer);
    if (end === -1) {
      text += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    pushText();
    segments.push({ kind: 'math', value: source.slice(i + 2, end), display });
    i = end + 2;
  }
  pushText();
  return segments;
}

/**
 * Sucht den Schlusstrenner einer Formel.
 *
 * @param {string} source Roher Kartentext.
 * @param {number} from Position nach dem Anfangstrenner.
 * @param {string} closer Der gesuchte Trenner, zwei Zeichen lang.
 * @returns {number} Position des Trenners, oder -1.
 */
function findCloser(source, from, closer) {
  let i = from;
  while (i < source.length) {
    if (source[i] !== '\\') {
      i += 1;
      continue;
    }
    if (source[i + 1] === closer[1]) {
      return i;
    }
    i += 2;
  }
  return -1;
}

/**
 * Escaped die Zeichen, die im HTML eine Bedeutung haben.
 *
 * @param {string} value Beliebiger Text.
 * @returns {string} Text, der als HTML sicher ist.
 */
export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Macht aus einem Textabschnitt HTML.
 *
 * @param {string} value Text ohne Formeln.
 * @returns {string} HTML mit <br> an den Zeilenumbrüchen.
 */
function renderText(value) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

/**
 * Macht aus einem rohen Kartentext HTML.
 *
 * Bei einem Fehler in einer Formel zeigt KaTeX die Stelle rot an. Der Rest
 * der Karte bleibt lesbar.
 *
 * @param {string} source Roher Kartentext aus der Deck-Datei.
 * @param {{ renderToString: (src: string, options: object) => string }} katex
 *   Die KaTeX-Bibliothek.
 * @returns {string} HTML für eine Kartenseite.
 */
export function renderCard(source, katex) {
  let html = '';
  for (const segment of splitSegments(source)) {
    if (segment.kind === 'text') {
      html += renderText(segment.value);
      continue;
    }
    const math = katex.renderToString(segment.value, {
      displayMode: segment.display,
      throwOnError: false,
      strict: false,
    });
    html += segment.display
      ? math
      : `<span class="math-inline">${math}</span>`;
  }
  return html;
}
