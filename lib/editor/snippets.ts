import { snippetCompletion } from "@codemirror/autocomplete";
import type { Completion } from "@codemirror/autocomplete";

export const LATEX_SNIPPETS: Completion[] = [
  snippetCompletion(
    "\\begin{equation}\n\t${expr}\n\\end{equation}",
    { label: "eq", detail: "snippet: equation env", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{equation*}\n\t${expr}\n\\end{equation*}",
    { label: "eq*", detail: "snippet: equation* env", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{align}\n\t${lhs} &= ${rhs}\n\\end{align}",
    { label: "align", detail: "snippet: align env", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{align*}\n\t${lhs} &= ${rhs}\n\\end{align*}",
    { label: "align*", detail: "snippet: align* env", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{itemize}\n\t\\item ${item}\n\\end{itemize}",
    { label: "itm", detail: "snippet: itemize", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{enumerate}\n\t\\item ${item}\n\\end{enumerate}",
    { label: "enum", detail: "snippet: enumerate", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{figure}[${htbp}]\n\t\\centering\n\t\\includegraphics[width=${0.8}\\linewidth]{${path}}\n\t\\caption{${caption}}\n\t\\label{fig:${label}}\n\\end{figure}",
    { label: "fig", detail: "snippet: figure", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{table}[${htbp}]\n\t\\centering\n\t\\begin{tabular}{${cols}}\n\t\t\\toprule\n\t\t${head} \\\\\n\t\t\\midrule\n\t\t${row} \\\\\n\t\t\\bottomrule\n\t\\end{tabular}\n\t\\caption{${caption}}\n\t\\label{tab:${label}}\n\\end{table}",
    { label: "tab", detail: "snippet: table", type: "snippet" },
  ),
  snippetCompletion(
    "\\section{${title}}\n\\label{sec:${label}}\n",
    { label: "sec", detail: "snippet: section + label", type: "snippet" },
  ),
  snippetCompletion(
    "\\subsection{${title}}\n\\label{subsec:${label}}\n",
    { label: "ssec", detail: "snippet: subsection + label", type: "snippet" },
  ),
  snippetCompletion(
    "\\subsubsection{${title}}\n",
    { label: "sssec", detail: "snippet: subsubsection", type: "snippet" },
  ),
  snippetCompletion(
    "\\chapter{${title}}\n\\label{chap:${label}}\n",
    { label: "chap", detail: "snippet: chapter + label", type: "snippet" },
  ),
  snippetCompletion(
    "\\frac{${num}}{${den}}",
    { label: "frac", detail: "snippet: fraction", type: "snippet" },
  ),
  snippetCompletion(
    "\\sqrt{${expr}}",
    { label: "sqrt", detail: "snippet: square root", type: "snippet" },
  ),
  snippetCompletion(
    "\\textbf{${text}}",
    { label: "bf", detail: "snippet: bold", type: "snippet" },
  ),
  snippetCompletion(
    "\\textit{${text}}",
    { label: "it", detail: "snippet: italic", type: "snippet" },
  ),
  snippetCompletion(
    "\\emph{${text}}",
    { label: "em", detail: "snippet: emph", type: "snippet" },
  ),
  snippetCompletion(
    "\\begin{${env}}\n\t${body}\n\\end{${env}}",
    { label: "env", detail: "snippet: generic environment", type: "snippet" },
  ),
];
