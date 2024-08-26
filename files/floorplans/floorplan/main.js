import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import "/lib/github.com/svgdotjs/svg.panzoom.js/svg.panzoom.js"
import * as ui from "/lib/ui.js"
import * as etc from "/lib/etc.js"
import * as lib from "./editor.js"	// Confusing, but I don't want to fix variable conflict
import { Vector2 } from "/lib/github.com/ros2jsguy/threejs-math/math/Vector2.js"
import "./geometry.js"
import * as backend from "./backend.js"

const messageTimeout = 4000

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
			zoomMin: .001,
			zoomMax: .5,
			zoomFactor: .5
		})

	let editor = new lib.FloorplanEditor(draw,
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

	editor.draw.on("select", function(event) { selectHandler(event, editor) })

	editor.backend.pull()
		.then(function() {
			if (editor.draw.findExactlyOne("#points").children().length === 0) {
				editor.addPoint({ x: 0, y: 0 })
			}
		})
}

function selectHandler(event, editor) {
	let old = document.getElementById("selOps")
	if (!event.detail.selected) {
		if (old) {
			old.remove()
		}
		return
	}
	let a = event.detail.selected.array()
	let c = document.createElement("li")
	c.setAttribute("id", "selOps")

	c.appendChild(document.createTextNode("Selection: "))
	c.append(ui.input("Delete", "Delete selected objects", {
			attributes: { type: "button" },
			handlers: { click: function() {
				editor.remove(...a)
			}},
		})
	)

	let refs = []
	for (let i in a) {
		refs[i] = lib.getRef(a[i])
	}

	let maps = []
	for (let i in refs) {
		if (refs[i].type === "pointmaps") {
			maps.push(editor.backend.cache.pointmaps[refs[i].id])
		}
	}

	if (maps.length > 0) {
		const changeTypes = function(newvalue) {
			for (let i in maps) {
				editor.mapPoints(newvalue, maps[i].a, maps[i].b)
				editor.updateDisplay()
			}
		}
		c.appendChild(
			selector(editor, { wall: true, door: true }, changeTypes, { text: "Type:" })
		)
	}

	if (old) {
		old.replaceWith(c)
	} else {
		document.querySelector(".toolbar")
			.appendChild(c)
	}
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
			mousedown: selectionHandler
		}
	},
	Precise: {
		points: true,
		handlers: {
			contextmenu: preventDefaultHandler,
			mousedown: [selectionHandler, precisePointHandler],
			mousemove: [precisePointHandler, precisePointMapHandler],
			mouseup: precisePointHandler,
			keydown: [zoomKeysHandler, undoRedoHandler],
			dblclick: precisePointMapHandler
		}
	}
}

// mousedown
function selectionHandler(event, editor) {
	if (event.button != buttons.left) {
		return
	}

	let p = editor.draw.point(event.clientX, event.clientY)

	let x = editor.thingAt(p, "#points")
	if (x) {
		x.select()
		return
	}

	x = editor.thingAt(p, "#pointmaps")
	if (x) {
		x.select()
		return
	}

	editor.draw.select()
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

function radioMenu(editor, key, values, initial, options) {
	options = options ?? {}
	options.callbacks = options.callbacks ?? {}

	let menu = document.createElement("div")
	menu.classList.add("menu")

	menu.appendChild(document.createTextNode(key + ": "))

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

	if (options.nosubmit) {
		return menu
	}

	container.appendChild(document.createTextNode(" "))
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

// mousedown, mousemove, mouseup
function precisePointHandler(event, editor, state) {
	const init = function() {
		state.menu = document.body.querySelector(".toolbar")
			.appendChild(document.createElement("li"))
		state.menu.classList.add("menu")
		state.menu.appendChild(document.createTextNode("Length: "))
		state.len = state.menu
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
	}
	const cleanup = function() {
		if (state.moveTimeout != null) {
			clearTimeout(state.moveTimeout)
		}
		if (state.menu != undefined) {
			state.menu.remove()
		}
		for (let i in state) {
			if (i !== "lastUp") {
				delete state[i]
			}
		}
	}
	const updatePoint = function(p, options) {
		options = options ?? {}

		if (state.snapmap == null) {
			editor.movePoint(state.to, p)
			editor.updateDisplay()
		}

		let points = editor.thingsAt(p, "#points")
		let fid = lib.getId(state.from)
		let tid
		if (state.snapmap == null) {
			tid = lib.getId(state.to)
		}
		let instead
		for (let i in points) {
			let id = lib.getId(points[i])
			if (id !== tid && id !== fid) {
				instead = id
			}
		}

		if (instead != undefined) {
			if (instead !== state.to) {
				if (state.snapmap == null) {
					editor.remove(state.to)
				} else {
					editor.remove(state.snapmap)
				}
				state.to = editor.findRef(backend.newRef("points", instead))
				state.snapmap = editor.mapPoints("wall", state.from, state.to)
			}
		} else if (state.snapmap != null) {
			editor.remove(state.snapmap)
			state.snapmap = null
			state.to = editor.addPoint(p, true)
			editor.mapPoints("wall", state.from, state.to)
			editor.updateDisplay()
			state.to = editor.findRef(state.to)
		}

		if (!options.leave_input) {
			state.len.value = userLength(editor,
			    editor.units.snapTo(state.origin.distanceTo(p), editor.unit))
		}
	}
	const doMove = function() {
		// This is racy
		state.moveTimeout = null
		updatePoint(snap(editor.units.snapTo(state.move, editor.unit), state.origin, 8))
	}
	const revert = function() {
		/*
		 * NOTE: WARNING: If allowing asyncronous edits this would be bad
		 * I should introduce a revert function which takes diffs and reverts
		 * them specifically, and I suppose pass a diff id with every single action.
		 * I think asyncronous actions would add very little in terms of value,
		 * and take time to implement. Better to disallow for now.
		 */
		editor.finishAction()
		editor.undo()
		cleanup()
	}
	const commit = function() {
		editor.finishAction()
		cleanup()
	}

	if (event.button !== buttons.left) {
		return
	}

	let cursor = editor.draw.point(event.clientX, event.clientY).vec()
	if (event.type === "mouseup") {
		state.lastUp = Date.now()
	}

	if (state.to == undefined) {
		if (event.type === "mousedown") {
			if (state.from != undefined) {
				return
			}

			state.from = editor.selectedPoint()
			if (!state.from) {
				return
			}

			if  (state.lastUp != null && elapsed(state.lastUp) <= 500) {
				state.to = state.from
				state.from = null
	
				// I want the first pointmap defined, but this for now
				let m = editor.backend.mappedPoints[lib.getId(state.to)]
				for (let point in m) {
					state.from = editor.findRef(backend.newRef("points", point))
					break
				}
				if (!state.from) {
					// I mean, there really shouldn't be an orphaned point,
					// and I see no reason to move the only point in the plan
					cleanup()
					throw new Error("Can't move unmapped points")
				}
				init()
			}
	
			state.origin = state.from.vec()
		} else if (event.type === "mouseup") {
			cleanup()
			return // Or should I preventDefault()?
		} else if (event.type === "mousemove" && state.origin != undefined &&
		    state.origin.distanceTo(cursor) > 200) {
			state.to = editor.addPoint(cursor, true)
			editor.mapPoints("wall", state.from, state.to)
			editor.updateDisplay()
			state.to = editor.findRef(state.to)
			init()
		}
		event.preventDefault()
		return
	}

	if (state.to == undefined) {
		return
	}
	if (!state.from) {
		throw new Error("Hmm")
	}

	if (event.type === "mousemove") {
		// This is still far too expensive, it runs up my fans in seconds.
		state.move = cursor
		if (state.moveTimeout == null) {
			state.moveTimeout = setTimeout(doMove, 35)
		}
	} else if (event.type === "mouseup") {
		if (state.from && state.from.inside(cursor.x, cursor.y)) {
			revert()
		} else {
			// Not that it makes much difference, but should probably use
			// state.to's position
			if (state.to && state.origin.distanceTo(cursor) > 0) {
				commit()
			} else {
				cleanup()
			}
		}
	}  else {
		console.warn("Bit of a state mismatch, not that big of a deal though")
		commit()
		return
	}		
	event.preventDefault()
}

// mousedown, mousemove, mouseup
function precisePointMapHandler(event, editor) {
	// Explicitly check button in case UA isn't complient
	if (event.type === "dblclick" && event.button == buttons.left) {
		let cursor = editor.draw.point(event.clientX, event.clientY).vec()
		if (editor.thingAt(cursor, "#points")) {
			return
		}

		let map = editor.thingAt(cursor, "#pointmaps")
		if (map == null) {
			return
		}

		// Shouldn't really use backend as it's only correct when updateDisplay is called
		let data = editor.backend.reqId("pointmaps", lib.getId(map))
		if (data.type != "wall") {
			throw new Error("Changing direction of doors not yet supported")
		}

		event.preventDefault()

		let sub = map.whereIsPoint(cursor.x, cursor.y)
		if (sub == null) {
			throw new Error("Expected point on line")
		}

		sub = editor.addPoint(sub)
		console.log(data, sub)
		editor.mapPoints("wall", data.a, sub)
		editor.mapPoints("wall", sub, data.b)
		editor.remove(map)
		editor.updateDisplay()
	}
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

function elapsed(since) {
	return Date.now() - since
}

window.onload = init
