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
	let view = viewbox(state)
	set_scale(state, view.width / size.width)

	/*
	 * Already called in set_scale, I suppose set_scale and the like should
	 * set a flag, and whenever  the user interface should be updated (say
	 * on a timer) call this.
	 */
	update_transforms(state)
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
	let from = view_to_real(state, graphics.point(click.offsetX, click.offsetY))
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
		let offset = view_to_real_scaled(state,
			graphics.point(mouse.movementX, mouse.movementY))
		let view = viewbox(state)
		let p = graphics.point(view.x - offset.x, view.y - offset.y)
		update_viewbox(state, graphics.rect(
			p.x, p.y, view.width, view.height)
		)
		update_movable(state)

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

function update_transforms(state) {
	let view = viewbox(state)
	let elements = Array.from(document.querySelectorAll(".scales, .moves"))

	for (let i in elements) {
		elements[i].transform.baseVal.clear()
		if (elements[i].classList.contains("scales")) {
			graphics.svg.transform(state.svg, elements[i], "setScale", state["scale"], state["scale"])
		}
		if (elements[i].classList.contains("moves")) {
			graphics.svg.transform(state.svg, elements[i], "setTranslate", view.x, view.y)
		}
	}
}

/*
  * In the future I may make seperate implementations for these, not sure yet.
  * Keeping possibilities open
  */
function update_movable(state) {
	update_transforms(state)
}

function update_scalable(state) {
	update_transforms(state)
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

// Newview is graphics.rect
function update_viewbox(state, newview) {
	limit_viewbox_position(state, newview)
	console.log("Viewbox", newview)
	state.svg.setAttribute("viewBox", [newview.x, newview.y, newview.width, newview.height].join(' '))
}

function limit_viewbox_position(state, view) {
		let maxsize = scale(state, canvas_size(state))
		let maxp = graphics.point(maxsize.width - view.width, maxsize.height - view.height)
		if (view.x < 0) {
			view.x = 0
		} else if (view.x > maxp.x) {
			console.log(`viewbox x restricted to max of ${maxp.x}`)
			view.x = maxp.x
		}
		if (view.y < 0) {
			view.y = 0
		} else if (view.y > maxp.y) {
			console.log(`viewbox y restricted to max of ${maxp.y}`)
			view.y = maxp.y
		}

		return view;
}


function canvas_size(state) {
	return { width: Number(state.svg.getAttribute("width")), height: Number(state.svg.getAttribute("height")) }
}

// from is a viewbox coordinate, obviously I guess
function set_scale(state, scale, from) {
	if (typeof scale !== "number") {
		throw new Error(scale + ": Invalid scale")
	}

	let size = canvas_size(state)
	let view = viewbox(state)
	let furthest = Math.min(view.width / size.width, view.height / size.height)
	if (scale < furthest) {
		console.log(`Unable to zoom out any further than ${furthest} (no more content)`)
		scale = furthest
	}
	if (state["scale"] === scale) {
		return
	}

	state["scale"] = scale

	if (!from) {
		from = graphics.point(
			view.width / 2,
			view.height / 2
		)
	}
	update_viewbox(state, graphics.rect(
			from.x / view.width,
			from.y / view.height,
			view.width,
			view.height
		)
	)
	update_transforms(state)
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
	//console.debug(`Viewbox to real coord: ${p.x}x${p.y} -> ${r.x}x${r.y} [scale ${state.scale}] [view ${viewbox(state).x}, ${viewbox(state).width}] [canvas ${canvas_size(state).width}]`)
	return r
}

function view_to_real_scaled(state, p) {
	return scale(state, view_to_real(state, p))
}

function real_to_absolute(state, p) {
	let view = viewbox(state)

	return graphics.point(
		p.x + (view.x / state["scale"]),
		p.y+ (view.y / state["scale"])
	)
}

function scale(state, obj) {
	for (let i in obj) {
		if (typeof obj[i] !== "number") {
			throw new Error("expected number")
		}
		obj[i] *= state["scale"]
	}
	return obj
}

function unscale(state, obj) {
	for (let i in obj) {
		if (typeof obj[i] !== "number") {
			throw new Error("expected number")
		}
		obj[i] /= state["scale"]
	}
	return obj
}
			
init()
