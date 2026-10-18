import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { localGame } from "../../scripts/local-game-plugin";

export default defineConfig({
  plugins: [react(), localGame()],
  server: { port: 3001 }
});
