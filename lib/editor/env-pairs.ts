import { Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

const pairMark = Decoration.mark({ class: "cm-envPairMatch" });

const BEGIN_RE = /\\begin\{([^}]+)\}/g;
const END_RE = /\\end\{([^}]+)\}/g;

function findEnclosing(doc: string, pos: number): { begin: { from: number; to: number; name: string }; end: { from: number; to: number; name: string } } | null {
  // Find the nearest \begin{X} before or covering pos
  // and the matching \end{X} after pos, respecting nesting.
  const begins: { from: number; to: number; name: string }[] = [];
  const ends: { from: number; to: number; name: string }[] = [];

  let m: RegExpExecArray | null;
  BEGIN_RE.lastIndex = 0;
  while ((m = BEGIN_RE.exec(doc))) {
    begins.push({ from: m.index, to: m.index + m[0].length, name: m[1] });
  }
  END_RE.lastIndex = 0;
  while ((m = END_RE.exec(doc))) {
    ends.push({ from: m.index, to: m.index + m[0].length, name: m[1] });
  }

  // Walk through pairs, maintain stack. Find the pair that encloses pos.
  const stack: { begin: { from: number; to: number; name: string } }[] = [];
  const pairs: { begin: { from: number; to: number; name: string }; end: { from: number; to: number; name: string } }[] = [];

  const tokens = [
    ...begins.map((b) => ({ kind: "begin" as const, ...b })),
    ...ends.map((e) => ({ kind: "end" as const, ...e })),
  ].sort((a, b) => a.from - b.from);

  for (const t of tokens) {
    if (t.kind === "begin") {
      stack.push({ begin: { from: t.from, to: t.to, name: t.name } });
    } else {
      // Find matching begin from top of stack with same name; if mismatch, skip.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].begin.name === t.name) {
          const b = stack[i].begin;
          stack.splice(i, 1);
          pairs.push({ begin: b, end: { from: t.from, to: t.to, name: t.name } });
          break;
        }
      }
    }
  }

  // Pick the innermost pair containing pos (within [begin.from, end.to]).
  let best: { begin: { from: number; to: number; name: string }; end: { from: number; to: number; name: string } } | null = null;
  for (const p of pairs) {
    if (pos >= p.begin.from && pos <= p.end.to) {
      if (!best || p.begin.from > best.begin.from) best = p;
    }
  }
  return best;
}

function buildDecorations(view: EditorView): DecorationSet {
  const sel = view.state.selection.main;
  if (!sel.empty) return Decoration.none;
  const pos = sel.head;
  const doc = view.state.doc.toString();
  const pair = findEnclosing(doc, pos);
  if (!pair) return Decoration.none;

  // Only highlight when the cursor is *on* the begin or end token, not just inside the env.
  const onBegin = pos >= pair.begin.from && pos <= pair.begin.to;
  const onEnd = pos >= pair.end.from && pos <= pair.end.to;
  if (!onBegin && !onEnd) return Decoration.none;

  const b = new RangeSetBuilder<Decoration>();
  b.add(pair.begin.from, pair.begin.to, pairMark);
  b.add(pair.end.from, pair.end.to, pairMark);
  return b.finish();
}

export function envPairHighlight(): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view);
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.selectionSet || u.viewportChanged) {
            this.decorations = buildDecorations(u.view);
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.theme({
      ".cm-envPairMatch": {
        backgroundColor: "rgba(59, 130, 246, 0.22)",
        outline: "1px solid rgba(59, 130, 246, 0.55)",
        borderRadius: "2px",
      },
    }),
  ];
}
