"use strict";

const parser = require("./parser");

const STRINGS = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

const parse = (source, options) => parser.parse(source, options);

const stripMatchingBraces = (source) => {
  let value = source;
  while (value.match(/(^|[^\\])\{.*?([^\\])\}/s)) {
    value = value.replace(/(^|[^\\])\{(.*?)([^\\])\}/s, "$1$2$3");
  }
  return value;
};

const entries = (source, options) => {
  const items = parse(source, options);
  const result = [];
  const strings = { ...STRINGS };
  const evaluate = (datatype, value) => {
    if (datatype === "number") {
      return value;
    }
    if (datatype === "quoted" || datatype === "braced") {
      return stripMatchingBraces(value).replace(/\\(["'%@{}()_])/g, "$1");
    }
    if (datatype === "identifier") {
      return strings[value] || "";
    }
    if (datatype === "concatinate") {
      return value.map((part) => evaluate(part.datatype, part.value)).join("");
    }
    return null;
  };

  for (const item of items) {
    if (item.itemtype === "string") {
      strings[item.name] = evaluate(item.datatype, item.value);
    } else if (item.itemtype === "entry") {
      const entry = { key: item.key, type: item.type };
      for (const field of item.fields) {
        entry[field.name.toUpperCase()] = evaluate(field.datatype, field.value);
      }
      result.push(entry);
    }
  }
  return result;
};

module.exports = { parse, entries };
