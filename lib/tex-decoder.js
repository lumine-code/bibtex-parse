"use strict";

const ACCENTS = new Map([
  ["'", "\u0301"],
  ["`", "\u0300"],
  ["^", "\u0302"],
  ['"', "\u0308"],
  ["~", "\u0303"],
  ["=", "\u0304"],
  [".", "\u0307"],
  ["u", "\u0306"],
  ["v", "\u030c"],
  ["H", "\u030b"],
  ["c", "\u0327"],
  ["k", "\u0328"],
  ["r", "\u030a"],
  ["b", "\u0331"],
  ["d", "\u0323"],
]);

const COMMANDS = new Map([
  ["TeX", "TeX"],
  ["LaTeX", "LaTeX"],
  ["BibTeX", "BibTeX"],
  ["BibLaTeX", "BibLaTeX"],
  ["ae", "æ"],
  ["AE", "Æ"],
  ["oe", "œ"],
  ["OE", "Œ"],
  ["aa", "å"],
  ["AA", "Å"],
  ["o", "ø"],
  ["O", "Ø"],
  ["l", "ł"],
  ["L", "Ł"],
  ["ss", "ß"],
  ["i", "ı"],
  ["j", "ȷ"],
  ["alpha", "α"],
  ["Alpha", "Α"],
  ["beta", "β"],
  ["Beta", "Β"],
  ["gamma", "γ"],
  ["Gamma", "Γ"],
  ["delta", "δ"],
  ["Delta", "Δ"],
  ["epsilon", "ϵ"],
  ["varepsilon", "ε"],
  ["Epsilon", "Ε"],
  ["zeta", "ζ"],
  ["Zeta", "Ζ"],
  ["eta", "η"],
  ["Eta", "Η"],
  ["theta", "θ"],
  ["vartheta", "ϑ"],
  ["Theta", "Θ"],
  ["iota", "ι"],
  ["Iota", "Ι"],
  ["kappa", "κ"],
  ["Kappa", "Κ"],
  ["lambda", "λ"],
  ["Lambda", "Λ"],
  ["mu", "μ"],
  ["Mu", "Μ"],
  ["nu", "ν"],
  ["Nu", "Ν"],
  ["xi", "ξ"],
  ["Xi", "Ξ"],
  ["omicron", "ο"],
  ["Omicron", "Ο"],
  ["pi", "π"],
  ["Pi", "Π"],
  ["rho", "ρ"],
  ["Rho", "Ρ"],
  ["sigma", "σ"],
  ["Sigma", "Σ"],
  ["tau", "τ"],
  ["Tau", "Τ"],
  ["upsilon", "υ"],
  ["Upsilon", "Υ"],
  ["phi", "ϕ"],
  ["varphi", "φ"],
  ["Phi", "Φ"],
  ["chi", "χ"],
  ["Chi", "Χ"],
  ["psi", "ψ"],
  ["Psi", "Ψ"],
  ["omega", "ω"],
  ["Omega", "Ω"],
  ["textendash", "–"],
  ["textemdash", "—"],
  ["ldots", "…"],
  ["dots", "…"],
  ["copyright", "©"],
  ["textcopyright", "©"],
  ["pounds", "£"],
  ["euro", "€"],
  ["degree", "°"],
  ["textdegree", "°"],
  ["hyphen", "-"],
  ["slash", "/"],
  ["textbackslash", "\\"],
  ["textasciitilde", "~"],
  ["textasciicircum", "^"],
  ["textbar", "|"],
]);

const WRAPPERS = new Set([
  "emph",
  "textbf",
  "textit",
  "textmd",
  "textrm",
  "textsf",
  "textsl",
  "textsc",
  "texttt",
  "textup",
  "mbox",
  "ensuremath",
  "mathbf",
  "mathit",
  "mathrm",
  "mathsf",
  "mathtt",
  "operatorname",
  "textsuperscript",
  "textsubscript",
  "mkbibemph",
  "mkbibitalic",
  "mkbibbold",
  "mkbibsuperscript",
  "mkbibordinal",
  "nocasechange",
  "noopsort",
]);

const SPACING = new Set([
  ",",
  ";",
  ":",
  "!",
  "quad",
  "qquad",
  "enspace",
  "thinspace",
  "medspace",
  "thickspace",
]);

function decodeTeX(source, options = {}) {
  if (typeof source !== "string") {
    throw new TypeError("TeX source must be a string");
  }

  const onUnknown = typeof options.onUnknown === "function" ? options.onUnknown : () => {};
  let index = 0;

  function parse(stopCharacter = null) {
    let output = "";
    while (index < source.length) {
      const character = source[index];
      if (stopCharacter && character === stopCharacter) {
        index += 1;
        break;
      }
      if (character === "{") {
        index += 1;
        output += parse("}");
        continue;
      }
      if (character === "}") {
        index += 1;
        continue;
      }
      if (character === "\\") {
        output += parseCommand();
        continue;
      }
      if (character === "~") {
        output += "\u00a0";
        index += 1;
        continue;
      }
      if (source.startsWith("---", index)) {
        output += "—";
        index += 3;
        continue;
      }
      if (source.startsWith("--", index)) {
        output += "–";
        index += 2;
        continue;
      }
      if (source.startsWith("``", index)) {
        output += "“";
        index += 2;
        continue;
      }
      if (source.startsWith("''", index)) {
        output += "”";
        index += 2;
        continue;
      }
      if (character === "$") {
        index += 1;
        continue;
      }
      output += character;
      index += 1;
    }
    return output;
  }

  function skipCommandWhitespace() {
    while (index < source.length && /[ \t\r\n]/.test(source[index])) index += 1;
  }

  function parseArgument() {
    skipCommandWhitespace();
    if (source[index] === "{") {
      index += 1;
      return parse("}");
    }
    if (source[index] === "\\") return parseCommand();
    if (index >= source.length) return "";
    const character = source[index];
    index += 1;
    return character;
  }

  function parseCommand() {
    const commandOffset = index;
    index += 1;
    if (index >= source.length) return "\\";

    const control = source[index];
    if ("{}$%_#&".includes(control)) {
      index += 1;
      return control;
    }
    if (control === "\\") {
      index += 1;
      return " ";
    }
    if (control === "(" || control === ")" || control === "[" || control === "]") {
      index += 1;
      return "";
    }
    if (control === " ") {
      index += 1;
      return " ";
    }
    if (ACCENTS.has(control) && !/[A-Za-z]/.test(control)) {
      index += 1;
      return applyAccent(parseArgument(), ACCENTS.get(control));
    }
    if (!/[A-Za-z]/.test(control)) {
      index += 1;
      if (SPACING.has(control)) return " ";
      onUnknown(control, commandOffset);
      return `\\${control}`;
    }

    const start = index;
    while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1;
    const command = source.slice(start, index);
    if (source[index] === "*") index += 1;

    if (ACCENTS.has(command)) {
      return applyAccent(parseArgument(), ACCENTS.get(command));
    }
    if (COMMANDS.has(command)) {
      skipCommandWhitespace();
      return COMMANDS.get(command);
    }
    if (SPACING.has(command)) {
      skipCommandWhitespace();
      return " ";
    }
    if (WRAPPERS.has(command)) {
      return parseArgument();
    }
    if (command === "href") {
      const url = parseArgument();
      const label = parseArgument();
      return label || url;
    }
    if (command === "url" || command === "path") {
      return parseArgument();
    }
    if (command === "frac") {
      return `${parseArgument()}/${parseArgument()}`;
    }
    if (command === "mkbibquote" || command === "enquote") {
      return `“${parseArgument()}”`;
    }
    if (command === "mkbibparens") {
      return `(${parseArgument()})`;
    }
    if (command === "mkbibbrackets") {
      return `[${parseArgument()}]`;
    }
    if (command === "foreignlanguage" || command === "textcolor") {
      parseArgument();
      return parseArgument();
    }

    onUnknown(command, commandOffset);
    const preserved = `\\${command}`;
    skipCommandWhitespace();
    if (source[index] !== "{") return preserved;
    index += 1;
    return `${preserved}{${parse("}")}}`;
  }

  return parse().normalize("NFC");
}

function applyAccent(value, combiningMark) {
  if (!value) return "";
  const base = value[0] === "ı" ? "i" : value[0] === "ȷ" ? "j" : value[0];
  return `${base}${combiningMark}${value.slice(1)}`.normalize("NFC");
}

module.exports = { decodeTeX };
