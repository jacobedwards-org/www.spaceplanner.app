import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import { FloorplanBackend as Backend } from "./backend.js"

SVG.extend(SVG.Element, {
	select: function() {
		console.debug("User selected", this.node)
		this.root().find(".last_selected")
			.removeClass("last_selected")
		this.root().find(".selected")
			.removeClass("selected")
			.addClass("last_selected")
		return this.addClass("selected")
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

export class FloorplanEditor {
	constructor(svg) {
		this.draw = svg
		this.mode
		this.modes = {}
		this.mode_states = {}
		this.backend = new Backend()
		this.updated = null // last time updated from backend

		let floorplan = this.draw.group().attr({ id: "floorplan" })
		floorplan.group().attr({ id: "walls" }) // lines
		floorplan.group().attr({ id: "points" }) // circles
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

		// to pass use in another function
		let state = this
		this.modes[name].handlers = {}
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
				let f = function(event) {
					// NOTE: Maybe handler states should be local to each mode too?
					return a[i](event, state, state["mode_states"][f])
				}
				this["mode_states"][f] = {}
				this["modes"][name]["handlers"][type].push(f)
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

	// Should be called after each user "action"
	finishAction() {
		this.backend.newDiff()
	}

	addPoint(point) {
		let already = this.pointAt(point)
		if (already) {
			return already.select()
		}
		this.backend.addPoint(point)
		this.updateDisplay()
	}

	pointAt(point) {
		let pointInside = null
		this.draw.findOne("#points")
			.children().each(function(child) {
				if (child.inside(point.x, point.y)) {
					pointInside = child
				}
			})
		return pointInside
	}

	mapPoints(type) {
		let pointId = function(id) { return id.split("_")[1] }
		let points = this.selectedPoints()

		this.backend.mapPoints(type,
			pointId(points.a.attr("id")),
			pointId(points.b.attr("id"))
		)
		this.updateDisplay()
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
		let diffs = this.backend.updatesSince(this.updated + 1)
		if (diffs.length === 0) {
			return
		}
		this.updated = diffs[0].time
		this.applyDiff(diffs)
	}

	applyDiff(diff, reverse) {
		if (!reverse) {
			for (let op in diff) {
				this.applyOp(diff[op], reverse)
			}
		} else {
			for (let op = diff.length - 1; i >= 0; --i) {
				this.applyOp(diff[op], reverse)
			}
		}
	}

	applyOp(diff, reverse) {
		console.debug("Editor.applyOp", diff)
		let editor = this

		const reverseOps = {
			add: "remove",
			remove: "add"
		}
		const ops = {
			add: {
				points: function(name, value) {
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
							.on("click", function(event) {
								if (event.shiftKey) {
									this.select()
									event.preventDefault()
								}
							})

					}
				},
				pointmaps: function(name, value) {
					if (value.type !== "wall") {
						throw new Error("Only walls currently supported")
					}
					let a = editor.backend.reqId("points", value.a)
					let b = editor.backend.reqId("points", value.b)
					let wall = editor.draw.findOneMax(name)
					if (wall) {
						wall.plot(a.x, a.y, b.x, b.y)
					} else {
						wall = editor.draw.findExactlyOne("#walls")
							.line(a.x, a.y, b.x, b.y).stroke("black")
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

		if (!ops[diff.op]) {
			throw new Error("Unexpected patch operation")
		}

		let path = diff.path.split("/")
		if (path.length != 2) {
			throw new Error("Expected only two path elements")
		}
		let type = path[0]
		let id = path[1]
		let op = reverse ? reverseOps[diff.op] : diff.op

		if (!ops[op][type]) {
			throw new Error("Unhandled patch")
		}
		ops[op][type](type + "_" + id, diff.value)
	}
}

function remove_mode_handlers(target, mode_handlers) {
	for (let event in mode_handlers) {
		for (let handler in mode_handlers[event]) {
			console.debug("Remove mode handler", event, handler, "from", target)
			target.off(event, mode_handlers[event][handler])
		}
	}
}

function add_mode_handlers(target, mode_handlers) {
	for (let event in mode_handlers) {
		for (let handler in mode_handlers[event]) {
			console.debug("Add mode handler", event, handler, "to", target)
			target.on(event, mode_handlers[event][handler])
		}
	}
}

function byId(id) {
	return "#" + id
}
