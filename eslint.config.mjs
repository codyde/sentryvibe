import next from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";
import nextParser from "eslint-config-next/parser.js";

const tsConfigs = tsPlugin.configs["flat/recommended"].map((config) => ({
  ...config,
  files: ["**/*.{ts,tsx}"],
}));

const eslintConfig = [
  next.flatConfig.coreWebVitals,
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      parser: nextParser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: "module",
        allowImportExportEverywhere: true,
        babelOptions: {
          presets: ["next/babel"],
          caller: {
            supportsTopLevelAwait: true,
          },
        },
      },
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": [
        "warn",
        {
          elements: ["img"],
          img: ["Image"],
        },
      ],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/no-anonymous-default-export": "warn",
    },
  },
  ...tsConfigs,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      react,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/html-has-lang": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "react/no-unescaped-entities": "warn",
      "@next/next/no-html-link-for-pages": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "**/.next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
