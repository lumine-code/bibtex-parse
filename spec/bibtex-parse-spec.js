const fs = require("fs");
const path = require("path");
const bibtexParse = require("..");

const fixtureRoot = path.join(__dirname, "..", "test");

function renderValue(value, datatype) {
  if (datatype === "concatinate") {
    return value.map((part) => renderValue(part.value, part.datatype)).join(" # ");
  }
  if (datatype === "braced") return `{${value}}`;
  if (datatype === "quoted") return `"${value}"`;
  if (datatype === "number" || datatype === "identifier" || datatype === "unenclosed") {
    return value;
  }
  return "";
}

function normalizeBibtex(source) {
  return source
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/@/g, "\n@")
    .replace(/([a-zA-Z_-]+=)/g, "\n  $1")
    .replace(/\(/g, "{")
    .replace(/\)/g, "}")
    .replace(/,}/g, "}")
    .replace(/,([a-zA-Z_-]+[},])/g, ",\n  $1");
}

function normalizeLineEndings(value) {
  if (typeof value === "string") return value.replace(/\r\n/g, "\n");
  if (Array.isArray(value)) return value.map(normalizeLineEndings);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeLineEndings(child)]),
    );
  }
  return value;
}

function render(items) {
  return items
    .map((item) => {
      if (item.itemtype === "comment") return item.comment;
      if (item.itemtype === "preamble") {
        const value = renderValue(item.value, item.datatype);
        if (item.enclosed === "braces") return `@preamble{${value}}`;
        if (item.enclosed === "parentheses") return `@preamble(${value})`;
        return `@preamble${value}`;
      }
      if (item.itemtype === "string") {
        const assignment = `${item.name} = ${renderValue(item.value, item.datatype)}`;
        return item.enclosed === "braces" ? `@string{${assignment}}` : `@string(${assignment})`;
      }
      if (item.itemtype === "entry") {
        const fields = item.fields
          .map(({ name, value, datatype }) =>
            datatype === "null" ? name : `${name} = ${renderValue(value, datatype)}`,
          )
          .join(",");
        return `@${item.type}{${item.key ? `${item.key},` : ""}${fields}}`;
      }
      return "";
    })
    .join("");
}

describe("bibtex-parse", () => {
  it("returns flattened entries", () => {
    const source = `@preamble{"Reference list"}
@string{ian = "Brown, Ian"}
@string{jane = "Woods, Jane"}
@inproceedings{Smith2009,
  author=jane,
  year=2009,
  month=dec,
  title={{Quantum somethings}},
  journal={Journal of {B}lah}
}`;

    expect(bibtexParse.entries(source)).toEqual([
      {
        key: "Smith2009",
        type: "inproceedings",
        AUTHOR: "Woods, Jane",
        YEAR: 2009,
        MONTH: "December",
        TITLE: "Quantum somethings",
        JOURNAL: "Journal of Blah",
      },
    ]);
  });

  it("supports each number output mode", () => {
    const source = `@article{large,
      isbn=993320203004020203040583893423432329499585399559303,
      year=2009
    }`;
    const digits = "993320203004020203040583893423432329499585399559303";

    expect(bibtexParse.entries(source)[0]).toEqual({
      key: "large",
      type: "article",
      ISBN: BigInt(digits),
      YEAR: 2009,
    });
    expect(bibtexParse.entries(source, { number: "number" })[0].ISBN).toBe(Number(digits));
    expect(bibtexParse.entries(source, { number: "bigint" })[0].YEAR).toBe(2009n);
    expect(bibtexParse.entries(source, { number: "string" })[0]).toEqual({
      key: "large",
      type: "article",
      ISBN: digits,
      YEAR: "2009",
    });
  });

  for (const filename of fs
    .readdirSync(path.join(fixtureRoot, "valid"))
    .filter((name) => name.endsWith(".bib"))) {
    it(`parses valid fixture ${filename}`, () => {
      const source = fs.readFileSync(path.join(fixtureRoot, "valid", filename), "utf8");
      const stem = filename.slice(0, -4);
      const treePath = path.join(fixtureRoot, "valid", `${stem}-tree.json`);
      const entriesPath = path.join(fixtureRoot, "valid", `${stem}-entries.json`);
      const items = bibtexParse.parse(source);

      expect(filename === "empty.bib" ? items.length === 0 : items.length > 0).toBeTrue();
      expect(normalizeBibtex(render(items))).toBe(normalizeBibtex(source));
      expect(() => bibtexParse.entries(source)).not.toThrow();
      if (fs.existsSync(treePath)) {
        expect(normalizeLineEndings(items)).toEqual(
          normalizeLineEndings(JSON.parse(fs.readFileSync(treePath, "utf8"))),
        );
      }
      if (fs.existsSync(entriesPath)) {
        expect(normalizeLineEndings(bibtexParse.entries(source))).toEqual(
          normalizeLineEndings(JSON.parse(fs.readFileSync(entriesPath, "utf8"))),
        );
      }
    });
  }

  for (const filename of fs
    .readdirSync(path.join(fixtureRoot, "invalid"))
    .filter((name) => name.endsWith(".bib"))) {
    it(`rejects invalid fixture ${filename}`, () => {
      const source = fs.readFileSync(path.join(fixtureRoot, "invalid", filename), "utf8");
      let error;
      try {
        bibtexParse.parse(source);
      } catch (caught) {
        error = caught;
      }
      expect(error instanceof SyntaxError).toBeTrue();
      expect(error.location.start.line).toBe(1);
      expect(error.location.start.column).toBe(1);
    });
  }
});
