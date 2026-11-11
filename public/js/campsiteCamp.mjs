// The camp in the homepage hero's campsite: the fire and its smoke, the
// three people around it, the tent, the 4x4, the trailhead sign and the ram.
// Every number is design mockup 1c's. See campsiteScene.mjs for how the scene
// is put together.
import {SITE, FX, FZ, VIEW, NO_SHADOW, heightAt} from './campsiteLand.mjs'

// The props are drawn a touch larger than life, so they read at hero size.
const S = 1.25
const FIRE_LIGHT = 16
const TENT_GLOW = 0.7

const addSmoke = (T, scene) =>
	Array.from({length: 7}, (_, i) => {
		const mat = new T.MeshStandardMaterial({
			color: '#8b9074',
			transparent: true,
			opacity: 0.3,
			depthWrite: false,
			flatShading: true,
		})
		const puff = new T.Mesh(new T.IcosahedronGeometry(0.1, 0), mat)
		puff.userData.offset = i / 7
		scene.add(puff)
		return puff
	})

const addSparks = (T, scene) => {
	const n = 26
	const geo = new T.BufferGeometry()
	geo.setAttribute(
		'position',
		new T.BufferAttribute(new Float32Array(n * 3), 3),
	)
	const mat = new T.PointsMaterial({
		color: 0xffa646,
		size: 2.2 * Math.min(2, window.devicePixelRatio || 1),
		sizeAttenuation: false,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
	})
	scene.add(new T.Points(geo, mat))
	const p = geo.attributes.position
	return (t, at) => {
		for (let i = 0; i < n; i++) {
			const o = i / n
			const u = (t * 0.55 + o * 1.7) % 1
			p.setXYZ(
				i,
				at.x + Math.sin(o * 41 + t) * 0.25 * u,
				at.y + 0.35 + u * 1.6,
				at.z + Math.cos(o * 31 + t * 0.7) * 0.25 * u,
			)
		}
		p.needsUpdate = true
	}
}

const addFirePit = ({T, M, add, disc}, fire) => {
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * Math.PI * 2
		const geo = new T.DodecahedronGeometry(0.075, 0)
		const x = Math.cos(a) * 0.27
		const z = Math.sin(a) * 0.27
		add(fire, geo, M('#7d7e6c'), x, 0.04, z).rotation.set(i, i * 2, 0)
	}
	const coals = new T.MeshBasicMaterial({color: '#a8481a'})
	add(fire, disc(0.23, 8), coals, 0, 0.012, 0, NO_SHADOW)
	for (let i = 0; i < 3; i++) {
		const log = new T.Group()
		log.rotation.y = (i / 3) * Math.PI * 2
		fire.add(log)
		const geo = new T.CylinderGeometry(0.035, 0.035, 0.42, 5)
		add(log, geo, M('#4a3624'), 0.08, 0.12, 0).rotation.z = 0.95
	}
}

// Returns where the Camping pin points, and tick(t), which animates the
// flames, the firelight, the smoke and the sparks for time t in seconds.
export const addFire = (kit) => {
	const {T, scene, V} = kit
	const fy = heightAt(FX, FZ)
	const fire = new T.Group()
	fire.position.set(FX, fy, FZ)
	fire.scale.setScalar(S)
	scene.add(fire)
	addFirePit(kit, fire)
	const flames = [
		['#e8792b', 0.14, 0.46, 0, 0],
		['#f5a443', 0.1, 0.36, 0.04, 0.03],
		['#ffd982', 0.06, 0.26, -0.02, -0.02],
	].map(([color, r, h, ox, oz]) => {
		const geo = new T.ConeGeometry(r, h, 5).translate(0, h / 2, 0)
		const flame = new T.Mesh(geo, new T.MeshBasicMaterial({color}))
		flame.position.set(ox, 0.04, oz)
		fire.add(flame)
		return flame
	})
	const light = new T.PointLight(0xff7a2a, FIRE_LIGHT, 9 * S, 1.5)
	light.position.set(FX, fy + 0.6, FZ)
	scene.add(light)
	const smoke = addSmoke(T, scene)
	const sparks = addSparks(T, scene)
	const at = V(FX, fy, FZ)
	const tick = (t) => {
		flames.forEach((f, k) => {
			f.scale.set(
				1 + 0.12 * Math.sin(t * 11 + k),
				1 + 0.26 * Math.sin(t * 8.3 + k * 2) + 0.12 * Math.sin(t * 19 + k),
				1 + 0.12 * Math.cos(t * 10 + k),
			)
			f.rotation.y = t * (1.5 + k * 0.4)
		})
		const flicker =
			0.84 +
			0.1 * Math.sin(t * 12.7) +
			0.07 * Math.sin(t * 5.3 + 1) +
			0.05 * Math.sin(t * 23)
		light.intensity = FIRE_LIGHT * flicker
		for (const puff of smoke) {
			const o = puff.userData.offset
			const u = (t * 0.22 + o) % 1
			puff.position.set(
				at.x + u * 0.6 + Math.sin(t * 0.9 + o * 9) * 0.08,
				at.y + 0.75 + u * 2.4,
				at.z - u * 0.25,
			)
			puff.scale.setScalar(0.6 + u * 2.0)
			puff.rotation.set(u * 3, u * 2, 0)
			puff.material.opacity = 0.3 * (1 - u) * Math.min(1, u * 6)
		}
		sparks(t, at)
	}
	return {top: V(FX, fy + 1.05, FZ), tick}
}

const person = ({T, M, add, Box}, jacket, pants, skin, hat) => {
	const g = new T.Group()
	const seat = new T.CylinderGeometry(0.1, 0.1, 0.62, 6).rotateZ(Math.PI / 2)
	add(g, seat, M('#5c4831'), 0, 0.1, -0.03)
	const body = new T.CylinderGeometry(0.075, 0.1, 0.3, 6)
	add(g, body, M(jacket), 0, 0.36, 0).rotation.x = 0.18
	add(g, new T.IcosahedronGeometry(0.075, 0), M(skin), 0, 0.58, 0.045)
	if (hat) add(g, new T.ConeGeometry(0.078, 0.09, 6), M(hat), 0, 0.665, 0.045)
	for (const sx of [-0.05, 0.05]) {
		add(g, Box(0.065, 0.065, 0.24), M(pants), sx, 0.23, 0.12)
		add(g, Box(0.06, 0.22, 0.06), M(pants), sx, 0.12, 0.24)
		add(g, Box(0.05, 0.05, 0.22), M(jacket), sx * 2.1, 0.42, 0.1).rotation.x =
			0.55
	}
	return g
}

export const addPeople = (kit) => {
	const fy = heightAt(FX, FZ)
	for (const [deg, jacket, pants, skin, hat] of [
		[150, '#e8792b', '#2f281d', '#c99b75', '#c9d4a0'],
		[238, '#8a9a4b', '#3b3327', '#8d5f42', null],
		[318, '#c4c2b1', '#2f281d', '#e0b48f', '#5c4831'],
	]) {
		const a = (deg * Math.PI) / 180
		const g = person(kit, jacket, pants, skin, hat)
		g.scale.setScalar(S)
		g.position.set(FX + Math.cos(a) * 0.8 * S, fy, FZ + Math.sin(a) * 0.8 * S)
		g.lookAt(FX, fy, FZ)
		kit.scene.add(g)
	}
}

export const addTent = ({T, scene, M, add, Box}) => {
	const [tx, tz] = SITE.tent
	const r = 0.62
	const tent = new T.Group()
	tent.position.set(tx, heightAt(tx, tz), tz)
	tent.scale.set(S, S * 0.78, S)
	scene.add(tent)
	const shell = new T.CylinderGeometry(r, r, 1.3, 3, 1, false, Math.PI / 2)
		.rotateZ(Math.PI / 2)
		.rotateY(Math.PI / 2)
	add(tent, shell, M('#e8792b'), 0, r * 0.5, 0)
	const door = r * 0.6
	const glow = new T.MeshStandardMaterial({
		color: '#2a1a0c',
		emissive: '#ff9a3c',
		emissiveIntensity: TENT_GLOW,
		flatShading: true,
	})
	const doorGeo = new T.CircleGeometry(door, 3, Math.PI / 2)
	add(tent, doorGeo, glow, 0, door * 0.5, 0.652, NO_SHADOW)
	add(tent, Box(0.03, 0.03, 1.5), M('#5c4831'), 0, r * 1.5 - 0.005, 0)
	tent.rotation.y = VIEW.az - 0.65
}

const addWheels = ({T, M, add}, truck) => {
	const wheel = new T.CylinderGeometry(0.24, 0.24, 0.18, 14).rotateX(
		Math.PI / 2,
	)
	const hub = new T.CylinderGeometry(0.1, 0.1, 0.19, 8).rotateX(Math.PI / 2)
	for (const x of [-0.55, 0.55]) {
		for (const z of [-0.42, 0.42]) {
			add(truck, wheel, M('#14170f'), x, 0.24, z)
			add(truck, hub, M('#8b9074'), x, 0.24, z, NO_SHADOW)
		}
	}
	const spare = new T.CylinderGeometry(0.22, 0.22, 0.14, 14).rotateZ(
		Math.PI / 2,
	)
	add(truck, spare, M('#14170f'), -0.93, 0.62, 0)
}

// Returns where the Auto touring pin points.
export const addTruck = (kit) => {
	const {T, scene, M, add, V, Box} = kit
	const [tx, tz] = SITE.truck
	const truck = new T.Group()
	truck.position.set(tx, heightAt(tx, tz), tz)
	truck.rotation.y = 0.35
	truck.scale.setScalar(S)
	scene.add(truck)
	const body = M('#c9d4a0')
	const trim = M('#1f2617')
	const glass = M('#1a2119', {roughness: 0.35, metalness: 0.3})
	const lamp = (glow) =>
		M('#e9e7da', {emissive: '#f2e6c4', emissiveIntensity: glow})
	add(truck, Box(1.7, 0.42, 0.82), body, 0, 0.45, 0)
	add(truck, Box(1.15, 0.42, 0.78), body, -0.22, 0.87, 0)
	add(truck, Box(1.0, 0.24, 0.79), glass, -0.22, 0.9, 0, NO_SHADOW)
	add(truck, Box(0.02, 0.26, 0.66), glass, 0.36, 0.9, 0, NO_SHADOW)
	add(truck, Box(0.02, 0.22, 0.5), glass, -0.8, 0.9, 0, NO_SHADOW)
	add(truck, Box(1.7, 0.1, 0.86), trim, 0, 0.27, 0)
	add(truck, Box(0.1, 0.13, 0.92), trim, 0.88, 0.32, 0)
	add(truck, Box(1.12, 0.04, 0.8), trim, -0.22, 1.1, 0)
	add(truck, Box(0.55, 0.17, 0.5), M('#8a9a4b'), -0.42, 1.205, 0)
	add(truck, Box(0.06, 0.05, 0.7), lamp(0.35), 0.31, 1.14, 0)
	add(truck, Box(0.05, 0.55, 0.05), trim, 0.48, 0.82, 0.43)
	for (const z of [-0.3, 0.3]) {
		add(truck, Box(0.02, 0.07, 0.11), lamp(0.25), 0.86, 0.52, z, NO_SHADOW)
	}
	addWheels(kit, truck)
	return V(tx, truck.position.y + 1.4 * S, tz)
}

export const addSign = ({T, scene, M, add, Box}) => {
	const [sx, sz] = SITE.sign
	const sign = new T.Group()
	sign.position.set(sx, heightAt(sx, sz), sz)
	sign.scale.setScalar(S)
	sign.rotation.y = VIEW.az
	scene.add(sign)
	add(sign, Box(0.05, 0.62, 0.05), M('#5c4831'), 0, 0.31, 0)
	add(sign, Box(0.34, 0.14, 0.03), M('#8a7350'), 0.06, 0.52, 0.03)
}

// Stands the ram on its ledge. Returns where it stands.
export const addRam = ({T, scene, M, add, Box}, ledge) => {
	const ram = new T.Group()
	ram.position.copy(ledge)
	ram.position.y += 0.06
	ram.rotation.y = VIEW.az + Math.PI
	ram.scale.setScalar(1.55)
	scene.add(ram)
	const fur = M('#9c8668')
	const horn = M('#cdbf9c')
	const leg = M('#6b5a44')
	add(ram, Box(0.42, 0.2, 0.2), fur, 0, 0.3, 0)
	add(ram, Box(0.02, 0.15, 0.16), M('#d6c9a8'), -0.215, 0.31, 0, NO_SHADOW)
	add(ram, Box(0.12, 0.2, 0.14), fur, 0.2, 0.42, 0).rotation.z = -0.35
	add(ram, Box(0.15, 0.1, 0.1), fur, 0.3, 0.5, 0).rotation.z = -0.25
	for (const z of [-0.065, 0.065]) {
		const hornGeo = new T.TorusGeometry(0.06, 0.022, 5, 10, Math.PI * 1.6)
		add(ram, hornGeo, horn, 0.25, 0.53, z).rotation.z = 0.9
		for (const x of [-0.15, 0.15]) {
			add(ram, Box(0.045, 0.21, 0.045), leg, x, 0.1, z * 0.9)
		}
	}
	return ram.position.clone()
}
