# bibtex-parse

Parses BibTeX and BibLaTeX into structured JavaScript data.

This maintained fork originates from Peter West's `bibtex-parse` project and keeps its broad real-world fixture corpus while providing a new resilient reader API for current Node.js releases.

## Features

- **Resilient documents**: returns valid entries around malformed blocks together with structured diagnostics.
- **Source fidelity**: preserves raw directives, expressions, fields, comments, and precise source locations.
- **Resolved values**: expands case-insensitive string macros, forward references, concatenations, and built-in month names.
- **Data inheritance**: resolves cascading `xdata`, BibLaTeX `ids` aliases, and type-aware `crossref` relations while leaving `xref` independent.
- **TeX decoding**: converts accents, ligatures, symbols, math characters, punctuation, and common formatting commands to Unicode without discarding the raw source.
- **Strict validation**: optionally throws a location-aware `BibTeXParseError` at the first syntax error.

## Installation

```sh
npm install @lumine-code/bibtex-parse
```

Node.js 24.18 or newer is required.

## Usage

```js
const { parse } = require("@lumine-code/bibtex-parse");

const document = parse(
  String.raw`@string{journal = {Journal}}
@article{muller2026,
  author = {M\"{u}ller, Anna},
  title = {A resilient parser},
  journal = JOURNAL,
  year = 2026
}`,
  { sourceName: "references.bib" },
);

console.log(document.entries[0].values.author); // Müller, Anna
console.log(document.entries[0].values.journal); // Journal
console.log(document.diagnostics); // []
```

Parsing is tolerant by default. A malformed directive becomes an `invalid` item, adds an error diagnostic, and does not prevent later valid entries from being returned.

```js
const document = parse(source, { sourceName: "references.bib" });

for (const diagnostic of document.diagnostics) {
  const { line, column } = diagnostic.location.start;
  console.warn(`${diagnostic.code} at ${line}:${column}: ${diagnostic.message}`);
}
```

Use strict mode when partial results are not acceptable:

```js
const document = parse(source, { sourceName: "references.bib", strict: true });
```

## API

### `parse(source, options)`

Parses a string and returns a document with these views:

- `items`: every source segment in order, including entries, strings, preambles, comments, and invalid blocks.
- `entries`: valid bibliography entries, referencing the same entry objects present in `items`.
- `strings`, `preambles`, `comments`: filtered views of the corresponding source items.
- `diagnostics`: ordered errors and warnings with codes, messages, severities, and locations.

Each entry contains its original `key`, lowercase `entryType`, ordered source `fields`, exact `raw` text, `location`, and a lowercase `values` map. Source fields retain their original name, parsed expression, raw right-hand side, decoded value, and location. Numeric literals stay strings so identifiers such as ISBNs never lose precision.

Options:

- `sourceName`: name copied into every location and diagnostic; defaults to `null`.
- `strict`: throw the first error as `BibTeXParseError`; defaults to `false`.

Locations contain zero-based, end-exclusive UTF-16 offsets and one-based line and column numbers.

### `decodeTeX(source)`

Returns Unicode display text for a TeX value. Braces used for case protection are removed, recognized commands are decoded, and unknown commands remain visible rather than being discarded.

### `BibTeXParseError`

Extends `SyntaxError` and exposes the originating `diagnostic`, its stable `code`, and its exact `location`.

## Building

`npm run build` compiles `src/bibtex.peggy` into the committed CommonJS parser. Generated output must be committed because Git dependencies may be installed with lifecycle scripts disabled.

Run `npm test` for the Jasmine suite and `npm run lint` for ESLint and formatting checks.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
