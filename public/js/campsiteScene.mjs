// The campsite scene in the homepage hero, from design mockup 1c.
// wandurCampsite.js imports this module only when it shows the live scene,
// and passes three.js in, so these files never name three's URL.
//
//   campsiteScene.mjs  this file: puts the scene together, lights it, says
//                      where each pin points, and aims and fits the camera
//   campsiteLand.mjs   ground, mountains, paths, pond, and shared helpers
//   campsiteForest.mjs trees and rocks
//   campsiteCamp.mjs   fire, people, tent, 4x4, sign, ram
import {
	SITE,
	FX,
	FZ,
	VIEW,
	TRACK,
	TRAIL,
	MOUNTAIN_CLEARINGS,
	heightAt,
	makeKit,
	addGround,
	addMountains,
	addPath,
	addPond,
} from './campsiteLand.mjs'
import {addTrees} from './campsiteForest.mjs'
import {
	addFire,
	addPeople,
	addTent,
	addTruck,
	addSign,
	addRam,
} from './campsiteCamp.mjs'

const FOG = 0x0c0f08
const CAMERA_DISTANCE = 60

// The box the camera frames, around the fire: [x, y, z] corners.
const FRAME = [
	[-10, 0, -9],
	[9.5, 2.5, 9.5],
]

const addLights = ({T, scene, V}, center) => {
	scene.add(new T.HemisphereLight(0xb3c09f, 0x1a160f, 1.15))
	const key = new T.DirectionalLight(0xdde6d2, 1.7)
	key.position.copy(V(-5, 11, 7).normalize().multiplyScalar(30).add(center))
	key.target.position.copy(center)
	key.castShadow = true
	key.shadow.mapSize.set(2048, 2048)
	const cam = key.shadow.camera
	cam.left = cam.bottom = -17
	cam.right = cam.top = 17
	cam.near = 1
	cam.far = 70
	key.shadow.bias = -0.0004
	key.shadow.normalBias = 0.03
	scene.add(key, key.target)
}

// How the camera looks at the scene. aim() and frame() take the caller's
// orthographic camera.
const cameraRig = (T, center) => {
	const [a, b] = FRAME
	const corners = []
	for (const x of [a[0], b[0]]) {
		for (const y of [a[1], b[1]]) {
			for (const z of [a[2], b[2]])
				corners.push(new T.Vector3(x + FX, y, z + FZ))
		}
	}
	const v = new T.Vector3()

	// Looks at the fire from VIEW's angle, turned by dAz and dEl radians.
	const aim = (cam, dAz = 0, dEl = 0) => {
		const az = VIEW.az + dAz
		const el = VIEW.el + dEl
		const d = CAMERA_DISTANCE
		cam.position.set(
			center.x + d * Math.cos(el) * Math.sin(az),
			center.y + d * Math.sin(el),
			center.z + d * Math.cos(el) * Math.cos(az),
		)
		cam.lookAt(center)
		cam.updateMatrixWorld()
	}

	// Fits FRAME's width to a w x h canvas, cropping its height, up to an
	// aspect of VIEW.maxAspect. Wider than that, the height holds and more
	// land shows at the sides: fitting the width there would crop the top
	// pin (Climbing, on the mountain) out of view. FRAME's center lands
	// (0.5 + shift) across and (0.5 - lift) down.
	const frame = (cam, w, h) => {
		aim(cam)
		let minX = Infinity
		let maxX = -Infinity
		let minY = Infinity
		let maxY = -Infinity
		for (const p of corners) {
			v.copy(p).applyMatrix4(cam.matrixWorldInverse)
			minX = Math.min(minX, v.x)
			maxX = Math.max(maxX, v.x)
			minY = Math.min(minY, v.y)
			maxY = Math.max(maxY, v.y)
		}
		const aspect = w / h
		const hh = (maxX - minX) / 2 / Math.min(aspect, VIEW.maxAspect)
		const hw = hh * aspect
		const cx = (minX + maxX) / 2 - VIEW.shift * hw * 2
		const cy = (minY + maxY) / 2 - VIEW.lift * hh * 2
		Object.assign(cam, {
			left: cx - hw,
			right: cx + hw,
			top: cy + hh,
			bottom: cy - hh,
		})
		cam.updateProjectionMatrix()
	}
	return {aim, frame}
}

/**
 * Builds the scene. Nothing here needs WebGL; the caller renders it.
 * @param {object} T the three.js module
 * @returns {{scene: object, anchors: Object<string, object>,
 *   tick: function(number): void, aim: function, frame: function}}
 *   anchors maps each pin's Activity value to the point it marks. tick(t)
 *   animates the fire for time t in seconds. aim(cam, dAz, dEl) and
 *   frame(cam, width, height) point and fit the caller's camera.
 */
export const buildScene = (T) => {
	const scene = new T.Scene()
	scene.fog = new T.Fog(FOG, 52, 84)
	const kit = makeKit(T, scene)
	const {V} = kit
	const center = V(FX, 0, FZ)

	addGround(kit)
	const ledge = addMountains(kit)
	const track = addPath(kit, TRACK, 0.44, '#6c5b3e', 0.22)
	const trail = addPath(kit, TRAIL, 0.17, '#655539', 0.14)
	addPond(kit)
	const fire = addFire(kit)
	addPeople(kit)
	addTent(kit)
	const truckTop = addTruck(kit)
	addSign(kit)
	const ram = addRam(kit, ledge)

	// Trees keep out of these circles. The camp's five places come first:
	// rocks keep out of those only.
	const {tent, truck, pond, sign} = SITE
	addTrees(kit, [
		[FX, FZ, 1.6],
		[tent[0], tent[1], 1.15],
		[truck[0], truck[1], 1.45],
		[pond[0], pond[1], 1.65],
		[sign[0], sign[1], 0.5],
		...MOUNTAIN_CLEARINGS,
		...track,
		...trail,
		[ram.x, ram.z, 0.6],
	])
	addLights(kit, center)

	const [trailX, trailZ] = TRAIL[TRAIL.length - 1]
	const anchors = {
		9: fire.top,
		4: truckTop,
		11: V(pond[0], 0.3, pond[1]),
		14: V(trailX, heightAt(trailX, trailZ) + 0.5, trailZ),
		7: ram.clone().add(V(0, 0.95, 0)),
	}

	return {scene, anchors, tick: fire.tick, ...cameraRig(T, center)}
}
