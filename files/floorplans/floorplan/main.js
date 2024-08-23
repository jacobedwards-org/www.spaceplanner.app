import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import "/lib/github.com/svgdotjs/svg.panzoom.js/svg.panzoom.js"
import * as ui from "/lib/ui.js"
import * as etc from "/lib/etc.js"
import { FloorplanEditor as Editor, idRef } from "./editor.js"
import { Vector2 } from "/lib/github.com/ros2jsguy/threejs-math/math/Vector2.js"
import "./geometry.js"

const messageTimeout = 4000
const movingAddTimeout = 250

const buttons = {
	left: 0,
	middle: 1,
	right: 2
}
	
function init() {
	etc.authorize()
	etc.bar()

	let floorplan = (new URLSearchParams(new URL(document.URL).search)).get("name")
	if (!floorplan) {
		document.location.href = "/floorplans"
	}
	let h1 = document.querySelector("h1")
	h1.textContent = floorplan
	let suffix = h1.appendChild(document.createTextNode(""))

	let draw = SVG()
		.addTo("#editor")
		.panZoom({
			panButton: buttons.right,
			// These need to be set using device size
			zoomMin: .025,
			zoomMax: .5,
			zoomFactor: .5
		})

	let editor = new Editor(draw,
		{ user: localStorage.getItem("username"), name: floorplan },
		{ backend: {
			callbacks: {
				pull: function() {
					editor.updateDisplay()
					suffix.data = ""
				},
				push: function() {
					suffix.data = ""
				}
			}
		}
	})
	editor.useUnits("imperial")
	editor.draw.viewbox(0, 0, editor.units.get("foot", 40), editor.units.get("foot", 40))

	let push = ui.button("Push", "Push updates", "arrow-up",
		{ handlers: { click: function() { editor.backend.push(); notify("Pushed floorplan", "pushpull") } } })
	let pull = ui.button("Pull", "Pull updates", "arrow-down",
		{ handlers: { click: function() { editor.backend.pull(); notify("Pulled floorplan", "pushpull") } } })
	let pushpull = document.createElement("li")
	pushpull.appendChild(pull)
	pushpull.appendChild(push)

	for (let mode in modes) {
		editor.addMode(mode, modes[mode])
	}
	editor.useMode("Precise")

	let toolbar = document.querySelector("header")
		.appendChild(document.createElement("ul"))
	toolbar.classList.add("toolbar")

	let undoRedo = document.createElement("li")
	// These could be hidden when they wouldn't have any effect
	undoRedo.append(ui.button("Undo",
		"Undo last action (you may also press u or control-z)",
		"arrow-undo-circle", {
			handlers: {
				click: function() {
					editor.undo()
				}
			}
		})
	)
	undoRedo.append(ui.button("Redo",
		"Redo next action (you may also press r)",
		"arrow-redo-circle", {
			handlers: {
				click: function() {
					editor.redo()
				}
			}
		})
	)
	toolbar.append(undoRedo)

	toolbar.append(pushpull)
	toolbar.append(item(
		selector(editor, editor.modes, function(mode) { editor.useMode(mode) },
			{ current: editor.mode, text: "Modes:" }
		)
	))
	toolbar.append(item(
		selector(editor, editor.units.systems, function(system) { editor.useUnits(system) },
			{ current: editor.unitSystem, text: "Units:" }
		)
	))

	editor.backend.pull()
		.then(function() {
			if (editor.draw.findExactlyOne("#points").children().length === 0) {
				editor.addPoint({ x: 0, y: 0 })
			}
		})
}

function selector(editor, things, select, options) {
	options = options ?? {}

	let form = document.createElement("form")
	form.classList.add("selection")

	if (options.text) {
		form.appendChild(document.createTextNode(options.text))
	}

	let list = form.appendChild(document.createElement("ul"))
	for (let thing in things) {
		console.log("selector", options.text ?? "something", thing)
		let item = list.appendChild(document.createElement("li"))
		let selector = item
			.appendChild(ui.input(thing, "Select " + thing, {
				attributes: { type: "button", value: thing },
				handlers: { click: function(event) {
					select(event.target.name)
					event.target.parentNode.parentNode
						.querySelectorAll("li > .selected")
						.forEach(function(sel) {
							sel.classList.remove("selected")
						})
					event.target.classList.add("selected")
				}}
			}))
		selector.classList.add("selector")
		if (thing == options.current) {
			selector.classList.add("selected")
		}
	}

	return form
}

let modes = {
	None: {
		handlers: {
			contextmenu: preventDefaultHandler
		}
	},
	Testing: {
		points: true,
		handlers: {
			/*
			 * To allow using right click for panZoom's panning
			 * (not sure if contextmenu is always right click
			 * though.
			 */
			contextmenu: preventDefaultHandler,
			click: addWallHandler
		}
	},
	Precise: {
		points: true,
		handlers: {
			contextmenu: preventDefaultHandler,
			mousedown: preciseAddWallHandler,
			mousemove: preciseAddWallHandler,
			mouseup: preciseAddWallHandler,
			keydown: [zoomKeysHandler, undoRedoHandler, preciseAddWallHandler, pointMapTypeHandler],
			click: pointMapTypeHandler
		}
	}
}

function zoomKeysHandler(event, editor) {
	if (event.key === "+") {
		editor.draw.zoom(editor.draw.zoom() * 1.25)
	} else if (event.key === "-" || event.key === "_") {
		editor.draw.zoom(editor.draw.zoom() / 1.25)
	} else {
		return
	}
	event.preventDefault()
}

// click, keydown
function pointMapTypeHandler(event, editor, state) {
	const cleanup = function() {
		state.menu.remove()
		for (let i in state) {
			delete state[i]
		}
	}
	const commit = function() {
		editor.finishAction()
		cleanup()
	}
	const cancel = function() {
		// NOTE: I would use editor.undo(), but I'm not sure
		// if I'll allow asynchronous menus,etc. in the future
		editor.mapPointsById(state.orig, state.map.a, state.map.b)
		cleanup()
	}
	const change = function(newvalue) {
		editor.mapPointsById(newvalue, state.map.a, state.map.b)
		editor.updateDisplay()
	}

	if (event.type === "keydown") {
		if (!state.menu) {
			return
		}
		if (event.key === "Enter") {
			commit(event)
		} else if (event.key === "Escape") {
			cancel(event)
		} else {
			return
		}
		event.preventDefault()
		return
	}

	if (event.type != "click") {
		return
	}

	// No matter where the user clicks, the old
	// menu should canceled
	if (state.menu) {
		cancel()
	}

	let map = editor.thingAt(editor.draw.point(event.clientX, event.clientY), "#floorplan > *")
	if (!map || map.type != "line") {
		return
	}

	map.select()
	let ref = idRef(map.attr("id"))
	state.map = editor.backend.cache.pointmaps[ref.id]
	state.orig = state.map.type
	if (state.menu) {
		throw new Error("Menu should have already been removed")
	}
	state.menu = document.body.appendChild(
		radioMenu(editor, "map_type", ["wall", "door"], state.orig, { callbacks: {
			commit: commit,
			change: change
		}})
	)

	event.preventDefault()
}

function radioMenu(editor, key, values, initial, options) {
	options = options ?? {}
	options.callbacks = options.callbacks ?? {}

	let menu = document.createElement("aside")
	menu.classList.add("terminal")
	menu.classList.add("menu")

	let form = menu.appendChild(document.createElement("form"))
	let container = form

	if (options.legend) {
		container.appendChild(document.createElement("legend"))
			.appendChild(document.createTextNode(options.legend))
	}

	let radios = radioInputs(key, values, initial)
	for (let i in radios) {
		if (options.callbacks.change) {
			radios[i].addEventListener("change", function(event) {
				options.callbacks.change(event.target.value)
				event.preventDefault()
			})
		}
		container.append(radios[i])
	}

	let submit = container.appendChild(document.createElement("input"))
	submit.setAttribute("type", "submit")
	submit.setAttribute("value", "Change")

	form.addEventListener("submit", function(event) {
		if (options.callbacks.commit) {
			options.callbacks.commit(event)
		}
		event.preventDefault()
	})

	return menu
}

function radioInputs(key, values, initial) {
	let radios = []
	for (let i in values) {
		let label = document.createElement("label")
		let radio = label.appendChild(document.createElement("input"))
		radio.setAttribute("type", "radio")
		radio.setAttribute("name", key)
		radio.setAttribute("value", values[i])
		if (values[i] === initial) {
			radio.setAttribute("checked", true)
		}
		label.append(radio)
		label.append(document.createTextNode(values[i]))
		radios.push(label)
	}
	return radios
}

// keydown
function undoRedoHandler(event, editor) {
	if (event.ctrlKey) {
		if (event.key === "z") {
			editor.undo()
		} else {
			return
		}
	} else {
		if (event.key === "u") {
			editor.undo()
		} else if (event.key === "r") {
			editor.redo()
		} else {
			return
		}
	}
	event.preventDefault()
}

// mousedown, mousemove, mouseup, keydown
function preciseAddWallHandler(event, editor, state) {
	const cleanup = function() {
		state.line.remove()
		state.point.remove()
		state.terminal.remove()
		for (let i in state) {
			delete state[i]
		}
	}
	const updatePoint = function(p, options) {
		options = options ?? {}
		let origin = state.from.vec()
		state.point.move(p.x, p.y)
		let instead = editor.pointAt(p)
		if (instead && instead != state.from) {
			state.point.hide()
			p = instead.select().pos()
			state.gotsnapped = true
		} else if (state.gotsnapped) {
			state.gotsnapped = false
			state.point.show().select()
		}
		state.line.plot(origin.x, origin.y, p.x, p.y)
		if (!options.leave_input) {
			state.len.value = userLength(editor,
			    editor.units.snapTo(origin.distanceTo(p), editor.unit))
		}
	}
	const addWall = function() {
		state.point.remove()
		let p = editor.addPoint(state.point.pos())
		editor.mapPoints("wall", state.from, p)
		cleanup()
		editor.finishAction()
	}

	if (!event.key && event.button !== buttons.left) {
		return
	}

	let p = editor.draw.point(event.clientX, event.clientY).vec()
	if (event.type === "mousedown") {
		if (state.point) {
			if (!state.moving &&
			    (Date.now() - state.lastmoving <= movingAddTimeout)) {
				if (state.from.vec().distanceTo(p) > 0) {
					addWall()
				} else {
					cleanup();
				}
				event.preventDefault()
				return
			}
			if (state.point.inside(p.x, p.y)) {
				state.moving = true
			}
			event.preventDefault()
			return
		}

		state.from = editor.pointAt(p)
		if (!state.from) {
			return
		}
		state.moving = true
		state.line = editor.ui.bottom.line()
			.addClass("wall")
			.addClass("preview")
		state.point = editor.ui.top.circle()
			.addClass("point")
			.addClass("preview")
			.select()
		state.terminal = document.body
			.appendChild(document.createElement("aside"))
		state.terminal.classList.add("terminal")
		state.len = state.terminal
			.appendChild(document.createElement("input"))
		state.len.value = 0
		state.len.addEventListener("input", function(event) {
			let vecs = state.line.vecs()
			let len
			try {
				len = editor.units.snapTo(
					parseUserLength(editor, event.target.value), editor.unit
				)
			}
			catch (err) {
				state.len.classList.add("invalid")
				console.log("Invalid input length", err)
				return
			}
			state.len.classList.remove("invalid")
			if (len> 0) {
				vecs[1] = setLength(vecs[0], vecs[1], len)
				updatePoint(vecs[1], { leave_input: true })
			}
		})
		event.preventDefault()
		return
	}

	if (!state.line) {
		return
	}

	if (event.type === "mousemove") {
		if (!state.moving) {
			return
		}
		let sp = state.from.vec()
		p = snap(editor.units.snapTo(p, editor.unit), sp, 8)
		updatePoint(p)
	} else if (event.type === "mouseup") {
		if (state.from.inside(p.x, p.y)) {
			cleanup();
		} else {
			state.moving = false
			state.lastmoving = Date.now()
		}
	} else if (event.type === "keydown") {
		if (event.key === "Enter") {
			addWall()
			return
		} else if (event.key !== "Escape") {
			return
		}
		cleanup();
	}  else {
		return
	}		
	event.preventDefault()
}

function parseUserLength(editor, length) {
	let a = length.replaceAll(" ", "").split(/([0-9]+)/)
	let amount
	let rebuilt = []
	for (let i in a) {
		if (a[i].length === 0) {
			;
		} else  if (!amount) {
			amount = Number(a[i])
			if (amount === NaN) {
				throw new Error("Invalid number")
			}
		} else {
			if (!editor.units.symbols[a[i]]) {
				throw new Error("Invalid user length")
			}
			rebuilt.push({ symbol: a[i], amount: amount })
			amount = null
		}
	}
	if (amount) {
		rebuilt.push({ unit: editor.unit, amount: amount })
	}
	
	return editor.units.combine(rebuilt)
}

function userLength(editor, units) {
	let a = editor.units.separate(units, editor.unitSystem)
	let words = []
	for (let i in a) {
		if (!a[i].unit) {
			// We don't allow anything smaller than smallest defined unit,
			// though maybe this should be an error condition
			continue
		}
		words.push(String(a[i].amount) + (a[i].symbol ?? a[i].name))
	}
	return words.join(" ")
}

// I suppose this is why math is important...
// and the internet:
// <https://stackoverflow.com/questions/42510144/calculate-coordinates-for-45-degree-snap>
// UPDATE: Probably find an easy way using threejs-math now
function snap(point, on, directions) {
	let factor = (directions ?? 4) / 2
	let dx = point.x - on.x
	let dy = point.y - on.y
	let dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2))
	let angle = Math.atan2(dy, dx)
	angle = Math.round(angle / Math.PI * factor) / factor * Math.PI
	return new Vector2(
		on.x + dist * Math.cos(angle),
		on.y + dist * Math.sin(angle)
	)
}

function setLength(a, b, length) {
	/*
	 * Not sure if a zero length line is worth supporting, it doesn't
	 * really work naturally. To support it you would need another
	 * store of information in addition to the vector
	 */
	if (length <= 0) {
		throw new Error("Zero length line wouldn't be able to be lengthened again")
	}
	/*
	 * Basically make it's origin zero, normalize it to be from
	 * 0-1, multiply it by length, then add the origin back to it.
	 */
	return b.sub(a).normalize().multiplyScalar(length).add(a)
}

// click
function addWallHandler(click, editor) {
	if (click.type !== "click") {
		throw new Error("Expected click event")
	}
	if (click.shiftKey) {
		return
	}

	editor.addPoint(editor.draw.point(click.clientX, click.clientY))
	editor.updateDisplay()
	if (editor.draw.findOne("#points").children().length >= 2) {
		editor.mapSelected("wall")
	}
	editor.finishAction()
	click.preventDefault()
}

function preventDefaultHandler(event) {
	event.preventDefault()
}

function notify(message, id) {
	console.log("Notify", message)

	let e = document.createElement("aside")
	e.id = id
	e.classList.add("message")
	e.textContent = message

	let old
	if (id) {
		old = document.getElementById(id)
	}

	if (old) {
		old.replaceWith(e)
	} else {
		document.body.prepend(e)
	}
	setTimeout(function() { e.remove() }, messageTimeout)
}

function item(node) {
	let i = document.createElement("li")
	i.append(node)
	return i
}

window.onload = init
