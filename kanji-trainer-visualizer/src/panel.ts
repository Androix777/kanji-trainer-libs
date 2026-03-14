import {
	renderValidationPanel,
	type AngleIssueFocus,
	type MetricFocus,
	type ValidationThemeMode,
	type ValidationPanelController,
} from "./renderCanvas";
import type { AffineTransform, OverlayValidationData, Point, Stroke } from "./types";
import { strokeColor } from "./palette";

const RIGHT_PANEL_WIDTH = 340;
const METRIC_WIDTH = 220;
const SCRUBBER_THUMB_RADIUS = 8;
const TOP_ROW_HEIGHT = 70;
const ROOT_ROW_GAP = 10;
const DEFAULT_PANEL_WIDTH = 1000;
const DEFAULT_PANEL_HEIGHT = 500;
const GREEN = "#31a24c";
const RED = "#cf2f2f";
const GRAY = "#999999";
const ICON_PLAY = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/><path d=\"M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z\" /></svg>";
const ICON_PAUSE = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/><path d=\"M9 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z\" /><path d=\"M17 4h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2z\" /></svg>";
const ICON_START = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/><path d=\"M19.496 4.136l-12 7a1 1 0 0 0 0 1.728l12 7a1 1 0 0 0 1.504 -.864v-14a1 1 0 0 0 -1.504 -.864z\" /><path d=\"M4 4a1 1 0 0 1 .993 .883l.007 .117v14a1 1 0 0 1 -1.993 .117l-.007 -.117v-14a1 1 0 0 1 1 -1z\" /></svg>";
const ICON_END = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/><path d=\"M3 5v14a1 1 0 0 0 1.504 .864l12 -7a1 1 0 0 0 0 -1.728l-12 -7a1 1 0 0 0 -1.504 .864z\" /><path d=\"M20 4a1 1 0 0 1 .993 .883l.007 .117v14a1 1 0 0 1 -1.993 .117l-.007 -.117v-14a1 1 0 0 1 1 -1z\" /></svg>";

export interface ValidationGuiPanel {
	element: HTMLDivElement;
	setData: (input: string | OverlayValidationData) => void;
	play: () => void;
	pause: () => void;
	restart: () => void;
	dispose: () => void;
}

export interface CreateValidationGuiPanelOptions {
	themeMode?: ValidationThemeMode;
	initialMode?: "draw" | "draw_loop" | "morph" | "morph_loop" | "overall";
}

interface UiTheme {
	panelBg: string;
	border: string;
	text: string;
	mutedText: string;
	trackBg: string;
	marker: string;
}

const UI_THEME: Record<ValidationThemeMode, UiTheme> = {
	light: {
		panelBg: "transparent",
		border: "#d4d4d4",
		text: "#1f232b",
		mutedText: "#777777",
		trackBg: "#e6e6e6",
		marker: "#202020",
	},
	dark: {
		panelBg: "transparent",
		border: "#57637d",
		text: "#e3e8f1",
		mutedText: "#adb7ca",
		trackBg: "#3f4b63",
		marker: "#f2f5fa",
	},
};

interface MetricRow {
	row: HTMLDivElement;
	valueLabel: HTMLSpanElement;
	fill: HTMLDivElement;
	thresholdLine: HTMLDivElement;
}

function parseInput(input: string | OverlayValidationData): OverlayValidationData {
	if (typeof input === "string") {
		return JSON.parse(input) as OverlayValidationData;
	}
	return input;
}

function applyAffineToPoint(point: Point, transform: AffineTransform): Point {
	return {
		x: transform.scale_x * point.x + transform.translate_x,
		y: transform.scale_y * point.y + transform.translate_y,
	};
}

function applyAffineToStrokePoints(points: Point[] | undefined, transform: AffineTransform): Point[] | undefined {
	if (!points) {
		return undefined;
	}
	return points.map((point) => applyAffineToPoint(point, transform));
}

function renderZones(container: HTMLDivElement, strokeCount: number, warnByStroke: boolean[]): void {
	container.innerHTML = "";
	const count = Math.max(strokeCount, 1);
	for (let i = 0; i < count; i += 1) {
		const zone = document.createElement("span");
		zone.style.position = "relative";
		zone.style.flex = "1";
		zone.style.height = "100%";
		zone.style.background = strokeColor(i);
		zone.style.opacity = "0.9";
		zone.style.display = "inline-block";
		if (i === 0) {
			zone.style.borderTopLeftRadius = "3px";
			zone.style.borderBottomLeftRadius = "3px";
		}
		if (i === count - 1) {
			zone.style.borderTopRightRadius = "3px";
			zone.style.borderBottomRightRadius = "3px";
		}

		if (warnByStroke[i]) {
			const badge = document.createElement("span");
			badge.textContent = "!";
			badge.style.position = "absolute";
			badge.style.top = "-7px";
			badge.style.left = "50%";
			badge.style.transform = "translateX(-50%)";
			badge.style.width = "11px";
			badge.style.height = "11px";
			badge.style.borderRadius = "999px";
			badge.style.background = "#cf2f2f";
			badge.style.color = "#fff";
			badge.style.fontSize = "9px";
			badge.style.fontWeight = "700";
			badge.style.lineHeight = "11px";
			badge.style.textAlign = "center";
			badge.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.8)";
			zone.appendChild(badge);
		}

		container.appendChild(zone);
	}
}

function buildStrokeWarnings(data: OverlayValidationData, strokeCount: number): boolean[] {
	const warnings = Array.from({ length: strokeCount }, () => false);
	const thresholdDtw = data.thresholds?.dtw;
	const thresholdRms = data.thresholds?.rms;
	const thresholdPosition = data.thresholds?.position;
	const referenceCount = data.reference_raw.strokes.length;
	const userCount = data.user_raw.strokes.length;

	const positionByIndex = new Map<number, number>();
	for (const s of data.composition.stroke_details ?? []) {
		positionByIndex.set(s.stroke_idx, Math.max(s.start.distance, s.end.distance));
	}

	for (let i = 0; i < strokeCount; i += 1) {
		const missingOrExtra = i >= referenceCount || i >= userCount;
		const dtw = data.dtw?.strokes?.[i]?.dtw_error;
		const rms = data.rms?.strokes?.[i]?.rms;
		const position = positionByIndex.get(i);

		const dtwBad = thresholdDtw !== undefined && dtw !== undefined && dtw > thresholdDtw;
		const rmsBad = thresholdRms !== undefined && rms !== undefined && rms > thresholdRms;
		const positionBad = thresholdPosition !== undefined && position !== undefined && position > thresholdPosition;

		warnings[i] = missingOrExtra || dtwBad || rmsBad || positionBad;
	}
	return warnings;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, color: string, lineWidth: number): void {
	if (stroke.points.length < 2) {
		return;
	}
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
	for (let i = 1; i < stroke.points.length; i += 1) {
		ctx.lineTo(stroke.points[i]!.x, stroke.points[i]!.y);
	}
	ctx.stroke();
}

function drawCurrentStrokePreview(
	canvas: HTMLCanvasElement,
	referencePoints: Point[] | undefined,
	userPoints: Point[] | undefined,
	strokeIndex: number,
	theme: UiTheme,
): void {
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return;
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = theme.panelBg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.strokeStyle = theme.border;
	ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

	const ref = referencePoints ? { points: referencePoints, label_pos: null } : undefined;
	const usr = userPoints ? { points: userPoints, label_pos: null } : undefined;
	const strokes = [ref, usr].filter(Boolean) as Stroke[];
	if (strokes.length === 0) {
		return;
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const stroke of strokes) {
		for (const p of stroke.points) {
			minX = Math.min(minX, p.x);
			minY = Math.min(minY, p.y);
			maxX = Math.max(maxX, p.x);
			maxY = Math.max(maxY, p.y);
		}
	}

	const padding = 12;
	const srcW = Math.max(maxX - minX, 1e-9);
	const srcH = Math.max(maxY - minY, 1e-9);
	const dstW = Math.max(canvas.width - padding * 2, 1);
	const dstH = Math.max(canvas.height - padding * 2, 1);
	const scale = Math.min(dstW / srcW, dstH / srcH);
	const ox = padding + (dstW - srcW * scale) / 2;
	const oy = padding + (dstH - srcH * scale) / 2;

	const mapStroke = (stroke: Stroke): Stroke => ({
		points: stroke.points.map((p) => ({
			x: ox + (p.x - minX) * scale,
			y: oy + (p.y - minY) * scale,
		})),
		label_pos: null,
	});

	const color = strokeColor(strokeIndex);
	if (ref) {
		drawStroke(ctx, mapStroke(ref), color.replace("rgb(", "rgba(").replace(")", ", 0.25)"), 5);
	}
	if (usr) {
		drawStroke(ctx, mapStroke(usr), color, 2.4);
	}
}

function createMetricRow(title: string): MetricRow {
	const row = document.createElement("div");
	row.style.display = "grid";
	row.style.gridTemplateColumns = "90px 1fr 48px";
	row.style.alignItems = "center";
	row.style.gap = "6px";
	row.style.padding = "4px 6px";
	row.style.borderRadius = "8px";
	row.style.transition = "background-color 100ms ease, box-shadow 100ms ease";

	const name = document.createElement("div");
	name.textContent = title;
	name.style.fontSize = "12px";
	row.appendChild(name);

	const bar = document.createElement("div");
	bar.style.position = "relative";
	bar.style.height = "8px";
	bar.style.border = "1px solid var(--kt-bar-border, #cfcfcf)";
	bar.style.background = "var(--kt-bar-bg, #f8f8f8)";
	bar.style.overflow = "hidden";

	const fill = document.createElement("div");
	fill.style.height = "100%";
	fill.style.width = "0%";
	fill.style.background = GREEN;
	bar.appendChild(fill);

	const thresholdLine = document.createElement("div");
	thresholdLine.style.position = "absolute";
	thresholdLine.style.top = "-1px";
	thresholdLine.style.bottom = "-1px";
	thresholdLine.style.width = "2px";
	thresholdLine.style.background = "var(--kt-threshold, #364fc7)";
	thresholdLine.style.left = "100%";
	bar.appendChild(thresholdLine);

	row.appendChild(bar);

	const valueLabel = document.createElement("span");
	valueLabel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
	valueLabel.style.fontSize = "11px";
	valueLabel.style.textAlign = "right";
	valueLabel.textContent = "-";
	row.appendChild(valueLabel);

	return { row, valueLabel, fill, thresholdLine };
}

function setMetricRow(row: MetricRow, value: number | undefined, threshold: number | undefined): void {
	if (value === undefined || Number.isNaN(value)) {
		row.valueLabel.textContent = "-";
		row.fill.style.width = "0%";
		row.fill.style.background = GRAY;
		row.thresholdLine.style.display = "none";
		return;
	}
	const clamped = Math.max(0, Math.min(1, value));
	row.valueLabel.textContent = `${Math.round(clamped * 100)}%`;
	row.fill.style.width = `${clamped * 100}%`;

	if (threshold === undefined || Number.isNaN(threshold)) {
		row.fill.style.background = GREEN;
		row.thresholdLine.style.display = "none";
		return;
	}

	const thresholdClamped = Math.max(0, Math.min(1, threshold));
	row.thresholdLine.style.display = "block";
	row.thresholdLine.style.left = `calc(${thresholdClamped * 100}% - 1px)`;
	row.fill.style.background = value <= threshold ? GREEN : RED;
}

function createAngleIssueItem(value: number, threshold: number | undefined): HTMLDivElement {
	const row = document.createElement("div");
	row.style.display = "grid";
	row.style.gridTemplateColumns = "1fr 46px";
	row.style.gap = "5px";
	row.style.alignItems = "center";
	row.style.padding = "6px 8px";
	row.style.borderRadius = "8px";
	row.style.cursor = "pointer";
	row.style.transition = "background-color 100ms ease, box-shadow 100ms ease";

	const left = document.createElement("div");

	const bar = document.createElement("div");
	bar.style.position = "relative";
	bar.style.height = "6px";
	bar.style.border = "1px solid var(--kt-bar-border, #d2d2d2)";
	bar.style.background = "var(--kt-bar-bg, #f8f8f8)";
	bar.style.overflow = "hidden";

	const fill = document.createElement("div");
	fill.style.height = "100%";
	fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
	fill.style.background = threshold !== undefined && value > threshold ? RED : GREEN;
	bar.appendChild(fill);

	if (threshold !== undefined && !Number.isNaN(threshold)) {
		const line = document.createElement("div");
		line.style.position = "absolute";
		line.style.top = "-1px";
		line.style.bottom = "-1px";
		line.style.width = "2px";
		line.style.background = "var(--kt-threshold, #364fc7)";
		line.style.left = `calc(${Math.max(0, Math.min(1, threshold)) * 100}% - 1px)`;
		bar.appendChild(line);
	}

	left.appendChild(bar);
	row.appendChild(left);

	const val = document.createElement("span");
	val.textContent = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
	val.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
	val.style.fontSize = "11px";
	val.style.textAlign = "right";
	row.appendChild(val);

	return row;
}

export function createValidationGuiPanel(
	input: string | OverlayValidationData,
	options?: CreateValidationGuiPanelOptions,
): ValidationGuiPanel {
	const themeMode = options?.themeMode ?? "light";
	const theme = UI_THEME[themeMode];
	const initialMode = options?.initialMode ?? "morph_loop";
	const hoverBg = themeMode === "dark" ? "rgba(142, 163, 255, 0.13)" : "rgba(54, 79, 199, 0.10)";
	const hoverRing = themeMode === "dark"
		? "inset 0 0 0 1px rgba(142, 163, 255, 0.45)"
		: "inset 0 0 0 1px rgba(54, 79, 199, 0.35)";

	const root = document.createElement("div");
	root.style.width = "100%";
	root.style.height = "100%";
	root.style.display = "grid";
	root.style.gridTemplateRows = `${TOP_ROW_HEIGHT}px 1fr`;
	root.style.gap = `${ROOT_ROW_GAP}px`;
	root.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
	root.style.color = theme.text;
	root.style.background = "transparent";
	root.style.setProperty("--kt-bar-bg", themeMode === "dark" ? "#2f394c" : "#f8f8f8");
	root.style.setProperty("--kt-bar-border", themeMode === "dark" ? "#6a7895" : "#cfcfcf");
	root.style.setProperty("--kt-threshold", themeMode === "dark" ? "#8ea3ff" : "#364fc7");

	const top = document.createElement("div");
	top.style.display = "grid";
	top.style.gridTemplateRows = "1fr 1fr";
	top.style.gap = "6px";
	root.appendChild(top);

	const createTimelineRow = (
		labelText: string,
		segmented: boolean,
		initialValue: number,
	): {
		row: HTMLDivElement;
		startBtn: HTMLButtonElement;
		playBtn: HTMLButtonElement;
		endBtn: HTMLButtonElement;
		loopBtn: HTMLButtonElement;
		input: HTMLInputElement;
		segments: HTMLDivElement;
		updateMarker: () => void;
		setLoopState: (active: boolean) => void;
		setPlayState: (playing: boolean) => void;
	} => {
		const row = document.createElement("div");
		row.style.display = "grid";
		row.style.gridTemplateColumns = "30px 30px 30px 52px 1fr";
		row.style.alignItems = "center";
		row.style.gap = "8px";

		const mkIconBtn = (): HTMLButtonElement => {
			const b = document.createElement("button");
			b.style.height = "24px";
			b.style.border = `1px solid ${theme.border}`;
			b.style.borderRadius = "6px";
			b.style.background = themeMode === "dark" ? "#2f394c" : "#f3f5f8";
			b.style.color = theme.text;
			b.style.cursor = "pointer";
			b.style.display = "inline-flex";
			b.style.alignItems = "center";
			b.style.justifyContent = "center";
			return b;
		};

		const startBtn = mkIconBtn();
		startBtn.innerHTML = ICON_START;
		row.appendChild(startBtn);

		const playBtn = mkIconBtn();
		playBtn.innerHTML = ICON_PLAY;
		playBtn.style.height = "24px";
		row.appendChild(playBtn);

		const endBtn = mkIconBtn();
		endBtn.innerHTML = ICON_END;
		row.appendChild(endBtn);

		const loopBtn = mkIconBtn();
		loopBtn.textContent = "Loop";
		row.appendChild(loopBtn);

		const scrubberWrap = document.createElement("div");
		scrubberWrap.style.position = "relative";
		scrubberWrap.style.height = "24px";
		scrubberWrap.style.overflow = "visible";
		row.appendChild(scrubberWrap);

		const segments = document.createElement("div");
		segments.style.position = "absolute";
		segments.style.left = "0";
		segments.style.right = "0";
		segments.style.top = "7px";
		segments.style.height = "10px";
		segments.style.padding = `0 ${SCRUBBER_THUMB_RADIUS}px`;
		segments.style.boxSizing = "border-box";
		segments.style.display = "flex";
		segments.style.alignItems = "center";
		segments.style.gap = segmented ? "1px" : "0";
		segments.style.background = theme.trackBg;
		segments.style.borderRadius = "4px";
		scrubberWrap.appendChild(segments);

		const marker = document.createElement("div");
		marker.style.position = "absolute";
		marker.style.top = "2px";
		marker.style.left = `${SCRUBBER_THUMB_RADIUS}px`;
		marker.style.width = "4px";
		marker.style.height = "20px";
		marker.style.background = theme.marker;
		marker.style.borderRadius = "2px";
		marker.style.pointerEvents = "none";
		marker.style.transform = "translateX(-2px)";
		marker.style.boxShadow = themeMode === "dark"
			? "0 0 0 1px rgba(0,0,0,0.45)"
			: "0 0 0 1px rgba(255,255,255,0.7)";
		scrubberWrap.appendChild(marker);

		const input = document.createElement("input");
		input.type = "range";
		input.min = "0";
		input.max = "1000";
		input.step = "1";
		input.value = String(initialValue);
		input.style.position = "absolute";
		input.style.inset = "0";
		input.style.width = "100%";
		input.style.height = "24px";
		input.style.margin = "0";
		input.style.display = "block";
		input.style.background = "transparent";
		input.style.opacity = "0";
		scrubberWrap.appendChild(input);

		const updateMarker = (): void => {
			const value = Number(input.value);
			const ratio = Number.isFinite(value) ? Math.max(0, Math.min(1, value / 1000)) : 0;
			const minX = SCRUBBER_THUMB_RADIUS;
			const maxX = Math.max(scrubberWrap.clientWidth - SCRUBBER_THUMB_RADIUS, minX);
			const x = minX + (maxX - minX) * ratio;
			marker.style.left = `${x}px`;
		};

		const setLoopState = (active: boolean): void => {
			loopBtn.textContent = "Loop";
			loopBtn.style.background = active
				? (themeMode === "dark" ? "#3e5382" : "#dce7ff")
				: (themeMode === "dark" ? "#2f394c" : "#f3f5f8");
		};
		const setPlayState = (playing: boolean): void => {
			playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
			playBtn.style.background = playing
				? (themeMode === "dark" ? "#3e5382" : "#dce7ff")
				: (themeMode === "dark" ? "#2f394c" : "#f3f5f8");
		};

		return {
			row,
			startBtn,
			playBtn,
			endBtn,
			loopBtn,
			input,
			segments,
			updateMarker,
			setLoopState,
			setPlayState,
		};
	};

	const drawTimeline = createTimelineRow("Draw", true, 1000);
	const morphTimeline = createTimelineRow("Morph", false, 0);
	top.appendChild(drawTimeline.row);
	top.appendChild(morphTimeline.row);

	const updateDrawMarker = (): void => {
		drawTimeline.updateMarker();
	};
	const updateMorphMarker = (): void => {
		morphTimeline.updateMarker();
	};

	const body = document.createElement("div");
	body.style.display = "grid";
	body.style.gridTemplateColumns = `1fr ${RIGHT_PANEL_WIDTH}px`;
	body.style.gap = "16px";
	body.style.minHeight = "0";
	root.appendChild(body);

	const viewerCanvas = document.createElement("canvas");
	viewerCanvas.width = 1;
	viewerCanvas.height = 1;
	viewerCanvas.style.width = "100%";
	viewerCanvas.style.height = "100%";
	viewerCanvas.style.alignSelf = "start";
	viewerCanvas.style.background = "transparent";
	body.appendChild(viewerCanvas);

	const side = document.createElement("div");
	side.style.border = `1px solid ${theme.border}`;
	side.style.background = "transparent";
	side.style.padding = "12px";
	side.style.display = "flex";
	side.style.flexDirection = "column";
	side.style.gap = "8px";
	side.style.minHeight = "0";
	side.style.overflow = "hidden";
	body.appendChild(side);

	const summaryHeader = document.createElement("div");
	summaryHeader.style.display = "grid";
	summaryHeader.style.gridTemplateColumns = "1fr auto";
	summaryHeader.style.alignItems = "center";
	summaryHeader.style.gap = "8px";
	const summaryTitle = document.createElement("div");
	summaryTitle.textContent = "Overall";
	summaryTitle.style.fontWeight = "600";
	const overallBtn = document.createElement("button");
	overallBtn.dataset.overallBtn = "1";
	overallBtn.textContent = "Show";
	overallBtn.style.height = "24px";
	overallBtn.style.border = `1px solid ${theme.border}`;
	overallBtn.style.borderRadius = "6px";
	overallBtn.style.background = themeMode === "dark" ? "#202735" : "#f3f5f8";
	overallBtn.style.color = theme.text;
	overallBtn.style.cursor = "pointer";
	const setOverallButtonState = (active: boolean): void => {
		overallBtn.textContent = active ? "Showing" : "Show";
		overallBtn.style.background = active
			? (themeMode === "dark" ? "#3e5382" : "#dce7ff")
			: (themeMode === "dark" ? "#2f394c" : "#f3f5f8");
	};
	summaryHeader.appendChild(summaryTitle);
	summaryHeader.appendChild(overallBtn);
	const summaryZone = document.createElement("div");
	summaryZone.style.display = "flex";
	summaryZone.style.flexDirection = "column";
	summaryZone.style.gap = "8px";
	side.appendChild(summaryZone);
	summaryZone.appendChild(summaryHeader);

	const summaryDtw = createMetricRow("Direction");
	const summaryRms = createMetricRow("Shape");
	const summaryPosition = createMetricRow("Placement");
	const summaryRelative = createMetricRow("Angles");
	summaryDtw.row.dataset.metricFocus = "dtw";
	summaryRms.row.dataset.metricFocus = "rms";
	summaryPosition.row.dataset.metricFocus = "position";
	summaryZone.appendChild(summaryDtw.row);
	summaryZone.appendChild(summaryRms.row);
	summaryZone.appendChild(summaryPosition.row);

	const angleHoverZone = document.createElement("div");
	angleHoverZone.style.display = "flex";
	angleHoverZone.style.flexDirection = "column";
	angleHoverZone.style.gap = "8px";
	angleHoverZone.style.flex = "1 1 auto";
	angleHoverZone.style.minHeight = "0";
	side.appendChild(angleHoverZone);
	angleHoverZone.appendChild(summaryRelative.row);

	const lowerSection = document.createElement("div");
	lowerSection.style.position = "relative";
	lowerSection.style.flex = "1 1 auto";
	lowerSection.style.minHeight = "0";
	angleHoverZone.appendChild(lowerSection);

	const strokeSection = document.createElement("div");
	strokeSection.style.display = "flex";
	strokeSection.style.flexDirection = "column";
	strokeSection.style.gap = "8px";
	strokeSection.style.position = "absolute";
	strokeSection.style.inset = "0";
	strokeSection.style.overflow = "hidden";
	strokeSection.style.opacity = "1";
	strokeSection.style.pointerEvents = "auto";
	strokeSection.style.transition = "opacity 120ms ease";
	lowerSection.appendChild(strokeSection);

	const strokeDivider = document.createElement("div");
	strokeDivider.style.borderTop = `1px solid ${theme.border}`;
	strokeSection.appendChild(strokeDivider);

	const strokeTitle = document.createElement("div");
	strokeTitle.style.fontWeight = "600";
	strokeTitle.textContent = "Stroke -";
	strokeSection.appendChild(strokeTitle);

	const previewCanvas = document.createElement("canvas");
	previewCanvas.width = METRIC_WIDTH;
	previewCanvas.height = 120;
	previewCanvas.style.width = "100%";
	previewCanvas.style.height = "120px";
	strokeSection.appendChild(previewCanvas);

	const currentDtw = createMetricRow("Direction");
	const currentRms = createMetricRow("Shape");
	const currentPosition = createMetricRow("Placement");
	strokeSection.appendChild(currentDtw.row);
	strokeSection.appendChild(currentRms.row);
	strokeSection.appendChild(currentPosition.row);

	const angleSection = document.createElement("div");
	angleSection.style.display = "flex";
	angleSection.style.flexDirection = "column";
	angleSection.style.gap = "8px";
	angleSection.style.position = "absolute";
	angleSection.style.inset = "0";
	angleSection.style.overflow = "hidden";
	angleSection.style.opacity = "0";
	angleSection.style.pointerEvents = "none";
	angleSection.style.transition = "opacity 120ms ease";
	lowerSection.appendChild(angleSection);

	const angleDivider = document.createElement("div");
	angleDivider.style.borderTop = `1px solid ${theme.border}`;
	angleSection.appendChild(angleDivider);

	const angleTitle = document.createElement("div");
	angleTitle.textContent = "Top Angle Issues";
	angleTitle.style.fontWeight = "600";
	angleSection.appendChild(angleTitle);

	const angleList = document.createElement("div");
	angleList.style.display = "flex";
	angleList.style.flexDirection = "column";
	angleList.style.gap = "10px";
	angleSection.appendChild(angleList);

	let controller: ValidationPanelController | null = null;
	let data: OverlayValidationData = parseInput(input);
	let drawLoopActive = false;
	let morphLoopActive = false;
	let drawPlaying = false;
	let morphPlaying = false;
	const clearSummaryFocus = (): void => {
		if (activeSummaryRow) {
			setRowHoverStyle(activeSummaryRow, false);
			activeSummaryRow = null;
		}
		activeSummaryMetric = null;
		setMetricFocus(null);
	};
	const clearAngleFocus = (): void => {
		if (activeAngleRow) {
			setRowHoverStyle(activeAngleRow, false);
			activeAngleRow = null;
		}
		controller?.setAngleIssueFocus(null);
	};
	const clearAllFocus = (): void => {
		clearSummaryFocus();
		clearAngleFocus();
	};

	const updateSummaryMetrics = (): void => {
		const max = data.max_errors;
		const thr = data.thresholds;
		setMetricRow(summaryDtw, max?.dtw, thr?.dtw);
		setMetricRow(summaryRms, max?.rms, thr?.rms);
		setMetricRow(summaryPosition, max?.position, thr?.position);
		setMetricRow(summaryRelative, max?.relative_angle, thr?.relative_angle);
	};

	const setMetricFocus = (focus: MetricFocus | null): void => {
		controller?.setMetricFocus(focus);
	};
	const setRowHoverStyle = (row: HTMLDivElement, active: boolean): void => {
		row.style.background = active ? hoverBg : "transparent";
		row.style.boxShadow = active ? hoverRing : "none";
	};

	let activeSummaryMetric: MetricFocus | null = null;
	let activeSummaryRow: HTMLDivElement | null = null;
	summaryZone.addEventListener("mousemove", (event) => {
		const target = event.target as HTMLElement | null;
		const metricRow = target?.closest("[data-metric-focus]") as HTMLElement | null;
		if (!metricRow) {
			const overOverall = target?.closest("[data-overall-btn='1']");
			if (overOverall) {
				if (activeSummaryRow) {
					setRowHoverStyle(activeSummaryRow, false);
					activeSummaryRow = null;
				}
				activeSummaryMetric = null;
				setMetricFocus(null);
			}
			return;
		}
		const metric = metricRow.dataset.metricFocus as MetricFocus | undefined;
		if (!metric || metric === activeSummaryMetric) {
			return;
		}
		activeSummaryMetric = metric;
		if (activeSummaryRow) {
			setRowHoverStyle(activeSummaryRow, false);
		}
		activeSummaryRow = metricRow as HTMLDivElement;
		setRowHoverStyle(activeSummaryRow, true);
		setMetricFocus(metric);
	});
	summaryZone.addEventListener("mouseleave", () => {
		activeSummaryMetric = null;
		if (activeSummaryRow) {
			setRowHoverStyle(activeSummaryRow, false);
		}
		activeSummaryRow = null;
		setMetricFocus(null);
	});

	let activeAngleRow: HTMLDivElement | null = null;
	const updateRelativeAngleList = (): void => {
		angleList.innerHTML = "";
		activeAngleRow = null;
		const details = [...(data.composition.angle_details ?? [])];
		details.sort((a, b) => b.weighted_diff - a.weighted_diff);
		const top = details.slice(0, 5);

		if (top.length === 0) {
			const empty = document.createElement("div");
			empty.textContent = "No angle details";
			empty.style.fontSize = "11px";
			empty.style.color = theme.mutedText;
			angleList.appendChild(empty);
			return;
		}

		const threshold = data.thresholds?.relative_angle;
		top.forEach((item) => {
			const row = createAngleIssueItem(item.weighted_diff, threshold);
			const focus: AngleIssueFocus = {
				strokeIndices: item.stroke_indices,
				pointTypes: item.point_types,
			};
			row.addEventListener("mouseenter", () => {
				if (activeAngleRow && activeAngleRow !== row) {
					setRowHoverStyle(activeAngleRow, false);
				}
				activeAngleRow = row;
				setRowHoverStyle(row, true);
				controller?.setAngleIssueFocus(focus);
			});
			angleList.appendChild(row);
		});
	};

	angleList.addEventListener("mouseleave", () => {
		if (activeAngleRow) {
			setRowHoverStyle(activeAngleRow, false);
			activeAngleRow = null;
		}
		controller?.setAngleIssueFocus(null);
	});

	let angleSectionOpened = false;
	const openAngleSection = (): void => {
		if (angleSectionOpened) {
			return;
		}
		angleSectionOpened = true;
		strokeSection.style.opacity = "0";
		strokeSection.style.pointerEvents = "none";
		angleSection.style.opacity = "1";
		angleSection.style.pointerEvents = "auto";
	};

	const closeAngleSection = (): void => {
		if (!angleSectionOpened) {
			return;
		}
		angleSectionOpened = false;
		angleSection.style.opacity = "0";
		angleSection.style.pointerEvents = "none";
		strokeSection.style.opacity = "1";
		strokeSection.style.pointerEvents = "auto";
		controller?.setAngleIssueFocus(null);
		setMetricFocus(null);
	};

	summaryRelative.row.addEventListener("mouseenter", () => {
		setRowHoverStyle(summaryRelative.row, true);
		openAngleSection();
	});
	angleSection.addEventListener("mouseenter", () => {
		openAngleSection();
	});
	angleHoverZone.addEventListener("mouseleave", () => {
		setRowHoverStyle(summaryRelative.row, false);
		closeAngleSection();
	});

	const updateCurrentStrokeInfo = (strokeIndex: number): void => {
		const strokeCount = controller?.getStrokeCount() ?? 0;
		const expectedStrokeCount = data.reference_raw.strokes.length;
		if (strokeIndex < 0 || strokeCount === 0) {
			strokeTitle.textContent = `Stroke - / ${expectedStrokeCount}`;
			setMetricRow(currentDtw, undefined, data.thresholds?.dtw);
			setMetricRow(currentRms, undefined, data.thresholds?.rms);
			setMetricRow(currentPosition, undefined, data.thresholds?.position);
			drawCurrentStrokePreview(previewCanvas, undefined, undefined, 0, theme);
			return;
		}

		strokeTitle.textContent = `Stroke ${strokeIndex + 1} / ${expectedStrokeCount}`;
		const dtwValue = data.dtw?.strokes?.[strokeIndex]?.dtw_error;
		const rmsStroke = data.rms?.strokes?.[strokeIndex];
		const rmsValue = rmsStroke?.rms;
		const compStroke = data.composition.stroke_details?.find((s) => s.stroke_idx === strokeIndex);
		const positionValue = compStroke
			? Math.max(compStroke.start.distance, compStroke.end.distance)
			: undefined;

		setMetricRow(currentDtw, dtwValue, data.thresholds?.dtw);
		setMetricRow(currentRms, rmsValue, data.thresholds?.rms);
		setMetricRow(currentPosition, positionValue, data.thresholds?.position);
		const referencePreviewPoints = rmsStroke?.reference_points_normalized
			?? applyAffineToStrokePoints(
				data.reference_raw.strokes[strokeIndex]?.points,
				data.composition.alignment.reference_to_aligned,
			);
		const userPreviewPoints = rmsStroke?.user_points_normalized
			?? applyAffineToStrokePoints(
				data.user_raw.strokes[strokeIndex]?.points,
				data.composition.alignment.user_to_aligned,
			);
		drawCurrentStrokePreview(
			previewCanvas,
			referencePreviewPoints,
			userPreviewPoints,
			strokeIndex,
			theme,
		);
	};

	const mountData = (payload: string | OverlayValidationData): void => {
		data = parseInput(payload);
		const panelWidth = Math.max(root.clientWidth || DEFAULT_PANEL_WIDTH, 320);
		const panelHeight = Math.max(root.clientHeight || DEFAULT_PANEL_HEIGHT, 260);
		const viewerWidth = Math.max(panelWidth - RIGHT_PANEL_WIDTH - 16, 220);
		const viewerHeight = Math.max(panelHeight - TOP_ROW_HEIGHT - ROOT_ROW_GAP, 180);
		viewerCanvas.width = viewerWidth;
		viewerCanvas.height = viewerHeight;
		viewerCanvas.style.height = `${viewerHeight}px`;
		controller?.dispose();
		controller = renderValidationPanel(viewerCanvas, data, {
			onDrawProgress: (progress) => {
				drawTimeline.input.value = String(Math.round(progress * 1000));
				updateDrawMarker();
			},
			onMorphProgress: (progress) => {
				morphTimeline.input.value = String(Math.round(progress * 1000));
				updateMorphMarker();
			},
			onStrokeIndexChange: (strokeIndex) => {
				updateCurrentStrokeInfo(strokeIndex);
			},
			onDrawLoopChange: (active) => {
				drawLoopActive = active;
				drawTimeline.setLoopState(active);
			},
			onMorphLoopChange: (active) => {
				morphLoopActive = active;
				morphTimeline.setLoopState(active);
			},
			onOverallModeChange: (active) => {
				setOverallButtonState(active);
			},
			themeMode,
		});
		const strokeCount = controller.getStrokeCount();
		renderZones(drawTimeline.segments, strokeCount, buildStrokeWarnings(data, strokeCount));
		updateSummaryMetrics();
		updateRelativeAngleList();
		closeAngleSection();
		drawTimeline.setLoopState(false);
		morphTimeline.setLoopState(false);
		drawTimeline.setPlayState(false);
		morphTimeline.setPlayState(false);
		setOverallButtonState(false);
		drawLoopActive = false;
		morphLoopActive = false;
		drawPlaying = false;
		morphPlaying = false;
		controller.setDrawProgress(1);
		drawTimeline.input.value = "1000";
		morphTimeline.input.value = "0";
		updateDrawMarker();
		updateMorphMarker();
		updateCurrentStrokeInfo(Math.max(0, strokeCount - 1));

		if (initialMode === "overall") {
			const active = controller.toggleOverallMode();
			setOverallButtonState(active);
		} else if (initialMode === "draw") {
			controller.setDrawProgress(0);
			controller.playDraw();
			drawPlaying = true;
			drawTimeline.setPlayState(true);
		} else if (initialMode === "draw_loop") {
			controller.setDrawProgress(0);
			const active = controller.toggleDrawLoop();
			drawTimeline.setLoopState(active);
			controller.playDraw();
			drawPlaying = true;
			drawTimeline.setPlayState(true);
		} else if (initialMode === "morph") {
			controller.setMorphProgress(0);
			controller.playMorph();
			morphPlaying = true;
			morphTimeline.setPlayState(true);
		} else if (initialMode === "morph_loop") {
			controller.setMorphProgress(0);
			const active = controller.toggleMorphLoop();
			morphTimeline.setLoopState(active);
			controller.playMorph();
			morphPlaying = true;
			morphTimeline.setPlayState(true);
		}
	};

	drawTimeline.playBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		if (drawPlaying) {
			controller.pauseDraw();
			drawPlaying = false;
			drawTimeline.setPlayState(false);
			return;
		}
		controller.playDraw();
		drawPlaying = true;
		drawTimeline.setPlayState(true);
	});
	drawTimeline.loopBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		if (drawLoopActive) {
			const active = controller.toggleDrawLoop();
			drawTimeline.setLoopState(active);
			if (!active && drawPlaying) {
				controller.pauseDraw();
				drawPlaying = false;
				drawTimeline.setPlayState(false);
			}
			return;
		}
		const active = controller.toggleDrawLoop();
		drawTimeline.setLoopState(active);
		controller.playDraw();
		drawPlaying = true;
		drawTimeline.setPlayState(true);
	});
	morphTimeline.playBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		clearAllFocus();
		if (morphPlaying) {
			controller.pauseMorph();
			morphPlaying = false;
			morphTimeline.setPlayState(false);
			return;
		}
		controller.playMorph();
		morphPlaying = true;
		morphTimeline.setPlayState(true);
	});
	morphTimeline.loopBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		if (morphLoopActive) {
			const active = controller.toggleMorphLoop();
			morphTimeline.setLoopState(active);
			if (!active && morphPlaying) {
				controller.pauseMorph();
				morphPlaying = false;
				morphTimeline.setPlayState(false);
			}
			return;
		}
		const active = controller.toggleMorphLoop();
		morphTimeline.setLoopState(active);
		controller.playMorph();
		morphPlaying = true;
		morphTimeline.setPlayState(true);
	});
	drawTimeline.startBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		clearAllFocus();
		if (drawLoopActive) {
			const active = controller.toggleDrawLoop();
			drawTimeline.setLoopState(active);
			drawLoopActive = active;
		}
		controller.pauseDraw();
		drawTimeline.input.value = "0";
		updateDrawMarker();
		controller.setDrawProgress(0);
		drawPlaying = false;
		drawTimeline.setPlayState(false);
	});
	drawTimeline.endBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		controller.pauseDraw();
		controller.setDrawProgress(1);
		drawPlaying = false;
		drawTimeline.setPlayState(false);
	});
	morphTimeline.startBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		controller.pauseMorph();
		controller.setMorphProgress(0);
		morphPlaying = false;
		morphTimeline.setPlayState(false);
	});
	morphTimeline.endBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		controller.pauseMorph();
		controller.setMorphProgress(1);
		morphPlaying = false;
		morphTimeline.setPlayState(false);
	});
	overallBtn.addEventListener("click", () => {
		if (!controller) {
			return;
		}
		clearAllFocus();
		const active = controller.toggleOverallMode();
		setOverallButtonState(active);
	});

	drawTimeline.input.addEventListener("input", () => {
		if (!controller) {
			return;
		}
		const progress = Number(drawTimeline.input.value) / 1000;
		controller.setDrawProgress(progress);
		updateDrawMarker();
	});
	morphTimeline.input.addEventListener("input", () => {
		if (!controller) {
			return;
		}
		const progress = Number(morphTimeline.input.value) / 1000;
		controller.setMorphProgress(progress);
		updateMorphMarker();
	});

	requestAnimationFrame(() => {
		mountData(data);
	});

	return {
		element: root,
		setData: (payload) => {
			mountData(payload);
		},
		play: () => {
			controller?.playDraw();
		},
		pause: () => {
			// legacy noop wrapper
		},
		restart: () => {
			controller?.setDrawProgress(0);
			controller?.playDraw();
		},
		dispose: () => {
			controller?.dispose();
			controller = null;
			root.remove();
		},
	};
}
