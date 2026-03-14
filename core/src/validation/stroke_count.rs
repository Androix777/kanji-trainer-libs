use crate::kanji::Kanji;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct StrokeCountResult {
    pub expected: usize,
    pub actual: usize,
}

impl StrokeCountResult {
    pub fn is_correct(&self) -> bool {
        self.expected == self.actual
    }
}

pub fn compare_stroke_count(input: &Kanji, reference: &Kanji) -> StrokeCountResult {
    StrokeCountResult {
        expected: reference.stroke_count(),
        actual: input.stroke_count(),
    }
}
