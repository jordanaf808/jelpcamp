// The land in the homepage hero's campsite: ground, mountains, paths and
// pond. Also the places, the terrain height and the helpers the other scene
// modules share. See campsiteScene.mjs for how the scene is put together.
// Every number is design mockup 1c's.

// Places on the ground, as [x, z].
export const SITE = {
	fire: [1.0, 1.1],
	tent: [2.8, -0.45],
	truck: [-1.0, 2.8],
	pond: [3.3, 3.1],
	sign: [0.15, -0.7],
}
export const [FX, FZ] = SITE.fire

// The camera's angle. shift and lift move the framing right and down, as a
// fraction of the frame's width and height. Past maxAspect (width over
// height) the framing stops scaling with the width; campsiteScene.mjs's
// frame() says why.
export const VIEW = {
	az: Math.PI / 4,
	el: 0.42,
	shift: 0.2,
	lift: -0.1,
	maxAspect: 2.4,
}

// [x, z, radius, height, holds the ram's ledge]
const MOUNTAINS = [
	[-4.6, -5.6, 3.1, 6.4, true],
	[-0.2, -8.6, 3.4, 7.4],
	[4.9, -9.8, 2.9, 5.6],
	[-9.6, -1.4, 3.2, 6.0],
	[-10.6, -9.6, 4.3, 9.2],
	[-6.2, -13.2, 3.7, 7.2],
	[2.6, -15.2, 4.7, 9.8],
	[-15.2, 2.6, 3.3, 5.8],
	[9.2, -14.4, 3.7, 6.6],
	[-15.4, -6.2, 4.1, 8.2],
	[-3, -18, 4.5, 8.5],
	[-18, -12, 4.5, 9],
]
export const TRACK = [
	[-16, 7.5],
	[-9, 5.6],
	[-4.4, 4.0],
	[-1.3, 2.85],
]
export const TRAIL = [
	[0.35, 0.2],
	[0.2, -0.4],
	[-0.6, -1.6],
	[-1.8, -2.9],
	[-2.6, -3.7],
]
const RAM_ANGLE = 0.85

const hash = (x, y) => {
	const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
	return s - Math.floor(s)
}
export const noise = (x, y) => {
	const xi = Math.floor(x)
	const yi = Math.floor(y)
	const xf = x - xi
	const yf = y - yi
	const u = xf * xf * (3 - 2 * xf)
	const v = yf * yf * (3 - 2 * yf)
	const a = hash(xi, yi)
	const b = hash(xi + 1, yi)
	const c = hash(xi, yi + 1)
	const d = hash(xi + 1, yi + 1)
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const smoothstep = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
	return t * t * (3 - 2 * t)
}

// Flat around the camp, rolling from about 5 units out from the fire.
export const heightAt = (x, z) =>
	(noise(x * 0.16 + 3.1, z * 0.16 + 7.7) - 0.45) *
	1.7 *
	smoothstep(4.8, 10, Math.hypot(x - FX, z - FZ))

export const NO_SHADOW = false

// Shorthands every part of the scene builds with. M caches materials, so
// meshes of one color share one.
export const makeKit = (T, scene) => {
	const materials = {}
	const M = (hex, extra) => {
		const key = hex + (extra ? JSON.stringify(extra) : '')
		materials[key] ||= new T.MeshStandardMaterial({
			color: hex,
			roughness: 0.92,
			metalness: 0,
			flatShading: true,
			...extra,
		})
		return materials[key]
	}
	// The last argument is NO_SHADOW for a mesh that casts none.
	const add = (parent, geo, mat, x = 0, y = 0, z = 0, cast = true) => {
		const mesh = new T.Mesh(geo, mat)
		mesh.position.set(x, y, z)
		mesh.castShadow = cast
		mesh.receiveShadow = true
		parent.add(mesh)
		return mesh
	}
	return {
		T,
		scene,
		M,
		add,
		V: (x, y, z) => new T.Vector3(x, y, z),
		Box: (w, h, d) => new T.BoxGeometry(w, h, d),
		disc: (r, segments) =>
			new T.CircleGeometry(r, segments).rotateX(-Math.PI / 2),
		camDir: new T.Vector3(Math.sin(VIEW.az), 0, Math.cos(VIEW.az)),
	}
}

// One color per triangle, so the geometry must be non-indexed. colorOf gets
// the triangle's first vertex index and its center.
const paintFaces = (T, geo, colorOf) => {
	const p = geo.attributes.position
	const colors = new Float32Array(p.count * 3)
	const mean = (get, f) => (get(f) + get(f + 1) + get(f + 2)) / 3
	const getX = (i) => p.getX(i)
	const getY = (i) => p.getY(i)
	const getZ = (i) => p.getZ(i)
	for (let f = 0; f < p.count; f += 3) {
		const center = {x: mean(getX, f), y: mean(getY, f), z: mean(getZ, f)}
		const color = colorOf(f, center)
		for (let k = 0; k < 3; k++) color.toArray(colors, (f + k) * 3)
	}
	geo.setAttribute('color', new T.BufferAttribute(colors, 3))
}

export const addGround = ({T, scene}) => {
	let geo = new T.PlaneGeometry(56, 56, 56, 56).rotateX(-Math.PI / 2)
	geo.translate(FX, 0, FZ)
	const p = geo.attributes.position
	for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
	geo = geo.toNonIndexed()
	const grass = ['#3e4a2a', '#47552f', '#353f24'].map((h) => new T.Color(h))
	const dirt = new T.Color('#565038')
	const c = new T.Color()
	paintFaces(T, geo, (f, {x: cx, z: cz}) => {
		c.copy(grass[Math.floor(noise(cx * 0.22 + 11, cz * 0.22 + 5) * 7) % 3])
		if (Math.hypot(cx - FX, cz - FZ) < 1.75) c.copy(dirt)
		return c.offsetHSL(0, 0, (hash(cx * 1.7, cz * 2.3) - 0.5) * 0.025)
	})
	const mat = new T.MeshStandardMaterial({
		vertexColors: true,
		roughness: 1,
		flatShading: true,
	})
	const ground = new T.Mesh(geo, mat)
	ground.receiveShadow = true
	scene.add(ground)
}

const mountainGeometry = (T, r, h, i) => {
	let geo = new T.ConeGeometry(r, h, 7, 4, true)
	const p = geo.attributes.position
	for (let k = 0; k < p.count; k++) {
		const x = p.getX(k)
		const y = p.getY(k)
		const z = p.getZ(k)
		if (y > h / 2 - 1e-4) continue
		const s = 1 + (hash(x * 3.1 + i * 7, z * 3.1 + y * 1.7) - 0.5) * 0.34
		const dy =
			y > -h / 2 + 1e-4 ? (hash(z * 2.3 + i, x * 1.9 - y) - 0.5) * 0.12 * h : 0
		p.setXYZ(k, x * s, y + dy, z * s)
	}
	geo = geo.toNonIndexed()
	const [snow, a, b, c, foot] = [
		'#e6e5d8',
		'#7b7b67',
		'#67685a',
		'#56574a',
		'#47552f',
	].map((hex) => new T.Color(hex))
	paintFaces(T, geo, (f, {y}) => {
		const t = (y + h / 2) / h
		const n = hash(f * 1.3 + i, i * 2.1)
		if (t > 0.74) return snow
		if (t > 0.5) return n > 0.5 ? a : b
		if (t > 0.2) return n > 0.6 ? b : c
		return foot
	})
	return geo
}

// Returns the ledge the ram stands on.
export const addMountains = ({T, scene, M, add, V, camDir}) => {
	const mat = new T.MeshStandardMaterial({
		vertexColors: true,
		roughness: 0.95,
		flatShading: true,
	})
	let ledge = null
	MOUNTAINS.forEach(([mx, mz, r, h, hasLedge], i) => {
		const base = heightAt(mx, mz) - 0.4
		add(scene, mountainGeometry(T, r, h, i), mat, mx, base + h / 2, mz)
		if (!hasLedge) return
		const up = 0.44
		const out = r * (1 - up) * 0.96
		const a = Math.atan2(camDir.x, camDir.z) + RAM_ANGLE
		ledge = V(mx + Math.sin(a) * out, base + up * h, mz + Math.cos(a) * out)
		const rockGeo = new T.DodecahedronGeometry(0.48, 0)
		const rock = add(
			scene,
			rockGeo,
			M('#7b7b67'),
			ledge.x,
			ledge.y - 0.1,
			ledge.z,
		)
		rock.scale.set(1, 0.34, 1)
	})
	return ledge
}

// A path is a row of discs in one instanced mesh, so one draw call. Each disc
// sits a hair above the last, so overlapping discs don't flicker. Returns
// circles around the path that trees keep out of.
export const addPath = ({T, scene, M, disc}, points, r, color, step) => {
	const curve = new T.CatmullRomCurve3(
		points.map(([x, z]) => new T.Vector3(x, 0, z)),
	)
	const n = Math.ceil(curve.getLength() / step)
	const discs = new T.InstancedMesh(disc(r, 8), M(color), n + 1)
	discs.receiveShadow = true
	const m = new T.Matrix4()
	const clearings = []
	for (let i = 0; i <= n; i++) {
		const pt = curve.getPoint(i / n)
		m.makeTranslation(pt.x, heightAt(pt.x, pt.z) + 0.014 + i * 0.00003, pt.z)
		discs.setMatrixAt(i, m)
		clearings.push([pt.x, pt.z, r + 0.25])
	}
	scene.add(discs)
	return clearings
}

export const addPond = ({T, scene, M, add, disc}) => {
	const [px, pz] = SITE.pond
	add(scene, disc(1.3, 11), M('#5d5641'), px, 0.008, pz, NO_SHADOW)
	const water = new T.MeshStandardMaterial({
		color: '#2b3f37',
		roughness: 0.15,
		metalness: 0.2,
		flatShading: true,
	})
	add(scene, disc(1.08, 11), water, px, 0.018, pz, NO_SHADOW)
	for (const [dx, dz, h] of [
		[-0.95, 0.35, 0.42],
		[-0.8, 0.62, 0.32],
		[0.55, -0.92, 0.38],
	]) {
		const reed = new T.ConeGeometry(0.035, h, 4)
		add(scene, reed, M('#8a9a4b'), px + dx, h / 2, pz + dz)
	}
}

export const MOUNTAIN_CLEARINGS = MOUNTAINS.map(([mx, mz, r]) => [
	mx,
	mz,
	r * 0.92,
])
