// The trees and rocks in the homepage hero's campsite. See campsiteScene.mjs
// for how the scene is put together.
//
// Every number is design mockup 1c's. Trees, then rocks, are placed from one
// seeded random sequence, so the scene is the same on every load. Keep the
// order of the R() calls, or the forest moves.
import {FX, FZ, heightAt, noise} from './campsiteLand.mjs'

const TREES = 340
const ROCKS = 70
const SEED = 5

const rng = (seed) => {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

const isClear = (x, z, circles) =>
	!circles.some(
		([cx, cz, r]) => (x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r,
	)

const treeTiers = (T) => [
	[new T.CylinderGeometry(0.06, 0.09, 0.34, 5).translate(0, 0.17, 0), 0],
	[new T.ConeGeometry(0.52, 0.78, 7).translate(0, 0.62, 0), 1],
	[new T.ConeGeometry(0.41, 0.66, 7).translate(0, 0.95, 0), 1],
	[new T.ConeGeometry(0.29, 0.56, 7).translate(0, 1.26, 0), 1.04],
]

// Trees, then rocks, from the seeded sequence. clearings: [x, z, r] circles
// to keep free, the camp's five places first.
export const addTrees = ({T, scene, camDir}, clearings) => {
	const R = rng(SEED)
	const randomSpot = () => [FX + (R() * 2 - 1) * 19, FZ + (R() * 2 - 1) * 19]
	// The ground between the fire and the camera stays open, so nothing
	// hides the camp.
	const inSightLine = (x, z) => {
		const dx = x - FX
		const dz = z - FZ
		const along = dx * camDir.x + dz * camDir.z
		const across = Math.abs(dx * camDir.z - dz * camDir.x)
		return along > 0 && along < 9 && across < 3.2
	}
	const trees = []
	for (let tries = 0; trees.length < TREES && tries < TREES * 80; tries++) {
		const [x, z] = randomSpot()
		if (!isClear(x, z, clearings) || inSightLine(x, z)) continue
		if (noise(x * 0.34 + 2, z * 0.34 + 9) < 0.36) continue
		const s = 0.75 + R() * 0.65
		const crowded = trees.some(
			(t) =>
				(t.x - x) * (t.x - x) + (t.z - z) * (t.z - z) <
				0.3 * (t.s + s) * (t.s + s),
		)
		if (crowded) continue
		trees.push({x, z, s, r: R() * 6.28, c: R()})
	}
	const greens = ['#3f5331', '#4b5f35', '#35472b', '#5b6c3b', '#445a33'].map(
		(h) => new T.Color(h),
	)
	const trunk = new T.Color('#4a3926')
	const foliage = new T.MeshStandardMaterial({
		color: 0xffffff,
		roughness: 0.9,
		flatShading: true,
	})
	const m = new T.Matrix4()
	const q = new T.Quaternion()
	const s = new T.Vector3()
	const p = new T.Vector3()
	const up = new T.Vector3(0, 1, 0)
	const color = new T.Color()
	for (const [geo, shade] of treeTiers(T)) {
		const tier = new T.InstancedMesh(geo, foliage, trees.length)
		tier.castShadow = tier.receiveShadow = true
		trees.forEach((t, i) => {
			q.setFromAxisAngle(up, t.r)
			s.setScalar(t.s)
			p.set(t.x, heightAt(t.x, t.z) - 0.02, t.z)
			tier.setMatrixAt(i, m.compose(p, q, s))
			if (shade) {
				color.copy(greens[Math.floor(t.c * greens.length)])
				if (shade > 1) color.offsetHSL(0, 0, 0.025)
			} else color.copy(trunk)
			tier.setColorAt(i, color)
		})
		scene.add(tier)
	}
	const rockMat = new T.MeshStandardMaterial({
		color: 0xffffff,
		roughness: 0.95,
		flatShading: true,
	})
	const rocks = new T.InstancedMesh(
		new T.DodecahedronGeometry(0.16, 0),
		rockMat,
		ROCKS,
	)
	rocks.castShadow = rocks.receiveShadow = true
	const greys = ['#7b7b67', '#67685a', '#8b8c76'].map((h) => new T.Color(h))
	let n = 0
	for (let tries = 0; n < ROCKS && tries < 2000; tries++) {
		const [x, z] = randomSpot()
		if (!isClear(x, z, clearings.slice(0, 5)) || inSightLine(x, z)) continue
		const size = 0.5 + R() * 1.1
		q.setFromEuler(new T.Euler(R() * 3, R() * 3, R() * 3))
		s.set(size, size * 0.7, size)
		p.set(x, heightAt(x, z) + 0.04 * size, z)
		rocks.setMatrixAt(n, m.compose(p, q, s))
		rocks.setColorAt(n, greys[n % 3])
		n++
	}
	rocks.count = n
	scene.add(rocks)
}
