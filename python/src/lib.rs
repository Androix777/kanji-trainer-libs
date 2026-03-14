use std::path::PathBuf;

use kanji_core::error::KanjiTrainerError;
use kanji_core::validation::global::ValidationThresholds;
use kanji_core::validation::stroke_dtw::compare_kanji_direction;
use kanji_core::validation::stroke_rms::compare_kanji_shape;
use pyo3::exceptions::{PyIOError, PyRuntimeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::PyDict;

use kanji_core::kanji::{Kanji, Point, Stroke};
use kanji_core::validator::{
    CacheStats as CoreCacheStats, DEFAULT_CACHE_SIZE, KanjiValidator as CoreKanjiValidator,
};

fn to_py_err(err: KanjiTrainerError) -> PyErr {
    let msg = err.to_string();
    match err {
        KanjiTrainerError::Io { .. } => PyIOError::new_err(msg),
        KanjiTrainerError::InvalidKanjiFolder(..) => PyIOError::new_err(msg),
        KanjiTrainerError::LockPoisoned => PyRuntimeError::new_err(msg),
        _ => PyValueError::new_err(msg),
    }
}

fn convert_raw_strokes(raw_strokes: Vec<Vec<(f64, f64)>>) -> PyResult<Kanji> {
    let mut strokes = Vec::with_capacity(raw_strokes.len());

    for raw_stroke in raw_strokes {
        let mut points = Vec::with_capacity(raw_stroke.len());
        for (x, y) in raw_stroke {
            let p = Point::try_from((x, y)).map_err(to_py_err)?;
            points.push(p);
        }

        let stroke = Stroke::try_new(points).map_err(to_py_err)?;
        strokes.push(stroke);
    }

    Kanji::try_new(strokes).map_err(to_py_err)
}

#[pyclass]
#[derive(Clone)]
pub struct StrokeCountResult {
    #[pyo3(get)]
    expected: usize,
    #[pyo3(get)]
    actual: usize,
}

#[pymethods]
impl StrokeCountResult {
    #[getter]
    fn is_correct(&self) -> bool {
        self.expected == self.actual
    }

    fn __repr__(&self) -> String {
        format!(
            "StrokeCountResult(expected={}, actual={}, is_correct={})",
            self.expected,
            self.actual,
            self.is_correct()
        )
    }
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct RawStroke {
    #[pyo3(get)]
    pub points: Vec<(f64, f64)>,
    #[pyo3(get)]
    pub label_pos: Option<(f64, f64)>,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct StrokeShapeDetails {
    #[pyo3(get)]
    pub rms: f32,
    #[pyo3(get)]
    pub user_points: Vec<(f64, f64)>,
    #[pyo3(get)]
    pub reference_points: Vec<(f64, f64)>,
}

#[pyclass]
#[derive(Clone)]
pub struct KanjiShapeResult {
    #[pyo3(get)]
    pub strokes: Vec<StrokeShapeDetails>,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct StrokeDirectionDetails {
    #[pyo3(get)]
    pub dtw_error: f32,
    #[pyo3(get)]
    pub user_angles: Vec<f32>,
    #[pyo3(get)]
    pub reference_angles: Vec<f32>,
}

#[pyclass]
#[derive(Clone)]
pub struct KanjiDirectionResult {
    #[pyo3(get)]
    pub strokes: Vec<StrokeDirectionDetails>,
}

#[pyclass]
#[derive(Debug, Clone, Copy)]
pub enum PyPointType {
    Start = 0,
    End = 1,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyPointDeviation {
    #[pyo3(get)]
    pub expected: (f64, f64),
    #[pyo3(get)]
    pub actual: (f64, f64),
    #[pyo3(get)]
    pub deviation_vector: (f64, f64),
    #[pyo3(get)]
    pub distance: f32,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyAngleDeviation {
    #[pyo3(get)]
    pub stroke_indices: (usize, usize),
    #[pyo3(get)]
    pub point_types: (PyPointType, PyPointType),
    #[pyo3(get)]
    pub expected_angle: f32,
    #[pyo3(get)]
    pub actual_angle: f32,
    #[pyo3(get)]
    pub angle_diff: f32,
    #[pyo3(get)]
    pub weight: f32,
    #[pyo3(get)]
    pub weighted_diff: f32,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyStrokeCompositionDetails {
    #[pyo3(get)]
    pub stroke_idx: usize,
    #[pyo3(get)]
    pub start: PyPointDeviation,
    #[pyo3(get)]
    pub end: PyPointDeviation,
}

#[pyclass]
#[derive(Clone)]
pub struct KanjiCompositionResult {
    #[pyo3(get)]
    pub stroke_details: Vec<PyStrokeCompositionDetails>,
    #[pyo3(get)]
    pub angle_details: Vec<PyAngleDeviation>,
    #[pyo3(get)]
    pub alignment: PyCompositionAlignment,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyAffineTransform {
    #[pyo3(get)]
    pub scale_x: f32,
    #[pyo3(get)]
    pub scale_y: f32,
    #[pyo3(get)]
    pub translate_x: f32,
    #[pyo3(get)]
    pub translate_y: f32,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyCompositionAlignment {
    #[pyo3(get)]
    pub user_to_aligned: PyAffineTransform,
    #[pyo3(get)]
    pub reference_to_aligned: PyAffineTransform,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyGlobalErrors {
    #[pyo3(get)]
    pub dtw: f32,
    #[pyo3(get)]
    pub rms: f32,
    #[pyo3(get)]
    pub position: f32,
    #[pyo3(get)]
    pub relative_angle: f32,
}

#[pyclass]
#[derive(Debug, Clone)]
pub struct PyValidationThresholds {
    #[pyo3(get, set)]
    pub dtw: f32,
    #[pyo3(get, set)]
    pub rms: f32,
    #[pyo3(get, set)]
    pub position: f32,
    #[pyo3(get, set)]
    pub relative_angle: f32,
}

#[pymethods]
impl PyValidationThresholds {
    #[new]
    fn new(dtw: f32, rms: f32, position: f32, relative_angle: f32) -> Self {
        Self {
            dtw,
            rms,
            position,
            relative_angle,
        }
    }
}

#[pyclass]
#[derive(Clone)]
pub struct GlobalValidationResult {
    #[pyo3(get)]
    pub is_valid: bool,
    #[pyo3(get)]
    pub score: f32,
    #[pyo3(get)]
    pub thresholds: PyValidationThresholds,
    #[pyo3(get)]
    pub reference_raw: Vec<RawStroke>,
    #[pyo3(get)]
    pub user_raw: Vec<RawStroke>,
    #[pyo3(get)]
    pub stroke_count: StrokeCountResult,
    #[pyo3(get)]
    pub dtw: KanjiDirectionResult,
    #[pyo3(get)]
    pub rms: KanjiShapeResult,
    #[pyo3(get)]
    pub composition: KanjiCompositionResult,
    #[pyo3(get)]
    pub max_errors: PyGlobalErrors,
}

fn point_to_dict(py: Python<'_>, point: (f64, f64)) -> PyResult<Py<PyDict>> {
    let d = PyDict::new(py);
    d.set_item("x", point.0)?;
    d.set_item("y", point.1)?;
    Ok(d.unbind())
}

fn label_pos_to_object(py: Python<'_>, label_pos: Option<(f64, f64)>) -> PyResult<PyObject> {
    match label_pos {
        Some(p) => Ok(point_to_dict(py, p)?.into_any()),
        None => Ok(py.None()),
    }
}

fn raw_stroke_to_dict(py: Python<'_>, stroke: &RawStroke) -> PyResult<Py<PyDict>> {
    let d = PyDict::new(py);
    let points = stroke
        .points
        .iter()
        .map(|p| point_to_dict(py, *p))
        .collect::<PyResult<Vec<_>>>()?;
    d.set_item("points", points)?;
    d.set_item("label_pos", label_pos_to_object(py, stroke.label_pos)?)?;
    Ok(d.unbind())
}

fn point_deviation_to_dict(py: Python<'_>, d: &PyPointDeviation) -> PyResult<Py<PyDict>> {
    let out = PyDict::new(py);
    out.set_item("expected", vec![d.expected.0, d.expected.1])?;
    out.set_item("actual", vec![d.actual.0, d.actual.1])?;
    out.set_item("deviation_vector", vec![d.deviation_vector.0, d.deviation_vector.1])?;
    out.set_item("distance", d.distance)?;
    Ok(out.unbind())
}

fn point_type_to_str(pt: PyPointType) -> &'static str {
    match pt {
        PyPointType::Start => "Start",
        PyPointType::End => "End",
    }
}

#[pymethods]
impl GlobalValidationResult {
    fn to_dict(&self, py: Python<'_>) -> PyResult<Py<PyDict>> {
        let out = PyDict::new(py);
        out.set_item("is_valid", self.is_valid)?;
        out.set_item("score", self.score)?;
        let thresholds = PyDict::new(py);
        thresholds.set_item("dtw", self.thresholds.dtw)?;
        thresholds.set_item("rms", self.thresholds.rms)?;
        thresholds.set_item("position", self.thresholds.position)?;
        thresholds.set_item("relative_angle", self.thresholds.relative_angle)?;
        out.set_item("thresholds", thresholds)?;

        let reference_raw = PyDict::new(py);
        let reference_strokes = self
            .reference_raw
            .iter()
            .map(|s| raw_stroke_to_dict(py, s))
            .collect::<PyResult<Vec<_>>>()?;
        reference_raw.set_item("strokes", reference_strokes)?;
        out.set_item("reference_raw", reference_raw)?;

        let user_raw = PyDict::new(py);
        let user_strokes = self
            .user_raw
            .iter()
            .map(|s| raw_stroke_to_dict(py, s))
            .collect::<PyResult<Vec<_>>>()?;
        user_raw.set_item("strokes", user_strokes)?;
        out.set_item("user_raw", user_raw)?;

        let stroke_count = PyDict::new(py);
        stroke_count.set_item("expected", self.stroke_count.expected)?;
        stroke_count.set_item("actual", self.stroke_count.actual)?;
        out.set_item("stroke_count", stroke_count)?;

        let dtw = PyDict::new(py);
        let dtw_strokes = self
            .dtw
            .strokes
            .iter()
            .map(|s| {
                let d = PyDict::new(py);
                d.set_item("dtw_error", s.dtw_error)?;
                d.set_item("user_angles", s.user_angles.clone())?;
                d.set_item("reference_angles", s.reference_angles.clone())?;
                Ok(d.unbind())
            })
            .collect::<PyResult<Vec<Py<PyDict>>>>()?;
        dtw.set_item("strokes", dtw_strokes)?;
        out.set_item("dtw", dtw)?;

        let rms = PyDict::new(py);
        let rms_strokes = self
            .rms
            .strokes
            .iter()
            .map(|s| {
                let d = PyDict::new(py);
                let user_points = s
                    .user_points
                    .iter()
                    .map(|p| point_to_dict(py, *p))
                    .collect::<PyResult<Vec<_>>>()?;
                let reference_points = s
                    .reference_points
                    .iter()
                    .map(|p| point_to_dict(py, *p))
                    .collect::<PyResult<Vec<_>>>()?;
                d.set_item("rms", s.rms)?;
                d.set_item("user_points_normalized", user_points)?;
                d.set_item("reference_points_normalized", reference_points)?;
                Ok(d.unbind())
            })
            .collect::<PyResult<Vec<Py<PyDict>>>>()?;
        rms.set_item("strokes", rms_strokes)?;
        out.set_item("rms", rms)?;

        let composition = PyDict::new(py);
        let stroke_details = self
            .composition
            .stroke_details
            .iter()
            .map(|s| {
                let d = PyDict::new(py);
                d.set_item("stroke_idx", s.stroke_idx)?;
                d.set_item("start", point_deviation_to_dict(py, &s.start)?)?;
                d.set_item("end", point_deviation_to_dict(py, &s.end)?)?;
                Ok(d.unbind())
            })
            .collect::<PyResult<Vec<Py<PyDict>>>>()?;
        composition.set_item("stroke_details", stroke_details)?;

        let angle_details = self
            .composition
            .angle_details
            .iter()
            .map(|a| {
                let d = PyDict::new(py);
                d.set_item("stroke_indices", vec![a.stroke_indices.0, a.stroke_indices.1])?;
                d.set_item(
                    "point_types",
                    vec![
                        point_type_to_str(a.point_types.0),
                        point_type_to_str(a.point_types.1),
                    ],
                )?;
                d.set_item("expected_angle", a.expected_angle)?;
                d.set_item("actual_angle", a.actual_angle)?;
                d.set_item("angle_diff", a.angle_diff)?;
                d.set_item("weight", a.weight)?;
                d.set_item("weighted_diff", a.weighted_diff)?;
                Ok(d.unbind())
            })
            .collect::<PyResult<Vec<Py<PyDict>>>>()?;
        composition.set_item("angle_details", angle_details)?;

        let alignment = PyDict::new(py);
        let user_to_aligned = PyDict::new(py);
        user_to_aligned.set_item("scale_x", self.composition.alignment.user_to_aligned.scale_x)?;
        user_to_aligned.set_item("scale_y", self.composition.alignment.user_to_aligned.scale_y)?;
        user_to_aligned.set_item(
            "translate_x",
            self.composition.alignment.user_to_aligned.translate_x,
        )?;
        user_to_aligned.set_item(
            "translate_y",
            self.composition.alignment.user_to_aligned.translate_y,
        )?;
        alignment.set_item("user_to_aligned", user_to_aligned)?;

        let reference_to_aligned = PyDict::new(py);
        reference_to_aligned.set_item(
            "scale_x",
            self.composition.alignment.reference_to_aligned.scale_x,
        )?;
        reference_to_aligned.set_item(
            "scale_y",
            self.composition.alignment.reference_to_aligned.scale_y,
        )?;
        reference_to_aligned.set_item(
            "translate_x",
            self.composition.alignment.reference_to_aligned.translate_x,
        )?;
        reference_to_aligned.set_item(
            "translate_y",
            self.composition.alignment.reference_to_aligned.translate_y,
        )?;
        alignment.set_item("reference_to_aligned", reference_to_aligned)?;
        composition.set_item("alignment", alignment)?;
        out.set_item("composition", composition)?;

        let max_errors = PyDict::new(py);
        max_errors.set_item("dtw", self.max_errors.dtw)?;
        max_errors.set_item("rms", self.max_errors.rms)?;
        max_errors.set_item("position", self.max_errors.position)?;
        max_errors.set_item("relative_angle", self.max_errors.relative_angle)?;
        out.set_item("max_errors", max_errors)?;

        Ok(out.unbind())
    }

    #[pyo3(signature = (pretty=false))]
    fn to_json(&self, py: Python<'_>, pretty: bool) -> PyResult<String> {
        let json = py.import("json")?;
        let payload = self.to_dict(py)?;
        let kwargs = PyDict::new(py);
        kwargs.set_item("ensure_ascii", false)?;
        if pretty {
            kwargs.set_item("indent", 2)?;
        }
        json.call_method("dumps", (payload,), Some(&kwargs))?.extract()
    }
}

#[pyclass]
#[derive(Clone)]
pub struct CacheStats {
    #[pyo3(get)]
    size: usize,
    #[pyo3(get)]
    capacity: usize,
    #[pyo3(get)]
    hits: u64,
    #[pyo3(get)]
    misses: u64,
    #[pyo3(get)]
    available_kanji_count: usize,
}

#[pymethods]
impl CacheStats {
    #[getter]
    fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 {
            0.0
        } else {
            self.hits as f64 / total as f64
        }
    }

    fn __repr__(&self) -> String {
        format!(
            "CacheStats(size={}, capacity={}, hits={}, misses={}, hit_rate={:.2}, available_kanji={})",
            self.size,
            self.capacity,
            self.hits,
            self.misses,
            self.hit_rate(),
            self.available_kanji_count
        )
    }
}

impl From<CoreCacheStats> for CacheStats {
    fn from(stats: CoreCacheStats) -> Self {
        Self {
            size: stats.size,
            capacity: stats.capacity,
            hits: stats.hits,
            misses: stats.misses,
            available_kanji_count: stats.available_kanji_count,
        }
    }
}

fn map_kanji_to_raw_strokes(kanji: &Kanji) -> Vec<RawStroke> {
    kanji
        .strokes()
        .iter()
        .map(|s| RawStroke {
            points: s.points().iter().map(|p| (*p.x as f64, *p.y as f64)).collect(),
            label_pos: s.label_pos.as_ref().map(|p| (*p.x as f64, *p.y as f64)),
        })
        .collect()
}

#[pyclass]
pub struct KanjiValidator {
    inner: CoreKanjiValidator<PathBuf>,
}

#[pymethods]
impl KanjiValidator {
    #[new]
    #[pyo3(signature = (kanji_vg_dir, cache_size=None))]
    fn new(kanji_vg_dir: PathBuf, cache_size: Option<usize>) -> PyResult<Self> {
        let inner = CoreKanjiValidator::new(kanji_vg_dir, cache_size).map_err(to_py_err)?;

        Ok(Self { inner })
    }

    fn get_kanji(&self, kanji: &str) -> PyResult<Vec<RawStroke>> {
        let kanji_char = validate_kanji_char(kanji)?;
        let kanji_obj = self.inner.get_kanji(kanji_char).map_err(to_py_err)?;

        Ok(map_kanji_to_raw_strokes(&kanji_obj))
    }

    fn check_stroke_count(
        &self,
        kanji: &str,
        user_strokes: Vec<Vec<(f64, f64)>>,
    ) -> PyResult<StrokeCountResult> {
        let kanji_char = validate_kanji_char(kanji)?;
        let user_kanji = convert_raw_strokes(user_strokes)?;

        let result = self
            .inner
            .check_stroke_count(kanji_char, &user_kanji)
            .map_err(to_py_err)?;

        Ok(StrokeCountResult {
            expected: result.expected,
            actual: result.actual,
        })
    }

    #[pyo3(signature = (kanji, user_strokes, sampling_resolution=10))]
    fn check_kanji_shape(
        &self,
        kanji: &str,
        user_strokes: Vec<Vec<(f64, f64)>>,
        sampling_resolution: usize,
    ) -> PyResult<KanjiShapeResult> {
        let kanji_char = validate_kanji_char(kanji)?;
        let user_kanji = convert_raw_strokes(user_strokes)?;

        let reference_kanji = self.inner.get_kanji(kanji_char).map_err(to_py_err)?;

        let core_result = compare_kanji_shape(
            &user_kanji,
            &reference_kanji,
            sampling_resolution,
        )
        .map_err(to_py_err)?;

        let strokes = core_result
            .strokes
            .into_iter()
            .map(|s| {
                let user_points = s
                    .user_points_normalized
                    .iter()
                    .map(|p| (*p.x as f64, *p.y as f64))
                    .collect();

                let reference_points = s
                    .reference_points_normalized
                    .iter()
                    .map(|p| (*p.x as f64, *p.y as f64))
                    .collect();

                StrokeShapeDetails {
                    rms: *s.rms,
                    user_points,
                    reference_points,
                }
            })
            .collect();

        Ok(KanjiShapeResult { strokes })
    }

    #[pyo3(signature = (kanji, user_strokes, sampling_resolution=20))]
    fn check_kanji_direction(
        &self,
        kanji: &str,
        user_strokes: Vec<Vec<(f64, f64)>>,
        sampling_resolution: usize,
    ) -> PyResult<KanjiDirectionResult> {
        let kanji_char = validate_kanji_char(kanji)?;
        let user_kanji = convert_raw_strokes(user_strokes)?;

        let reference_kanji = self.inner.get_kanji(kanji_char).map_err(to_py_err)?;

        let core_result =
            compare_kanji_direction(&user_kanji, &reference_kanji, sampling_resolution)
                .map_err(to_py_err)?;

        let strokes = core_result
            .strokes
            .into_iter()
            .map(|s| StrokeDirectionDetails {
                dtw_error: *s.dtw_error,
                user_angles: s.user_angles,
                reference_angles: s.reference_angles,
            })
            .collect();

        Ok(KanjiDirectionResult { strokes })
    }

    fn check_kanji_composition(
        &self,
        kanji: &str,
        user_strokes: Vec<Vec<(f64, f64)>>,
    ) -> PyResult<KanjiCompositionResult> {
        use kanji_core::validation::stroke_relative_position::{
            PointType, compare_kanji_composition,
        };

        let kanji_char = validate_kanji_char(kanji)?;
        let user_kanji = convert_raw_strokes(user_strokes)?;
        let reference_kanji = self.inner.get_kanji(kanji_char).map_err(to_py_err)?;

        let core_result =
            compare_kanji_composition(&user_kanji, &reference_kanji).map_err(to_py_err)?;
        let kanji_core::validation::stroke_relative_position::KanjiCompositionResult {
            stroke_details,
            angle_details,
            alignment,
        } = core_result;

        let map_point_type = |pt: PointType| match pt {
            PointType::Start => PyPointType::Start,
            PointType::End => PyPointType::End,
        };

        let map_dev = |d: &kanji_core::validation::stroke_relative_position::PointDeviation| {
            PyPointDeviation {
                expected: (d.expected.0 as f64, d.expected.1 as f64),
                actual: (d.actual.0 as f64, d.actual.1 as f64),
                deviation_vector: (d.deviation_vector.0 as f64, d.deviation_vector.1 as f64),
                distance: *d.distance,
            }
        };

        let strokes = stroke_details
            .into_iter()
            .map(|s| PyStrokeCompositionDetails {
                stroke_idx: s.stroke_idx,
                start: map_dev(&s.start),
                end: map_dev(&s.end),
            })
            .collect();

        let angles = angle_details
            .into_iter()
            .map(|a| PyAngleDeviation {
                stroke_indices: a.stroke_indices,
                point_types: (
                    map_point_type(a.point_types.0),
                    map_point_type(a.point_types.1),
                ),
                expected_angle: a.expected_angle,
                actual_angle: a.actual_angle,
                angle_diff: *a.angle_diff,
                weight: a.weight,
                weighted_diff: *a.weighted_diff,
            })
            .collect();

        let alignment = PyCompositionAlignment {
            user_to_aligned: PyAffineTransform {
                scale_x: alignment.user_to_aligned.scale_x,
                scale_y: alignment.user_to_aligned.scale_y,
                translate_x: alignment.user_to_aligned.translate_x,
                translate_y: alignment.user_to_aligned.translate_y,
            },
            reference_to_aligned: PyAffineTransform {
                scale_x: alignment.reference_to_aligned.scale_x,
                scale_y: alignment.reference_to_aligned.scale_y,
                translate_x: alignment.reference_to_aligned.translate_x,
                translate_y: alignment.reference_to_aligned.translate_y,
            },
        };

        Ok(KanjiCompositionResult {
            stroke_details: strokes,
            angle_details: angles,
            alignment,
        })

    }

    #[pyo3(signature = (kanji, user_strokes, thresholds, sampling_resolution=20))]
    fn validate_kanji(
        &self,
        kanji: &str,
        user_strokes: Vec<Vec<(f64, f64)>>,
        thresholds: PyValidationThresholds,
        sampling_resolution: usize,
    ) -> PyResult<GlobalValidationResult> {
        let kanji_char = validate_kanji_char(kanji)?;
        let user_kanji = convert_raw_strokes(user_strokes)?;

        let core_thresholds = ValidationThresholds {
            dtw: thresholds.dtw,
            rms: thresholds.rms,
            position: thresholds.position,
            relative_angle: thresholds.relative_angle,
        };

        let core_result = self
            .inner
            .validate_kanji(kanji_char, &user_kanji, sampling_resolution, &core_thresholds)
            .map_err(to_py_err)?;
        let kanji_core::validation::global::GlobalValidationResult {
            is_valid,
            score,
            thresholds: core_thresholds,
            reference_raw,
            user_raw,
            stroke_count: core_stroke_count,
            dtw: core_dtw,
            rms: core_rms,
            composition: core_composition,
            max_errors: core_max_errors,
        } = core_result;

        let stroke_count = StrokeCountResult {
            expected: core_stroke_count.expected,
            actual: core_stroke_count.actual,
        };

        let dtw = KanjiDirectionResult {
            strokes: core_dtw
                .strokes
                .into_iter()
                .map(|s| StrokeDirectionDetails {
                    dtw_error: *s.dtw_error,
                    user_angles: s.user_angles,
                    reference_angles: s.reference_angles,
                })
                .collect(),
        };

        let rms = KanjiShapeResult {
            strokes: core_rms
                .strokes
                .into_iter()
                .map(|s| {
                    let user_points = s
                        .user_points_normalized
                        .iter()
                        .map(|p| (*p.x as f64, *p.y as f64))
                        .collect();

                    let reference_points = s
                        .reference_points_normalized
                        .iter()
                        .map(|p| (*p.x as f64, *p.y as f64))
                        .collect();

                    StrokeShapeDetails {
                        rms: *s.rms,
                        user_points,
                        reference_points,
                    }
                })
                .collect(),
        };

        let composition = {
            use kanji_core::validation::stroke_relative_position::PointType;
            let kanji_core::validation::stroke_relative_position::KanjiCompositionResult {
                stroke_details,
                angle_details,
                alignment,
            } = core_composition;

            let map_point_type = |pt: PointType| match pt {
                PointType::Start => PyPointType::Start,
                PointType::End => PyPointType::End,
            };

            let map_dev = |d: &kanji_core::validation::stroke_relative_position::PointDeviation| {
                PyPointDeviation {
                    expected: (d.expected.0 as f64, d.expected.1 as f64),
                    actual: (d.actual.0 as f64, d.actual.1 as f64),
                    deviation_vector: (d.deviation_vector.0 as f64, d.deviation_vector.1 as f64),
                    distance: *d.distance,
                }
            };

            let strokes = stroke_details
                .into_iter()
                .map(|s| PyStrokeCompositionDetails {
                    stroke_idx: s.stroke_idx,
                    start: map_dev(&s.start),
                    end: map_dev(&s.end),
                })
                .collect();

            let angles = angle_details
                .into_iter()
                .map(|a| PyAngleDeviation {
                    stroke_indices: a.stroke_indices,
                    point_types: (
                        map_point_type(a.point_types.0),
                        map_point_type(a.point_types.1),
                    ),
                    expected_angle: a.expected_angle,
                    actual_angle: a.actual_angle,
                    angle_diff: *a.angle_diff,
                    weight: a.weight,
                    weighted_diff: *a.weighted_diff,
                })
                .collect();

            let alignment = PyCompositionAlignment {
                user_to_aligned: PyAffineTransform {
                    scale_x: alignment.user_to_aligned.scale_x,
                    scale_y: alignment.user_to_aligned.scale_y,
                    translate_x: alignment.user_to_aligned.translate_x,
                    translate_y: alignment.user_to_aligned.translate_y,
                },
                reference_to_aligned: PyAffineTransform {
                    scale_x: alignment.reference_to_aligned.scale_x,
                    scale_y: alignment.reference_to_aligned.scale_y,
                    translate_x: alignment.reference_to_aligned.translate_x,
                    translate_y: alignment.reference_to_aligned.translate_y,
                },
            };

            KanjiCompositionResult {
                stroke_details: strokes,
                angle_details: angles,
                alignment,
            }

        };

        let max_errors = PyGlobalErrors {
            dtw: core_max_errors.dtw,
            rms: core_max_errors.rms,
            position: core_max_errors.position,
            relative_angle: core_max_errors.relative_angle,
        };

        Ok(GlobalValidationResult {
            is_valid,
            score: *score,
            thresholds: PyValidationThresholds {
                dtw: core_thresholds.dtw,
                rms: core_thresholds.rms,
                position: core_thresholds.position,
                relative_angle: core_thresholds.relative_angle,
            },
            reference_raw: map_kanji_to_raw_strokes(&reference_raw),
            user_raw: map_kanji_to_raw_strokes(&user_raw),
            stroke_count,
            dtw,
            rms,
            composition,
            max_errors,
        })
    }

    fn get_stroke_count(&self, kanji: &str) -> PyResult<usize> {
        let kanji_char = validate_kanji_char(kanji)?;

        self.inner.get_stroke_count(kanji_char).map_err(to_py_err)
    }

    fn has_kanji(&self, kanji: &str) -> PyResult<bool> {
        let kanji_char = validate_kanji_char(kanji)?;
        self.inner.has_kanji(kanji_char).map_err(to_py_err)
    }

    fn available_kanji(&self) -> PyResult<Vec<String>> {
        let list = self.inner.available_kanji().map_err(to_py_err)?;
        Ok(list.into_iter().map(|c| c.to_string()).collect())
    }

    fn available_kanji_count(&self) -> PyResult<usize> {
        self.inner.available_kanji_count().map_err(to_py_err)
    }

    fn refresh_index(&self) -> PyResult<()> {
        self.inner.refresh_available_index().map_err(to_py_err)
    }

    fn cache_stats(&self) -> PyResult<CacheStats> {
        Ok(self.inner.cache_stats().map_err(to_py_err)?.into())
    }

    fn clear_cache(&self) -> PyResult<()> {
        self.inner.clear_cache().map_err(to_py_err)
    }

    fn __repr__(&self) -> String {
        match self.inner.cache_stats() {
            Ok(stats) => {
                format!(
                    "KanjiValidator(cache={}/{}, available={})",
                    stats.size, stats.capacity, stats.available_kanji_count
                )
            }
            Err(_) => "KanjiValidator(err: lock poisoned)".to_string(),
        }
    }

    fn __len__(&self) -> PyResult<usize> {
        self.inner.available_kanji_count().map_err(to_py_err)
    }

    fn __contains__(&self, kanji: &str) -> PyResult<bool> {
        self.has_kanji(kanji)
    }
}

fn validate_kanji_char(kanji: &str) -> PyResult<char> {
    let mut chars = kanji.chars();

    let kanji_char = chars
        .next()
        .ok_or_else(|| PyValueError::new_err("Empty kanji string"))?;

    if chars.next().is_some() {
        return Err(PyValueError::new_err(format!(
            "Expected single kanji character, got '{}'",
            kanji
        )));
    }

    Ok(kanji_char)
}

#[pymodule]
fn kanji_trainer(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add("DEFAULT_CACHE_SIZE", DEFAULT_CACHE_SIZE)?;
    m.add_class::<KanjiValidator>()?;
    m.add_class::<StrokeCountResult>()?;
    m.add_class::<CacheStats>()?;
    m.add_class::<RawStroke>()?;
    m.add_class::<KanjiShapeResult>()?;
    m.add_class::<StrokeShapeDetails>()?;
    m.add_class::<KanjiDirectionResult>()?;
    m.add_class::<StrokeDirectionDetails>()?;
    m.add_class::<KanjiCompositionResult>()?;
    m.add_class::<PyAffineTransform>()?;
    m.add_class::<PyCompositionAlignment>()?;
    m.add_class::<PyPointType>()?;
    m.add_class::<PyPointDeviation>()?;
    m.add_class::<PyAngleDeviation>()?;
    m.add_class::<PyStrokeCompositionDetails>()?;
    m.add_class::<PyGlobalErrors>()?;
    m.add_class::<PyValidationThresholds>()?;
    m.add_class::<GlobalValidationResult>()?;
    Ok(())
}
