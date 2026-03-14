export interface Point {
	x: number;
	y: number;
}

export interface Stroke {
	points: Point[];
	label_pos?: Point | null;
}

export interface Kanji {
	strokes: Stroke[];
}

export interface AffineTransform {
	scale_x: number;
	scale_y: number;
	translate_x: number;
	translate_y: number;
}

export interface OverlayValidationData {
	reference_raw: Kanji;
	user_raw: Kanji;
	thresholds?: {
		dtw: number;
		rms: number;
		position: number;
		relative_angle: number;
	};
	dtw?: {
		strokes: Array<{
			dtw_error: number;
			user_angles?: number[];
			reference_angles?: number[];
		}>;
	};
	rms?: {
		strokes: Array<{
			rms: number;
			user_points_normalized?: Point[];
			reference_points_normalized?: Point[];
		}>;
	};
	composition: {
		stroke_details?: Array<{
			stroke_idx: number;
			start: { distance: number };
			end: { distance: number };
		}>;
		angle_details?: Array<{
			stroke_indices: [number, number];
			point_types?: ["Start" | "End", "Start" | "End"];
			weighted_diff: number;
		}>;
		alignment: {
			user_to_aligned: AffineTransform;
			reference_to_aligned: AffineTransform;
		};
	};
	max_errors?: {
		dtw: number;
		rms: number;
		position: number;
		relative_angle: number;
	};
}
