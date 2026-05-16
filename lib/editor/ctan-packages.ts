export type CtanPackage = {
  name: string;
  description: string;
};

export const CTAN_PACKAGES: CtanPackage[] = [
  { name: "amsmath", description: "AMS math environments and symbols (align, gather, cases, ...)" },
  { name: "amssymb", description: "Extra AMS math symbols (\\mathbb, \\geqslant, ...)" },
  { name: "amsthm", description: "Theorem-like environments" },
  { name: "amsfonts", description: "AMS math fonts" },
  { name: "mathtools", description: "amsmath superset with extra math tools" },
  { name: "mathrsfs", description: "Ralph Smith's formal script font (\\mathscr)" },
  { name: "bm", description: "Bold math symbols" },
  { name: "siunitx", description: "Comprehensive units & numbers handling (\\SI, \\num)" },
  { name: "cancel", description: "Strike-through math" },

  { name: "inputenc", description: "Input encoding (utf8)" },
  { name: "fontenc", description: "Font encoding (T1)" },
  { name: "babel", description: "Multilingual support" },
  { name: "polyglossia", description: "Multilingual support (XeLaTeX/LuaLaTeX)" },
  { name: "csquotes", description: "Context-sensitive quotation" },
  { name: "microtype", description: "Subliminal typographic refinements" },
  { name: "lmodern", description: "Latin Modern fonts" },
  { name: "fontspec", description: "OpenType fonts (XeLaTeX/LuaLaTeX)" },
  { name: "newtxtext", description: "Times-like text fonts" },
  { name: "newtxmath", description: "Times-like math fonts" },
  { name: "mathpazo", description: "Palatino-like math fonts" },
  { name: "mathptmx", description: "Times math fonts" },
  { name: "helvet", description: "Helvetica sans-serif font" },
  { name: "courier", description: "Courier monospace font" },
  { name: "charter", description: "Charter font" },

  { name: "geometry", description: "Customize page layout / margins" },
  { name: "fancyhdr", description: "Customize headers and footers" },
  { name: "titlesec", description: "Customize section titles" },
  { name: "titletoc", description: "Customize table of contents" },
  { name: "tocbibind", description: "Add bibliography/index/contents to ToC" },
  { name: "setspace", description: "Set line spacing" },
  { name: "parskip", description: "Paragraph spacing instead of indent" },
  { name: "indentfirst", description: "Indent the first paragraph" },
  { name: "lastpage", description: "Reference the last page number" },

  { name: "graphicx", description: "Include images (\\includegraphics)" },
  { name: "subcaption", description: "Sub-figures and sub-tables" },
  { name: "subfig", description: "Older sub-figure support" },
  { name: "float", description: "Improved float positioning (H specifier)" },
  { name: "wrapfig", description: "Wrap text around figures" },
  { name: "rotating", description: "Rotated figures and tables" },
  { name: "epstopdf", description: "Convert EPS to PDF on the fly" },
  { name: "svg", description: "Include SVG figures" },
  { name: "standalone", description: "Standalone class for self-contained figures" },

  { name: "booktabs", description: "Professional-quality tables (\\toprule, \\midrule)" },
  { name: "longtable", description: "Multi-page tables" },
  { name: "tabularx", description: "Auto-width tabular" },
  { name: "tabulary", description: "Balanced auto-width tabular" },
  { name: "array", description: "Extended tabular features" },
  { name: "multirow", description: "Multi-row cells" },
  { name: "makecell", description: "Multi-line cells" },
  { name: "colortbl", description: "Colored table cells" },
  { name: "diagbox", description: "Diagonal cell divisions" },

  { name: "hyperref", description: "Hyperlinks, PDF metadata (\\href, \\url)" },
  { name: "cleveref", description: "Smart cross-references (\\cref)" },
  { name: "nameref", description: "Name-based cross-references" },
  { name: "bookmark", description: "PDF bookmarks (faster than hyperref)" },

  { name: "color", description: "Basic color support" },
  { name: "xcolor", description: "Extended color support" },

  { name: "tikz", description: "TikZ graphics" },
  { name: "pgfplots", description: "Plots using TikZ" },
  { name: "pgfplotstable", description: "Tabular data plotting" },
  { name: "circuitikz", description: "Electrical circuits with TikZ" },
  { name: "chemfig", description: "Chemical structures" },
  { name: "tikz-cd", description: "Commutative diagrams" },
  { name: "forest", description: "Drawing tree structures" },

  { name: "listings", description: "Source code listings" },
  { name: "minted", description: "Syntax-highlighted code (requires Python pygments)" },
  { name: "fancyvrb", description: "Fancy verbatim" },
  { name: "verbatim", description: "Improved verbatim" },

  { name: "natbib", description: "Author-year & numerical citations (BibTeX)" },
  { name: "biblatex", description: "Modern bibliography (use with biber)" },
  { name: "apacite", description: "APA citation style" },
  { name: "harvard", description: "Harvard citation styles" },

  { name: "url", description: "URL formatting" },
  { name: "doi", description: "DOI links" },

  { name: "ifthen", description: "Conditional expressions" },
  { name: "etoolbox", description: "Programming tools for LaTeX" },
  { name: "xparse", description: "Document command parser (expl3)" },
  { name: "expl3", description: "LaTeX3 programming layer" },
  { name: "pgfkeys", description: "Key-value parsing" },

  { name: "enumitem", description: "Control list layout" },
  { name: "paralist", description: "Inline and compact lists" },

  { name: "ragged2e", description: "Better ragged text" },
  { name: "blindtext", description: "Lorem ipsum placeholder text" },
  { name: "lipsum", description: "Lorem ipsum text" },

  { name: "datetime", description: "Date and time formatting" },
  { name: "datetime2", description: "Modern date/time formatting" },

  { name: "tcolorbox", description: "Colored & framed text boxes" },
  { name: "mdframed", description: "Framed environments with breaks" },
  { name: "framed", description: "Simple framed environments" },

  { name: "algorithm", description: "Algorithm float environment" },
  { name: "algorithm2e", description: "Algorithms with end keywords" },
  { name: "algpseudocode", description: "Pseudocode style for algorithms" },
  { name: "algorithmic", description: "Pseudocode environments" },

  { name: "todonotes", description: "Add TODO notes in margin" },
  { name: "changes", description: "Track changes" },
  { name: "marginnote", description: "Margin notes" },

  { name: "etex", description: "e-TeX extensions" },
  { name: "kvoptions", description: "Key-value class/package options" },
  { name: "calc", description: "Arithmetic in LaTeX" },

  { name: "appendix", description: "Improved appendix support" },
  { name: "abstract", description: "Customize abstract environment" },
  { name: "abstractsubmission", description: "Custom abstract for journals" },

  { name: "babelbib", description: "Multilingual bibliographies" },
  { name: "glossaries", description: "Glossaries and acronyms" },
  { name: "acronym", description: "Acronyms" },
  { name: "nomencl", description: "Nomenclature" },
  { name: "makeidx", description: "Index creation" },
  { name: "imakeidx", description: "Modern index creation" },

  { name: "luacode", description: "Lua code (LuaLaTeX)" },
  { name: "luaotfload", description: "OpenType font loader (LuaLaTeX)" },

  { name: "scrbase", description: "KOMA-Script base" },
  { name: "scrlayer-scrpage", description: "KOMA-Script page styles" },

  { name: "beamer", description: "Presentations (class)" },
  { name: "beamerthemesplit", description: "Beamer theme split" },
];
