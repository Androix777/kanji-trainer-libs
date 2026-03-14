from typing import List, Tuple, Optional, Final
from pathlib import Path
from enum import IntEnum

DEFAULT_CACHE_SIZE: Final[int] = 100

class PyPointType(IntEnum):
    """Indicates whether a point is the start or the end of a stroke."""
    Start = 0
    End = 1

class StrokeCountResult:
    """Result of a stroke count validation."""
    @property
    def expected(self) -> int:
        """The correct number of strokes for this Kanji."""
        ...
    @property
    def actual(self) -> int:
        """The number of strokes provided by the user."""
        ...
    @property
    def is_correct(self) -> bool:
        """True if the actual stroke count matches the expected count."""
        ...

    def __repr__(self) -> str: ...

class RawStroke:
    """Raw stroke data including optional label position."""
    @property
    def points(self) -> List[Tuple[float, float]]:
        """Stroke polyline points in normalized [0, 1] coordinates."""
        ...
    @property
    def label_pos(self) -> Optional[Tuple[float, float]]:
        """Optional position of the stroke index label in normalized [0, 1] coordinates."""
        ...

class PyAffineTransform:
    @property
    def scale_x(self) -> float: ...
    @property
    def scale_y(self) -> float: ...
    @property
    def translate_x(self) -> float: ...
    @property
    def translate_y(self) -> float: ...

class PyCompositionAlignment:
    @property
    def user_to_aligned(self) -> PyAffineTransform: ...
    @property
    def reference_to_aligned(self) -> PyAffineTransform: ...

class StrokeShapeDetails:
    """Result of shape analysis for a single stroke."""
    @property
    def rms(self) -> float:
        """
        Root Mean Square error between the user stroke and reference.
        Normalized to [0.0, 1.0], where 0.0 is a perfect match.
        """
        ...
    @property
    def user_points(self) -> List[Tuple[float, float]]:
        """Normalized points from the user's input (centered and scaled)."""
        ...
    @property
    def reference_points(self) -> List[Tuple[float, float]]:
        """Normalized points from the reference Kanji (centered and scaled)."""
        ...

class KanjiShapeResult:
    """Collection of shape details for all strokes in a Kanji."""
    @property
    def strokes(self) -> List[StrokeShapeDetails]:
        """
        Analysis details for each evaluated stroke.
        Note: Only compares up to the minimum number of strokes between user and reference.
        """
        ...

class StrokeDirectionDetails:
    """Result of direction/angle analysis for a single stroke."""
    @property
    def dtw_error(self) -> float:
        """
        Dynamic Time Warping error based on angle sequences.
        Normalized to [0.0, 1.0], where 0.0 is a perfect match.
        """
        ...
    @property
    def user_angles(self) -> List[float]:
        """Sequence of angles in radians for the user's stroke."""
        ...
    @property
    def reference_angles(self) -> List[float]:
        """Sequence of angles in radians for the reference stroke."""
        ...

class KanjiDirectionResult:
    """Collection of direction details for all strokes in a Kanji."""
    @property
    def strokes(self) -> List[StrokeDirectionDetails]:
        """
        Analysis details for each evaluated stroke.
        Note: Only compares up to the minimum number of strokes between user and reference.
        """
        ...

class PyPointDeviation:
    """Details about positional deviation of a specific point (Start or End)."""
    @property
    def expected(self) -> Tuple[float, float]:
        """The coordinate where the point should be according to reference."""
        ...
    @property
    def actual(self) -> Tuple[float, float]:
        """The actual coordinate provided by the user."""
        ...
    @property
    def deviation_vector(self) -> Tuple[float, float]:
        """The vector from expected to actual position."""
        ...
    @property
    def distance(self) -> float:
        """Euclidean distance of the deviation."""
        ...

class PyAngleDeviation:
    """Details about the angular relationship between two points."""
    @property
    def stroke_indices(self) -> Tuple[int, int]:
        """The indices of the two strokes being compared."""
        ...
    @property
    def point_types(self) -> Tuple[PyPointType, PyPointType]:
        """Whether the points are Start or End points."""
        ...
    @property
    def expected_angle(self) -> float:
        """The reference angle in radians."""
        ...
    @property
    def actual_angle(self) -> float:
        """The user's angle in radians."""
        ...
    @property
    def angle_diff(self) -> float:
        """The difference between expected and actual angles."""
        ...
    @property
    def weight(self) -> float:
        """The importance of this specific angular relationship."""
        ...
    @property
    def weighted_diff(self) -> float:
        """The angle difference multiplied by its weight."""
        ...

class PyStrokeCompositionDetails:
    """Positional deviation for the endpoints of a specific stroke."""
    @property
    def stroke_idx(self) -> int:
        """Index of the stroke."""
        ...
    @property
    def start(self) -> PyPointDeviation:
        """Deviation of the starting point."""
        ...
    @property
    def end(self) -> PyPointDeviation:
        """Deviation of the ending point."""
        ...

class KanjiCompositionResult:
    """Analysis of the relative positions (composition) of strokes."""
    @property
    def stroke_details(self) -> List[PyStrokeCompositionDetails]:
        """Positional details for stroke endpoints."""
        ...
    @property
    def angle_details(self) -> List[PyAngleDeviation]:
        """Angular relationship details between different strokes."""
        ...
    @property
    def alignment(self) -> PyCompositionAlignment:
        """Transforms from raw user/reference coordinates into the shared aligned space."""
        ...

class PyGlobalErrors:
    """Maximum errors found during validation."""
    @property
    def dtw(self) -> float: ...
    @property
    def rms(self) -> float: ...
    @property
    def position(self) -> float: ...
    @property
    def relative_angle(self) -> float: ...

class PyValidationThresholds:
    """Thresholds for validation."""
    dtw: float
    rms: float
    position: float
    relative_angle: float

    def __init__(self, dtw: float, rms: float, position: float, relative_angle: float) -> None: ...

class GlobalValidationResult:
    """Complete validation result including all checks."""
    @property
    def is_valid(self) -> bool: ...
    @property
    def score(self) -> float: ...
    @property
    def thresholds(self) -> PyValidationThresholds: ...
    @property
    def reference_raw(self) -> List[RawStroke]: ...
    @property
    def user_raw(self) -> List[RawStroke]: ...
    @property
    def stroke_count(self) -> StrokeCountResult: ...
    @property
    def dtw(self) -> KanjiDirectionResult: ...
    @property
    def rms(self) -> KanjiShapeResult: ...
    @property
    def composition(self) -> KanjiCompositionResult: ...
    @property
    def max_errors(self) -> PyGlobalErrors: ...
    def to_dict(self) -> dict[str, object]: ...
    def to_json(self, pretty: bool = False) -> str: ...

class CacheStats:
    """Statistics for the internal Kanji SVG cache."""
    @property
    def size(self) -> int:
        """Current number of items in cache."""
        ...
    @property
    def capacity(self) -> int:
        """Maximum items the cache can hold."""
        ...
    @property
    def hits(self) -> int:
        """Number of cache hits."""
        ...
    @property
    def misses(self) -> int:
        """Number of cache misses."""
        ...
    @property
    def available_kanji_count(self) -> int:
        """Total number of Kanji SVG files indexed on disk."""
        ...
    @property
    def hit_rate(self) -> float:
        """Ratio of hits to total requests."""
        ...

    def __repr__(self) -> str: ...

class KanjiValidator:
    """
    Main validator class for evaluating handwritten Kanji against a Reference (KanjiVG).
    
    This class is thread-safe and uses an internal LRU cache for SVG parsing.
    All coordinates in `user_strokes` MUST be normalized to the range [0.0, 1.0].
    """

    def __init__(self, kanji_vg_dir: Path | str, cache_size: Optional[int] = None) -> None:
        """
        Initialize the validator.
        :param kanji_vg_dir: Path to the directory containing KanjiVG SVG files.
        :param cache_size: Optional cache limit. Defaults to 100.
        :raises IOError: If the directory is inaccessible or index cannot be built.
        """
        ...

    def get_kanji(self, kanji: str) -> List[RawStroke]:
        """
        Retrieves raw strokes for a specific Kanji character.
        Coordinates are normalized to [0.0, 1.0], including optional label positions.
        :raises ValueError: If `kanji` is not a single character or not found.
        """
        ...

    def check_stroke_count(
        self, kanji: str, user_strokes: List[List[Tuple[float, float]]]
    ) -> StrokeCountResult:
        """
        Compares the number of strokes in the input to the reference.
        :param user_strokes: List of strokes, each being a list of (x, y) tuples in [0.0, 1.0].
        :raises ValueError: If coordinates are out of range or strokes are empty.
        """
        ...

    def check_kanji_shape(
        self,
        kanji: str,
        user_strokes: List[List[Tuple[float, float]]],
        sampling_resolution: int = 10,
    ) -> KanjiShapeResult:
        """
        Performs RMS-based shape comparison for each stroke.
        Internal normalization is applied to both user and reference strokes to account for
        scaling and translation differences before comparison.
        
        :param sampling_resolution: Number of points to sample per stroke (min 2).
        :raises ValueError: If sampling_resolution < 2.
        """
        ...

    def check_kanji_direction(
        self,
        kanji: str,
        user_strokes: List[List[Tuple[float, float]]],
        sampling_resolution: int = 20,
    ) -> KanjiDirectionResult:
        """
        Performs DTW-based direction (angle) comparison for each stroke.
        Uses Dynamic Time Warping on the sequence of angles between consecutive points.
        
        :param sampling_resolution: Number of points to sample for angle extraction (min 3).
        :raises ValueError: If sampling_resolution < 3.
        """
        ...

    def check_kanji_composition(
        self, kanji: str, user_strokes: List[List[Tuple[float, float]]]
    ) -> KanjiCompositionResult:
        """
        Analyzes the spatial relationships and relative positions of strokes.
        Evaluates endpoint deviations and angular relationships between different strokes.
        """
        ...

    def validate_kanji(
        self,
        kanji: str,
        user_strokes: List[List[Tuple[float, float]]],
        thresholds: PyValidationThresholds,
        sampling_resolution: int = 20,
    ) -> GlobalValidationResult:
        """
        Performs a complete validation of the Kanji against the reference.
        """
        ...

    def get_stroke_count(self, kanji: str) -> int:
        """Returns the expected stroke count for the given Kanji."""
        ...

    def has_kanji(self, kanji: str) -> bool:
        """Checks if the validator has a reference SVG for the given character."""
        ...

    def available_kanji(self) -> List[str]:
        """Returns a list of all Kanji characters currently indexed."""
        ...

    def available_kanji_count(self) -> int:
        """Returns the count of indexed Kanji characters."""
        ...

    def refresh_index(self) -> None:
        """Rescans the KanjiVG directory to update the character index."""
        ...

    def cache_stats(self) -> CacheStats:
        """Returns performance metrics for the SVG cache."""
        ...

    def clear_cache(self) -> None:
        """Wipes all cached data."""
        ...

    def __repr__(self) -> str: ...
    def __len__(self) -> int: ...
    def __contains__(self, kanji: str) -> bool: ...
