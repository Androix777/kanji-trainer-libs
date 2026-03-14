use thiserror::Error;
use std::path::PathBuf;

#[derive(Error, Debug)]
pub enum KanjiTrainerError {
    #[error("Kanji character '{0}' (codepoint {1}) not found in database")]
    NotFound(char, String),

    #[error("Failed to read SVG file at {path}")]
    Io {
        #[source]
        source: std::io::Error,
        path: PathBuf,
    },

    #[error("Invalid SVG structure: {0}")]
    InvalidSvg(String),

    #[error("XML parsing failed: {source}")]
    XmlParse {
        #[from]
        source: roxmltree::Error,
    },

    #[error("Malformed SVG path data: {0}")]
    PathDataMalformed(String),

    #[error("Invalid coordinate value ({0} {1}) for point")]
    InvalidPoint(f32, f32),

    #[error("Kanji has no strokes: it's empty")]
    EmptyKanji,

    #[error("Internal concurrency error: thread panicked while holding a lock")]
    LockPoisoned,

    #[error("Need at least 2 points for stroke")]
    InvalidStroke,

    #[error("Need at least 2 points for sampling resolution")]
    InvalidSamplingResolution,

    #[error("Invalid or missing kanji folder: {0}")]
    InvalidKanjiFolder(PathBuf), 

    #[error("Value {value} is out of expected range [{min}, {max}]")]
    OutOfRange {
        value: f32,
        min: f32,
        max: f32,
    },

}

pub type KanjiResult<T = ()> = Result<T, KanjiTrainerError>;
