# Changelog

## 1.0.0

- Rebranded the maintained fork as `@lumine-code/bibtex-parse` for Node.js 24.18 and newer.
- Replaced the fail-fast document parser with tolerant recovery and structured source diagnostics.
- Stopped treating unknown TeX commands as parser issues and resolved `crossref` through BibLaTeX `ids` aliases.
- Added exact raw source data and locations to directives, entries, fields, and expressions.
- Added Unicode TeX decoding, case-insensitive string expansion, forward references, and inheritance through `xdata` and `crossref`.
- Replaced Rollup, PEG.js, and Tap with Peggy, Jasmine, ESLint, Prettier, and multiplatform CI.

## Upstream history

### 2.1.0

- Added configurable handling for numeric literals larger than `Number.MAX_SAFE_INTEGER`.

### 2.0.0

- Rewrote the parser and added fixtures collected from other BibTeX parsers.

### 1.0.0

- Added `@comment` directives and comments without a `%` prefix.
- Changed the original AST from an object to an ordered list.
