use crate::kanji::{Kanji, Point, Stroke};
use lyon_geom::cubic_bezier::CubicBezierSegment;
use lyon_geom::euclid::{Point2D, Vector2D};
use std::fs;
use std::path::Path;
use svgtypes::{PathParser, PathSegment};
use crate::error::{KanjiTrainerError, KanjiResult};

const KANJIVG_SIZE: f64 = 109.0;
const FLATTENING_TOLERANCE: f32 = 0.5;

pub fn load_kanji_by_char(kanji: char, kanji_vg_dir: &Path) -> KanjiResult<Kanji> {
    let codepoint = kanji as u32;
    let filename = format!("{:05x}.svg", codepoint);
    let svg_path = kanji_vg_dir.join(&filename);

    let svg_content = fs::read_to_string(&svg_path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            KanjiTrainerError::NotFound(kanji, format!("{:05x}", codepoint))
        } else {
            KanjiTrainerError::Io {
                source: e,
                path: svg_path.clone(),
            }
        }
    })?;

    parse_kanji_vg(&svg_content)
}


pub fn parse_kanji_vg(svg_data: &str) -> KanjiResult<Kanji> {
    let start_idx = svg_data.find("<svg").ok_or_else(|| 
        KanjiTrainerError::InvalidSvg("Tag <svg> not found".to_string())
    )?;
    
    let svg_body = &svg_data[start_idx..];
    let cleaned_xml = svg_body.replace("kvg:", "kvg_");
    
    let doc = roxmltree::Document::parse(&cleaned_xml)?;

    let mut strokes = Vec::with_capacity(20);

    for node in doc.descendants() {
        if node.tag_name().name() == "path" {
            if let Some(parent) = node.parent() {
                if let Some(id) = parent.attribute("id") {
                    if id.contains("StrokeNumbers") {
                        continue;
                    }
                }
            }

            if let Some(d_attr) = node.attribute("d") {
                let points = parse_svg_path_str(d_attr)?;
                let stroke = Stroke::try_new(points)?;
                strokes.push(stroke);
            }
        } else if node.tag_name().name() == "text" {
            let mut label_point = None;

            if let Some(transform) = node.attribute("transform") {
                label_point = parse_transform(transform)?;
            }

            if label_point.is_none() {
                if let (Some(x_str), Some(y_str)) = (node.attribute("x"), node.attribute("y")) {
                    if let (Ok(x), Ok(y)) = (x_str.parse::<f64>(), y_str.parse::<f64>()) {
                        label_point = Some(Point::try_from((x / KANJIVG_SIZE, y / KANJIVG_SIZE))?);
                    }
                }
            }

            if let Some(pos) = label_point {
                let text_content = node.text().unwrap_or("").trim();
                if let Ok(idx) = text_content.parse::<usize>() {
                    if idx > 0 && idx <= strokes.len() {
                        let stroke = &mut strokes[idx - 1];
                        stroke.label_pos = Some(pos);
                    }
                }
            }
        }
    }

    Kanji::try_new(strokes)
}

fn parse_transform(transform: &str) -> KanjiResult<Option<Point>> {
    let transform = transform.trim();
    if transform.starts_with("matrix") {
        let content = transform
            .trim_start_matches("matrix(")
            .trim_end_matches(')')
            .replace(',', " ");
        let parts: Vec<&str> = content.split_whitespace().collect();
        if parts.len() == 6 {
            let x = parts[4]
                .parse::<f64>()
                .map_err(|_| KanjiTrainerError::InvalidSvg("Invalid matrix X".to_string()))?;
            let y = parts[5]
                .parse::<f64>()
                .map_err(|_| KanjiTrainerError::InvalidSvg("Invalid matrix Y".to_string()))?;
            return Ok(Some(Point::try_from((x / KANJIVG_SIZE, y / KANJIVG_SIZE))?));
        }
    } else if transform.starts_with("translate") {
        let content = transform
            .trim_start_matches("translate(")
            .trim_end_matches(')')
            .replace(',', " ");
        let parts: Vec<&str> = content.split_whitespace().collect();
        if parts.len() >= 2 {
            let x = parts[0]
                .parse::<f64>()
                .map_err(|_| KanjiTrainerError::InvalidSvg("Invalid translate X".to_string()))?;
            let y = parts[1]
                .parse::<f64>()
                .map_err(|_| KanjiTrainerError::InvalidSvg("Invalid translate Y".to_string()))?;
            return Ok(Some(Point::try_from((x / KANJIVG_SIZE, y / KANJIVG_SIZE))?));
        }
    }
    Ok(None)
}

fn parse_svg_path_str(d_str: &str) -> KanjiResult<Vec<Point>> {
    let mut points = Vec::new();
    let mut current_pos = Point2D::<f64, lyon_geom::euclid::UnknownUnit>::new(0.0, 0.0);
    let mut start_pos = Point2D::<f64, lyon_geom::euclid::UnknownUnit>::new(0.0, 0.0);
    let mut last_cubic_ctrl: Option<Point2D<f64, lyon_geom::euclid::UnknownUnit>> = None;

    let mut push_point = |p: Point2D<f64, lyon_geom::euclid::UnknownUnit>| -> KanjiResult<()> {
        let nx = p.x / KANJIVG_SIZE;
        let ny = p.y / KANJIVG_SIZE;
        
        let nx_clamped = nx.clamp(0.0, 1.0);
        let ny_clamped = ny.clamp(0.0, 1.0);
        
        let point = Point::try_from((nx_clamped, ny_clamped))?;

        
        points.push(point);
        Ok(())
    };

    for segment_result in PathParser::from(d_str) {
        let segment = segment_result.map_err(|e| 
            KanjiTrainerError::PathDataMalformed(e.to_string())
        )?;

        match segment {
            PathSegment::MoveTo { abs, x, y } => {
                let target = if abs { Point2D::new(x, y) } else { current_pos + Vector2D::new(x, y) };
                current_pos = target;
                start_pos = target;
                push_point(target)?;
                last_cubic_ctrl = None;
            }
            PathSegment::LineTo { abs, x, y } => {
                let target = if abs { Point2D::new(x, y) } else { current_pos + Vector2D::new(x, y) };
                push_point(target)?;
                current_pos = target;
                last_cubic_ctrl = None;
            }
            PathSegment::HorizontalLineTo { abs, x } => {
                let target = if abs { Point2D::new(x, current_pos.y) } else { current_pos + Vector2D::new(x, 0.0) };
                push_point(target)?;
                current_pos = target;
                last_cubic_ctrl = None;
            }
            PathSegment::VerticalLineTo { abs, y } => {
                let target = if abs { Point2D::new(current_pos.x, y) } else { current_pos + Vector2D::new(0.0, y) };
                push_point(target)?;
                current_pos = target;
                last_cubic_ctrl = None;
            }
            PathSegment::CurveTo { abs, x1, y1, x2, y2, x, y } => {
                let (ctrl1, ctrl2, to) = if abs {
                    (Point2D::new(x1, y1), Point2D::new(x2, y2), Point2D::new(x, y))
                } else {
                    (
                        current_pos + Vector2D::new(x1, y1),
                        current_pos + Vector2D::new(x2, y2),
                        current_pos + Vector2D::new(x, y),
                    )
                };

                let bezier = CubicBezierSegment { from: current_pos, ctrl1, ctrl2, to };

                for point in bezier.flattened(FLATTENING_TOLERANCE as f64) {
                    push_point(point)?;
                }
                current_pos = to;
                last_cubic_ctrl = Some(ctrl2);
            }
            PathSegment::SmoothCurveTo { abs, x2, y2, x, y } => {
                let ctrl1 = if let Some(prev_ctrl2) = last_cubic_ctrl {
                    current_pos + (current_pos - prev_ctrl2)
                } else {
                    current_pos
                };

                let (ctrl2, to) = if abs {
                    (Point2D::new(x2, y2), Point2D::new(x, y))
                } else {
                    (
                        current_pos + Vector2D::new(x2, y2),
                        current_pos + Vector2D::new(x, y),
                    )
                };

                let bezier = CubicBezierSegment { from: current_pos, ctrl1, ctrl2, to };

                for point in bezier.flattened(FLATTENING_TOLERANCE as f64) {
                    push_point(point)?;
                }
                current_pos = to;
                last_cubic_ctrl = Some(ctrl2);
            }
            PathSegment::Quadratic { abs, x1, y1, x, y } => {
                let (ctrl, to) = if abs {
                    (Point2D::new(x1, y1), Point2D::new(x, y))
                } else {
                    (current_pos + Vector2D::new(x1, y1), current_pos + Vector2D::new(x, y))
                };
                
                let ctrl1 = current_pos + (ctrl - current_pos) * (2.0 / 3.0);
                let ctrl2 = to + (ctrl - to) * (2.0 / 3.0);
                
                let bezier = CubicBezierSegment { from: current_pos, ctrl1, ctrl2, to };
                for point in bezier.flattened(FLATTENING_TOLERANCE as f64) {
                    push_point(point)?;
                }
                
                current_pos = to;
                last_cubic_ctrl = None;
            }
            PathSegment::ClosePath { .. } => {
                current_pos = start_pos;
                last_cubic_ctrl = None;
            }
            _ => {
                last_cubic_ctrl = None;
            }
        }
    }

    Ok(points)
}
