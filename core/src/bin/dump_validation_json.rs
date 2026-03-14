use std::error::Error;
use std::fs;
use std::path::PathBuf;

use kanji_trainer::validation::global::ValidationThresholds;
use kanji_trainer::validator::KanjiValidator;

fn main() -> Result<(), Box<dyn Error>> {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Cannot resolve repository root")?
        .to_path_buf();
    let kanji_dir = repo_root.join("data").join("kanji");
    let out_path = repo_root.join("global-validation-result.sample.json");

    let validator = KanjiValidator::new(&kanji_dir, None)?;
    let kanji_char = '日';
    let reference = validator.get_kanji(kanji_char)?;
    let user = reference.clone();

    let thresholds = ValidationThresholds {
        dtw: 0.25,
        rms: 0.2,
        position: 0.25,
        relative_angle: 0.5,
    };

    let result = validator.validate_kanji(kanji_char, &user, 20, &thresholds)?;
    let json = result.to_json_pretty_string()?;
    fs::write(&out_path, json)?;

    println!("Wrote {}", out_path.display());
    Ok(())
}
