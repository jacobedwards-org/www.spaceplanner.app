import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"

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
	}
})

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

	addPoint(point) {
		let already = this.pointAt(point)
		if (already) {
			return already.select()
		}
		return this.draw.findOne("#points")
			.circle(4)
			.addClass("point")
			.move(point.x, point.y)
			.select()
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

	addWall() {
		let points = this.selectedPoints()
		return this.draw.find("#walls")
			.line(points.b.x, points.b.y, points.a.x, points.a.y)
			.stroke("black")
	}

	selectedPoints() {
		return {
			a: this.selectedPoint(),
			b: this.lastSelectedPoint()
		}
	}

	selectedPoint() {
		return this.draw.findOneMax("#points > .selected").pos()
	}

	lastSelectedPoint() {
		return this.draw.findOneMax("#points > .last_selected").pos()
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
