use nutype::nutype;
use serde::ser::{Serialize, SerializeStruct, Serializer};

use crate::error::{KanjiResult, KanjiTrainerError};

#[nutype(
    validate(
        greater_or_equal = 0.0,
        less_or_equal = 1.0,
        finite
    ),
    derive(Debug, Clone, Copy, PartialEq, PartialOrd, Deref)
)]
pub struct Norm(f32);

#[derive(Debug, Clone, PartialEq)]
pub struct Point {
    pub x: Norm,
    pub y: Norm,
}

impl TryFrom<(f32, f32)> for Point {
    type Error = KanjiTrainerError;

    fn try_from((x, y): (f32, f32)) -> KanjiResult<Self> {
        let nx = Norm::try_new(x).map_err(|_| KanjiTrainerError::InvalidPoint(x, y))?;
        let ny = Norm::try_new(y).map_err(|_| KanjiTrainerError::InvalidPoint(x, y))?;

        Ok(Point { x: nx, y: ny })
    }
}

impl TryFrom<(f64, f64)> for Point {
    type Error = KanjiTrainerError;

    fn try_from((x, y): (f64, f64)) -> KanjiResult<Self> {
        let x_f = x as f32;
        let y_f = y as f32;

        let nx = Norm::try_new(x_f).map_err(|_| KanjiTrainerError::InvalidPoint(x_f, y_f))?;
        let ny = Norm::try_new(y_f).map_err(|_| KanjiTrainerError::InvalidPoint(x_f, y_f))?;

        Ok(Point { x: nx, y: ny })
    }
}

impl Serialize for Norm {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_f32(**self)
    }
}

impl Serialize for Point {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("Point", 2)?;
        state.serialize_field("x", &self.x)?;
        state.serialize_field("y", &self.y)?;
        state.end()
    }
}

#[nutype(
    validate(predicate = |v| v.len() >= 2),
    derive(Debug, Clone, PartialEq, Deref, AsRef)
)]
pub struct StrokePoints(Vec<Point>);

#[nutype(
    validate(predicate = |v| !v.is_empty()),
    derive(Debug, Clone, Deref, AsRef)
)]
pub struct KanjiStrokes(Vec<Stroke>);

#[derive(Debug, Clone)]
pub struct Stroke {
    points: StrokePoints,
    pub label_pos: Option<Point>,
}

#[derive(Debug, Clone)]
pub struct Kanji {
    strokes: KanjiStrokes,
}

impl Stroke {
    pub fn try_new(points: Vec<Point>) -> KanjiResult<Self> {
        let points = StrokePoints::try_new(points).map_err(|_| KanjiTrainerError::InvalidStroke)?;
        Ok(Self {
            points,
            label_pos: None,
        })
    }

    pub fn with_label_pos(mut self, pos: Point) -> Self {
        self.label_pos = Some(pos);
        self
    }

    pub fn points(&self) -> &StrokePoints {
        &self.points
    }
}

impl Serialize for Stroke {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("Stroke", 2)?;
        state.serialize_field("points", self.points().as_ref())?;
        state.serialize_field("label_pos", &self.label_pos)?;
        state.end()
    }
}

impl Kanji {
    pub fn try_new(strokes: Vec<Stroke>) -> KanjiResult<Self> {
        let strokes = KanjiStrokes::try_new(strokes).map_err(|_| KanjiTrainerError::EmptyKanji)?;
        Ok(Self { strokes })
    }

    pub fn strokes(&self) -> &KanjiStrokes {
        &self.strokes
    }

    pub fn stroke_count(&self) -> usize {
        self.strokes.len()
    }
}

impl Serialize for Kanji {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("Kanji", 1)?;
        state.serialize_field("strokes", self.strokes().as_ref())?;
        state.end()
    }
}
