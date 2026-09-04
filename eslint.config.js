const js = require("@eslint/js");
const n = require("eslint-plugin-n");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: ["lib/parser.js", "test/valid/**", "test/invalid/**"],
  },
  js.configs.recommended,
  n.configs["flat/recommended-script"],
  {
    settings: {
      n: { version: ">=24.18.0" },
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["eslint.config.js", "prettier.config.js", "spec/**"],
    rules: {
      "n/no-unpublished-require": "off",
      "n/no-extraneous-require": "off",
    },
  },
  {
    files: ["spec/**"],
    languageOptions: {
      globals: {
        ...globals.jasmine,
      },
    },
  },
  prettier,
];
