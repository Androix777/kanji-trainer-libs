use crate::error::{KanjiResult, KanjiTrainerError};
use crate::kanji::{Kanji, Norm};
use crate::validation::utils::interpolate_stroke;
use augurs_dtw::{Distance, Dtw};
use serde::Serialize;

struct AngularDist;
impl Distance for AngularDist {
    fn distance(&self, a: f64, b: f64) -> f64 {
        let diff = (a - b).abs();
        let circle = 2.0 * std::f64::consts::PI;
        diff.min(circle - diff)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct StrokeDirectionDetails {
    pub dtw_error: Norm,
    pub user_angles: Vec<f32>,
    pub reference_angles: Vec<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KanjiDirectionResult {
    pub strokes: Vec<StrokeDirectionDetails>,
}

pub fn compare_kanji_direction(
    input: &Kanji,
    reference: &Kanji,
    sampling_resolution: usize,
) -> KanjiResult<KanjiDirectionResult> {
    if sampling_resolution < 3 {
        return Err(KanjiTrainerError::InvalidSamplingResolution);
    }

    let input_strokes = input.strokes().as_ref();
    let ref_strokes = reference.strokes().as_ref();

    let mut stroke_results = Vec::with_capacity(input_strokes.len());

    let strokes_to_compare = input_strokes.iter().zip(ref_strokes.iter());

    for (u_stroke, r_stroke) in strokes_to_compare {
        let u_interp = interpolate_stroke(u_stroke.points(), sampling_resolution);
        let r_interp = interpolate_stroke(r_stroke.points(), sampling_resolution);

        let u_angles = points_to_angles(&u_interp);
        let r_angles = points_to_angles(&r_interp);

        let u_angles_f64: Vec<f64> = u_angles.iter().map(|&x| x as f64).collect();
        let r_angles_f64: Vec<f64> = r_angles.iter().map(|&x| x as f64).collect();

        let dtw_dist = Dtw::new(AngularDist).distance(&u_angles_f64, &r_angles_f64);

        let max_possible_dist = std::f64::consts::PI * r_angles.len() as f64;
        let normalized_error = (dtw_dist / max_possible_dist).clamp(0.0, 1.0) as f32;
        let dtw_error =
            Norm::try_new(normalized_error).map_err(|_| KanjiTrainerError::OutOfRange {
                value: normalized_error,
                min: 0.0,
                max: 1.0,
            })?;

        stroke_results.push(StrokeDirectionDetails {
            dtw_error,
            user_angles: u_angles,
            reference_angles: r_angles,
        });
    }

    Ok(KanjiDirectionResult {
        strokes: stroke_results,
    })
}

fn points_to_angles(points: &[(f32, f32)]) -> Vec<f32> {
    points
        .windows(2)
        .map(|w| {
            let dx = w[1].0 - w[0].0;
            let dy = w[1].1 - w[0].1;
            dy.atan2(dx)
        })
        .collect()
}
