import { createValidationGuiPanel } from "../src/index";
import type { OverlayValidationData } from "../src/types";
import type { ValidationThemeMode } from "../src/renderCanvas";

const panelHost = document.getElementById("panelHost") as HTMLDivElement;
const jsonInput = document.getElementById("jsonInput") as HTMLTextAreaElement;
const applyBtn = document.getElementById("applyBtn") as HTMLButtonElement;
const vizTheme = document.getElementById("vizTheme") as HTMLSelectElement;
const pageTheme = document.getElementById("pageTheme") as HTMLSelectElement;
const panelWidthInput = document.getElementById("panelWidth") as HTMLInputElement;
const panelHeightInput = document.getElementById("panelHeight") as HTMLInputElement;
const resizeBtn = document.getElementById("resizeBtn") as HTMLButtonElement;
const VIZ_THEME_KEY = "ktv_demo_viz_theme";
const PAGE_THEME_KEY = "ktv_demo_page_theme";
const PANEL_WIDTH_KEY = "ktv_demo_panel_width";
const PANEL_HEIGHT_KEY = "ktv_demo_panel_height";
const DEFAULT_PANEL_WIDTH = 1000;
const DEFAULT_PANEL_HEIGHT = 500;

const defaultPayload: OverlayValidationData = {
	reference_raw: {
		strokes: [
			{ points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }] },
			{ points: [{ x: 0.5, y: 0.15 }, { x: 0.5, y: 0.85 }] },
		],
	},
	user_raw: {
		strokes: [
			{ points: [{ x: 0.18, y: 0.22 }, { x: 0.84, y: 0.24 }] },
			{ points: [{ x: 0.53, y: 0.1 }, { x: 0.48, y: 0.9 }] },
		],
	},
	composition: {
		alignment: {
			user_to_aligned: { scale_x: 1, scale_y: 1, translate_x: 0, translate_y: 0 },
			reference_to_aligned: { scale_x: 1, scale_y: 1, translate_x: 0, translate_y: 0 },
		},
	},
};

jsonInput.value = JSON.stringify(defaultPayload, null, 2);

const savedVizTheme = localStorage.getItem(VIZ_THEME_KEY);
if (savedVizTheme === "light" || savedVizTheme === "dark") {
	vizTheme.value = savedVizTheme;
}

const savedPageTheme = localStorage.getItem(PAGE_THEME_KEY);
if (savedPageTheme === "light" || savedPageTheme === "dark") {
	pageTheme.value = savedPageTheme;
}

function currentVizTheme(): ValidationThemeMode {
	return vizTheme.value === "dark" ? "dark" : "light";
}

function applyPageTheme(theme: "light" | "dark"): void {
	const isDark = theme === "dark";
	document.documentElement.style.setProperty("--page-bg", isDark ? "#0b0d11" : "#f4f6fb");
	document.documentElement.style.setProperty("--page-text", isDark ? "#e3e8f1" : "#1f232b");
}

function clampInt(value: number, min: number, max: number): number {
	const rounded = Math.round(value);
	return Math.max(min, Math.min(max, rounded));
}

const savedWidth = Number(localStorage.getItem(PANEL_WIDTH_KEY));
const savedHeight = Number(localStorage.getItem(PANEL_HEIGHT_KEY));
const panelWidth = Number.isFinite(savedWidth) ? clampInt(savedWidth, 640, 2000) : DEFAULT_PANEL_WIDTH;
const panelHeight = Number.isFinite(savedHeight) ? clampInt(savedHeight, 360, 1200) : DEFAULT_PANEL_HEIGHT;
panelWidthInput.value = String(panelWidth);
panelHeightInput.value = String(panelHeight);

function getPanelSize(): { width: number; height: number } {
	const width = clampInt(Number(panelWidthInput.value) || DEFAULT_PANEL_WIDTH, 640, 2000);
	const height = clampInt(Number(panelHeightInput.value) || DEFAULT_PANEL_HEIGHT, 360, 1200);
	panelWidthInput.value = String(width);
	panelHeightInput.value = String(height);
	return { width, height };
}

const initialSize = getPanelSize();
panelHost.style.width = `${initialSize.width}px`;
panelHost.style.height = `${initialSize.height}px`;
let panel = createValidationGuiPanel(jsonInput.value, {
	themeMode: currentVizTheme(),
});
panelHost.appendChild(panel.element);
applyPageTheme(pageTheme.value === "dark" ? "dark" : "light");

function remountPanel(theme: ValidationThemeMode): void {
	const size = getPanelSize();
	localStorage.setItem(PANEL_WIDTH_KEY, String(size.width));
	localStorage.setItem(PANEL_HEIGHT_KEY, String(size.height));
	panelHost.style.width = `${size.width}px`;
	panelHost.style.height = `${size.height}px`;
	panel.dispose();
	panelHost.innerHTML = "";
	panel = createValidationGuiPanel(jsonInput.value, {
		themeMode: theme,
	});
	panelHost.appendChild(panel.element);
}

function applyJson(): void {
	try {
		panel.setData(jsonInput.value);
	} catch (error) {
		console.error(error);
		alert("Invalid JSON payload.");
	}
}

applyBtn.addEventListener("click", applyJson);
vizTheme.addEventListener("change", () => {
	const nextTheme = currentVizTheme();
	localStorage.setItem(VIZ_THEME_KEY, nextTheme);
	remountPanel(nextTheme);
});

pageTheme.addEventListener("change", () => {
	const nextTheme = pageTheme.value === "dark" ? "dark" : "light";
	localStorage.setItem(PAGE_THEME_KEY, nextTheme);
	applyPageTheme(nextTheme);
});

resizeBtn.addEventListener("click", () => {
	remountPanel(currentVizTheme());
});
