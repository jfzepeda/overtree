export type BibEntry = {
  key: string;
  type: string;
  fields: Record<string, string>;
  raw: string;
};

/**
 * Parse a BibTeX/biblatex file into structured entries.
 *
 * Handles:
 *   - @type{key, field1 = {value}, field2 = "value", field3 = value, ...}
 *   - Nested braces in values
 *   - Comments (lines starting with %)
 *
 * Does NOT handle:
 *   - @string{...} macros
 *   - @preamble{...}
 *   - @comment{...}
 * Those are silently skipped.
 */
export function parseBib(source: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    // Skip whitespace and line comments
    while (i < n && /\s/.test(source[i])) i++;
    if (i < n && source[i] === "%") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }

    if (i >= n) break;
    if (source[i] !== "@") {
      i++;
      continue;
    }

    const entryStart = i;
    i++; // consume @
    // Read type
    const typeStart = i;
    while (i < n && /[A-Za-z]/.test(source[i])) i++;
    const type = source.slice(typeStart, i).toLowerCase();
    if (!type) continue;

    // Skip whitespace
    while (i < n && /\s/.test(source[i])) i++;
    if (i >= n || source[i] !== "{") continue;
    i++; // consume {

    if (type === "string" || type === "preamble" || type === "comment") {
      i = skipBalanced(source, i);
      continue;
    }

    // Read key
    while (i < n && /\s/.test(source[i])) i++;
    const keyStart = i;
    while (i < n && source[i] !== "," && source[i] !== "}" && !/\s/.test(source[i])) i++;
    const key = source.slice(keyStart, i).trim();
    if (!key) {
      i = skipBalanced(source, i);
      continue;
    }

    // Read fields
    const fields: Record<string, string> = {};
    while (i < n) {
      while (i < n && /\s/.test(source[i])) i++;
      if (source[i] === "}") {
        i++;
        break;
      }
      if (source[i] === ",") {
        i++;
        continue;
      }
      // field name
      const fnStart = i;
      while (i < n && /[A-Za-z0-9_-]/.test(source[i])) i++;
      const fname = source.slice(fnStart, i).toLowerCase();
      while (i < n && /\s/.test(source[i])) i++;
      if (i >= n || source[i] !== "=") {
        // malformed — skip to next , or }
        while (i < n && source[i] !== "," && source[i] !== "}") i++;
        continue;
      }
      i++; // consume =
      while (i < n && /\s/.test(source[i])) i++;
      // value: {balanced} or "string" or bareword
      let value = "";
      if (source[i] === "{") {
        const end = skipBalanced(source, i + 1);
        value = source.slice(i + 1, end - 1);
        i = end;
      } else if (source[i] === '"') {
        i++;
        const start = i;
        while (i < n && source[i] !== '"') {
          if (source[i] === "\\" && i + 1 < n) i += 2;
          else i++;
        }
        value = source.slice(start, i);
        if (i < n) i++; // consume closing "
      } else {
        const start = i;
        while (i < n && source[i] !== "," && source[i] !== "}" && source[i] !== "\n") i++;
        value = source.slice(start, i).trim();
      }
      if (fname) fields[fname] = collapseValue(value);
      // Trailing whitespace + optional comma
      while (i < n && /\s/.test(source[i])) i++;
      if (source[i] === ",") {
        i++;
        continue;
      }
      if (source[i] === "}") {
        i++;
        break;
      }
    }

    entries.push({
      key,
      type,
      fields,
      raw: source.slice(entryStart, i),
    });
  }

  return entries;
}

function skipBalanced(src: string, i: number): number {
  // i points at the position after the opening brace; return position right after matching close
  let depth = 1;
  const n = src.length;
  while (i < n && depth > 0) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "\\" && i + 1 < n) {
      i += 2;
      continue;
    }
    i++;
  }
  return i;
}

function collapseValue(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

export function formatBibEntry(e: BibEntry): string {
  const fieldLines = Object.entries(e.fields)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n");
  return `@${e.type}{${e.key},\n${fieldLines}\n}`;
}
