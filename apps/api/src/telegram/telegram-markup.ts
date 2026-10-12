/**
 * The assistant writes a small Markdown: **bold**, _italic_, `code` and [text](https://link).
 * Telegram gets it as HTML; everything else is escaped, so the result is always valid. A marker
 * without a pair stays as written, except at the end of an answer still being written
 * (`partial`): there it is hidden until its pair arrives.
 */
export function toTelegramHtml(text: string, partial = false) {
  return render(text, { html: true, partial });
}

/** The same text without markup, for when Telegram refuses the HTML. */
export function toPlainText(text: string, partial = false) {
  return render(text, { html: false, partial });
}

type Mode = { html: boolean; partial: boolean };

/** A piece of markup found at some position: what it becomes and where it ends. */
type Span = { output: string; end: number };

const LINK = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/;
/** The start of a link at the very end of the text, still being written. */
const LINK_IN_PROGRESS = /^\[([^\]\n]*)(\](\([^\s)]*)?)?$/;
const WORD_CHAR = /[\p{L}\p{N}]/u;

function render(text: string, mode: Mode) {
  let output = "";
  let index = 0;

  while (index < text.length) {
    const span = readSpan(text, index, mode);

    if (span) {
      output += span.output;
      index = span.end;
      continue;
    }

    output += escape(text[index], mode);
    index++;
  }

  return output;
}

function readSpan(text: string, index: number, mode: Mode): Span | null {
  if (text.startsWith("**", index)) {
    return readBold(text, index, mode);
  }

  switch (text[index]) {
    case "`":
      return readCode(text, index, mode);
    case "_":
      return readItalic(text, index, mode);
    case "[":
      return readLink(text, index, mode);
    default:
      return null;
  }
}

function readBold(text: string, index: number, mode: Mode): Span | null {
  const start = index + 2;
  const end = closingOnLine(text, start, "**");

  if (end > start && isTrimmed(text.slice(start, end))) {
    const inner = render(text.slice(start, end), { ...mode, partial: false });

    return { output: wrap(inner, "b", mode), end: end + 2 };
  }

  return mode.partial && end === -1 ? restWithoutMarker(text, start, mode) : null;
}

function readCode(text: string, index: number, mode: Mode): Span | null {
  const start = index + 1;
  const end = closingOnLine(text, start, "`");

  if (end > start) {
    const inner = escape(text.slice(start, end), mode);

    return { output: wrap(inner, "code", mode), end: end + 1 };
  }

  return mode.partial && end === -1 ? restWithoutMarker(text, start, mode) : null;
}

/** `_` marks italics only around words: snake_case and lone underscores stay as they are. */
function readItalic(text: string, index: number, mode: Mode): Span | null {
  const start = index + 1;
  const opens = !isWordChar(text[index - 1]) && isOpening(text[start]);

  if (!opens) {
    return null;
  }

  const end = italicEnd(text, start);

  if (end !== -1) {
    const inner = render(text.slice(start, end), { ...mode, partial: false });

    return { output: wrap(inner, "i", mode), end: end + 1 };
  }

  return mode.partial && isLastLine(text, start) ? restWithoutMarker(text, start, mode) : null;
}

function readLink(text: string, index: number, mode: Mode): Span | null {
  const rest = text.slice(index);
  const link = LINK.exec(rest);

  if (link) {
    const [whole, label, url] = link;
    const shown = render(label, { ...mode, partial: false });
    const output = mode.html
      ? `<a href="${escapeAttribute(url)}">${shown}</a>`
      : `${shown} (${url})`;

    return { output, end: index + whole.length };
  }

  const unfinished = mode.partial ? LINK_IN_PROGRESS.exec(rest) : null;

  if (unfinished) {
    return { output: render(unfinished[1], mode), end: text.length };
  }

  return null;
}

/** Where `marker` closes on the same line, or -1. */
function closingOnLine(text: string, from: number, marker: string) {
  const end = text.indexOf(marker, from);
  const lineEnd = text.indexOf("\n", from);

  if (end === -1 || (lineEnd !== -1 && lineEnd < end)) {
    return -1;
  }

  return end;
}

/** The closing `_` of italics on the same line: after a non-space, before a non-word. */
function italicEnd(text: string, from: number) {
  for (let index = from + 1; index < text.length && text[index] !== "\n"; index++) {
    const closes = text[index] === "_" && text[index - 1] !== " " && !isWordChar(text[index + 1]);

    if (closes) {
      return index;
    }
  }

  return -1;
}

/** The rest of an unfinished answer with the open marker hidden. */
function restWithoutMarker(text: string, from: number, mode: Mode): Span | null {
  if (!isLastLine(text, from)) {
    return null;
  }

  return { output: render(text.slice(from), mode), end: text.length };
}

function wrap(inner: string, tag: string, mode: Mode) {
  return mode.html ? `<${tag}>${inner}</${tag}>` : inner;
}

function isLastLine(text: string, from: number) {
  return !text.includes("\n", from);
}

function isTrimmed(text: string) {
  return text.trim() === text;
}

function isOpening(char: string | undefined) {
  return char !== undefined && char !== " " && char !== "\n" && char !== "_";
}

function isWordChar(char: string | undefined) {
  return char !== undefined && WORD_CHAR.test(char);
}

function escape(text: string, mode: Mode) {
  if (!mode.html) {
    return text;
  }

  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string) {
  return escape(text, { html: true, partial: false }).replace(/"/g, "&quot;");
}
