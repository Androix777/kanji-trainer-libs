use crate::kanji::Point;

pub fn interpolate_stroke(points: &[Point], sampling_resolution: usize) -> Vec<(f32, f32)> {
    if points.is_empty() {
        return Vec::new();
    }

    let mut lengths = Vec::with_capacity(points.len());
    lengths.push(0.0);
    let mut total_length = 0.0;

    for win in points.windows(2) {
        let p1 = &win[0];
        let p2 = &win[1];
        let dx = *p2.x - *p1.x;
        let dy = *p2.y - *p1.y;
        total_length += (dx * dx + dy * dy).sqrt();
        lengths.push(total_length);
    }

    let mut output = Vec::with_capacity(sampling_resolution);

    if total_length < f32::EPSILON {
        let p0 = (*points[0].x, *points[0].y);
        output.extend(std::iter::repeat(p0).take(sampling_resolution));
        return output;
    }

    let step = total_length / (sampling_resolution - 1) as f32;
    let mut current_segment = 1;

    for i in 0..sampling_resolution {
        let target = i as f32 * step;

        while current_segment < lengths.len() - 1 && lengths[current_segment] < target {
            current_segment += 1;
        }

        let start_l = lengths[current_segment - 1];
        let end_l = lengths[current_segment];
        let diff = end_l - start_l;

        let t = if diff > f32::EPSILON {
            (target - start_l) / diff
        } else {
            0.0
        };

        let p_start = &points[current_segment - 1];
        let p_end = &points[current_segment];

        let x = *p_start.x + t * (*p_end.x - *p_start.x);
        let y = *p_start.y + t * (*p_end.y - *p_start.y);
        output.push((x, y));
    }

    output
}

pub fn get_normalization_params(points: &[(f32, f32)]) -> ((f32, f32), f32) {
    let n = points.len() as f32;
    if n == 0.0 {
        return ((0.0, 0.0), 0.0);
    }

    let (sum_x, sum_y) = points
        .iter()
        .fold((0.0, 0.0), |acc, p| (acc.0 + p.0, acc.1 + p.1));
    let mean = (sum_x / n, sum_y / n);

    let max_val = points.iter().fold(0.0f32, |m, &(px, py)| {
        m.max((px - mean.0).abs()).max((py - mean.1).abs())
    });

    let factor = if max_val < f32::EPSILON {
        0.0
    } else {
        0.5 / max_val
    };
    (mean, factor)
}

pub fn apply_normalization_raw(
    points: &[(f32, f32)],
    mean: (f32, f32),
    factor: f32,
) -> Vec<(f32, f32)> {
    points
        .iter()
        .map(|&(px, py)| {
            let nx = (px - mean.0) * factor + 0.5;
            let ny = (py - mean.1) * factor + 0.5;
            (nx, ny)
        })
        .collect()
}

pub fn angular_distance(a: f32, b: f32) -> f32 {
    let diff = (a - b).abs();
    let circle = 2.0 * std::f32::consts::PI;
    diff.min(circle - diff)
}
