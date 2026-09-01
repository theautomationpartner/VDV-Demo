import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // El proyecto es JavaScript, sin TypeScript: nada avisa cuando se usa una
    // variable que no existe. `next build` tampoco - compila igual y el error
    // recien aparece en el navegador, en produccion.
    //
    // Paso de verdad: al sacar unas variables del dashboard del Portal quedaron
    // tres usos sueltos mas abajo en el JSX. Lint en verde, build en verde, y la
    // pantalla rota con "deferContracts is not defined". Esta regla lo agarra.
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-undef": "error",
    },
  },
]);

export default eslintConfig;
