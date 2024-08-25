import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import * as backend from "./backend.js"

const selectEvent = new Event("select")
const unselectEvent = new Event("unselect")

SVG.extend(SVG.Svg, {
	unselect: function(list) {
		console.debug("Svg.unselect", list)

		let selected
		if (list) {
			selected = list
		} else {
			selected = this.find(".selected")
		}

		// Should also test for selected class
		if (!selected) {
			console.debug("Nothing to unselect")
			return
		}

		this.find(".last_selected")
			.removeClass("last_selected")

		let unselected = selected
			.removeClass("selected")
			.addClass("last_selected")

		// NOTE: Could fire an event, but then I'd have to handle
		// deletions, so I'll leave it until it's needed.
		return unselected
	},

	select: function(list) {
		console.debug("Svg.select", list)

		this.unselect()

		if (list) {
			list.addClass("selected")
		}
		this.fire("select", { selected: list })
		return list
	},

	reselect: function() {
		this.fire("select", { selected: this.find(".selected") })
	}
})

SVG.extend(SVG.List, {
	selectList: function() {
		let root
		this.each(function(item) {
			if (!root) {
				root = item.root()
			} else if (root != item.root())
				throw new Error("Cannot select from different documents")
			})

		return root.select(this)
	},

	array: function() {
		let a = []
		this.each(function(item) {
			a.push(item)
		})
		return a
	}
})

SVG.extend(SVG.Element, {
	select: function() {
		return new SVG.List([this]).selectList()[0]
	},

	findOneMax: function(selector) {
		let results = this.find(selector)
		if (results.length > 1) {
			throw new Error("Found more than one element")
		}
		if (results.length == 1)
			return results[0]
		return undefined
	},

	findExactlyOne: function(selector) {
		let r = this.findOneMax(selector)
		if (!r) {
			throw new Error("Didn't find " + selector)
		}
		return r
	}
})

// May not be needed anymore
SVG.extend(SVG.Circle, {
	// Maybe this already exists?
	pos: function() {
		let attrs = this.attr(["cx", "cy"])
		return { x: attrs.cx, y: attrs.cy }
	}
})

class Units {
	constructor() {
		this.data = {}
		this.systems = {}
		this.symbols = {}
	}

	add(name, factor, options) {
		options = options ?? {}

		if (!name || !factor) {
			throw new Error("Requires name and factor")
		}
		if (this.data[name]) {
			throw new Error("Already exists")
		}
		if (options.base && (!this.data[options.base] || this.data[options.base].next)) {
			throw new Error("Invalid base (already used or does not exist)")
		}
		if (options.base && options.system) {
			throw new Error("Class may only be set on base units")
		}
		if (options.system && this.systems[options.system]) {
			throw new Error("Unit system already exists")
		}
		if (options.symbol && this.symbols[options.symbol]) {
			throw new Error("Symbol already exists")
		}

		this.data[name] = {
			name: name,
			factor: factor,
		}
		if (options.system) {
			this.data[name].system = options.system
			this.systems[options.system] = name
		}
		if (options.symbol) {
			this.data[name].symbol = options.symbol
			this.symbols[options.symbol] = name
		}
		if (options.base) {
			this.data[options.base].next = name
			this.data[name].base = options.base
		}
	}

	get(name, num) {
		if (!name || !this.data[name]) {
			throw new Error("Invalid unit")
		}
		let n = this.data[name].factor
		if (this.data[name].base) {
			n *= this.get(this.data[name].base)
		}
		return n * (num ?? 1)
	}

	system(name) {
		return this.data[this.smallest(name)].system
	}

	smallest(name) {
		return this.walk(name, "base")
	}

	biggest(name) {
		return this.walk(name, "next")
	}

	walk(name, key) {
		while (this.data[name][key]) {
			name = this.data[name][key]
		}
		return name
	}

	separate(units, system) {
		let parts = []
		let unit = this.biggest(this.systems[system])

		do {
			let n = this.get(unit)
			if (units >= n) {
				let amount = Math.floor(units / n)
				units -= amount * n // not sure about floating mod in js
				parts.push({ unit: unit, symbol: this.data[unit].symbol, amount: amount })
			}
		} while (units > 0 && (unit = this.data[unit].base))
		if (units > 0) {
			parts.push({ "amount": units })
		}
		return parts
	}

	combine(parts) {
		let t = 0
		for (let i in parts) {
			if (!parts[i].unit) {
				if (!parts[i].symbol) {
					throw new Error("Requires unit or symbol")
				}
				parts[i].unit = this.symbols[parts[i].symbol]
			}
			t += this.get(parts[i].unit, parts[i].amount)
		}
		return t
	}

	snapTo(x, unit) {
		let n = this.get(unit)
		let f = function(x) {
			x = Math.round(x)
			return x - (x % n)
		}

		if (typeof x === "number") {
			return f(x)
		} else if (Array.isArray(x)) {
			for (let i in x) {
				x[i] = f(x[i])
			}
		} else if (typeof x === "object") {
			for (let i in x) {
				if (typeof x[i] === "number") {
					x[i] = f(x[i])
				}
			}
		} else {
			throw new Error("Unable to snap that")
		}

		return x
	}
}

export class FloorplanEditor {
	constructor(svg, floorplan, options) {
		if (!options) {
			options = {}
		}

		this.draw = svg
		this.mode
		this.modes = {}
		this.mode_states = {}

		// Setup units
		this.units = new Units()
		this.units.add("inch", 96, { symbol: '"', system: "imperial" })
		this.units.add("foot", 12, { base: "inch", symbol: "'" })
		this.units.add("centimeter", this.units.get("inch") / 2.54, { symbol: "cm", system: "metric" })
		this.units.add("meter", 100, { symbol: "m", base: "centimeter" })

		if (!options.backend) {
			options.backend = {}
		}
		if (!options.backend.callbacks) {
			options.backend.callbacks = {}
		}

		let editor = this
		options.backend.callbacks.updateId = function(ids) { editor.updateId(ids) }

		this.backend = new backend.FloorplanBackend(floorplan, options.backend)

		// The diff which reflects the state of the displayed objects
		this.diff = -1

		this.grids = {}
		for (let system in this.units.systems) {
			this.grids[system] = gridSystem(this, system)
		}

		this.draw.rect().attr({ id: "grid" })

		this.ui = {}
		this.ui.bottom = this.draw.group().attr({ id: "bottom" })

		let data = this.draw.group().attr({ id: "floorplan" })
		data.group().attr({ id: "pointmaps" }) // lines
		data.group().attr({ id: "points" }) // circles

		this.ui.top = this.draw.group().attr({ id: "top" })

		// Resize grid when appropriate
		this.draw.on("zoom", function(event) {
			editor.updateGrid(event.detail.box)
		})
		this.draw.on("panning", function(event) {
			editor.updateGrid(event.detail.box)
		})
		let resize = new ResizeObserver(function(entries) {
			if (entries[0].target != editor.draw.node) {
				throw new Error("Expected draw node")
			}
			console.debug("Editor resized")
			editor.updateGrid()
		})
		resize.observe(editor.draw.node)

		let selectionRemoval = new MutationObserver(function(mutations) {
			for (const m of mutations) {
				if (m.type === "childList" && m.removedNodes) {
					m.removedNodes.forEach(function(node) {
						if (node.classList.contains("selected")) {
							console.debug("selectionRemoval",
								"Detected selected node being removed")
							editor.draw.reselect()
							return
						}
					})
				}
			}
		})
		selectionRemoval.observe(this.draw.node, { childList: true, subtree: true })

		this.draw.on("select", function(event) {
			editor.selection = event.detail.selection
		})
	}

	useUnits(system) {
		if (!this.units.systems[system]) {
			throw new Error("No such system")
		}
		this.unitSystem = system
		this.useGrid(system)
	}

	get unit() {
		return this.units.systems[this.unitSystem]
	}

	addMode(name, mode) {
		if (this.modes[name]) {
			throw new Error("Mode already exists")
		}
		if (!mode) {
			throw new Error("No mode")
		}

		this.modes[name] = {}
		for (let key in mode) {
			if (key !== "handlers") {
				this.modes[name][key] = mode[key]
			}
		}

		const getHandler = function(editor, handler) {
			editor.mode_states[handler] = {}
			return function(event) {
				return handler(event, state, editor.mode_states[handler])
			}
		}

		// to pass use in another function
		let state = this
		this.modes[name].handlers = {}
		this.mode_states[name] = {}
		for (let type in mode.handlers) {
			this.modes[name]["handlers"][type] = []

			let a = mode.handlers[type]
			if (typeof a === "function") {
				a = [ a ]
			} else if (typeof a !== "object") {
				delete this.modes[name]
				throw new Error("Expected function or object")
			}

			for (let i in a) {
				console.debug("Create mode handler", name, type, a[i])
				this["modes"][name]["handlers"][type]
					.push(getHandler(this, a[i]))
			}
		}

		console.log("Add mode", mode)
		return this
	}

	useMode(newmode) {
		if (newmode && !this.modes[newmode]) {
			throw new Error("'" + newmode + "': Invalid mode")
		}

		if (newmode === this.mode) {
			return this
		}

		if (this.mode) {
			remove_mode_handlers(this.draw, this.modes[this.mode].handlers)
		}

		if (newmode) {
			let points = this.draw.findOne("#points")
			if (this.modes[newmode].points) {
				points.attr("visibility", null)
			} else {
				points.attr("visibility", "hidden")
			}
			add_mode_handlers(this.draw, this.modes[newmode].handlers)
		}

		this.mode = newmode
		console.log("Mode", this.mode)
		return this
	}

	useGrid(system) {
		let grid = this.draw.findExactlyOne("#grid")
		if (!system) {
			grid.attr("visibility", "hidden")
		} else {
			grid.fill(this.grids[system].url()).attr("visibility", null)
		}
	}

	updateGrid(box) {
		let grid = this.draw.findExactlyOne("#grid")
		if (!box) {
			box = this.draw.viewbox()
		}

		const swap = { x: "y", y: "x", width: "height", height: "width" }
		const map = { width: "x", height: "y" }

		// Reads easy, right?
		let real = this.draw.node.getBoundingClientRect()
		let base = (real.width > real.height) ? "height" : "width"
		let val = real[swap[base]] * (box[base] / real[base])
		let diff = val - box[swap[base]]
		box[map[swap[base]]] -= diff / 2
		box[swap[base]] = val
		grid.size(box.width, box.height).move(box.x, box.y)
	}

	// Should be called after each user "action"
	finishAction() {
		this.backend.history.newGroup()
	}

	undo() {
		this.backend.undo()
		this.updateDisplay()
	}

	redo() {
		this.backend.redo()
		this.updateDisplay()
	}

	addPoint(point, force) {
		if (!force) {
			let already = this.pointAt(point)
			if (already) {
				return already
			}
		}
		return this.backend.addPoint(point)
	}

	remove(...elements) {
		let later = []

		for (let i in elements) {
			let ref = getRef(elements[i])
			if (ref.type === "pointmaps") {
				this.backend.unmapPoints(ref.id)
			} else {
				later.push(ref)
			}
		}

		for (let i in later) {
			if (later[i].type === "points") {
				this.backend.removePoint(later[i].id, { unmap: true })
			} else {
				throw new Error("Unsupported type")
			}
		}

		this.backend.removeOrphans()
		this.updateDisplay()
	}

	movePoint(point, coordinate) {
		return this.backend.replacePoint(getId(point, "points"), coordinate)
	}

	removePoints(...points) {
		for (let i in points) {
			points[i] = backend.newRef("points", getId(points[i]))
		}
		return this.remove(points)
	}

	pointAt(point) {
		return this.thingAt(point, "#points")
	}

	thingAt(point, selector) {
		return this.thingsAt(point, selector, 1)[0]
	}

	thingsAt(point, selector, max) {
		let children = this.draw.find(selector ?? "*")
			.children()
			.toArray()

		let inside = []
		for (let i in children) {
			if (children[i].inside(point.x, point.y)) {
				if (inside.push(children[i]) >= max) {
					return inside
				}
			}
		}
		return inside
	}

	mapSelected(type) {
		let points = this.selectedPoints()
		return this.mapPoints(type, points.a, points.b)
	}

	mapPoints(type, p1, p2) {
		let ref = this.backend.mapPoints(type, getId(p1, "points"), getId(p2, "points"))
		this.updateDisplay()
		return ref
	}

	selectedPoints() {
		return {
			a: this.selectedPoint(),
			b: this.lastSelectedPoint()
		}
	}

	selectedPoint() {
		return this.draw.findOneMax("#points > .selected")
	}

	lastSelectedPoint() {
		return this.draw.findOneMax("#points > .last_selected")
	}

	updateDisplay() {
		let diffs = this.backend.history.between(this.diff, this.backend.history.place)
		if (diffs.length > 0) {
			this.applyDiffs(diffs)
			this.diff = diffs.at(-1).id
			if (this.diff > this.backend.history.place) {
				this.diff -= 1
			}
			console.debug("Editor.updateDisplay", "Updated display to diff id", this.diff)
		}
	}

	applyDiffs(diffs) {
		for (let op in diffs) {
			this.applyOp(diffs[op])
		}
	}

	applyOp(diff, reverse) {
		console.debug("Editor.applyOp", diff)
		let editor = this

		let ops = {
			add: {
				points: function(name, value, ref) {
					let cur = editor.draw.findOneMax(byId(name))
					// Update pointmaps
					if (cur) {
						cur.cx(value.x).cy(value.y)
							.select()
					} else {
						editor.draw.findOne("#points")
							.circle(4)
							.cx(value.x).cy(value.y)
							.attr({ id: name })
							.addClass("point")
							.select()

					}
					for (let oth in editor.backend.mappedPoints[ref.id]) {
						let map = editor.backend.mappedPoints[ref.id][oth]
						oth = editor.backend.reqId("points", oth)
						map = editor.draw.findOneMax(byId(refId((backend.newRef("pointmaps", map)))))
						if (map) {
							// It's probably being added later, that said, this isn't a good solution
							// because it doesn't allow for checking for errors.
							map.plot(oth.x, oth.y, value.x, value.y)
						}
					}
				},
				pointmaps: function(name, value) {
					if (value.type !== "wall" && value.type !== "door") {
						throw new Error("Only walls and doors currently supported")
					}
					let a = editor.backend.reqId("points", value.a)
					let b = editor.backend.reqId("points", value.b)
					let wall = editor.draw.findOneMax(byId(name))
					if (wall) {
						wall.plot(a.x, a.y, b.x, b.y)
							.removeClass(wall.data("type"))
							.addClass(value.type)
							.data("type", value.type)
					} else {
						editor.draw.findExactlyOne("#pointmaps")
							.line(a.x, a.y, b.x, b.y)
							.stroke({ color: "black", width: 400 })
							.attr({ id: name })
							.addClass(value.type)
							.data("type", value.type)
					}
				}
			},
			remove: {
				points: function(name) {
					// Remove pointmaps
					editor.draw.findExactlyOne(byId(name)).remove()
				},
				pointmaps: function(name) {
					editor.draw.findExactlyOne(byId(name)).remove()
				}
			}
		}
		if (ops.replace) {
			throw new Error("You messed up")
		}
		ops.replace = ops.add

		if (!ops[diff.op]) {
			throw new Error(diff.op + ": Unexpected patch operation")
		}

		let ref = backend.parsePath(diff.path)
		if (!ops[diff.op][ref.type]) {
			throw new Error("Unhandled patch")
		}
		ops[diff.op][ref.type](refId(ref), diff.value, ref)
	}

	updateId(ids) {
		let e = this.findRef(backend.newRef(ids.type, ids.old))
		e.attr({ id: refId(backend.newRef(ids.type, ids.new)) })
		console.log("Editor.updateId", `${ids.old} -> ${ids.new}`)
	}

	findRef(ref) {
		return this.draw.findExactlyOne(byId(refId(getRef(ref))))
	}
}

function remove_mode_handlers(target, mode_handlers) {
	for (let event in mode_handlers) {
		for (let handler in mode_handlers[event]) {
			console.debug("Remove mode handler", event, handler, "to", target)
			let h = mode_handlers[event][handler]
			if (event === "keydown" || event === "keyup") {
				document.removeEventListener(event, h)
			} else {
				target.off(event, h)
			}
		}
	}
}

function add_mode_handlers(target, mode_handlers) {
	for (let event in mode_handlers) {
		for (let handler in mode_handlers[event]) {
			console.debug("Add mode handler", event, handler, "to", target)
			let h = mode_handlers[event][handler]
			if (event === "keydown" || event === "keyup") {
				document.addEventListener(event, h)
			} else {
				target.on(event, h)
			}
		}
	}
}

function gridPattern(editor, unit, using) {
	let n = editor.units.get(unit)
	return editor.draw.pattern(n, n, function(on) {
		if (using) {
			on.rect(n, n).fill(using.url())
		}
		on.path(`M ${n} 0 L 0 0 0 ${n}`)
			.fill("none")
			.stroke({ width: n / 50, color: "grey" })
	}).attr({ id: "grid_" + unit + "_pattern", patternUnits: "userSpaceOnUse" })
}

function gridSystem(editor, system) {
	let unit = editor.units.systems[system]
	let last

	do {
		last = gridPattern(editor, unit, last)
	} while ((unit = editor.units.data[unit].next));
	return last
}

export function getRef(thing, type) {
	console.debug("getRef", thing, type)
	let ref
	if (typeof thing === "object") {
		if (typeof thing.attr === "function") {
			ref = idRef(thing.attr("id"))
		} else if (typeof thing.type === "string" && typeof thing.id === "number") {
			ref = thing
		}
	} else if (typeof thing === "string") {
		ref = idRef(thing)
	}

	if (!ref) {
		console.error("Couldn't get ref from", thing)
		throw new Error("Invalid ref")
	}
	if (type && ref.type != type) {
		throw new Error(`${ref.type}: Invalid ref type (wanted ${type})`)
	}
	return ref
}

export function getId(thing, type) {
	console.debug("getId", thing)

	let n = Number(thing)
	if (isNaN(n)) {
		return getRef(thing, type).id
	}
	return n
}

export function idRef(id) {
	let a = id.split("_")
	if (a.length != 2) {
		throw new Error(`${id}: Invalid id`)
	}
	return backend.newRef(a[0], a[1])
}

function byId(id) {
	return "#" + id
}

function refId(ref) {
	return ref.type + "_" + ref.id
}
