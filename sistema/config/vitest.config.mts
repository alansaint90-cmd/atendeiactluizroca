import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    // Evita que os ambientes DOM esgotem memória em máquinas com muitos núcleos.
    maxWorkers: 2,
    passWithNoTests: true, // projeto recem-criado ainda nao tem teste
    setupFiles: ["config/vitest.setup.ts"],
    // .mjs de tests/ sao scripts Node (ex.: check-compliance.test.mjs), nao Vitest.
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.tsx"],
  },
});
