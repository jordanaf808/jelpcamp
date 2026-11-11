// <wandur-campsite>: the campsite scene in the homepage hero
// (views/campsites/index.ejs), from design mockup 1c.
//
// Five pins set the search form's Activity. A click toggles `active` and fires
// a bubbling, composed `wandur-activity` event with {value, label}.
// heroSearch.js keeps the dropdown and `active` in step.
//
// The live scene runs only at 900px and up, with motion allowed. Only then
// does the element import three.js (data-three-src) and the scene
// (data-scene-src), both URLs from the view. Without the live scene (reduced
// motion, no WebGL, a failed import) the element shows no scene and no pins.
// The pins are one set of buttons for the element's whole life, so focus
// stays put when the live scene starts or stops.
;(() => {
	if (customElements.get('wandur-campsite')) return

	const LIVE = '(min-width: 900px) and (prefers-reduced-motion: no-preference)'
	const PINS = [
		{value: '9', label: 'Camping'},
		{value: '4', label: 'Auto touring'},
		{value: '11', label: 'Fishing'},
		{value: '14', label: 'Hiking'},
		{value: '7', label: 'Climbing'},
	]
	// Shadow DOM sees the page's custom properties, so the pins use the site's
	// tokens. It doesn't see the page's focus ring, so .pin restates it.
	const CSS = `
:host{display:block;position:relative;overflow:hidden}
canvas{position:absolute;inset:0;display:block;width:100%;height:100%;opacity:0;transition:opacity .6s}
:host([data-live]) canvas{opacity:1}
.pins{position:absolute;inset:0;pointer-events:none}
.pin{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;will-change:transform}
.pin[hidden]{display:none}
.label{padding:6px 9px;border:1px solid var(--line-3);background:var(--surface-2);color:var(--text);font:500 var(--fs-mono-xs)/1.2 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;transition:background-color .2s,border-color .2s,color .2s}
.stem{width:1px;height:16px;background:rgba(201,212,160,.55)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--sage);box-shadow:0 0 0 3px rgba(201,212,160,.22)}
.pin:hover .label{border-color:var(--sage)}
.pin:focus-visible{outline:none}
.pin:focus-visible .label{outline:2px solid var(--accent);outline-offset:2px}
.pin[aria-pressed="true"] .label{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.pin[aria-pressed="true"] .dot{background:var(--accent);box-shadow:0 0 0 4px rgba(232,121,43,.3)}
.pin[aria-pressed="true"] .stem{background:var(--accent)}`

	const span = (className, text) => {
		const el = document.createElement('span')
		el.className = className
		if (text) el.textContent = text
		return el
	}

	class WandurCampsite extends HTMLElement {
		static get observedAttributes() {
			return ['active']
		}

		constructor() {
			super()
			this._root = this.attachShadow({mode: 'open'})
			this._root.innerHTML = `<style>${CSS}</style><div class="pins"></div>`
			this._pinLayer = this._root.querySelector('.pins')
			this._pins = PINS.map((pin) => this._makePin(pin))
			this._pinLayer.append(...this._pins)
			// Bumped on every start and stop, so a start still loading when the
			// element stops (or restarts) knows to give up.
			this._run = 0
			this._t = 0
			this._mouse = {x: 0, y: 0, easedX: 0, easedY: 0}
		}

		connectedCallback() {
			this.setAttribute('role', 'group')
			this.setAttribute('aria-label', 'Pick an activity')
			this._syncPins()
			this._query = matchMedia(LIVE)
			this._onQuery = () =>
				this._query.matches ? this._startLive() : this._stopLive()
			this._query.addEventListener('change', this._onQuery)
			this._onQuery()
		}

		disconnectedCallback() {
			this._query.removeEventListener('change', this._onQuery)
			this._stopLive()
		}

		attributeChangedCallback() {
			this._syncPins()
		}

		_makePin({value, label}) {
			const button = document.createElement('button')
			button.type = 'button'
			button.className = 'pin'
			button.dataset.value = value
			button.hidden = true
			button.append(span('label', label), span('stem'), span('dot'))
			button.addEventListener('click', () => {
				const next = this.getAttribute('active') === value ? '' : value
				this.setAttribute('active', next)
				this.dispatchEvent(
					new CustomEvent('wandur-activity', {
						detail: {value: next, label},
						bubbles: true,
						composed: true,
					}),
				)
			})
			return button
		}

		_syncPins() {
			const active = this.getAttribute('active') || ''
			for (const pin of this._pins) {
				pin.setAttribute('aria-pressed', String(pin.dataset.value === active))
			}
		}

		async _startLive() {
			if (this._live) return
			this._live = true
			const run = ++this._run
			try {
				const [T, scene] = await Promise.all([
					import(this.dataset.threeSrc),
					import(this.dataset.sceneSrc),
				])
				if (run !== this._run) return
				this._build(T, scene)
				// Compiles the shaders off the main thread where the GPU driver
				// allows it, instead of in the first frame.
				await this._renderer.compileAsync(this._scene, this._cam)
				if (run !== this._run) return
				this._loop()
			} catch (err) {
				if (run !== this._run) return
				console.warn('<wandur-campsite>: no live scene.', err)
				this._stopLive()
			}
		}

		_stopLive() {
			this._run++
			this._live = false
			cancelAnimationFrame(this._frameId)
			this._resize?.disconnect()
			this._onScreen?.disconnect()
			this.removeEventListener('pointermove', this._onPointerMove)
			this.removeEventListener('pointerleave', this._onPointerLeave)
			this._scene?.traverse((obj) => {
				obj.geometry?.dispose()
				for (const mat of [].concat(obj.material || [])) mat.dispose()
			})
			// dispose() keeps the WebGL context. Losing it, and dropping the
			// canvas, frees it: a browser holds only a few at a time.
			this._renderer?.dispose()
			this._renderer?.forceContextLoss()
			this._canvas?.remove()
			this._scene = this._renderer = this._canvas = null
			this._resize = this._onScreen = null
			for (const pin of this._pins) pin.hidden = true
			this.removeAttribute('data-live')
		}

		// The renderer comes first: without WebGL it throws, before the scene
		// is built for nothing.
		_build(T, {buildScene, VIEW}) {
			this._T = T
			this._view = VIEW
			this._canvas = document.createElement('canvas')
			this._canvas.setAttribute('aria-hidden', 'true')
			this._pinLayer.before(this._canvas)
			const renderer = new T.WebGLRenderer({
				canvas: this._canvas,
				antialias: true,
				alpha: true,
			})
			this._renderer = renderer
			renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
			renderer.setClearColor(0x000000, 0)
			renderer.shadowMap.enabled = true
			renderer.shadowMap.type = T.PCFShadowMap
			const {scene, center, framePoints, anchors, tick} = buildScene(T)
			this._scene = scene
			this._center = center
			this._framePoints = framePoints
			this._tick = tick
			this._anchors = this._pins.map((pin) => ({
				pin,
				point: anchors[pin.dataset.value],
			}))
			this._cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 160)
			this._v = new T.Vector3()
			this._onPointerMove = (e) => {
				if (e.pointerType === 'touch') return
				const r = this.getBoundingClientRect()
				this._mouse.x = (e.clientX - r.left) / r.width - 0.5
				this._mouse.y = (e.clientY - r.top) / r.height - 0.5
			}
			this._onPointerLeave = () => {
				this._mouse.x = this._mouse.y = 0
			}
			this.addEventListener('pointermove', this._onPointerMove)
			this.addEventListener('pointerleave', this._onPointerLeave)
			this._resize = new ResizeObserver(() => this._fit())
			this._resize.observe(this)
			this._visible = true
			this._onScreen = new IntersectionObserver(([entry]) => {
				this._visible = entry.isIntersecting
			})
			this._onScreen.observe(this)
			this._fit()
		}

		_pose(az, el) {
			const c = this._center
			const d = 60
			this._cam.position.set(
				c.x + d * Math.cos(el) * Math.sin(az),
				c.y + d * Math.sin(el),
				c.z + d * Math.cos(el) * Math.cos(az),
			)
			this._cam.lookAt(c)
			this._cam.updateMatrixWorld()
		}

		// Frames the scene to the element's width; the height crops. The frame
		// box's center sits (0.5 + shift) across and (0.5 - lift) down.
		_fit() {
			if (!this._renderer) return
			const w = Math.max(1, this.clientWidth)
			const h = Math.max(1, this.clientHeight)
			this._renderer.setSize(w, h, false)
			this._w = w
			this._h = h
			const {az, el, shift, lift} = this._view
			this._pose(az, el)
			let minX = Infinity
			let maxX = -Infinity
			let minY = Infinity
			let maxY = -Infinity
			for (const p of this._framePoints) {
				const v = this._v.copy(p).applyMatrix4(this._cam.matrixWorldInverse)
				minX = Math.min(minX, v.x)
				maxX = Math.max(maxX, v.x)
				minY = Math.min(minY, v.y)
				maxY = Math.max(maxY, v.y)
			}
			const hw = (maxX - minX) / 2
			const hh = hw / (w / h)
			const cx = (minX + maxX) / 2 - shift * hw * 2
			const cy = (minY + maxY) / 2 - lift * hh * 2
			Object.assign(this._cam, {
				left: cx - hw,
				right: cx + hw,
				top: cy + hh,
				bottom: cy - hh,
			})
			this._cam.updateProjectionMatrix()
		}

		_loop() {
			let last = performance.now()
			const step = (now) => {
				this._frameId = requestAnimationFrame(step)
				const dt = Math.min(0.05, (now - last) / 1000)
				last = now
				if (!this._visible) return
				this._frame(dt)
				if (!this.hasAttribute('data-live')) this.setAttribute('data-live', '')
			}
			this._frameId = requestAnimationFrame(step)
		}

		// One frame: a slow drift, a tilt toward the mouse, the fire, then the
		// pins over the points they mark.
		_frame(dt) {
			const m = this._mouse
			this._t += dt
			m.easedX += (m.x - m.easedX) * 0.06
			m.easedY += (m.y - m.easedY) * 0.06
			const {az, el} = this._view
			const drift = Math.sin(this._t * 0.18) * 0.03
			this._pose(az + m.easedX * 0.07 + drift, el - m.easedY * 0.05)
			this._tick(this._t)
			this._renderer.render(this._scene, this._cam)
			for (const {pin, point} of this._anchors) {
				const v = this._v.copy(point).project(this._cam)
				const x = ((v.x + 1) / 2) * this._w
				const y = ((1 - v.y) / 2) * this._h
				const off = x < 0 || x > this._w || y < 0 || y > this._h
				if (pin.hidden !== off) pin.hidden = off
				if (!off) {
					pin.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
				}
			}
		}
	}

	customElements.define('wandur-campsite', WandurCampsite)
})()
