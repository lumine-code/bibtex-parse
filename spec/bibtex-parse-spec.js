const fs = require("fs");
const path = require("path");
const { BibTeXParseError, decodeTeX, parse } = require("..");

const fixtureRoot = path.join(__dirname, "..", "test");

function diagnosticCodes(document) {
  return document.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("public API", () => {
  it("exports the new reader API only", () => {
    const api = require("..");
    expect(Object.keys(api).sort()).toEqual(["BibTeXParseError", "decodeTeX", "parse"]);
    expect(api.entries).toBeUndefined();
  });

  it("validates source and options", () => {
    expect(() => parse(null)).toThrowError(TypeError, "BibTeX source must be a string");
    expect(() => parse("", [])).toThrowError(TypeError, "Parser options must be an object");
    expect(() => decodeTeX(null)).toThrowError(TypeError, "TeX source must be a string");
  });

  it("returns an empty document for empty input", () => {
    expect(parse("")).toEqual({
      items: [],
      entries: [],
      strings: [],
      preambles: [],
      comments: [],
      diagnostics: [],
    });
  });
});

describe("document structure", () => {
  it("preserves source items, raw values, and exact locations", () => {
    const source =
      "\ufeff% heading\r\n" +
      "@string{journal = {Journal}}\r\n" +
      '@preamble{"Generated bibliography"}\r\n' +
      "@comment{private note}\r\n" +
      "@article{Key, TITLE = {The {NASA} mission}, year = 2026, journal=journal}";
    const document = parse(source, { sourceName: "library.bib" });
    const entry = document.entries[0];
    const title = entry.fields[0];

    expect(document.items.map((item) => item.raw).join("")).toBe(source);
    expect(document.strings[0].value).toBe("Journal");
    expect(document.preambles[0].value).toBe("Generated bibliography");
    expect(document.comments.some((comment) => comment.value === "private note")).toBeTrue();
    expect(entry.key).toBe("Key");
    expect(entry.entryType).toBe("article");
    expect(entry.values.title).toBe("The NASA mission");
    expect(entry.values.year).toBe("2026");
    expect(title.name).toBe("TITLE");
    expect(title.normalizedName).toBe("title");
    expect(title.raw).toBe("{The {NASA} mission}");
    expect(title.source).toBe("TITLE = {The {NASA} mission}");
    expect(entry.location.sourceName).toBe("library.bib");
    expect(entry.location.start).toEqual({
      offset: source.indexOf("@article"),
      line: 5,
      column: 1,
    });
    expect(entry.location.end.offset).toBe(source.length);
    expect(entry.location.end.column).toBe(entry.raw.length + 1);
  });

  it("parses entries enclosed by parentheses", () => {
    const entry = parse("@book(Key, title={Title},)").entries[0];
    expect(entry.delimiter).toBe("parentheses");
    expect(entry.values.title).toBe("Title");
  });

  it("treats unmatched quotes and percent signs in comment directives as text", () => {
    const document = parse('@comment{A "quoted % comment}\n@book{x,title={Title}}');
    expect(document.comments[0].value).toBe('A "quoted % comment');
    expect(document.entries.map((entry) => entry.key)).toEqual(["x"]);
    expect(document.diagnostics).toEqual([]);
  });

  it("preserves duplicate entries and fields while resolving the last field", () => {
    const document = parse("@article{x,title={First},TITLE={Second}}\n@book{x,title={Duplicate}}");
    expect(document.entries.length).toBe(2);
    expect(document.entries[0].fields.length).toBe(2);
    expect(document.entries[0].values.title).toBe("Second");
    expect(diagnosticCodes(document)).toEqual(["duplicate-field", "duplicate-key"]);
  });

  it("keeps @ signs and percent characters inside field values", () => {
    const document = parse(
      "@misc{x,email={person@example.com},title={100% useful},note={A @book{ marker}}}",
    );
    expect(document.entries[0].values).toEqual(
      jasmine.objectContaining({
        email: "person@example.com",
        title: "100% useful",
        note: "A @book marker",
      }),
    );
  });
});

describe("string expressions", () => {
  it("resolves case-insensitive forward references, concatenation, and built-in months", () => {
    const document = parse(`@article{x, journal=LATER # " Press", month=JAN}
@string{later = name}
@string{NAME = {Journal}}`);
    expect(document.entries[0].values.journal).toBe("Journal Press");
    expect(document.entries[0].values.month).toBe("January");
    expect(document.strings.map((definition) => definition.value)).toEqual(["Journal", "Journal"]);
    expect(document.diagnostics).toEqual([]);
  });

  it("preserves undefined identifiers instead of discarding them", () => {
    const document = parse("@article{x,journal=unknown}");
    expect(document.entries[0].values.journal).toBe("unknown");
    expect(diagnosticCodes(document)).toEqual(["undefined-string"]);
  });

  it("reports cyclic and duplicate string definitions", () => {
    const document = parse(`@string{a=b}
@string{b=a}
@string{c={first}}
@string{C={replacement}}
@article{x,title=b}`);
    expect(document.entries[0].values.title).toBe("a");
    expect(diagnosticCodes(document)).toContain("duplicate-string");
    expect(diagnosticCodes(document)).toContain("cyclic-string");
  });
});

describe("TeX decoding", () => {
  it("decodes accents, ligatures, punctuation, wrappers, and repeated symbols", () => {
    const source = String.raw`M\"{u}ller, Garc\'{i}a, encyclop\ae dia, \textbf{bold}, \alpha/\alpha, 10\%, A~B, a--b, x---y`;
    expect(decodeTeX(source)).toBe(
      "Müller, García, encyclopædia, bold, α/α, 10%, A\u00a0B, a–b, x—y",
    );
  });

  it("supports the standard Latin accent commands", () => {
    const cases = [
      [String.raw`\'{e}`, "é"],
      ["\\`{a}", "à"],
      [String.raw`\^{o}`, "ô"],
      [String.raw`\"{u}`, "ü"],
      [String.raw`\~{n}`, "ñ"],
      [String.raw`\={a}`, "ā"],
      [String.raw`\.{z}`, "ż"],
      [String.raw`\u{g}`, "ğ"],
      [String.raw`\v{s}`, "š"],
      [String.raw`\H{o}`, "ő"],
      [String.raw`\c{c}`, "ç"],
      [String.raw`\k{a}`, "ą"],
      [String.raw`\r{a}`, "å"],
      [String.raw`\d{s}`, "ṣ"],
    ];
    for (const [source, expected] of cases) expect(decodeTeX(source)).toBe(expected);
  });

  it("converts every Greek command supported by the package", () => {
    expect(
      decodeTeX(
        String.raw`\alpha\beta\gamma\delta\epsilon\varepsilon\zeta\eta\theta\vartheta\iota\kappa\lambda\mu\nu\xi\omicron\pi\rho\sigma\tau\upsilon\phi\varphi\chi\psi\omega`,
      ),
    ).toBe("αβγδϵεζηθϑικλμνξοπρστυϕφχψω");
  });

  it("decodes links and strips math delimiters without losing their content", () => {
    expect(decodeTeX(String.raw`\href{https://example.com}{Example} and $\theta_2$`)).toBe(
      "Example and θ_2",
    );
  });

  it("preserves unknown commands without treating valid TeX as a parsing issue", () => {
    const document = parse(String.raw`@article{x,title={A \custom{term}}}`);
    expect(document.entries[0].values.title).toBe(String.raw`A \custom{term}`);
    expect(document.diagnostics).toEqual([]);

    const unknown = [];
    expect(
      decodeTeX(String.raw`A \custom{term}`, {
        onUnknown: (command) => unknown.push(command),
      }),
    ).toBe(String.raw`A \custom{term}`);
    expect(unknown).toEqual(["custom"]);
  });

  it("keeps raw TeX beside the decoded value", () => {
    const document = parse(String.raw`@article{x,title={M\"{u}ller}}`);
    const field = document.entries[0].fields[0];
    expect(field.raw).toBe(String.raw`{M\"{u}ller}`);
    expect(field.value).toBe("Müller");
  });
});

describe("data inheritance", () => {
  it("applies xdata left-to-right and keeps child values authoritative", () => {
    const document = parse(`@xdata{first,publisher={First},location={Warsaw}}
@xdata{second,publisher={Second},year={2020}}
@book{child,title={Child},publisher={Own},xdata={first,second}}`);
    expect(document.entries[2].values).toEqual(
      jasmine.objectContaining({
        title: "Child",
        publisher: "Own",
        location: "Warsaw",
        year: "2020",
      }),
    );
  });

  it("supports cascading xdata entries", () => {
    const document = parse(`@xdata{name,publisher={Press}}
@xdata{place,location={London}}
@xdata{bundle,xdata={name,place}}
@book{child,xdata={bundle}}`);
    expect(document.entries[3].values).toEqual(
      jasmine.objectContaining({ publisher: "Press", location: "London" }),
    );
  });

  it("resolves crossrefs through BibLaTeX ids aliases", () => {
    const document = parse(`@mvbook{parent,ids={parent-alias},title={Collected Works}}
@book{child,crossref={parent-alias},title={Volume One}}`);

    expect(document.entries[1].values.maintitle).toBe("Collected Works");
    expect(document.diagnostics).toEqual([]);
  });

  it("applies xdata before type-aware crossref mappings", () => {
    const document =
      parse(`@book{parent,title={Book},subtitle={Sub},author={Author},publisher={Parent}}
@xdata{data,publisher={XData},location={Warsaw}}
@incollection{child,title={Chapter},xdata={data},crossref={parent}}`);
    expect(document.entries[2].values).toEqual(
      jasmine.objectContaining({
        title: "Chapter",
        booktitle: "Book",
        booksubtitle: "Sub",
        author: "Author",
        bookauthor: "Author",
        publisher: "XData",
        location: "Warsaw",
      }),
    );
  });

  it("maps multivolume and periodical parent titles", () => {
    const document = parse(`@mvbook{series,title={Collected Works}}
@book{volume,crossref={series},title={Volume One}}
@periodical{journal,title={Journal},subtitle={Research}}
@article{paper,crossref={journal},title={Paper}}`);
    expect(document.entries[1].values.maintitle).toBe("Collected Works");
    expect(document.entries[3].values.journaltitle).toBe("Journal");
    expect(document.entries[3].values.journalsubtitle).toBe("Research");
  });

  it("does not inherit through xref", () => {
    const document = parse("@book{parent,publisher={Press}}\n@inbook{child,xref={parent}}");
    expect(document.entries[1].values.publisher).toBeUndefined();
  });

  it("reports missing and cyclic parents without dropping entries", () => {
    const document = parse(`@book{missing,xdata={nowhere}}
@book{a,crossref={b}}
@book{b,crossref={a}}`);
    expect(document.entries.map((entry) => entry.key)).toEqual(["missing", "a", "b"]);
    expect(diagnosticCodes(document)).toContain("missing-parent");
    expect(diagnosticCodes(document)).toContain("cyclic-inheritance");
  });
});

describe("diagnostics and recovery", () => {
  it("recovers after a balanced malformed block", () => {
    const source = `@article{before,title={Before}}
@article{broken,title {Missing equals}}
@book{after,title={After}}`;
    const document = parse(source, { sourceName: "broken.bib" });
    expect(document.entries.map((entry) => entry.key)).toEqual(["before", "after"]);
    expect(diagnosticCodes(document)).toEqual(["syntax-error"]);
    expect(document.diagnostics[0].location.sourceName).toBe("broken.bib");
    expect(document.diagnostics[0].location.start.line).toBe(2);
    expect(document.items.map((item) => item.raw).join("")).toBe(source);
  });

  it("recovers at the next directive after an unterminated block", () => {
    const source = `@article{before,title={Before}}
@article{broken,title={Missing close}
@book{after,title={After}}`;
    const document = parse(source);
    expect(document.entries.map((entry) => entry.key)).toEqual(["before", "after"]);
    expect(diagnosticCodes(document)).toEqual(["unterminated-block"]);
  });

  it("reports keyless entries and omits them from the entry view", () => {
    const document = parse("@article{title={No key}}\n@article{ok,title={Keyed}}");
    expect(document.entries.map((entry) => entry.key)).toEqual(["ok"]);
    expect(document.items.find((item) => item.entryType === "article").valid).toBeFalse();
    expect(diagnosticCodes(document)).toEqual(["missing-key"]);
  });

  it("throws the first error in strict mode with source coordinates", () => {
    let error;
    try {
      parse("% heading\n@article{title={No key}}", {
        sourceName: "strict.bib",
        strict: true,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error instanceof BibTeXParseError).toBeTrue();
    expect(error instanceof SyntaxError).toBeTrue();
    expect(error.code).toBe("missing-key");
    expect(error.location.start.line).toBe(2);
    expect(error.message).toContain("strict.bib:2:1");
  });

  it("does not throw warnings in strict mode", () => {
    expect(() => parse("@article{x,title=undefined}", { strict: true })).not.toThrow();
  });
});

describe("upstream fixture corpus", () => {
  for (const filename of fs
    .readdirSync(path.join(fixtureRoot, "valid"))
    .filter((name) => name.endsWith(".bib"))) {
    it(`reads and preserves valid fixture ${filename}`, () => {
      const source = fs.readFileSync(path.join(fixtureRoot, "valid", filename), "utf8");
      const document = parse(source, { sourceName: filename });
      expect(document.items.map((item) => item.raw).join("")).toBe(source);
      for (const diagnostic of document.diagnostics) {
        expect(diagnostic.location.sourceName).toBe(filename);
        expect(diagnostic.location.start.offset).toBeGreaterThanOrEqual(0);
        expect(diagnostic.location.end.offset).toBeLessThanOrEqual(source.length);
      }
    });
  }

  for (const filename of fs
    .readdirSync(path.join(fixtureRoot, "invalid"))
    .filter((name) => name.endsWith(".bib"))) {
    it(`diagnoses invalid fixture ${filename}`, () => {
      const source = fs.readFileSync(path.join(fixtureRoot, "invalid", filename), "utf8");
      const document = parse(source, { sourceName: filename });
      expect(document.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBeTrue();
      expect(() => parse(source, { sourceName: filename, strict: true })).toThrowError(
        BibTeXParseError,
      );
    });
  }
});
