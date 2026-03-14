use crate::error::{KanjiResult, KanjiTrainerError};
use crate::kanji::{Kanji, Norm, Point};
use crate::validation::utils::{
    apply_normalization_raw, get_normalization_params, interpolate_stroke,
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct StrokeShapeDetails {
    pub rms: Norm,
    pub user_points_normalized: Vec<Point>,
    pub reference_points_normalized: Vec<Point>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KanjiShapeResult {
    pub strokes: Vec<StrokeShapeDetails>,
}

pub fn compare_kanji_shape(
    input: &Kanji,
    reference: &Kanji,
    sampling_resolution: usize,
) -> KanjiResult<KanjiShapeResult> {
    if sampling_resolution < 2 {
        return Err(KanjiTrainerError::InvalidSamplingResolution);
    }

    let input_strokes = input.strokes().as_ref();
    let ref_strokes = reference.strokes().as_ref();

    let mut stroke_results = Vec::with_capacity(input_strokes.len());

    for (u_stroke, r_stroke) in input_strokes.iter().zip(ref_strokes.iter()) {
        let u_interp = interpolate_stroke(u_stroke.points(), sampling_resolution);
        let r_interp = interpolate_stroke(r_stroke.points(), sampling_resolution);

        let (u_mean, u_factor) = get_normalization_params(&u_interp);
        let (r_mean, r_factor) = get_normalization_params(&r_interp);

        let u_norm = apply_normalization_raw(&u_interp, u_mean, u_factor);
        let r_norm = apply_normalization_raw(&r_interp, r_mean, r_factor);

        let mut sum_sq_dist = 0.0;
        for (p_u, p_r) in u_norm.iter().zip(r_norm.iter()) {
            let dx = p_u.0 - p_r.0;
            let dy = p_u.1 - p_r.1;
            sum_sq_dist += dx * dx + dy * dy;
        }

        let rms_raw = (sum_sq_dist / sampling_resolution as f32).sqrt();
        let rms_norm = (rms_raw / std::f32::consts::SQRT_2).clamp(0.0, 1.0);
        let rms = Norm::try_new(rms_norm).map_err(|_| KanjiTrainerError::OutOfRange {
            value: rms_norm,
            min: 0.0,
            max: 1.0,
        })?;

        let user_points_normalized = to_points(u_norm.clone())?;
        let reference_points_normalized = to_points(r_norm.clone())?;

        stroke_results.push(StrokeShapeDetails {
            rms,
            user_points_normalized,
            reference_points_normalized,
        });

    }

    Ok(KanjiShapeResult {
        strokes: stroke_results,
    })
}

fn to_points(raw: Vec<(f32, f32)>) -> KanjiResult<Vec<Point>> {
    raw.into_iter().map(Point::try_from).collect()
}
