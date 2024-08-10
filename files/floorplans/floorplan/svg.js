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
		foot: 10 * 12
	},
	metric: {
		meter: 254,
		centimeter: 25.4
	}
}


function init() {
	let state = {
		walls: etc.require_id("walls"),
		// [ { x: X, y: Y }, ... ]
		// I considered using a nested  array instead, but I think this is more appropriate
		points: [],
		units: units["imperial"],
		svg: etc.require_id("floorplan"),
		svg_ui: etc.require_id("svg_ui"),
		svg_data: etc.require_id("svg_data"),
		scale: 1,
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

	let size = canvas_size(state)
	etc.require_id("floorplan").prepend(make_grid(state.units, size.width, size.height))
	//let view = ..XXXJKLDJF
	//set_scale(state, view.width / size.width)
	set_scale(state, 2)

	update_movable(state)
}

function make_grid(units, width, height) {
	let grid = graphics.svg.element("g")
	grid.id = "grid"
	grid.setAttribute("class", "scales")

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
		mousemove: [freedraw_move_handler, viewbox_movement_handler, debug_mouse_position_handler],
		mouseleave: viewbox_movement_handler,
		mouseup: viewbox_movement_handler,
		click: freedraw_click_handler,
		auxclick: viewbox_scale_handler
	},
	add: {
		mousemove:  freedraw_move_handler,
		click: freedraw_click_handler
	}
}

// Listen on auxclick
function viewbox_scale_handler(state, click) {
	if (click.button != 1) {
		return
	}
	console.log("scale handler")
	let from = graphics.point(click.offsetX, click.offsetY)

	if (click.shiftKey) {
		set_scale(state, state.scale - .5, from)
	} else {
		set_scale(state, state.scale + .5, from)
	}
	click.preventDefault()
}

// Listen on mousedown, mouseup, mouseleave, and mousemove
function viewbox_movement_handler(state, mouse) {
	if (mouse.type === "mouseleave") {
		state.flags.moving = false
		console.debug("Movement (left)", state.flags.moving)
	} else if (mouse.button === 2) {
		if (mouse.type === "mousedown") {
			state.flags.moving = true
		} else if (mouse.type === "mouseup") {
			state.flags.moving =  false
		}
		console.debug("Movement (up/down)", state.flags.moving)
	}
	if (state.flags.moving && mouse.type === "mousemove") {
		let view = viewbox(state)
		let newpos =
			graphics.point(view.x - mouse.movementX, view.y - mouse.movementY)

		let size = canvas_size(state)
		if (newpos.x < 0) {
			newpos.x = 0
		} else if (newpos.x + view.width > size.width) {
			newpos.x = size.width - view.width
		}
		if (newpos.y < 0) {
			newpos.y = 0
		} else if (newpos.y + view.height > size.height) {
			newpos.y = size.height - view.height
		}

		update_viewbox(state, graphics.rect(newpos.x, newpos.y, view.width, view.height))
		update_movable(state)
		console.debug("Move", newpos.x, newpos.y)
	}
}

// Listen on mousemove
function freedraw_move_handler(state, mouse) {
	let line =  document.querySelector("line.preview")
	if (!line) {
		line = graphics.svg.element("line")
		line.setAttribute("class","preview scales")
		state.svg.append(line)
		update_scalable(state)
	}

	let last = last_point(state)

	let p = real_to_absolute(state, view_to_real(state, graphics.point(mouse.offsetX, mouse.offsetY)))

	state["preview_point"] = p

	if (!last) {
		line.setAttribute("hidden", true)
	} else {
		if (!mouse.shiftKey) {
			axis_snap(state["preview_point"], last)
		}
		line.removeAttribute("hidden")
		line.setAttribute("x1", last.x)
		line.setAttribute("y1", last.y)
		line.setAttribute("x2", p.x)
		line.setAttribute("y2", p.y)
	}
}

// Listen on click
function freedraw_click_handler(state, click) {
	if (click.button != 0) {
		return
	}
	if (!state["preview_point"]) {
		throw new Error("Expected preview_point")
	}
	add_points(state, state["preview_point"])
	click.preventDefault()
}

// listen on mousemove
function debug_mouse_position_handler(state, mouse) {
	let cursor = document.getElementById("debug_cursor")
	if (!cursor) {
		cursor = graphics.svg.element("circle")
		cursor.id = "debug_cursor"
		cursor.setAttribute("class", "moves")
		state.svg_ui.append(cursor)
	}
	let text = document.getElementById("debug_cursor_text")
	if (!text) {
		text = document.createElement("span")
		text.id = "debug_cursor_text"
		document.body.append(text)
	}

	let p = view_to_real_scaled(state, graphics.point(mouse.offsetX, mouse.offsetY))
	text.textContent = `Mouse: ${p["x"]}x${p["y"]}`
	cursor.setAttribute("cx", p.x)
	cursor.setAttribute("cy", p.y)
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

function update_movable(state) {
	let moving = Array.from(document.getElementsByClassName("moves"))
	let view = viewbox(state)
	for (let i in moving) {
		moving[i].setAttribute("transform", "translate(" + view.x + "," + view.y + ")")
	}
}

function update_scalable(state) {
	let scaling = Array.from(document.getElementsByClassName("scales"))
	for (let i in scaling) {
		scaling[i].setAttribute("transform", "scale(" + state.scale + ")")
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

function viewbox(state) {
	let a = state.svg.getAttribute("viewBox").split(' ')
	for (let i in a) {
		a[i] = Number(a[i])
	}
	return graphics.rect(a[0], a[1], a[2], a[3])
}

function update_viewbox(state, newview) {
	console.debug("Update viewbox:", newview)
	state.svg.setAttribute("viewBox", [newview.x, newview.y, newview.width, newview.height].join(' '))
}

function canvas_size(state) {
	return { width: Number(state.svg.getAttribute("width")), height: Number(state.svg.getAttribute("height")) }
}

function set_scale(state, scale, from) {
	if (typeof scale !== "number") {
		throw new Error(scale + ": Invalid scale")
	}

	let size = canvas_size(state)
	let view = viewbox(state)
	let furthest = Math.min(view.width / size.width, view.height / size.height)
	console.log(furthest)
	if (scale < furthest) {
		scale = furthest
	}

	state["scale"] = scale
	update_scalable(state)
	console.log("Scale", scale)
}

function view_to_real(state, p) {
	let view = viewbox(state)
	let size = canvas_size(state)
	let scale = state["scale"] * 1

	let r = graphics.point(
		((p.x / (size.width / view.width))) / scale,
		((p.y / (size.height / view.height))) / scale
	)
	console.debug(`Viewbox to real coord: ${p.x}x${p.y} -> ${r.x}x${r.y} [scale ${state.scale}] [view ${viewbox(state).x}, ${viewbox(state).width}] [canvas ${canvas_size(state).width}]`)
	return r
}

function view_to_real_scaled(state, p) {
	let r = view_to_real(state, p)
	let rs = graphics.point(
		r.x * state["scale"],
		r.y * state["scale"]
	)

	console.debug(`Real to real scaled coord: ${r.x}x${r.y} -> ${rs.x}x${rs.y} [scale ${state.scale}] [view ${viewbox(state).x}, ${viewbox(state).width}] [canvas ${canvas_size(state).width}]`)
	return rs
}

function real_to_absolute(state, p) {
	let view = viewbox(state)

	return graphics.point(
		p.x + (view.x / state["scale"]),
		p.y+ (view.y / state["scale"])
	)
}

init()
