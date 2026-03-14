const GOLDEN_RATIO_INV = 0.618033988749895;

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);

	let r = 0;
	let g = 0;
	let b = 0;

	switch (i % 6) {
		case 0:
			r = v;
			g = t;
			b = p;
			break;
		case 1:
			r = q;
			g = v;
			b = p;
			break;
		case 2:
			r = p;
			g = v;
			b = t;
			break;
		case 3:
			r = p;
			g = q;
			b = v;
			break;
		case 4:
			r = t;
			g = p;
			b = v;
			break;
		case 5:
			r = v;
			g = p;
			b = q;
			break;
	}

	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function strokeColor(strokeIndex: number): string {
	const h = ((strokeIndex * GOLDEN_RATIO_INV) % 1 + 1) % 1;
	const [r, g, b] = hsvToRgb(h, 0.42, 0.56);
	return `rgb(${r}, ${g}, ${b})`;
}
