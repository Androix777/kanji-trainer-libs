use crate::error::KanjiResult;
use crate::kanji::{Kanji, Norm};
use crate::validation::stroke_count::{compare_stroke_count, StrokeCountResult};
use crate::validation::stroke_dtw::{compare_kanji_direction, KanjiDirectionResult};
use crate::validation::stroke_relative_position::{compare_kanji_composition, KanjiCompositionResult};
use crate::validation::stroke_rms::{compare_kanji_shape, KanjiShapeResult};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ValidationThresholds {
    pub dtw: f32,
    pub rms: f32,
    pub position: f32,
    pub relative_angle: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct GlobalValidationResult {
    pub is_valid: bool,
    pub score: Norm,
    pub thresholds: ValidationThresholds,
    pub reference_raw: Kanji,
    pub user_raw: Kanji,
    pub stroke_count: StrokeCountResult,
    pub dtw: KanjiDirectionResult,
    pub rms: KanjiShapeResult,
    pub composition: KanjiCompositionResult,
    pub max_errors: GlobalErrors,
}

#[derive(Debug, Clone, Serialize)]
pub struct GlobalErrors {
    pub dtw: f32,
    pub rms: f32,
    pub position: f32,
    pub relative_angle: f32,
}

impl GlobalValidationResult {
    pub fn to_json_value(&self) -> serde_json::Result<serde_json::Value> {
        serde_json::to_value(self)
    }

    pub fn to_json_string(&self) -> serde_json::Result<String> {
        serde_json::to_string(self)
    }

    pub fn to_json_pretty_string(&self) -> serde_json::Result<String> {
        serde_json::to_string_pretty(self)
    }
}

pub fn validate_kanji(
    input: &Kanji,
    reference: &Kanji,
    sampling_resolution: usize,
    thresholds: &ValidationThresholds,
) -> KanjiResult<GlobalValidationResult> {
    let stroke_count = compare_stroke_count(input, reference);
    let dtw = compare_kanji_direction(input, reference, sampling_resolution)?;
    let rms = compare_kanji_shape(input, reference, sampling_resolution)?;
    let composition = compare_kanji_composition(input, reference)?;

    let max_dtw = dtw
        .strokes
        .iter()
        .map(|s| *s.dtw_error)
        .fold(0.0f32, f32::max);

    let max_rms = rms.strokes.iter().map(|s| *s.rms).fold(0.0f32, f32::max);

    let max_position = composition
        .stroke_details
        .iter()
        .map(|s| (*s.start.distance).max(*s.end.distance))
        .fold(0.0f32, f32::max);

    let max_relative_angle = composition
        .angle_details
        .iter()
        .map(|a| *a.weighted_diff)
        .fold(0.0f32, f32::max);

    let is_valid = stroke_count.is_correct()
        && max_dtw <= thresholds.dtw
        && max_rms <= thresholds.rms
        && max_position <= thresholds.position
        && max_relative_angle <= thresholds.relative_angle;

    let score = if is_valid {
        let q_dtw = 1.0 - (max_dtw / thresholds.dtw);
        let q_rms = 1.0 - (max_rms / thresholds.rms);
        let q_pos = 1.0 - (max_position / thresholds.position);
        let q_ang = 1.0 - (max_relative_angle / thresholds.relative_angle);

        let geometric_mean = (q_dtw * q_rms * q_pos * q_ang).powf(0.25);

        Norm::try_new(geometric_mean.clamp(0.0, 1.0))
            .expect("Geometric mean should be within [0, 1]")
    } else {
        Norm::try_new(0.0).unwrap()
    };

    Ok(GlobalValidationResult {
        is_valid,
        score,
        thresholds: thresholds.clone(),
        reference_raw: reference.clone(),
        user_raw: input.clone(),
        stroke_count,
        dtw,
        rms,
        composition,
        max_errors: GlobalErrors {
            dtw: max_dtw,
            rms: max_rms,
            position: max_position,
            relative_angle: max_relative_angle,
        },
    })
}
