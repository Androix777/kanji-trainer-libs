import type { Kanji, Point, Stroke } from "./types";

const RESAMPLE_POINTS = 24;
const EPS = 1e-9;

export interface MorphFrameStroke {
	stroke: Stroke;
	strokeIndex: number;
	alpha: number;
}

export interface MorphFrame {
	strokes: MorphFrameStroke[];
	isComplete: boolean;
}

export interface MorphPlan {
	reference: Kanji;
	user: Kanji;
	removeDurationMs: number;
	morphDurationMs: number;
	addDurationMs: number;
	totalDurationMs: number;
	pairs: StrokePairPlan[];
	extraUser: Array<{ stroke: Stroke; strokeIndex: number }>;
	missingReference: Array<{ stroke: Stroke; strokeIndex: number }>;
}

interface LocalPoint {
	x: number;
	y: number;
}

interface StrokePairPlan {
	strokeIndex: number;
	userRaw: Stroke;
	referenceRaw: Stroke;
	userLocal: LocalPoint[];
	referenceLocal: LocalPoint[];
	userCenter: Point;
	referenceCenter: Point;
	userAngle: number;
	referenceAngle: number;
	userLength: number;
	referenceLength: number;
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function avgPoint(points: Point[]): Point {
	if (points.length === 0) {
		return { x: 0, y: 0 };
	}
	let x = 0;
	let y = 0;
	for (const p of points) {
		x += p.x;
		y += p.y;
	}
	return { x: x / points.length, y: y / points.length };
}

function rotate(p: LocalPoint, angle: number): LocalPoint {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return {
		x: p.x * c - p.y * s,
		y: p.x * s + p.y * c,
	};
}

function shortestAngleDelta(from: number, to: number): number {
	let delta = to - from;
	while (delta > Math.PI) {
		delta -= Math.PI * 2;
	}
	while (delta < -Math.PI) {
		delta += Math.PI * 2;
	}
	return delta;
}

function polylineLength(points: Point[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i += 1) {
		const a = points[i - 1]!;
		const b = points[i]!;
		total += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return total;
}

function ensureStroke(stroke: Stroke): Stroke {
	if (stroke.points.length >= 2) {
		return stroke;
	}
	if (stroke.points.length === 1) {
		const p = stroke.points[0]!;
		return {
			points: [p, p],
			label_pos: null,
		};
	}
	return {
		points: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
		label_pos: null,
	};
}

function resampleStroke(stroke: Stroke, count: number): Point[] {
	const src = ensureStroke(stroke).points;
	if (count <= 1) {
		return [src[0]!];
	}
	const lengths: number[] = [0];
	for (let i = 1; i < src.length; i += 1) {
		const a = src[i - 1]!;
		const b = src[i]!;
		lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
	}
	const total = lengths[lengths.length - 1]!;
	if (total <= EPS) {
		return Array.from({ length: count }, () => ({ ...src[0]! }));
	}

	const out: Point[] = [];
	for (let i = 0; i < count; i += 1) {
		const t = i / (count - 1);
		const target = t * total;
		let seg = 1;
		while (seg < lengths.length && lengths[seg]! < target) {
			seg += 1;
		}
		const bIdx = Math.min(seg, src.length - 1);
		const aIdx = Math.max(0, bIdx - 1);
		const l0 = lengths[aIdx]!;
		const l1 = lengths[bIdx]!;
		const a = src[aIdx]!;
		const b = src[bIdx]!;
		const ratio = l1 - l0 <= EPS ? 0 : (target - l0) / (l1 - l0);
		out.push({
			x: lerp(a.x, b.x, ratio),
			y: lerp(a.y, b.y, ratio),
		});
	}
	return out;
}

function strokeAngle(points: Point[]): number {
	const a = points[0]!;
	const b = points[points.length - 1]!;
	return Math.atan2(b.y - a.y, b.x - a.x);
}

function strokeLength(points: Point[]): number {
	const a = points[0]!;
	const b = points[points.length - 1]!;
	const endToEnd = Math.hypot(b.x - a.x, b.y - a.y);
	if (endToEnd > EPS) {
		return endToEnd;
	}
	const path = polylineLength(points);
	return path > EPS ? path : 1;
}

function toLocal(points: Point[], center: Point, angle: number, length: number): LocalPoint[] {
	const c = Math.cos(-angle);
	const s = Math.sin(-angle);
	const invLen = 1 / Math.max(length, EPS);
	return points.map((p) => {
		const x = p.x - center.x;
		const y = p.y - center.y;
		return {
			x: (x * c - y * s) * invLen,
			y: (x * s + y * c) * invLen,
		};
	});
}

function buildPairPlan(strokeIndex: number, userStroke: Stroke, referenceStroke: Stroke): StrokePairPlan {
	const userSamples = resampleStroke(userStroke, RESAMPLE_POINTS);
	const referenceSamples = resampleStroke(referenceStroke, RESAMPLE_POINTS);

	const userCenter = avgPoint(userSamples);
	const referenceCenter = avgPoint(referenceSamples);
	const userAngle = strokeAngle(userSamples);
	const referenceAngle = strokeAngle(referenceSamples);
	const userLength = strokeLength(userSamples);
	const referenceLength = strokeLength(referenceSamples);

	return {
		strokeIndex,
		userRaw: ensureStroke(userStroke),
		referenceRaw: ensureStroke(referenceStroke),
		userLocal: toLocal(userSamples, userCenter, userAngle, userLength),
		referenceLocal: toLocal(referenceSamples, referenceCenter, referenceAngle, referenceLength),
		userCenter,
		referenceCenter,
		userAngle,
		referenceAngle,
		userLength,
		referenceLength,
	};
}

function buildMorphedStroke(pair: StrokePairPlan, t: number): Stroke {
	const angle = pair.userAngle + shortestAngleDelta(pair.userAngle, pair.referenceAngle) * t;
	const length = lerp(pair.userLength, pair.referenceLength, t);
	const center: Point = {
		x: lerp(pair.userCenter.x, pair.referenceCenter.x, t),
		y: lerp(pair.userCenter.y, pair.referenceCenter.y, t),
	};

	const points: Point[] = [];
	for (let i = 0; i < pair.userLocal.length; i += 1) {
		const ul = pair.userLocal[i]!;
		const rl = pair.referenceLocal[i]!;
		const local: LocalPoint = {
			x: lerp(ul.x, rl.x, t),
			y: lerp(ul.y, rl.y, t),
		};
		const rotated = rotate(local, angle);
		points.push({
			x: center.x + rotated.x * length,
			y: center.y + rotated.y * length,
		});
	}

	return { points, label_pos: null };
}

export function createMorphPlan(
	reference: Kanji,
	user: Kanji,
	removeDurationMs: number = 420,
	morphDurationMs: number = 1400,
	addDurationMs: number = 420,
): MorphPlan {
	const pairCount = Math.min(reference.strokes.length, user.strokes.length);
	const pairs: StrokePairPlan[] = [];
	for (let i = 0; i < pairCount; i += 1) {
		pairs.push(buildPairPlan(i, user.strokes[i]!, reference.strokes[i]!));
	}

	const extraUser: Array<{ stroke: Stroke; strokeIndex: number }> = [];
	for (let i = pairCount; i < user.strokes.length; i += 1) {
		extraUser.push({ stroke: ensureStroke(user.strokes[i]!), strokeIndex: i });
	}

	const missingReference: Array<{ stroke: Stroke; strokeIndex: number }> = [];
	for (let i = pairCount; i < reference.strokes.length; i += 1) {
		missingReference.push({ stroke: ensureStroke(reference.strokes[i]!), strokeIndex: i });
	}

	const totalDurationMs = removeDurationMs + morphDurationMs + addDurationMs;
	return {
		reference,
		user,
		removeDurationMs,
		morphDurationMs,
		addDurationMs,
		totalDurationMs,
		pairs,
		extraUser,
		missingReference,
	};
}

export function sampleMorphFrame(plan: MorphPlan, elapsedMs: number): MorphFrame {
	const t = Math.max(0, Math.min(plan.totalDurationMs, elapsedMs));
	const out: MorphFrameStroke[] = [];

	const removeEnd = plan.removeDurationMs;
	const morphEnd = removeEnd + plan.morphDurationMs;

	if (t <= removeEnd) {
		const removeT = removeEnd <= EPS ? 1 : t / removeEnd;
		for (const pair of plan.pairs) {
			out.push({ stroke: pair.userRaw, strokeIndex: pair.strokeIndex, alpha: 1 });
		}
		for (const extra of plan.extraUser) {
			out.push({ stroke: extra.stroke, strokeIndex: extra.strokeIndex, alpha: 1 - removeT });
		}
		return {
			strokes: out,
			isComplete: false,
		};
	}

	if (t <= morphEnd) {
		const morphT = plan.morphDurationMs <= EPS ? 1 : (t - removeEnd) / plan.morphDurationMs;
		for (const pair of plan.pairs) {
			out.push({
				stroke: buildMorphedStroke(pair, morphT),
				strokeIndex: pair.strokeIndex,
				alpha: 1,
			});
		}
		return {
			strokes: out,
			isComplete: false,
		};
	}

	const addT = plan.addDurationMs <= EPS ? 1 : (t - morphEnd) / plan.addDurationMs;
	for (const pair of plan.pairs) {
		out.push({ stroke: pair.referenceRaw, strokeIndex: pair.strokeIndex, alpha: 1 });
	}
	for (const miss of plan.missingReference) {
		out.push({ stroke: miss.stroke, strokeIndex: miss.strokeIndex, alpha: addT });
	}
	return {
		strokes: out,
		isComplete: t >= plan.totalDurationMs - EPS,
	};
}
