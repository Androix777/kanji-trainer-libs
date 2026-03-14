use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use crate::error::{KanjiTrainerError, KanjiResult};
use crate::kanji::Kanji;
use crate::cache::{KanjiCache, FileCache};
use crate::validation::stroke_count::{StrokeCountResult, compare_stroke_count};
use crate::validation::global::{GlobalValidationResult, ValidationThresholds, validate_kanji};
use crate::parser::load_kanji_by_char;

pub const DEFAULT_CACHE_SIZE: usize = 100;

#[derive(Debug, Clone)]
pub struct CacheStats {
    pub size: usize,
    pub capacity: usize,
    pub hits: u64,
    pub misses: u64,
    pub available_kanji_count: usize,
}

impl CacheStats {
    pub fn hit_rate(&self) -> f64 {
        let total = self.hits + self.misses;
        if total == 0 { 0.0 } else { self.hits as f64 / total as f64 }
    }
}

pub struct KanjiValidator<P: AsRef<Path>> {
    kanji_vg_dir: P,
    cache: Mutex<KanjiCache>,
    available_index: Mutex<FileCache>,
    hits: AtomicU64,
    misses: AtomicU64,
}

impl<P: AsRef<Path>> KanjiValidator<P> {
    pub fn new(kanji_vg_dir: P, cache_size: Option<usize>) -> KanjiResult<Self> {
        let capacity = cache_size.unwrap_or(DEFAULT_CACHE_SIZE);
        let file_cache = FileCache::new(kanji_vg_dir.as_ref())?;

        Ok(Self {
            kanji_vg_dir,
            cache: Mutex::new(KanjiCache::new(capacity)),
            available_index: Mutex::new(file_cache),
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        })
    }


    fn lock_cache(&self) -> KanjiResult<std::sync::MutexGuard<'_, KanjiCache>> {
        self.cache.lock().map_err(|_| KanjiTrainerError::LockPoisoned)
    }

    fn lock_index(&self) -> KanjiResult<std::sync::MutexGuard<'_, FileCache>> {
        self.available_index.lock().map_err(|_| KanjiTrainerError::LockPoisoned)
    }


    pub fn get_kanji(&self, kanji_char: char) -> KanjiResult<Kanji> {
        {
            let mut cache = self.lock_cache()?;
            if let Some(kanji) = cache.get(kanji_char) {
                self.hits.fetch_add(1, Ordering::Relaxed);
                return Ok(kanji.clone());
            }
        }

        self.misses.fetch_add(1, Ordering::Relaxed);

        let kanji = load_kanji_by_char(kanji_char, self.kanji_vg_dir.as_ref())?;

        {
            let mut cache = self.lock_cache()?;
            cache.insert(kanji_char, kanji.clone());
        }

        Ok(kanji)
    }



    pub fn check_stroke_count(
        &self,
        kanji_char: char,
        user_kanji: &Kanji,
    ) -> KanjiResult<StrokeCountResult> {
        let reference = self.get_kanji(kanji_char)?;
        Ok(compare_stroke_count(user_kanji, &reference))
    }


    pub fn validate_kanji(
        &self,
        kanji_char: char,
        user_kanji: &Kanji,
        sampling_resolution: usize,
        thresholds: &ValidationThresholds,
    ) -> KanjiResult<GlobalValidationResult> {
        let reference = self.get_kanji(kanji_char)?;
        validate_kanji(user_kanji, &reference, sampling_resolution, thresholds)
    }


    pub fn get_stroke_count(&self, kanji_char: char) -> KanjiResult<usize> {
        let kanji = self.get_kanji(kanji_char)?;
        Ok(kanji.stroke_count())
    }


    pub fn has_kanji(&self, kanji_char: char) -> KanjiResult<bool> {
        let index = self.lock_index()?;
        Ok(index.contains(kanji_char))
    }


    pub fn available_kanji(&self) -> KanjiResult<Vec<char>> {
        let index = self.lock_index()?;
        Ok(index.get_all())
    }



    pub fn available_kanji_count(&self) -> KanjiResult<usize> {
        let index = self.lock_index()?;
        Ok(index.len())
    }


    pub fn refresh_available_index(&self) -> KanjiResult {
        let mut index = self.lock_index()?;
        index.reload(self.kanji_vg_dir.as_ref())?;
        Ok(())
    }


    pub fn cache_stats(&self) -> KanjiResult<CacheStats> {
        let cache = self.lock_cache()?;
        let index = self.lock_index()?;
        
        Ok(CacheStats {
            size: cache.len(),
            capacity: cache.capacity(),
            hits: self.hits.load(Ordering::Relaxed),
            misses: self.misses.load(Ordering::Relaxed),
            available_kanji_count: index.len(),
        })
    }


    pub fn clear_cache(&self) -> KanjiResult {
        self.lock_cache()?.clear();
        Ok(())
    }
}
