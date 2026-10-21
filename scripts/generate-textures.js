// Generates the two background textures the WANDUR redesign loads:
//   public/images/camo-contour.png  (opaque banded camo, RGB)
//   public/images/topo.png          (sparse contour lines on transparency, RGBA)
//
// The noise (mk) and field renderer (smooth) are ported from the design file
// "WANDUR Redesign.dc.html", tex() method. The prototype drew them on a canvas
// in the browser; this does the same math once, at build time, and writes PNGs
// with node:zlib instead of a canvas encoder. No dependencies.
//
// Run from the repo root: node scripts/generate-textures.js
// Output is deterministic, so re-running should leave git with no diff.

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const W = 1400
const H = 900
const OUT_DIR = path.join(__dirname, '..', 'public', 'images')

// mulberry32 PRNG feeding a 256x256 value-noise table, three octaves.
// Math.imul, the >>> and |0 coercions and the Float32Array table are kept
// as the design had them: a table of doubles would change the noise.
const mk = (seed) => {
	let a = seed >>> 0
	const r = () => {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const p = new Float32Array(65536)
	for (let i = 0; i < 65536; i++) p[i] = r()
	const n = (x, y) => {
		const xi = Math.floor(x)
		const yi = Math.floor(y)
		const xf = x - xi
		const yf = y - yi
		const g = (i, j) => p[((i & 255) << 8) | (j & 255)]
		const u = xf * xf * (3 - 2 * xf)
		const v = yf * yf * (3 - 2 * yf)
		const A = g(xi, yi)
		const B = g(xi + 1, yi)
		const C = g(xi, yi + 1)
		const D = g(xi + 1, yi + 1)
		return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v
	}
	return (x, y) =>
		n(x, y) * 0.55 +
		n(x * 2.1 + 17, y * 2.1 + 9) * 0.3 +
		n(x * 4.3 + 3, y * 4.3 + 31) * 0.15
}

const hex = (h) => [
	parseInt(h.slice(1, 3), 16),
	parseInt(h.slice(3, 5), 16),
	parseInt(h.slice(5, 7), 16),
]
const pal = ['#151910', '#1f2617', '#2a331e', '#2a2217'].map(hex)
const edge = hex('#39432a')

// Anti-aliased iso-lines of a noise field. `s` is the noise scale in pixels,
// `L` the number of contour levels. With `fill`, bands are painted from `pal`
// and the lines blended over them (opaque RGB). Without it, only the lines are
// drawn, on a transparent background (RGBA).
const smooth = (field, L, s, lineCol, fill) => {
	const channels = fill ? 3 : 4
	// Canvas ImageData is a Uint8ClampedArray: writes round and clamp.
	const d = new Uint8ClampedArray(W * H * channels)
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const v = field(x / s, y / s) * L
			const gx = field((x + 1) / s, y / s) * L - v
			const gy = field(x / s, (y + 1) / s) * L - v
			const f = v - Math.floor(v)
			const g = Math.hypot(gx, gy) || 1e-6
			const a = Math.max(0, Math.min(1, 1.1 - Math.min(f, 1 - f) / g))
			const i = (y * W + x) * channels
			if (fill) {
				const q = Math.floor(v)
				const base = pal[((q % 4) + 4) % 4]
				for (let k = 0; k < 3; k++)
					d[i + k] = base[k] + (lineCol[k] - base[k]) * a
			} else {
				d[i + 3] = a * (Math.floor(v) % 4 === 0 ? 255 : 150)
				// A browser exports fully transparent pixels as 0,0,0,0.
				if (d[i + 3] !== 0) {
					d[i] = lineCol[0]
					d[i + 1] = lineCol[1]
					d[i + 2] = lineCol[2]
				}
			}
		}
	}
	return {pixels: d, channels}
}

const chunk = (type, data) => {
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
	const out = Buffer.alloc(body.length + 8)
	out.writeUInt32BE(data.length, 0)
	body.copy(out, 4)
	out.writeUInt32BE(zlib.crc32(body), body.length + 4)
	return out
}

const paeth = (a, b, c) => {
	const p = a + b - c
	const pa = Math.abs(p - a)
	const pb = Math.abs(p - b)
	const pc = Math.abs(p - c)
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

// Tries all five PNG row filters and keeps the one with the smallest sum of
// absolute (signed) residuals, the usual heuristic for what deflate likes.
const filterRow = (row, prev, bpp) => {
	let best = null
	let bestScore = Infinity
	for (let type = 0; type < 5; type++) {
		const out = Buffer.alloc(row.length + 1)
		out[0] = type
		let score = 0
		for (let i = 0; i < row.length; i++) {
			const left = i >= bpp ? row[i - bpp] : 0
			const up = prev ? prev[i] : 0
			const upLeft = prev && i >= bpp ? prev[i - bpp] : 0
			let pred = 0
			if (type === 1) pred = left
			else if (type === 2) pred = up
			else if (type === 3) pred = (left + up) >> 1
			else if (type === 4) pred = paeth(left, up, upLeft)
			const res = (row[i] - pred) & 255
			out[i + 1] = res
			score += res < 128 ? res : 256 - res
		}
		if (score < bestScore) {
			bestScore = score
			best = out
		}
	}
	return best
}

const encodePng = ({pixels, channels}) => {
	const stride = W * channels
	const raw = Buffer.alloc((stride + 1) * H)
	let prev = null
	for (let y = 0; y < H; y++) {
		const row = pixels.subarray(y * stride, (y + 1) * stride)
		filterRow(row, prev, channels).copy(raw, y * (stride + 1))
		prev = row
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(W, 0)
	ihdr.writeUInt32BE(H, 4)
	ihdr[8] = 8 // bit depth
	ihdr[9] = channels === 4 ? 6 : 2 // colour type: RGBA or RGB
	// compression, filter method and interlace bytes stay 0
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, {level: 9})),
		chunk('IEND', Buffer.alloc(0)),
	])
}

const write = (name, image) => {
	const png = encodePng(image)
	fs.writeFileSync(path.join(OUT_DIR, name), png)
	console.log(`${name}: ${W}x${H}, ${png.length} bytes`)
}

write('camo-contour.png', smooth(mk(11), 7, 140, edge, true))
write('topo.png', smooth(mk(203), 16, 300, [201, 212, 160], false))
