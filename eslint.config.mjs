// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**/*",
      "node_modules/**/*",
      "bin/**/*",
      "build/**/*",
      "tests/**/*",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
);
