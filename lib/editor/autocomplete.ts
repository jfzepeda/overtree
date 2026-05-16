import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { LATEX_COMMANDS, ENV_NAMES } from "./latex-commands";
import { CTAN_PACKAGES } from "./ctan-packages";
import { LATEX_SNIPPETS } from "./snippets";

export type BibEntryHandle = {
  key: string;
  title?: string;
  author?: string;
  year?: string;
};

export type LatexCompletionOptions = {
  /** Called lazily on each completion to fetch the current project's bib entries. */
  getBibEntries?: () => BibEntryHandle[];
};

const COMMAND_COMPLETIONS: Completion[] = LATEX_COMMANDS.map((c) => ({
  label: c.label,
  detail: c.detail,
  info: c.info,
  type: c.detail === "snippet" ? "snippet" : "keyword",
}));

const ENV_COMPLETIONS: Completion[] = ENV_NAMES.map((n) => ({
  label: n,
  type: "type",
}));

const PACKAGE_COMPLETIONS: Completion[] = CTAN_PACKAGES.map((p) => ({
  label: p.name,
  detail: p.description,
  type: "namespace",
}));

const LABEL_DEF_REGEX = /\\label\s*\{\s*([^}\s]+)\s*\}/g;
const NEWCOMMAND_REGEX = /\\(?:re)?newcommand\s*\{?\s*(\\[A-Za-z@]+)\s*\}?/g;
const DECLAREMATHOP_REGEX = /\\DeclareMathOperator\s*\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g;

function scanLabels(doc: string): string[] {
  const labels = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = LABEL_DEF_REGEX.exec(doc))) labels.add(m[1]);
  return Array.from(labels);
}

function scanUserCommands(doc: string): string[] {
  const cmds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = NEWCOMMAND_REGEX.exec(doc))) cmds.add(m[1]);
  while ((m = DECLAREMATHOP_REGEX.exec(doc))) cmds.add(m[1]);
  return Array.from(cmds);
}

const REF_CMDS = ["ref", "eqref", "pageref", "autoref", "nameref", "cref", "Cref"];
const CITE_CMDS = ["cite", "citep", "citet", "citeauthor", "citeyear", "citealp", "citealt", "Citep", "Citet", "nocite", "parencite", "textcite", "footcite", "autocite"];

/**
 * Build the LaTeX autocomplete source.
 *
 * Context-aware:
 *   - \begin{ / \end{          → env names
 *   - \usepackage{ / \RequirePackage{ → CTAN packages
 *   - \ref{ / \eqref{ / ...    → labels in doc
 *   - \cite{ / \citep{ / ...   → bib entry keys
 *   - \<word>                  → commands + user macros + snippets
 */
export function createLatexCompletions(opts: LatexCompletionOptions = {}) {
  return function latexCompletions(ctx: CompletionContext): CompletionResult | null {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);

    // Inside \begin{...} or \end{...}
    const envMatch = before.match(/\\(begin|end)\s*\{([^}]*)$/);
    if (envMatch) {
      const partial = envMatch[2];
      const from = ctx.pos - partial.length;
      return {
        from,
        options: ENV_COMPLETIONS,
        validFor: /^[A-Za-z*]*$/,
      };
    }

    // Inside \usepackage{...} or \RequirePackage{...}
    const pkgMatch = before.match(/\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\s*\{([^}]*)$/);
    if (pkgMatch) {
      const partial = pkgMatch[1].split(",").pop()?.trimStart() ?? "";
      const from = ctx.pos - partial.length;
      return {
        from,
        options: PACKAGE_COMPLETIONS,
        validFor: /^[A-Za-z0-9-]*$/,
      };
    }

    // Inside \ref{...}, \eqref{...}, \cref{...}, etc.
    const refMatch = before.match(new RegExp(`\\\\(${REF_CMDS.join("|")})\\s*\\{([^}]*)$`));
    if (refMatch) {
      const partial = refMatch[2].split(",").pop()?.trimStart() ?? "";
      const from = ctx.pos - partial.length;
      const labels = scanLabels(ctx.state.doc.toString());
      return {
        from,
        options: labels.map((l) => ({ label: l, type: "variable", detail: "label" })),
        validFor: /^[^,}\s]*$/,
      };
    }

    // Inside \cite{...}, \citep{...}, etc.
    const citeMatch = before.match(new RegExp(`\\\\(${CITE_CMDS.join("|")})(?:\\[[^\\]]*\\])?\\s*\\{([^}]*)$`));
    if (citeMatch) {
      const partial = citeMatch[2].split(",").pop()?.trimStart() ?? "";
      const from = ctx.pos - partial.length;
      const bibs = opts.getBibEntries?.() ?? [];
      return {
        from,
        options: bibs.map((b) => ({
          label: b.key,
          detail: b.author ? `${b.author}${b.year ? ` (${b.year})` : ""}` : b.year,
          info: b.title,
          type: "constant",
        })),
        validFor: /^[^,}\s]*$/,
      };
    }

    // \<word> — commands, user macros, snippets
    const cmdMatch = before.match(/\\([A-Za-z@]*)$/);
    if (cmdMatch) {
      const from = ctx.pos - cmdMatch[1].length - 1;
      const userCmds: Completion[] = scanUserCommands(ctx.state.doc.toString()).map(
        (c) => ({ label: c, type: "function", detail: "user" }),
      );
      return {
        from,
        options: [...COMMAND_COMPLETIONS, ...userCmds],
        validFor: /^\\[A-Za-z@]*$/,
      };
    }

    // Bare word before cursor — match snippet triggers (eq, itm, sec, ...)
    if (!ctx.explicit) return null;
    const word = ctx.matchBefore(/[A-Za-z*]+/);
    if (!word) return null;
    return {
      from: word.from,
      options: LATEX_SNIPPETS,
      validFor: /^[A-Za-z*]*$/,
    };
  };
}
