import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import * as backend from "./backend.js"
import { Vector2 } from "/lib/github.com/mrdoob/three.js/math/Vector2.js"

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

		if (list && list.sameElements(this.find(".selected"))) {
			console.debug("SVG.select", "Already selected; not reselecting")
			return list
		}

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
	},

	sameElements: function(list2) {
		const cmp = function(a, b) {
			return a.attr("id") < b.attr("id")
		}

		let a = this.array()
		let b = list2.array()
		if (a.length != b.length) {
			return false
		}

		a = a.sort(cmp)
		b = b.sort(cmp)
		for (let i = 0; i < a.length; ++i) {
			if (a[i].attr("id") !== b[i].attr("id")) {
				return false
			}
		}
		return true
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
	},

	touching: function(x, y, minsize) {
		let b = this.bbox()
		let d = minsize - b.width 
		if (d > 0) {
			b.x -= d / 2
			b.width = minsize
		}
		d = minsize - b.height
		if (d > 0) {
			b.y -= d / 2
			b.height = minsize
		}
		return (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height)
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

	separate(units, system, options) {
		options = options ?? {}
		let parts = []
		let unit = this.biggest(this.systems[system])

		do {
			let n = this.get(unit)
			if (units >= n) {
				let amount = units / n
				if (this.data[unit].base || options.whole) {
					amount = Math.floor(amount)
				}
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

		let editor = this

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
		options.backend.callbacks["patch"] = function(diff) { editor.applyOp(diff) }

		this.backend = new backend.FloorplanBackend(floorplan, options.backend)

		this.grids = {}
		for (let system in this.units.systems) {
			this.grids[system] = gridSystem(this, system)
		}

		this.draw.rect().attr({ id: "grid" })
		this.useGrid()

		this.ui = {}
		this.ui.bottom = this.draw.group().attr({ id: "bottom" })

		let data = this.draw.group().attr({ id: "floorplan" })
		this.doorSwings = data.group().attr({ id: "door_swings" })
		data.group().attr({ id: "pointmaps" }) // lines
		data.group().attr({ id: "points" }) // circles
		this.layouts = data.group().attr({ id: "furniture_layouts" })  // g of furniture
		this.layout = "1"

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
						if (node.classList && node.classList.contains("selected")) {
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
		const margin = 10000
		grid.size(box.width + margin, box.height + margin).move(box.x - margin / 2, box.y - margin / 2)
	}

	// Should be called after each user "action"
	finishAction() {
		this.backend.history.mark()
		this.backend.push()
	}

	undo() {
		this.backend.undo()
		this.backend.push()
	}

	redo() {
		this.backend.redo()
		this.backend.push()
	}

	addPoint(point, force) {
		if (!force) {
			let already = this.pointAt(point)
			if (already != null) {
				return already
			}
		}
		return this.backend.addPoint(point)
	}

	remove(...elements) {
		let later = []

		for (let i in elements) {
			let id = getID(elements[i])
			if (backend.idType(id) === "pntmap") {
				this.backend.unmapPoints(id)
			} else if (backend.idType(id) === "furmap") {
				// For now, just remove the furniture too
				later.push(this.backend.reqObj(id).furniture_id)
				this.backend.unmapFurniture(id)
			} else {
				later.push(id)
			}
		}

		for (let i in later) {
			let t = backend.idType(later[i])
			if (t === "pnt") {
				this.backend.removePoint(later[i], { unmap: true })
			} else if (t === "fur") {
				this.backend.removeFurniture(later[i])
			} else {
				throw new Error(backend.idType(later[i]) + ": Unsupported type")
			}
		}

		this.backend.removeOrphans()
	}

	movePoint(point, coordinate) {
		return this.backend.replacePoint(getID(point, "points"), coordinate)
	}

	pointAt(point) {
		return this.thingAt(point, "#points")
	}

	thingAt(point, selector, options) {
		options = options ?? {}
		options.max = 1
		return this.thingsAt(point, selector, options)[0]
	}

	thingsAt(point, selector, options) {
		options = options ?? {}

		let children = this.draw.find(selector ?? "*")
			.children()
			.toArray()

		let done = {}
		let inside = []
		for (let i = 0; i < children.length; ++i) {
			if (children[i][options.method ?? "inside"](point.x, point.y, options.minsize)) {
				if (inside.push(children[i]) >= options.max) {
					return inside
				}
				children[i] = null
			}
		}

		return inside
	}

	mapSelected(type) {
		let points = this.selectedPoints()
		return this.mapPoints({ type, a: points.a, b: points.b })
	}

	mapPoints(params, id) {
		if (params.a) {
			params.a = getID(params.a, "points")
		}
		if (params.b) {
			params.b = getID(params.b, "points")
		}
		return this.backend.mapPoints(params, id)
	}

	addFurniture(params, id) {
		return this.backend.addFurniture(params, id)
	}

	mapFurniture(params, id) {
		return this.backend.mapFurniture(params, id)
	}

	addMappedFurniture(params, id) {
		return this.backend.addMappedFurniture(params, id)
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

	applyDiffs(diffs) {
		for (let op in diffs) {
			this.applyOp(diffs[op])
		}
	}

	applyOp(diff) {
		console.debug("Editor.applyOp", diff)
		let editor = this

		let ops = {
			add: {
				points: function(id, value) {
					let cur = editor.draw.findOneMax(byId(id))
					// Update pointmaps
					if (cur) {
						cur.cx(value.x).cy(value.y)
							.select()
					} else {
						editor.draw.findOne("#points")
							.circle(750)
							.cx(value.x).cy(value.y)
							.attr({ id })
							.addClass("point")
							.select()

					}
					for (let oth in editor.backend.mappedPoints[id]) {
						let map = editor.backend.mappedPoints[id][oth]
						ops.add.pointmaps(map, editor.backend.obj(map))
					}
				},
				pointmaps: function(id, value) {
					if (value.type !== "wall" && value.type !== "door") {
						throw new Error("Only walls and doors currently supported")
					}
					let a = editor.backend.obj(value.a)
					let b = editor.backend.obj(value.b)
					let wall = editor.draw.findOneMax(byId(id))
					if (wall) {
						wall.plot(a.x, a.y, b.x, b.y)
							.removeClass(wall.data("type"))
							.addClass(value.type)
							.data("type", value.type)
					} else {
						wall = editor.draw.findExactlyOne("#pointmaps")
							.line(a.x, a.y, b.x, b.y)
							.stroke({ color: "black", width: 550 })
							.attr({ id })
							.addClass(value.type)
							.data("type", value.type)
					}

					let sid = swingID(id)
					if (value.type !== "door" || !value.door_swing) {
						let s = editor.draw.findOne(byId(sid))
						if (s != null) {
							s.remove()
						}
					} else {
						a = new Vector2(a.x, a.y)
						b = new Vector2(b.x, b.y)
						if (value.door_swing.at(0) === "b") {
							let t = a
							a = b
							b = t
						}
						const rad = function(deg) {
							return deg * Math.PI / 180
						}

						let deg = 90
						if (value.door_swing.at(1) === "-") {
							deg = -deg
						}
						let e = b.clone().rotateAround(a, rad(deg))
						let r = a.distanceTo(b)
						let d = `M ${b.x} ${b.y} A ${r} ${r} ${deg} 0 ${deg < 0 ? 0 : 1} ${e.x} ${e.y} L ${a.x} ${a.y} Z`

						let swing = editor.draw.findOne(byId(sid))
						if (swing != null) {
							swing.plot(d)
						} else {
							swing = editor.doorSwings.path(d)
								.fill("rgba(0,0,0,.05)").stroke({ width: 100, color: "#AAA", dasharray: "400 100" })
								.attr({ id: sid })
						}
					}
				},
				furniture: function(id, value) {
					let maps = editor.backend.cache.furniture_maps
					for (let mid in maps) {
						if (maps[mid].furniture_id == id) {
							let m = editor.draw.findOneMax(byId(mid))
							if (m == null) {
								ops.add.furniture_maps(id, editor.backend.cache[id])
								m = editor.draw.findOneMax(byId(mid))
							}
							m.size(value.width, value.depth)
							let t = m.findOne("title")
							if (t == null) {
								t = m.element("title")
							}
							t.words(furniture_name(value))
							m.load(furnitureImage(value))
						}
					}
				},
				furniture_maps: function(id, value) {
					let f = editor.backend.reqObj(value.furniture_id)
					let fm = editor.draw.findOneMax(byId(id))
					if (!fm) {
						fm = editor.layoutG().image(furnitureImage(f))
							.size(f.width, f.depth)
							.attr({ id, preserveAspectRatio: "none" })
						fm.on("error", function() {
							if (this.attr("href") === "/furniture/any.svg") {
								throw new Error("Unable to load furniture assets")
							}
							this.load("/furniture/any.svg")
						})
					}
					fm.cx(value.x).cy(value.y)
					fm.transform({
						rotate: value.angle
					})
				}
			},
			remove: {
				points: function(id) {
					// Remove pointmaps
					editor.draw.findExactlyOne(byId(id)).remove()
				},
				pointmaps: function(id) {
					editor.draw.findExactlyOne(byId(id)).remove()
					let s = editor.draw.findOne(byId(swingID(id)))
					if (s != null) {
						s.remove()
					}
				},
				furniture: function(name) {},
				furniture_maps: function(id) {
					editor.draw.findExactlyOne(byId(id)).remove()
				}
			}
		}
		if (ops.replace) {
			throw new Error("You messed up")
		}
		ops.replace = ops.add
		ops.new = ops.add

		if (!ops[diff.op]) {
			throw new Error(diff.op + ": Unexpected patch operation")
		}

		let id = backend.parsePath(diff.path)
		let t = backend.idTable(id)
		if (!ops[diff.op][t]) {
			throw new Error("Unhandled patch")
		}
		ops[diff.op][t](id, diff.value)
	}

	switchLayout(name) {
		if (this.layout != null) {
			this.layouts.findExactlyOne(byId(layoutID(this.layout))).hide()
		}
		this.layouts.findExactlyOne(byId(layoutID(name))).show()
		this.layout = name
	}

	layoutG(name) {
		if (name == null) {
			name = this.layout
		}
		let id = layoutID(name)
		let layout = this.layouts.findOneMax(byId(id))
		if (layout) {
			return layout
		}
		layout = this.layouts.group().attr({id: id})
		return layout
	}

	findObj(id) {
		return this.draw.findExactlyOne(byId(getID(id)))
	}

	variety(id) {
		let t = backend.idType(id)
		if (t === "furmap") {
			id = this.backend.reqObj(id).furniture_id
		} else if (t !== "fur") {
			throw new Error(id + ": Unable to get furniture definition from that ID")
		}

		let f = structuredClone(this.backend.reqObj(id))
		let d = f.depth
		return this.varietyFrom(f)
	}

	varietyFrom(params) {
		if (this.furniture_types[params.type] == null) {
			throw new Error(params.type + ": Invalid furniture type")
		}
		let vars = this.furniture_types[params.type].varieties
		for (let v in vars) {
			if (params.width == vars[v].width && params.depth == vars[v].depth) {
				return v
			}
		}
		return null
	}

	pointmapLength(map) {
		map = this.backend.reqObj(getID(map))
		let a = this.backend.reqObj(map.a)
		a = new Vector2(a.x, a.y)
		let b = this.backend.reqObj(map.b)
		b = new Vector2(b.x, b.y)
		return a.distanceTo(b)
	}
}

function layoutID(name) {
	return "layout_" + name
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

export function getID(thing, type) {
	console.debug("getID", thing, type)
	let id
	if (typeof thing === "object") {
		if (typeof thing.attr === "function") {
			id = thing.attr("id")
		} else if (typeof thing.type === "string" && typeof thing.id === "string") {
			id = thing.id
		}
	} else if (typeof thing === "string") {
		id = thing
	}

	if (id == undefined) {
		console.error("Couldn't get id from", thing)
		throw new Error("Invalid id")
	}
	if (type && backend.idTable(id) != type) {
		throw new Error(`${backend.idTable(id)}: Invalid table (wanted ${type})`)
	}
	return id
}

function byId(id) {
	return "#" + id
}

function furniture_name(f) {
	return f.name ? `${f.name} (${f.type})` : f.type
}

function swingID(id) {
	return id + "_swing"
}

function furnitureImage(f) {
	return `/furniture/${f.type}/${f.style ?? "default"}.svg`
}
