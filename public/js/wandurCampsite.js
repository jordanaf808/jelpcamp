// <wandur-campsite>: the campsite scene in the homepage hero
// (views/campsites/index.ejs), from design mockup 1c.
//
// Five pins set the search form's Activity. A click toggles `active` and fires
// a bubbling, composed `wandur-activity` event with {value, label}.
// heroSearch.js keeps the dropdown and `active` in step.
//
// The live scene runs at 900px and up with motion allowed. Only then, after
// page load, does the element import three.js and the scene, from the view's
// data-three-src and data-scene-src. Without it (reduced motion, no WebGL, a
// failed import) there is no scene and no pins. The pins are one set of
// buttons, so pressed state and tab order survive a start or stop.
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
	const PIN_PARTS =
		'<span class="label"></span><span class="stem"></span><span class="dot"></span>'
	// Shadow DOM sees the page's custom properties but not its focus ring, so
	// .pin restates the ring. The host makes no stacking context, so .pins'
	// z-index lifts the pins over the hero's shade and text; the canvas stays.
	const CSS = `
:host{display:block;position:relative;overflow:hidden}
canvas{position:absolute;inset:0;display:block;width:100%;height:100%;opacity:0;transition:opacity .6s}
:host([data-live]) canvas{opacity:1}
.pins{position:absolute;inset:0;z-index:3;pointer-events:none}
.pin{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;will-change:transform}
.pin[hidden]{display:none}
.label{padding:6px 9px;border:1px solid var(--line-3);background:var(--surface-2);color:var(--text);font:500 var(--fs-mono-xs)/1.2 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;transition:background-color .2s,border-color .2s,color .2s}
.stem{width:1px;height:16px;background:rgba(201,212,160,.55)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--sage);box-shadow:0 0 0 3px rgba(201,212,160,.22)}
.pin:hover .label{border-color:var(--sage)}
.pin:focus-visible{outline:none}
.pin:focus-visible .label{outline:2px solid var(--accent);outline-offset:2px}
.pin[aria-pressed="true"]:focus-visible .label{outline-color:var(--text)}
.pin[aria-pressed="true"] .label{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.pin[aria-pressed="true"] .dot{background:var(--accent);box-shadow:0 0 0 4px rgba(232,121,43,.3)}
.pin[aria-pressed="true"] .stem{background:var(--accent)}
@media (forced-colors:active){.pin[aria-pressed="true"] .label{forced-color-adjust:none;background:Highlight;border-color:Highlight;color:HighlightText}}`

	const pageLoaded = new Promise((resolve) => {
		if (document.readyState === 'complete') resolve()
		else addEventListener('load', resolve, {once: true})
	})

	class WandurCampsite extends HTMLElement {
		static observedAttributes = ['active']

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
			button.innerHTML = PIN_PARTS
			button.firstChild.textContent = label
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
				// After load, so three.js doesn't compete with what the page
				// needs first: fonts, styles, the map.
				await pageLoaded
				if (run !== this._run) return
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
			this._live = this._looping = false
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

		// The context comes first: without WebGL 2, which three.js needs, this
		// throws before building the scene, and before three's console.error.
		_build(T, {buildScene}) {
			this._canvas = document.createElement('canvas')
			this._canvas.setAttribute('aria-hidden', 'true')
			this._pinLayer.before(this._canvas)
			const options = {antialias: true, alpha: true}
			const gl = this._canvas.getContext('webgl2', options)
			if (!gl) throw new Error('WebGL 2 is unavailable.')
			const renderer = (this._renderer = new T.WebGLRenderer({
				canvas: this._canvas,
				context: gl,
				...options,
			}))
			renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
			renderer.setClearColor(0x000000, 0)
			renderer.shadowMap.enabled = true
			renderer.shadowMap.type = T.PCFShadowMap
			// Nothing that casts a shadow moves, so the shadow map is drawn once.
			renderer.shadowMap.autoUpdate = false
			renderer.shadowMap.needsUpdate = true
			this._world = buildScene(T)
			this._scene = this._world.scene
			this._anchors = this._pins.map((pin) => ({
				pin,
				point: this._world.anchors[pin.dataset.value],
			}))
			this._cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 160)
			this._v = new T.Vector3()
			this._watch()
			this._fit()
		}

		// The mouse (for the tilt), the element's size, and whether it's on
		// screen. _stopLive undoes all of it.
		_watch() {
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
		}

		_fit() {
			if (!this._renderer) return
			this._w = Math.max(1, this.clientWidth)
			this._h = Math.max(1, this.clientHeight)
			this._renderer.setSize(this._w, this._h, false)
			this._world.frame(this._cam, this._w, this._h)
			// setSize clears the canvas, so draw now rather than leave it blank
			// until the next frame.
			if (this._looping) {
				this._choosePins()
				this._frame(0)
			}
		}

		_project(point) {
			const v = this._v.copy(point).project(this._cam)
			return {x: ((v.x + 1) / 2) * this._w, y: ((1 - v.y) / 2) * this._h}
		}

		// Shows each pin whose whole box fits in the canvas, judged once per
		// size from the camera at rest, so drift can't make a pin blink. A
		// focused pin stays, so focus never drops.
		_choosePins() {
			for (const pin of this._pins) pin.hidden = false
			// Every size is read before any pin hides: one layout, not five.
			const sizes = this._pins.map((pin) => [pin.offsetWidth, pin.offsetHeight])
			this._world.aim(this._cam)
			this._anchors.forEach(({pin, point}, i) => {
				const [width, height] = sizes[i]
				const {x, y} = this._project(point)
				const fits =
					x - width / 2 >= 0 &&
					x + width / 2 <= this._w &&
					y - height >= 0 &&
					y <= this._h
				pin.hidden = !fits && this._root.activeElement !== pin
			})
		}

		// The first frame is drawn at once, so the pins never show unplaced.
		_loop() {
			this._looping = true
			this._choosePins()
			this._frame(0)
			this.setAttribute('data-live', '')
			let last = performance.now()
			const step = (now) => {
				this._frameId = requestAnimationFrame(step)
				const dt = Math.min(0.05, (now - last) / 1000)
				last = now
				if (this._visible) this._frame(dt)
			}
			this._frameId = requestAnimationFrame(step)
		}

		// One frame: drift and mouse tilt, the fire, then the pins over it.
		_frame(dt) {
			const m = this._mouse
			this._t += dt
			m.easedX += (m.x - m.easedX) * 0.06
			m.easedY += (m.y - m.easedY) * 0.06
			const drift = Math.sin(this._t * 0.18) * 0.03
			this._world.aim(this._cam, m.easedX * 0.07 + drift, -m.easedY * 0.05)
			this._world.tick(this._t)
			this._renderer.render(this._scene, this._cam)
			for (const {pin, point} of this._anchors) {
				if (pin.hidden) continue
				const {x, y} = this._project(point)
				pin.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
			}
		}
	}

	customElements.define('wandur-campsite', WandurCampsite)
})()
