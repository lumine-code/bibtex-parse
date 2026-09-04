const fs = require("fs");
const path = require("path");
const { parse } = require("..");

const sourcePath = path.join(__dirname, "example.bib");
const source = fs.readFileSync(sourcePath, "utf8");
const document = parse(source, { sourceName: sourcePath });

console.log(
  JSON.stringify({ entries: document.entries, diagnostics: document.diagnostics }, null, 2),
);
