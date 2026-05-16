export type OutlineNode = {
  level: number; // 0 = part, 1 = chapter, 2 = section, 3 = subsection, 4 = subsubsection, 5 = paragraph
  title: string;
  line: number; // 1-based
};

const SECTION_RE = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*\{([^}]*)\}/;

const LEVEL: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

export function parseOutline(text: string): OutlineNode[] {
  const out: OutlineNode[] = [];
  const lines = text.split("\n");
  let inComment = false; // tracking line-wise %comments
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // strip line comments (not inside verbatim, but good enough)
    const noComment = raw.replace(/(^|[^\\])%.*$/, "$1");
    const m = noComment.match(SECTION_RE);
    if (m) {
      out.push({
        level: LEVEL[m[1]] ?? 99,
        title: m[2].trim(),
        line: i + 1,
      });
    }
    void inComment;
  }
  return out;
}
