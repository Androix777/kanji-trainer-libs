import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "src/index.ts",
	format: ["esm", "iife"],
	globalName: "KanjiTrainerVisualizer",
	dts: true,
	outDir: "dist",
	clean: true,
	minify: true,
	platform: "browser",
	noExternal: ["animejs"],
	inlineOnly: ["animejs"],
});
