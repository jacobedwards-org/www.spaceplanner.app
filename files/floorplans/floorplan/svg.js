import *  as graphics from "./graphics.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

/*
 * NOTE: This system is okay, but I was thinking of restructuring
 * it to look like this:
 *	units =
 *	    { system: [ { value: 10, name: "inch" }, { value: 12, name: "foot" } ] }
 * because while it's a little more messy, it would be nice to have
 * each element build on the previous unit. Maybe it doesn't matter
 * though because I'll probably only ever hardcode units in like this.
 */
const units = {
	// systems
	imperial: {
		inch: 10,
		foot:  10 * 12
	},
	metric: {
		meter: 254,
		centimeter: 25.4
	}
}

function init() {
	console.warn(modes)
	let state = {
		walls: etc.require_id("walls"),
		// [ { x: X, y: Y }, ... ]
		// I considered using a nested  array instead, but I think this is more appropriate
		points: [],
		units: units["imperial"],
		svg: etc.require_id("floorplan"),
		flags: {}
	}

	init_modes(state, modes)
	switch_mode(state, "precise")
	let mode_selector = etc.require_id("mode_selector")
	for (let mode in modes) {
		mode_selector.append(ui.input(mode, "Switch to " + mode + " mode",
			{ attributes: { type: "submit", value: mode }, handlers: { click: function() { switch_mode(state, mode) } } }
		))
	}
	state.svg.before(mode_selector)

	state.svg.prepend(make_grid(state.units, state.svg.getAttribute("width"), state.svg.getAttribute("height")))
}

function make_grid(units, width, height) {
	let grid = graphics.svg.element("g")
	grid.id = "grid"

	let sorted = sort_units(units)
	for (let i in sorted) {
		let g = graphics.svg.element("g")
		g.id = "grid_" + (sorted.length - i)

		let unit = sorted[i]
		for (let x = unit.val; x < width; x += unit.val) {
			g.append(graphics.svg.line(x, 0, x, height))
		}
		for (let y = unit.val; y < height; y += unit.val) {
			g.append(graphics.svg.line(0, y, width, y))
		}
		grid.append(g)
	}

	return grid
}

function sort_units(units) {
	let a = []
	for (let unit in units) {
		a.push({ name: unit,  val: units[unit] })
	}
	return a.sort(function(a, b) { return (a["val"] < b["val"]) ?  -1 : 1 })
}

function init_modes(state, modes) {
	state["modes"] = {}
	for (let mode in modes) {
		state["modes"][mode] = {}
		for (let event_name in modes[mode]) {
			let a = modes[mode][event_name]
			if (typeof a === "function") {
				a = [ a ]
			} else if (typeof a !== "object") {
				throw new Error("Expected function or object")
			}
			state["modes"][mode][event_name] = []
			for (let i in a) {
				console.debug("init_modes",  mode, event_name, i, a[i])
				state["modes"][mode][event_name].push(function(event) {
					return a[i](state, event)
				})
			}
		}
	}
}

function switch_mode(state, newmode) {
	console.debug("switch_mode", newmode, state)
	if (newmode && !modes[newmode]) {
		throw new Error("'" + newmode + "': Invalid mode")
	}
	if (newmode === state.mode) {
		return
	}
	if (state.mode) {
		remove_mode_handlers(state.svg, state.modes[state.mode])
	}
	if (newmode) {
		add_mode_handlers(state.svg, state.modes[newmode])
	}
	state.mode = newmode
}

let modes = {
	precise: {
		contextmenu: function(state, event) {
			event.preventDefault()
		},
		mousedown: viewbox_movement_handler,
		mousemove: [freedraw_move_handler, viewbox_movement_handler, debug_mouse_position],
		mouseleave: viewbox_movement_handler,
		mouseup: viewbox_movement_handler,
		click: freedraw_click_handler
	},
	add: {
		mousemove:  freedraw_move_handler,
		click: freedraw_click_handler
	}
}

function viewbox_movement_handler(state, mouse) {
	if (mouse.type === "mouseleave") {
		state.flags.moving = false
		console.debug("Movement (left)", state.flags.moving)
	} else if (mouse.button & 2) {
		if (mouse.type === "mousedown") {
			state.flags.moving = true
		} else if (mouse.type === "mouseup") {
			state.flags.moving =  false
		}
		console.debug("Movement (up/down)", state.flags.moving)
	}
	if (state.flags.moving && mouse.type === "mousemove") {
		let docwidth = state.svg.getAttribute("width")
		let docheight = state.svg.getAttribute("height")
		let view = state.svg.viewBox.animVal
		let x = view.x - mouse.movementX
		let y = view.y - mouse.movementY
		if (mouse.movementX > 0 && x < 0) {
			x = 0
		} else if (x + view.width > docwidth) {
			x  = docwidth - view.width
		}
		if (mouse.movementY > 0 && y < 0) {
			y = 0
		} else if (y + view.height > docheight) {
			y = docheight - view.height;
		}
		state.svg.setAttribute("viewBox", [x, y, state.svg.viewBox.animVal.width, state.svg.viewBox.animVal.height].join(' '))
	}
}

// listen on mousemove
function debug_mouse_position(state, mouse) {
	let cursor = document.getElementById("debug_cursor")
	if (!cursor) {
		cursor = graphics.svg.element("circle")
		cursor.id = "debug_cursor"
		cursor.setAttribute("fill", "red")
		cursor.setAttribute("r", ".25em")
		state.svg.append(cursor)
	}
	let text = document.getElementById("debug_cursor_text")
	if (!text) {
		text = document.createElement("span")
		text.id = "debug_cursor_text"
		text.setAttribute("position", "absolute")
		text.setAttribute("color", "red")
		document.body.append(text)
	}
	let p = view_to_canvas_point(state, { x: mouse.offsetX, y: mouse.offsetY })
	text.textContent = [mouse.offsetX, mouse.offsetY].join(", ")
	cursor.setAttribute("cx", p.x)
	cursor.setAttribute("cy", p.y)
}

function freedraw_move_handler(state, mouse) {
	let line =  document.querySelector("line.preview")
	if (!line) {
		line = graphics.svg.element("line")
		line.setAttribute("class","preview")
		state.svg.append(line)
	}

	let last = last_point(state)
	let mp = state["preview_point"] = view_to_canvas_point(state, graphics.point(mouse.offsetX, mouse.offsetY))
	if (!last) {
		line.setAttribute("hidden", true)
	} else {
		if (!mouse.shiftKey) {
			axis_snap(state["preview_point"], last)
		}
		line.removeAttribute("hidden")
		line.setAttribute("x1", last.x)
		line.setAttribute("y1",last.y)
		line.setAttribute("x2", mp.x)
		line.setAttribute("y2", mp.y)
	}
}

function freedraw_click_handler(state, click) {
	if (!state["preview_point"]) {
		throw new Error("Expected preview_point")
	}
	add_points(state, state["preview_point"])
}

function remove_mode_handlers(element, mode_handlers) {
	for (let event in mode_handlers) {
		for (let handler in mode_handlers[event]) {
			console.debug("remove mode handler", event, handler, "from", element)
			element.removeEventListener(event, mode_handlers[event][handler])
		}
	}
}

function add_mode_handlers(element, mode_handlers) {
	for (let event in mode_handlers) {
		for (let handler in mode_handlers[event]) {
			console.debug("add mode handler", event, handler, "from", element)
			element.addEventListener(event, mode_handlers[event][handler], false)
		}
	}
}

function update_points_display(state) {
	let s = ""
	for (let i in state.points) {
		if (i > 0) {
			s += " "
		}
		s += state.points[i].x + ','  + state.points[i].y
	}
	state.walls.setAttribute("points", s)
}

function add_points(state, ...points) {
	for (let i in points) {
		if (typeof points[i].x !== "number" || typeof points[i].y !== "number") {
			throw new Error("Invalid point")
		}
	}
	state["points"].push(...points)
	update_points_display(state)
}

function last_point(state) {
	return  state["points"][state["points"].length - 1]
}

function axis_snap(point, on) {
	let  axis = axis_snap_which(on, point)
	point[axis] = on[axis]
	return point
}

function axis_snap_which(a, b) {
	if (Math.abs(a.x - b.x)  > Math.abs(a.y - b.y)) {
		return "y"
	} else  {
		return "x"
	}
}

function view_to_canvas_point(state, viewbox_point) {
	let view = viewbox(state)

	// NOTE:: I'm dividing by 2 because it works, but I'm not
	// sure if this is because of a universal property or the
	// mousemove offset[XY] values
	return { x: (viewbox_point.x / 2) + view.x, y: (viewbox_point.y / 2) + view.y }
}

function viewbox(state) {
	let a = state.svg.getAttribute("viewBox").split(' ')
	for (let i in a) {
		a[i] = Number(a[i])
	}
	return { x: a[0], y: a[1], width: a[2], height: a[3] }
}

init()
