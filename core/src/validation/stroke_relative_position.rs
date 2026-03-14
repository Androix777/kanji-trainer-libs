use crate::error::KanjiResult;
use crate::kanji::{Kanji, Norm, Point};
use crate::validation::utils::angular_distance;
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum PointType {
    Start,
    End,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct AffineTransform {
    pub scale_x: f32,
    pub scale_y: f32,
    pub translate_x: f32,
    pub translate_y: f32,
}

impl AffineTransform {
    pub fn apply(&self, p: (f32, f32)) -> (f32, f32) {
        (
            self.scale_x.mul_add(p.0, self.translate_x),
            self.scale_y.mul_add(p.1, self.translate_y),
        )
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct CompositionAlignment {
    pub user_to_aligned: AffineTransform,
    pub reference_to_aligned: AffineTransform,
}

#[derive(Debug, Clone, Serialize)]
pub struct PointDeviation {
    pub expected: (f32, f32),
    pub actual: (f32, f32),
    pub deviation_vector: (f32, f32),
    pub distance: Norm,
}

#[derive(Debug, Clone, Serialize)]
pub struct AngleDeviation {
    pub stroke_indices: (usize, usize),
    pub point_types: (PointType, PointType),
    pub expected_angle: f32,
    pub actual_angle: f32,
    pub angle_diff: Norm,
    pub weight: f32,
    pub weighted_diff: Norm,
}

#[derive(Debug, Clone, Serialize)]
pub struct StrokeRelativeDetails {
    pub stroke_idx: usize,
    pub start: PointDeviation,
    pub end: PointDeviation,
}

#[derive(Debug, Clone, Serialize)]
pub struct KanjiCompositionResult {
    pub stroke_details: Vec<StrokeRelativeDetails>,
    pub angle_details: Vec<AngleDeviation>,
    pub alignment: CompositionAlignment,
}

impl Default for KanjiCompositionResult {
    fn default() -> Self {
        Self {
            stroke_details: Vec::new(),
            angle_details: Vec::new(),
            alignment: CompositionAlignment {
                user_to_aligned: AffineTransform {
                    scale_x: 1.0,
                    scale_y: 1.0,
                    translate_x: 0.0,
                    translate_y: 0.0,
                },
                reference_to_aligned: AffineTransform {
                    scale_x: 1.0,
                    scale_y: 1.0,
                    translate_x: 0.0,
                    translate_y: 0.0,
                },
            },
        }
    }
}

pub fn compare_kanji_composition(input: &Kanji, reference: &Kanji) -> KanjiResult<KanjiCompositionResult> {
    let input_strokes = input.strokes().as_ref();
    let ref_strokes = reference.strokes().as_ref();

    let n: usize = input_strokes.len().min(ref_strokes.len());

    let input_subset = &input_strokes[..n];
    let ref_subset = &ref_strokes[..n];

    let u_rect = Rect::from_strokes(input_subset);
    let r_rect = Rect::from_strokes(ref_subset);
    let full_r_rect = Rect::from_strokes(ref_strokes);

    let (u_side, u_off_x, u_off_y) = u_rect.to_square_params();
    let (r_side, r_off_x, r_off_y) = r_rect.to_square_params();
    let (full_r_side, _, _) = full_r_rect.to_square_params();

    let expansion_ratio = (r_side / full_r_side).min(1.0);

    let user_to_aligned = AffineTransform {
        scale_x: 1.0 / u_side,
        scale_y: 1.0 / u_side,
        translate_x: (-u_rect.min_x + u_off_x) / u_side,
        translate_y: (-u_rect.min_y + u_off_y) / u_side,
    };

    let reference_to_aligned = AffineTransform {
        scale_x: 1.0 / r_side,
        scale_y: 1.0 / r_side,
        translate_x: (-r_rect.min_x + r_off_x) / r_side,
        translate_y: (-r_rect.min_y + r_off_y) / r_side,
    };

    let norm_p = |p: &Point, t: AffineTransform| -> (f32, f32) { t.apply((*p.x, *p.y)) };

    struct EndpointData {
        pos: (f32, f32),
        stroke_idx: usize,
        point_type: PointType,
    }

    let mut user_endpoints = Vec::with_capacity(n * 2);
    let mut ref_endpoints = Vec::with_capacity(n * 2);

    for i in 0..n {
        let u_pts = input_subset[i].points().as_ref();
        let r_pts = ref_subset[i].points().as_ref();

        if u_pts.is_empty() || r_pts.is_empty() {
            continue;
        }

        user_endpoints.push(EndpointData {
            pos: norm_p(&u_pts[0], user_to_aligned),
            stroke_idx: i,
            point_type: PointType::Start,
        });
        user_endpoints.push(EndpointData {
            pos: norm_p(&u_pts[u_pts.len() - 1], user_to_aligned),
            stroke_idx: i,
            point_type: PointType::End,
        });

        ref_endpoints.push(EndpointData {
            pos: norm_p(&r_pts[0], reference_to_aligned),
            stroke_idx: i,
            point_type: PointType::Start,
        });
        ref_endpoints.push(EndpointData {
            pos: norm_p(&r_pts[r_pts.len() - 1], reference_to_aligned),
            stroke_idx: i,
            point_type: PointType::End,
        });
    }

    let mut stroke_details = Vec::with_capacity(n);
    for i in 0..n {
        let s_idx = i * 2;
        let e_idx = i * 2 + 1;

        let start_raw = calculate_point_deviation_raw(user_endpoints[s_idx].pos, ref_endpoints[s_idx].pos);
        let end_raw = calculate_point_deviation_raw(user_endpoints[e_idx].pos, ref_endpoints[e_idx].pos);

        let normalize_dist = |d: f32| {
            let val = (d * expansion_ratio) / 2.0f32.sqrt();
            Norm::try_new(val.clamp(0.0, 1.0)).unwrap_or_else(|_| Norm::try_new(0.0).unwrap())
        };

        stroke_details.push(StrokeRelativeDetails {
            stroke_idx: i,
            start: PointDeviation {
                expected: start_raw.0,
                actual: start_raw.1,
                deviation_vector: start_raw.2,
                distance: normalize_dist(start_raw.3),
            },
            end: PointDeviation {
                expected: end_raw.0,
                actual: end_raw.1,
                deviation_vector: end_raw.2,
                distance: normalize_dist(end_raw.3),
            },
        });
    }

    let mut angle_details = Vec::new();
    let ep_count = user_endpoints.len();

    for i in 0..ep_count {
        for j in (i + 1)..ep_count {
            let u1 = &user_endpoints[i];
            let u2 = &user_endpoints[j];
            if u1.stroke_idx == u2.stroke_idx {
                continue;
            }

            let r1 = &ref_endpoints[i];
            let r2 = &ref_endpoints[j];

            let dx_r = r2.pos.0 - r1.pos.0;
            let dy_r = r2.pos.1 - r1.pos.1;
            let dx_u = u2.pos.0 - u1.pos.0;
            let dy_u = u2.pos.1 - u1.pos.1;

            let dist_r = (dx_r * dx_r + dy_r * dy_r).sqrt();
            let k: f32 = 0.1;
            let saturation = (dist_r * dist_r) / (dist_r * dist_r + k * k);
            let weight = saturation * expansion_ratio;

            let r_angle = dy_r.atan2(dx_r);
            let u_angle = dy_u.atan2(dx_u);
            let diff = angular_distance(u_angle, r_angle);

            angle_details.push(AngleDeviation {
                stroke_indices: (u1.stroke_idx, u2.stroke_idx),
                point_types: (u1.point_type, u2.point_type),
                expected_angle: r_angle,
                actual_angle: u_angle,
                angle_diff: {
                    let val = diff / std::f32::consts::PI;
                    Norm::try_new(val.clamp(0.0, 1.0)).unwrap_or_else(|_| Norm::try_new(0.0).unwrap())
                },
                weight,
                weighted_diff: {
                    let val = (diff * weight) / std::f32::consts::PI;
                    Norm::try_new(val.clamp(0.0, 1.0)).unwrap_or_else(|_| Norm::try_new(0.0).unwrap())
                },
            });
        }
    }

    Ok(KanjiCompositionResult {
        stroke_details,
        angle_details,
        alignment: CompositionAlignment {
            user_to_aligned,
            reference_to_aligned,
        },
    })
}

fn calculate_point_deviation_raw(
    actual: (f32, f32),
    expected: (f32, f32),
) -> ((f32, f32), (f32, f32), (f32, f32), f32) {
    let dx = actual.0 - expected.0;
    let dy = actual.1 - expected.1;
    let distance = (dx * dx + dy * dy).sqrt();
    (expected, actual, (dx, dy), distance)
}

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub min_x: f32,
    pub max_x: f32,
    pub min_y: f32,
    pub max_y: f32,
}

impl Rect {
    pub fn from_strokes(strokes: &[crate::kanji::Stroke]) -> Self {
        let mut min_x = f32::MAX;
        let mut max_x = f32::MIN;
        let mut min_y = f32::MAX;
        let mut max_y = f32::MIN;

        let mut has_points = false;
        for stroke in strokes {
            for point in stroke.points().as_ref() {
                has_points = true;
                let px = *point.x;
                let py = *point.y;
                if px < min_x {
                    min_x = px;
                }
                if px > max_x {
                    max_x = px;
                }
                if py < min_y {
                    min_y = py;
                }
                if py > max_y {
                    max_y = py;
                }
            }
        }

        if !has_points {
            return Self {
                min_x: 0.0,
                max_x: 0.0,
                min_y: 0.0,
                max_y: 0.0,
            };
        }

        Self {
            min_x,
            max_x,
            min_y,
            max_y,
        }
    }

    pub fn width(&self) -> f32 {
        (self.max_x - self.min_x).max(0.0)
    }

    pub fn height(&self) -> f32 {
        (self.max_y - self.min_y).max(0.0)
    }

    pub fn to_square_params(&self) -> (f32, f32, f32) {
        let w = self.width();
        let h = self.height();
        let side = w.max(h).max(f32::EPSILON);

        let offset_x = (side - w) / 2.0;
        let offset_y = (side - h) / 2.0;

        (side, offset_x, offset_y)
    }
}
