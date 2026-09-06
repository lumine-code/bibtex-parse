"use strict";

const generatedParser = require("./parser");
const { decodeTeX } = require("./tex-decoder");

const BUILTIN_STRINGS = new Map([
  ["jan", "January"],
  ["feb", "February"],
  ["mar", "March"],
  ["apr", "April"],
  ["may", "May"],
  ["jun", "June"],
  ["jul", "July"],
  ["aug", "August"],
  ["sep", "September"],
  ["oct", "October"],
  ["nov", "November"],
  ["dec", "December"],
]);

const CONTROL_FIELDS = new Set(["crossref", "xdata", "xref", "ids", "entryset"]);
const BOOK_PARTS = new Set([
  "inbook",
  "bookinbook",
  "suppbook",
  "incollection",
  "suppcollection",
  "inproceedings",
  "inreference",
]);
const MULTIVOLUME_PARENTS = new Map([
  ["mvbook", new Set(["book", "inbook", "bookinbook", "suppbook"])],
  ["mvcollection", new Set(["collection", "incollection", "suppcollection"])],
  ["mvproceedings", new Set(["proceedings", "inproceedings"])],
  ["mvreference", new Set(["reference", "inreference"])],
]);

class BibTeXParseError extends SyntaxError {
  constructor(diagnostic) {
    const start = diagnostic.location.start;
    const source = diagnostic.location.sourceName || "<input>";
    super(`${diagnostic.message} (${source}:${start.line}:${start.column})`);
    this.name = "BibTeXParseError";
    this.code = diagnostic.code;
    this.location = diagnostic.location;
    this.diagnostic = diagnostic;
  }
}

function parse(source, options = {}) {
  if (typeof source !== "string") throw new TypeError("BibTeX source must be a string");
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Parser options must be an object");
  }

  const sourceName = options.sourceName == null ? null : String(options.sourceName);
  const locate = createLocator(source, sourceName);
  const diagnostics = [];
  const diagnosticKeys = new Set();
  const addDiagnostic = (code, severity, message, location) => {
    const key = `${code}\0${location.start.offset}\0${message}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push({ severity, code, message, location });
  };

  const items = [];
  let cursor = 0;
  while (cursor < source.length) {
    const candidate = findDirective(source, cursor);
    if (!candidate) {
      addTextItem(items, source, cursor, source.length, locate);
      break;
    }
    addTextItem(items, source, cursor, candidate.start, locate);
    const block = scanDirective(source, candidate);
    if (!block.complete) {
      const location = locate(candidate.start, block.end);
      items.push({ type: "invalid", raw: source.slice(candidate.start, block.end), location });
      addDiagnostic(
        "unterminated-block",
        "error",
        `Unterminated @${candidate.name} block`,
        location,
      );
      cursor = block.end;
      continue;
    }

    const raw = source.slice(candidate.start, block.end);
    try {
      const item = relocateNode(generatedParser.parse(raw), candidate.start, locate);
      items.push(item);
    } catch (error) {
      const relativeStart = error.location?.start?.offset ?? 0;
      const relativeEnd = error.location?.end?.offset ?? relativeStart + 1;
      const location = locate(
        candidate.start + relativeStart,
        Math.min(candidate.start + Math.max(relativeEnd, relativeStart + 1), block.end),
      );
      items.push({ type: "invalid", raw, location: locate(candidate.start, block.end) });
      addDiagnostic("syntax-error", "error", cleanSyntaxMessage(error.message), location);
    }
    cursor = block.end;
  }

  const strings = items.filter((item) => item.type === "string");
  const preambles = items.filter((item) => item.type === "preamble");
  const comments = items.filter((item) => item.type === "comment");
  const parsedEntries = items.filter((item) => item.type === "entry");
  const entries = [];

  for (const entry of parsedEntries) {
    if (!entry.key) {
      addDiagnostic("missing-key", "error", "Bibliography entry is missing a key", entry.location);
      entry.valid = false;
    } else {
      entry.valid = true;
      entries.push(entry);
    }
  }

  resolveValues({ entries, strings, preambles, addDiagnostic });
  resolveInheritance(entries, addDiagnostic);
  addDuplicateEntryDiagnostics(entries, addDiagnostic);
  diagnostics.sort((left, right) => left.location.start.offset - right.location.start.offset);

  if (options.strict) {
    const firstError = diagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (firstError) throw new BibTeXParseError(firstError);
  }

  return { items, entries, strings, preambles, comments, diagnostics };
}

function createLocator(source, sourceName) {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
    else if (source[index] === "\r" && source[index + 1] !== "\n") lineStarts.push(index + 1);
  }

  const positionAt = (rawOffset) => {
    const offset = Math.max(0, Math.min(rawOffset, source.length));
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (lineStarts[middle] <= offset) low = middle + 1;
      else high = middle - 1;
    }
    const lineIndex = Math.max(0, high);
    return {
      offset,
      line: lineIndex + 1,
      column: offset - lineStarts[lineIndex] + 1,
    };
  };

  return (start, end) => ({
    sourceName,
    start: positionAt(start),
    end: positionAt(end),
  });
}

function findDirective(source, from) {
  const pattern = /@([A-Za-z][A-Za-z0-9_:-]*)[ \t\r\n]*([({])/g;
  pattern.lastIndex = from;
  let match;
  while ((match = pattern.exec(source))) {
    if (isInsidePercentComment(source, match.index)) continue;
    return {
      start: match.index,
      name: match[1],
      opener: match[2],
      openerOffset: pattern.lastIndex - 1,
    };
  }
  return null;
}

function isInsidePercentComment(source, offset) {
  const lineStart =
    Math.max(source.lastIndexOf("\n", offset - 1), source.lastIndexOf("\r", offset - 1)) + 1;
  for (let index = lineStart; index < offset; index += 1) {
    if (source[index] !== "%") continue;
    let slashes = 0;
    for (
      let previous = index - 1;
      previous >= lineStart && source[previous] === "\\";
      previous -= 1
    ) {
      slashes += 1;
    }
    if (slashes % 2 === 0) return true;
  }
  return false;
}

function scanDirective(source, candidate) {
  const topIsBrace = candidate.opener === "{";
  const rawComment = candidate.name.toLowerCase() === "comment";
  let topDepth = 1;
  let braceDepth = 0;
  let quoted = false;
  let quoteBraceDepth = 0;
  let percentComment = false;

  for (let index = candidate.openerOffset + 1; index < source.length; index += 1) {
    const character = source[index];
    if (percentComment) {
      if (character === "\n" || character === "\r") percentComment = false;
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (!rawComment && quoted) {
      if (character === "{") quoteBraceDepth += 1;
      else if (character === "}" && quoteBraceDepth > 0) quoteBraceDepth -= 1;
      else if (character === '"' && quoteBraceDepth === 0) quoted = false;
      continue;
    }
    const commentCanStart = topIsBrace ? topDepth === 1 : braceDepth === 0;
    if (!rawComment && character === "%" && commentCanStart) {
      percentComment = true;
      continue;
    }
    const quoteCanStart = topIsBrace ? topDepth === 1 : braceDepth === 0;
    if (!rawComment && character === '"' && quoteCanStart) {
      quoted = true;
      continue;
    }
    if (topIsBrace) {
      if (character === "{") topDepth += 1;
      else if (character === "}" && --topDepth === 0) return { complete: true, end: index + 1 };
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}" && braceDepth > 0) braceDepth -= 1;
    else if (braceDepth === 0 && character === "(") topDepth += 1;
    else if (braceDepth === 0 && character === ")" && --topDepth === 0) {
      return { complete: true, end: index + 1 };
    }
  }

  return { complete: false, end: findRecoveryOffset(source, candidate.openerOffset + 1) };
}

function findRecoveryOffset(source, from) {
  const pattern = /(?:^|\r\n|\n|\r)[ \t]*@([A-Za-z][A-Za-z0-9_:-]*)[ \t\r\n]*[({]/g;
  pattern.lastIndex = from;
  const match = pattern.exec(source);
  if (!match) return source.length;
  return match.index + match[0].indexOf("@");
}

function addTextItem(items, source, start, end, locate) {
  if (end <= start) return;
  const raw = source.slice(start, end);
  items.push({ type: "comment", value: raw, raw, location: locate(start, end) });
}

function relocateNode(value, baseOffset, locate) {
  if (Array.isArray(value)) return value.map((child) => relocateNode(child, baseOffset, locate));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "location" && child?.start && child?.end) {
      result.location = locate(baseOffset + child.start.offset, baseOffset + child.end.offset);
    } else {
      result[key] = relocateNode(child, baseOffset, locate);
    }
  }
  return result;
}

function cleanSyntaxMessage(message) {
  return String(message || "Invalid BibTeX syntax").replace(/\s+but .* found\.$/s, "");
}

function resolveValues({ entries, strings, preambles, addDiagnostic }) {
  const definitions = new Map();
  for (const definition of strings) {
    const previous = definitions.get(definition.normalizedName);
    if (previous) {
      addDiagnostic(
        "duplicate-string",
        "warning",
        `String macro ${definition.name} replaces an earlier definition`,
        definition.location,
      );
    }
    definitions.set(definition.normalizedName, definition);
  }

  const macroCache = new Map(BUILTIN_STRINGS);
  const resolvingMacros = new Set();

  const resolveMacro = (name, expressionLocation) => {
    const normalizedName = name.toLowerCase();
    if (macroCache.has(normalizedName)) return macroCache.get(normalizedName);
    const definition = definitions.get(normalizedName);
    if (!definition) {
      addDiagnostic(
        "undefined-string",
        "warning",
        `String macro ${name} is not defined`,
        expressionLocation,
      );
      return name;
    }
    if (resolvingMacros.has(normalizedName)) {
      addDiagnostic(
        "cyclic-string",
        "warning",
        `String macro ${name} is part of a cycle`,
        expressionLocation,
      );
      return name;
    }
    resolvingMacros.add(normalizedName);
    const value = evaluateExpression(definition.expression, resolveMacro);
    resolvingMacros.delete(normalizedName);
    macroCache.set(normalizedName, value);
    definition.value = value;
    return value;
  };

  for (const definition of strings) {
    definition.value = resolveMacro(definition.name, definition.location);
  }
  for (const preamble of preambles) {
    preamble.value = evaluateExpression(preamble.expression, resolveMacro);
  }
  for (const entry of entries) {
    const values = Object.create(null);
    const seenFields = new Map();
    for (const field of entry.fields) {
      if (seenFields.has(field.normalizedName)) {
        addDiagnostic(
          "duplicate-field",
          "warning",
          `Field ${field.name} replaces an earlier value in entry ${entry.key}`,
          field.location,
        );
      }
      seenFields.set(field.normalizedName, field);
      if (!field.expression) {
        field.value = null;
        addDiagnostic(
          "missing-field-value",
          "warning",
          `Field ${field.name} has no value`,
          field.location,
        );
      } else {
        field.value = evaluateExpression(field.expression, resolveMacro);
      }
      values[field.normalizedName] = field.value;
    }
    entry.values = values;
  }
}

function evaluateExpression(expression, resolveMacro) {
  if (expression.type === "identifier") {
    return resolveMacro(expression.name, expression.location);
  }
  if (expression.type === "concatenation") {
    return expression.parts.map((part) => evaluateExpression(part, resolveMacro)).join("");
  }
  if (expression.kind === "number") return expression.value;
  return decodeTeX(expression.value);
}

function resolveInheritance(entries, addDiagnostic) {
  const entriesByKey = new Map();
  for (const entry of entries) {
    if (!entriesByKey.has(entry.key)) entriesByKey.set(entry.key, entry);
  }
  for (const entry of entries) {
    for (const alias of splitKeys(entry.values.ids)) {
      if (!entriesByKey.has(alias)) entriesByKey.set(alias, entry);
    }
  }
  const ownValues = new WeakMap(entries.map((entry) => [entry, entry.values]));
  const resolved = new WeakSet();
  const resolving = new Set();

  const resolveEntry = (entry) => {
    if (resolved.has(entry)) return entry.values;
    if (resolving.has(entry)) return ownValues.get(entry);
    resolving.add(entry);
    const values = Object.assign(Object.create(null), ownValues.get(entry));

    const xdataKeys = splitKeys(values.xdata);
    for (const key of xdataKeys) {
      const parent = entriesByKey.get(key);
      if (!parent) {
        addReferenceDiagnostic(entry, "xdata", key, "missing-parent", addDiagnostic);
        continue;
      }
      if (resolving.has(parent)) {
        addReferenceDiagnostic(entry, "xdata", key, "cyclic-inheritance", addDiagnostic);
        continue;
      }
      copyMissing(values, resolveEntry(parent));
    }

    if (values.crossref) {
      const key = values.crossref.trim();
      const parent = entriesByKey.get(key);
      if (!parent) {
        addReferenceDiagnostic(entry, "crossref", key, "missing-parent", addDiagnostic);
      } else if (resolving.has(parent)) {
        addReferenceDiagnostic(entry, "crossref", key, "cyclic-inheritance", addDiagnostic);
      } else {
        copyCrossref(values, resolveEntry(parent), parent.entryType, entry.entryType);
      }
    }

    entry.values = values;
    resolving.delete(entry);
    resolved.add(entry);
    return values;
  };

  for (const entry of entries) resolveEntry(entry);
}

function splitKeys(value) {
  return typeof value === "string"
    ? value
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean)
    : [];
}

function copyMissing(target, source) {
  for (const [name, value] of Object.entries(source)) {
    if (CONTROL_FIELDS.has(name) || Object.hasOwn(target, name)) continue;
    target[name] = value;
  }
}

function copyCrossref(target, source, parentType, childType) {
  const renames = crossrefRenames(parentType, childType);
  for (const [name, value] of Object.entries(source)) {
    if (CONTROL_FIELDS.has(name)) continue;
    const rename = renames.get(name);
    if (rename && !Object.hasOwn(target, rename.target)) target[rename.target] = value;
    if (!rename?.exclusive && !Object.hasOwn(target, name)) target[name] = value;
  }
}

function crossrefRenames(parentType, childType) {
  const renames = new Map();
  if (BOOK_PARTS.has(childType)) {
    renames.set("title", { target: "booktitle", exclusive: true });
    renames.set("subtitle", { target: "booksubtitle", exclusive: true });
    renames.set("titleaddon", { target: "booktitleaddon", exclusive: true });
    renames.set("author", { target: "bookauthor", exclusive: false });
  }
  if (childType === "article" && parentType === "periodical") {
    renames.set("title", { target: "journaltitle", exclusive: true });
    renames.set("subtitle", { target: "journalsubtitle", exclusive: true });
    renames.set("titleaddon", { target: "journaltitleaddon", exclusive: true });
  }
  for (const [multivolumeType, childTypes] of MULTIVOLUME_PARENTS) {
    if (parentType !== multivolumeType || !childTypes.has(childType)) continue;
    renames.set("title", { target: "maintitle", exclusive: true });
    renames.set("subtitle", { target: "mainsubtitle", exclusive: true });
    renames.set("titleaddon", { target: "maintitleaddon", exclusive: true });
  }
  return renames;
}

function addReferenceDiagnostic(entry, fieldName, key, code, addDiagnostic) {
  const field = [...entry.fields]
    .reverse()
    .find((candidate) => candidate.normalizedName === fieldName);
  const message =
    code === "missing-parent"
      ? `Entry ${entry.key} references missing ${fieldName} entry ${key}`
      : `Entry ${entry.key} has cyclic ${fieldName} inheritance through ${key}`;
  addDiagnostic(code, "warning", message, field?.location ?? entry.location);
}

function addDuplicateEntryDiagnostics(entries, addDiagnostic) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      addDiagnostic(
        "duplicate-key",
        "warning",
        `Entry key ${entry.key} is defined more than once`,
        entry.location,
      );
    }
    seen.add(entry.key);
  }
}

module.exports = { BibTeXParseError, parse };
