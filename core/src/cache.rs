use std::collections::HashSet;
use std::fs;
use std::num::NonZeroUsize;
use std::path::Path;
use lru::LruCache;

use crate::error::{KanjiResult, KanjiTrainerError};
use crate::kanji::Kanji;

pub struct KanjiCache {
    cache: LruCache<char, Kanji>,
}

impl KanjiCache {
    pub fn new(capacity: usize) -> Self {
        let cap = NonZeroUsize::new(capacity).expect("Capacity must be > 0");
        Self {
            cache: LruCache::new(cap),
        }
    }

    pub fn get(&mut self, key: char) -> Option<&Kanji> {
        self.cache.get(&key)
    }

    pub fn insert(&mut self, key: char, value: Kanji) {
        self.cache.put(key, value);
    }

    pub fn len(&self) -> usize {
        self.cache.len()
    }

    pub fn capacity(&self) -> usize {
        self.cache.cap().get()
    }

    pub fn clear(&mut self) {
        self.cache.clear();
    }
}

pub struct FileCache {
    index: HashSet<char>,
}

impl FileCache {
    pub fn new(dir: &Path) -> KanjiResult<Self> {
        Ok(Self {
            index: Self::scan_directory(dir)?,
        })

    }


    fn scan_directory(dir: &Path) -> KanjiResult<HashSet<char>> {
        let mut available = HashSet::with_capacity(7000);
        
        let entries = fs::read_dir(dir).map_err(|_| KanjiTrainerError::InvalidKanjiFolder(dir.to_path_buf()))?;

        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let Some(name) = file_name.to_str() else { continue };
            
            let Some(stem) = name.strip_suffix(".svg") else { continue };
            
            if let Ok(codepoint) = u32::from_str_radix(stem, 16) {
                if let Some(ch) = char::from_u32(codepoint) {
                    available.insert(ch);
                }
            }
        }
        Ok(available)
    }

    pub fn contains(&self, ch: char) -> bool {
        self.index.contains(&ch)
    }

    pub fn get_all(&self) -> Vec<char> {
        self.index.iter().copied().collect()
    }

    pub fn len(&self) -> usize {
        self.index.len()
    }

    pub fn reload(&mut self, dir: &Path) -> KanjiResult {
        self.index = Self::scan_directory(dir)?;
        Ok(())
    }
}