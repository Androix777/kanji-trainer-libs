import type { AffineTransform, Kanji, OverlayValidationData, Point, Stroke } from "./types";
import { strokeColor } from "./palette";
import { createMorphPlan, sampleMorphFrame } from "./morph";

const PADDING = 12;
const PANEL_GAP = 16;
const REFERENCE_WIDTH = 2.5;
const USER_WIDTH = 2.5;
const STROKE_DURATION_MS = 450;

export type ValidationThemeMode = "light" | "dark";

export interface AngleIssueFocus {
	strokeIndices: [number, number];
	pointTypes?: ["Start" | "End", "Start" | "End"];
}

export type MetricFocus = "dtw" | "rms" | "position";

export interface ValidationPanelController {
	playDraw: () => void;
	pauseDraw: () => void;
	toggleDrawLoop: () => boolean;
	setDrawProgress: (progress01: number) => void;
	getDrawProgress: () => number;
	playMorph: () => void;
	pauseMorph: () => void;
	toggleMorphLoop: () => boolean;
	setMorphProgress: (progress01: number) => void;
	getMorphProgress: () => number;
	toggleOverallMode: () => boolean;
	setAngleIssueFocus: (focus: AngleIssueFocus | null) => void;
	setMetricFocus: (focus: MetricFocus | null) => void;
	getStrokeCount: () => number;
	dispose: () => void;
}

export interface ValidationPanelOptions {
	onDrawProgress?: (progress01: number) => void;
	onMorphProgress?: (progress01: number) => void;
	onStrokeIndexChange?: (strokeIndex: number) => void;
	onDrawLoopChange?: (active: boolean) => void;
	onMorphLoopChange?: (active: boolean) => void;
	onOverallModeChange?: (active: boolean) => void;
	themeMode?: ValidationThemeMode;
}

interface CanvasTheme {
	panelBackground: string;
	panelBorder: string;
	title: string;
	referenceGhost: string;
}

const CANVAS_THEME: Record<ValidationThemeMode, CanvasTheme> = {
	light: {
		panelBackground: "transparent",
		panelBorder: "#d4d4d4",
		title: "#555555",
		referenceGhost: "rgba(120, 120, 120, 0.18)",
	},
	dark: {
		panelBackground: "transparent",
		panelBorder: "#57637d",
		title: "#d1d6e0",
		referenceGhost: "rgba(190, 200, 220, 0.22)",
	},
};

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
interface PanelRect { x: number; y: number; width: number; height: number }

// Geometry helpers

function applyAffineToPoint(p: Point, t: AffineTransform): Point {
	return { x: t.scale_x * p.x + t.translate_x, y: t.scale_y * p.y + t.translate_y };
}

function applyAffineToKanji(kanji: Kanji, t: AffineTransform): Kanji {
	return {
		strokes: kanji.strokes.map((s) => ({
			points: s.points.map((p) => applyAffineToPoint(p, t)),
			label_pos: s.label_pos ? applyAffineToPoint(s.label_pos, t) : s.label_pos,
		})),
	};
}

function computeBounds(kanjiList: Kanji[]): Bounds | null {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	let found = false;
	for (const k of kanjiList) {
		for (const s of k.strokes) {
			for (const p of s.points) {
				found = true;
				minX = Math.min(minX, p.x);
				minY = Math.min(minY, p.y);
				maxX = Math.max(maxX, p.x);
				maxY = Math.max(maxY, p.y);
			}
		}
	}
	return found ? { minX, minY, maxX, maxY } : null;
}

function fitToPanel(point: Point, bounds: Bounds, panel: PanelRect): Point {
	const iw = Math.max(panel.width - PADDING * 2, 1);
	const ih = Math.max(panel.height - PADDING * 2, 1);
	const sw = Math.max(bounds.maxX - bounds.minX, 1e-9);
	const sh = Math.max(bounds.maxY - bounds.minY, 1e-9);
	const scale = Math.min(iw / sw, ih / sh);
	const ox = panel.x + PADDING + (iw - sw * scale) / 2;
	const oy = panel.y + PADDING + (ih - sh * scale) / 2;
	return { x: ox + (point.x - bounds.minX) * scale, y: oy + (point.y - bounds.minY) * scale };
}

function normalizeKanji(kanji: Kanji, bounds: Bounds, panel: PanelRect): Kanji {
	return {
		strokes: kanji.strokes.map((s) => ({
			points: s.points.map((p) => fitToPanel(p, bounds, panel)),
			label_pos: s.label_pos ? fitToPanel(s.label_pos, bounds, panel) : s.label_pos,
		})),
	};
}

// Drawing primitives

function drawPanel(ctx: CanvasRenderingContext2D, panel: PanelRect, theme: CanvasTheme): void {
	ctx.fillStyle = theme.panelBackground;
	ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
	ctx.strokeStyle = theme.panelBorder;
	ctx.lineWidth = 1;
	ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1);
}

function drawFullStroke(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	color: string,
	lineWidth: number,
): void {
	if (stroke.points.length < 2) return;
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.beginPath();
	ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
	for (let i = 1; i < stroke.points.length; i++) {
		ctx.lineTo(stroke.points[i]!.x, stroke.points[i]!.y);
	}
	ctx.stroke();
}

function drawPartialStroke(
	ctx: CanvasRenderingContext2D,
	stroke: Stroke,
	progress: number,
	strokeIndex: number,
	lineWidth: number,
): void {
	if (stroke.points.length < 2 || progress <= 0) return;

	ctx.strokeStyle = strokeColor(strokeIndex);
	ctx.lineWidth = lineWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	if (progress >= 1) {
		ctx.beginPath();
		ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
		for (let i = 1; i < stroke.points.length; i++) {
			ctx.lineTo(stroke.points[i]!.x, stroke.points[i]!.y);
		}
		ctx.stroke();
		return;
	}

	let totalLen = 0;
	for (let i = 1; i < stroke.points.length; i++) {
		const a = stroke.points[i - 1]!, b = stroke.points[i]!;
		totalLen += Math.hypot(b.x - a.x, b.y - a.y);
	}
	if (totalLen <= 0) return;

	let remaining = totalLen * progress;
	ctx.beginPath();
	ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
	for (let i = 1; i < stroke.points.length; i++) {
		const a = stroke.points[i - 1]!, b = stroke.points[i]!;
		const segLen = Math.hypot(b.x - a.x, b.y - a.y);
		if (segLen <= 0) continue;
		if (remaining >= segLen) {
			ctx.lineTo(b.x, b.y);
			remaining -= segLen;
		} else {
			const t = remaining / segLen;
			ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
			break;
		}
	}
	ctx.stroke();
}

function pointFromStroke(stroke: Stroke | undefined, type?: "Start" | "End"): Point | null {
	if (!stroke || stroke.points.length === 0) return null;
	return type === "End" ? stroke.points[stroke.points.length - 1] ?? null : stroke.points[0] ?? null;
}

// Overlay drawing

function drawGlowOverlay(
	ctx: CanvasRenderingContext2D,
	reference: Kanji,
	user: Kanji,
	indices: Set<number>,
): void {
	if (indices.size === 0) return;

	const t = performance.now() / 1000;
	const pulse = 0.5 + 0.5 * Math.sin(t * 7.0);
	const glowWidth = 6.2 + pulse * 3.0;
	const glowBlur = 26 + pulse * 22;

	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.globalAlpha = 0.56;
	for (const i of indices) {
		const color = strokeColor(i);
		ctx.shadowBlur = glowBlur;
		ctx.shadowColor = color;
		const ref = reference.strokes[i];
		const usr = user.strokes[i];
		if (ref) drawFullStroke(ctx, ref, color, glowWidth);
		if (usr) drawFullStroke(ctx, usr, color, glowWidth);
	}
	ctx.restore();
}

function drawAngleArrow(
	ctx: CanvasRenderingContext2D,
	from: Point,
	to: Point,
	color: string,
	grow: number,
): void {
	const dx = to.x - from.x, dy = to.y - from.y;
	const len = Math.hypot(dx, dy);
	if (len < 1e-6) return;

	const ux = dx / len, uy = dy / len;
	const g = Math.max(0.04, Math.min(1, grow));
	const ex = from.x + dx * g, ey = from.y + dy * g;
	const segLen = Math.hypot(ex - from.x, ey - from.y);
	const head = Math.min(10, Math.max(6, segLen * 0.2));
	const half = head * 0.45;
	const bx = ex - ux * head, by = ey - uy * head;
	const px = -uy, py = ux;

	ctx.lineWidth = 2.4;
	ctx.lineCap = "round";
	ctx.strokeStyle = color;
	ctx.beginPath();
	ctx.moveTo(from.x, from.y);
	ctx.lineTo(ex, ey);
	ctx.stroke();

	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(ex, ey);
	ctx.lineTo(bx + px * half, by + py * half);
	ctx.lineTo(bx - px * half, by - py * half);
	ctx.closePath();
	ctx.fill();
}

function drawAngleFocusOnPanels(
	ctx: CanvasRenderingContext2D,
	reference: Kanji,
	user: Kanji,
	focus: AngleIssueFocus,
	timeSec: number,
	showStrokeHighlight = true,
): void {
	const [a, b] = focus.strokeIndices;
	const refA = pointFromStroke(reference.strokes[a], focus.pointTypes?.[0]);
	const refB = pointFromStroke(reference.strokes[b], focus.pointTypes?.[1]);
	const usrA = pointFromStroke(user.strokes[a], focus.pointTypes?.[0]);
	const usrB = pointFromStroke(user.strokes[b], focus.pointTypes?.[1]);
	if (!refA || !refB || !usrA || !usrB) return;

	if (showStrokeHighlight) {
		const pulse = 0.5 + 0.5 * Math.sin(timeSec * 7.0);
		const glowWidth = 6.2 + pulse * 2.8;
		const glowBlur = 24 + pulse * 20;

		ctx.save();
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.globalAlpha = 0.52;
		for (const i of [a, b]) {
			const c = strokeColor(i);
			ctx.shadowBlur = glowBlur;
			ctx.shadowColor = c;
			if (reference.strokes[i]) drawFullStroke(ctx, reference.strokes[i]!, c, glowWidth);
			if (user.strokes[i]) drawFullStroke(ctx, user.strokes[i]!, c, glowWidth);
		}
		ctx.restore();

		for (const i of [a, b]) {
			const c = strokeColor(i);
			if (reference.strokes[i]) drawFullStroke(ctx, reference.strokes[i]!, c, REFERENCE_WIDTH);
			if (user.strokes[i]) drawFullStroke(ctx, user.strokes[i]!, c, USER_WIDTH);
		}
	}

	const growDuration = 0.62;
	const cycle = growDuration + 0.24;
	const grow = Math.min(timeSec, cycle) < growDuration
		? Math.min(timeSec, cycle) / growDuration
		: 1;

	drawAngleArrow(ctx, usrA, usrB, "rgba(210, 35, 35, 0.58)", grow);
	drawAngleArrow(ctx, refA, refB, "rgba(35, 165, 70, 0.58)", grow);
}

// Null controller

const NULL_CONTROLLER: ValidationPanelController = {
	playDraw: () => {},
	pauseDraw: () => {},
	toggleDrawLoop: () => false,
	setDrawProgress: () => {},
	getDrawProgress: () => 0,
	playMorph: () => {},
	pauseMorph: () => {},
	toggleMorphLoop: () => false,
	setMorphProgress: () => {},
	getMorphProgress: () => 0,
	toggleOverallMode: () => false,
	setAngleIssueFocus: () => {},
	setMetricFocus: () => {},
	getStrokeCount: () => 0,
	dispose: () => {},
};

// Input parsing

function parseInput(input: string | OverlayValidationData): OverlayValidationData {
	return typeof input === "string" ? JSON.parse(input) as OverlayValidationData : input;
}

// Main

export function renderValidationPanel(
	canvas: HTMLCanvasElement,
	input: string | OverlayValidationData,
	options?: ValidationPanelOptions,
): ValidationPanelController {
	const data = parseInput(input);
	const theme = CANVAS_THEME[options?.themeMode ?? "light"];
	const ctx = canvas.getContext("2d");
	if (!ctx) return NULL_CONTROLLER;

	const refAligned = applyAffineToKanji(data.reference_raw, data.composition.alignment.reference_to_aligned);
	const usrAligned = applyAffineToKanji(data.user_raw, data.composition.alignment.user_to_aligned);
	const bounds = computeBounds([refAligned, usrAligned]);
	if (!bounds) return NULL_CONTROLLER;

	const leftPanel: PanelRect = { x: 0, y: 0, width: (canvas.width - PANEL_GAP) / 2, height: canvas.height };
	const rightPanel: PanelRect = { x: leftPanel.width + PANEL_GAP, y: 0, width: leftPanel.width, height: canvas.height };

	const refLeft = normalizeKanji(refAligned, bounds, leftPanel);
	const refRight = normalizeKanji(refAligned, bounds, rightPanel);
	const usrRight = normalizeKanji(usrAligned, bounds, rightPanel);
	const morphPlan = createMorphPlan(refRight, usrRight);
	const strokeCount = Math.max(refLeft.strokes.length, usrRight.strokes.length);
	const totalDurationMs = Math.max(strokeCount, 1) * STROKE_DURATION_MS;



	const metricBad: Record<MetricFocus, Set<number>> = { dtw: new Set(), rms: new Set(), position: new Set() };
	for (let i = 0; i < strokeCount; i++) {
		const dtw = data.dtw?.strokes?.[i]?.dtw_error;
		const rms = data.rms?.strokes?.[i]?.rms;
		const detail = data.composition.stroke_details?.find((s) => s.stroke_idx === i);
		const pos = detail ? Math.max(detail.start.distance, detail.end.distance) : undefined;
		if (data.thresholds?.dtw !== undefined && dtw !== undefined && dtw > data.thresholds.dtw) metricBad.dtw.add(i);
		if (data.thresholds?.rms !== undefined && rms !== undefined && rms > data.thresholds.rms) metricBad.rms.add(i);
		if (data.thresholds?.position !== undefined && pos !== undefined && pos > data.thresholds.position) metricBad.position.add(i);
	}

	const angleIssues: AngleIssueFocus[] = [];
	const angleThr = data.thresholds?.relative_angle;
	for (const item of data.composition.angle_details ?? []) {
		const bad = angleThr !== undefined ? item.weighted_diff > angleThr : item.weighted_diff > 0;
		if (bad) angleIssues.push({ strokeIndices: item.stroke_indices, pointTypes: item.point_types });
	}



	let activeView: "draw" | "morph" = "draw";
	let playing = false;

	let drawPhase = 0;
	let drawDir: 1 | -1 = 1;
	let drawLoopEnabled = false;

	let morphProgress = 0;
	let morphDir: 1 | -1 = 1;
	let morphLoopEnabled = false;

	let angleFocus: AngleIssueFocus | null = null;
	let metricFocus: MetricFocus | null = null;
	let overallMode = false;



	const setDrawLoop = (v: boolean): void => {
		if (drawLoopEnabled !== v) { drawLoopEnabled = v; options?.onDrawLoopChange?.(v); }
	};
	const setMorphLoop = (v: boolean): void => {
		if (morphLoopEnabled !== v) { morphLoopEnabled = v; options?.onMorphLoopChange?.(v); }
	};
	const setOverall = (v: boolean): void => {
		if (overallMode !== v) { overallMode = v; options?.onOverallModeChange?.(v); }
	};

	const isEndSummaryActive = (): boolean =>
		overallMode && activeView === "draw" && !angleFocus && !metricFocus;



	const switchToDraw = (): void => {
		if (activeView !== "morph") return;
		playing = false;
		stopLoop();
		setMorphLoop(false);
		activeView = "draw";
	};

	const switchToMorph = (): void => {
		playing = false;
		stopLoop();
		setDrawLoop(false);
		setOverall(false);
		angleFocus = null;
		metricFocus = null;
		activeView = "morph";
	};



	const notifyDraw = (): void => {
		const progress = strokeCount > 0 ? Math.max(0, Math.min(1, drawPhase / strokeCount)) : 0;
		const strokeIdx = strokeCount > 0 ? Math.min(strokeCount - 1, Math.max(0, Math.floor(drawPhase))) : -1;
		options?.onDrawProgress?.(progress);
		options?.onStrokeIndexChange?.(strokeIdx);
	};

	const notifyMorph = (): void => {
		options?.onMorphProgress?.(Math.max(0, Math.min(1, morphProgress)));
	};


	const baseCanvas = document.createElement("canvas");
	baseCanvas.width = canvas.width;
	baseCanvas.height = canvas.height;
	const baseCtx = baseCanvas.getContext("2d")!;
	let baseDirty = true;
	let cachedDrawPhase = -1;
	let cachedMorphProgress = -1;
	let cachedActiveView: "draw" | "morph" | null = null;
	let cachedShowFull = false;

	const renderBase = (): void => {
		baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
		drawPanel(baseCtx, leftPanel, theme);
		drawPanel(baseCtx, rightPanel, theme);

		if (activeView === "morph" && !angleFocus && !metricFocus) {
			for (let i = 0; i < refLeft.strokes.length; i++) {
				if (refLeft.strokes[i]) drawFullStroke(baseCtx, refLeft.strokes[i]!, strokeColor(i), REFERENCE_WIDTH);
			}
			const frame = sampleMorphFrame(morphPlan, morphProgress * morphPlan.totalDurationMs);
			for (const s of frame.strokes) {
				if (s.alpha <= 0) continue;
				baseCtx.save();
				baseCtx.globalAlpha = s.alpha;
				drawFullStroke(baseCtx, s.stroke, strokeColor(s.strokeIndex), USER_WIDTH);
				baseCtx.restore();
			}
		} else {
			const showFull = angleFocus !== null || metricFocus !== null;
			for (let i = 0; i < strokeCount; i++) {
				const p = showFull ? 1 : Math.max(0, Math.min(1, drawPhase - i));
				if (refLeft.strokes[i]) drawPartialStroke(baseCtx, refLeft.strokes[i]!, p, i, REFERENCE_WIDTH);
				if (usrRight.strokes[i]) drawPartialStroke(baseCtx, usrRight.strokes[i]!, p, i, USER_WIDTH);
			}
		}

		cachedDrawPhase = drawPhase;
		cachedMorphProgress = morphProgress;
		cachedActiveView = activeView;
		cachedShowFull = angleFocus !== null || metricFocus !== null;
		baseDirty = false;
	};

	const isBaseDirty = (): boolean => {
		if (baseDirty) return true;
		if (cachedActiveView !== activeView) return true;
		if (activeView === "morph" && morphProgress !== cachedMorphProgress) return true;
		if (activeView === "draw" && drawPhase !== cachedDrawPhase) return true;
		const showFull = angleFocus !== null || metricFocus !== null;
		if (showFull !== cachedShowFull) return true;
		return false;
	};

	const render = (): void => {
		if (isBaseDirty()) renderBase();

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(baseCanvas, 0, 0);

		if (activeView === "morph" && !angleFocus && !metricFocus) return;

		if (angleFocus) {
			drawAngleFocusOnPanels(ctx, refLeft, usrRight, angleFocus, performance.now() / 1000 % 1.05);
		} else if (metricFocus) {
			drawGlowOverlay(ctx, refLeft, usrRight, metricBad[metricFocus]);
		} else if (isEndSummaryActive()) {
			const combined = new Set([...metricBad.dtw, ...metricBad.rms, ...metricBad.position]);
			drawGlowOverlay(ctx, refLeft, usrRight, combined);
			if (angleIssues.length > 0) {
				const t = performance.now() / 1000;
				const idx = Math.floor(t / 1.05) % angleIssues.length;
				drawAngleFocusOnPanels(ctx, refLeft, usrRight, angleIssues[idx]!, t % 1.05, false);
			}
		}
	};



	let frameId: number | null = null;
	let prevTs = 0;
	let lastOverlayRenderTs = 0;
	const OVERLAY_INTERVAL_MS = 1000 / 30;

	const needsLoop = (): boolean =>
		playing || angleFocus !== null || metricFocus !== null || isEndSummaryActive();

	const needsOverlayOnly = (): boolean =>
		!playing && (angleFocus !== null || metricFocus !== null || isEndSummaryActive());

	const ensureLoop = (): void => {
		if (frameId === null && needsLoop()) {
			prevTs = 0;
			frameId = requestAnimationFrame(tick);
		}
	};

	const stopLoop = (): void => {
		if (frameId !== null) {
			cancelAnimationFrame(frameId);
			frameId = null;
		}
	};

	const advanceDraw = (dt: number): void => {
		if (totalDurationMs <= 0) return;
		const delta = (dt / totalDurationMs) * strokeCount;

		if (drawLoopEnabled) {
			drawPhase += delta * drawDir;
			if (drawPhase >= strokeCount) { drawPhase = strokeCount; drawDir = -1; }
			else if (drawPhase <= 0) { drawPhase = 0; drawDir = 1; }
		} else {
			drawPhase = Math.min(drawPhase + delta, strokeCount);
			if (drawPhase >= strokeCount) playing = false;
		}
		notifyDraw();
	};

	const advanceMorph = (dt: number): void => {
		if (morphPlan.totalDurationMs <= 0) return;
		let next = morphProgress + (dt / morphPlan.totalDurationMs) * morphDir;

		if (next > 1) {
			if (morphLoopEnabled) { next = 1; morphDir = -1; }
			else { next = 1; playing = false; }
		} else if (next < 0) {
			if (morphLoopEnabled) { next = 0; morphDir = 1; }
			else { next = 0; playing = false; }
		}
		morphProgress = next;
		notifyMorph();
	};

	const tick = (ts: number): void => {
		const dt = prevTs > 0 ? Math.max(0, ts - prevTs) : 0;
		prevTs = ts;

		if (playing) {
			if (activeView === "draw") advanceDraw(dt);
			else advanceMorph(dt);
			render();
		} else if (needsOverlayOnly()) {
			if (ts - lastOverlayRenderTs >= OVERLAY_INTERVAL_MS) {
				lastOverlayRenderTs = ts;
				render();
			}
		}

		if (needsLoop()) {
			frameId = requestAnimationFrame(tick);
		} else {
			frameId = null;
		}
	};


	render();
	notifyDraw();


	return {
		playDraw: () => {
			switchToDraw();
			setOverall(false);
			if (drawLoopEnabled) {
				if (drawPhase >= strokeCount) drawDir = -1;
				else if (drawPhase <= 0) drawDir = 1;
			}
			playing = true;
			ensureLoop();
		},

		pauseDraw: () => {
			if (activeView === "draw") {
				playing = false;
				stopLoop();
				ensureLoop();
			}
		},

		toggleDrawLoop: () => {
			drawLoopEnabled = !drawLoopEnabled;
			options?.onDrawLoopChange?.(drawLoopEnabled);
			if (!drawLoopEnabled) {
				playing = false;
				stopLoop();
				ensureLoop();
			}
			return drawLoopEnabled;
		},

		setDrawProgress: (progress01: number) => {
			switchToDraw();
			setOverall(false);
			playing = false;
			stopLoop();
			drawPhase = Math.max(0, Math.min(1, progress01)) * strokeCount;
			render();
			notifyDraw();
			ensureLoop();
		},

		getDrawProgress: () =>
			strokeCount > 0 ? Math.max(0, Math.min(1, drawPhase / strokeCount)) : 0,

		playMorph: () => {
			switchToMorph();
			angleFocus = null;
			metricFocus = null;
			morphDir = 1;
			playing = true;
			render();
			notifyMorph();
			ensureLoop();
		},

		pauseMorph: () => {
			if (activeView === "morph") {
				playing = false;
				stopLoop();
				ensureLoop();
			}
		},

		toggleMorphLoop: () => {
			morphLoopEnabled = !morphLoopEnabled;
			options?.onMorphLoopChange?.(morphLoopEnabled);
			if (!morphLoopEnabled) {
				playing = false;
				stopLoop();
				if (activeView === "morph") {
					render();
					notifyMorph();
				}
				ensureLoop();
			}
			return morphLoopEnabled;
		},

		setMorphProgress: (progress01: number) => {
			switchToMorph();
			playing = false;
			stopLoop();
			morphProgress = Math.max(0, Math.min(1, progress01));
			morphDir = 1;
			render();
			notifyMorph();
		},

		getMorphProgress: () => morphProgress,

		toggleOverallMode: () => {
			if (activeView === "morph") switchToDraw();
			overallMode = !overallMode;
			options?.onOverallModeChange?.(overallMode);
			render();
			notifyDraw();
			ensureLoop();
			return overallMode;
		},

		setAngleIssueFocus: (focus: AngleIssueFocus | null) => {
			angleFocus = focus;
			if (focus) metricFocus = null;
			render();
			if (activeView === "morph") notifyMorph();
			else notifyDraw();
			ensureLoop();
		},

		setMetricFocus: (focus: MetricFocus | null) => {
			metricFocus = focus;
			if (focus) angleFocus = null;
			render();
			if (activeView === "morph") notifyMorph();
			else notifyDraw();
			ensureLoop();
		},

		getStrokeCount: () => strokeCount,

		dispose: () => {
			playing = false;
			stopLoop();
		},
	};
}
