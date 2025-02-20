import eslint from "@eslint/js";
import { configs } from 'eslint-plugin-lit';
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  configs['flat/recommended'],
  ...tseslint.configs.strictTypeChecked,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", {}],
      "@typescript-eslint/unbound-method": "off", // Conflicts with Lit event handlers.
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [".astro/", "dist/"],
  },
);
