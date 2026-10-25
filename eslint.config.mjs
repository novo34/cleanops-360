import eslint from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import jsxA11y from "eslint-plugin-jsx-a11y"
import react from "eslint-plugin-react"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"

const tsRules = tseslint.configs.recommended.rules
const reactRules = react.configs.recommended.rules
const jsxA11yRules = jsxA11y.configs.recommended.rules

export default [
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  eslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        React: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "jsx-a11y": jsxA11y,
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...tsRules,
      ...reactRules,
      ...jsxA11yRules,
      ...reactHooks.configs["recommended-latest"].rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
]

// Deliberately not included: eslint-config-next and @next/eslint-plugin-next.
// Their fast-glob -> micromatch -> braces chain is the audited vulnerability.
// Next.js-specific rules therefore require a later, separately audited solution.
