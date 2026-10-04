import { defineConfig } from "vite";
// base "./" so the same build works on GitHub Pages (sub-folder) and inside the Android app
export default defineConfig({ base: "./", build: { outDir: "dist", target: "es2020" } });
