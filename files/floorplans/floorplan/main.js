import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import "/lib/github.com/svgdotjs/svg.panzoom.js/svg.panzoom.js"
import * as ui from "/lib/ui.js"
import * as etc from "/lib/etc.js"
import * as lib from "./editor.js"	// Confusing, but I don't want to fix variable conflict
import { Vector2 } from "/lib/github.com/ros2jsguy/threejs-math/math/Vector2.js"
import "./geometry.js"
import * as backend from "./backend.js"
import * as api from "/lib/api.js"

const messageTimeout = 4000

const buttons = {
	left: 0,
	middle: 1,
	right: 2
}

const params = {
	threshold: 650
}

const panBit = 1
const zoomBit = 2

let State = {
	panZoom: 0,
	pointOp: 'Create'
}

// turn off bubbling
const escapeEvent = new Event("escape")

function init() {
	etc.authorize()
	etc.bar()

	// Just to get stuff out of the way for now
	let debug = (new URLSearchParams(new URL(document.URL).search)).get("debug") != undefined

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
					suffix.data = ""
				},
				push: function() {
					suffix.data = ""
				}
			}
		}
	})
	editor.useUnits("imperial")
	editor.draw.hide()
	api.fetch("GET", "furniture")
		.then(function(furniture) {
			editor.furniture_types = furniture
		})
		.catch(function(err) {
			etc.error("That's unexpected. Unable to get furniture definitions")
		})

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

	let addFurn = ui.button("Add Furniture", "Add furniture", "add", { handlers: {
		// TODO: Create it at the last clicked point if on screen, else somewhere reasonable on screen
		click: function() { furnitureMenu(editor, { x: 0, y: 0 }) }
	}})

	toolbar.append(item(addFurn))
	toolbar.append(undoRedo)
	toolbar.append(pushpull)

	if (debug) {
		toolbar.append(item(
			selector(editor.modes, function(mode) { editor.useMode(mode) },
				{ current: editor.mode, text: "Modes:" }
			)
		))
		toolbar.append(item(
			selector(editor.units.systems, function(system) { editor.useUnits(system) },
				{ current: editor.unitSystem, text: "Units:" }
			)
		))
	}

	editor.draw.show()
	editor.backend.pull()
		.then(function() {
			if (editor.draw.findExactlyOne("#points").children().length === 0) {
				editor.addPoint({ x: 0, y: 0 })
			}

			const adj = function(ns, t, pos, siz) {
				t[pos] += (t[siz] - ns) / 2
				t[siz] = ns
			}
			const add = function(d, t, pos, siz) {
				return adj(t[siz] + d, t, pos, siz)
			}

			let bbox = editor.draw.findOne("#floorplan").bbox()
			let ft = editor.units.get("foot")
			let min = ft * 20
			add(ft * 2, bbox, "x", "width")
			if (bbox.width < min) {
				adj(min, bbox, "x", "width")
			}
			add(ft * 2, bbox, "y", "height")
			if (bbox.height < min) {
				adj(min, bbox, "y", "height")
			}
			editor.draw.viewbox(bbox)
			editor.updateGrid()
		})

	let preventWhenSel = function(e) {
		if (editor.draw.findOne(".selected")) {
			e.preventDefault()
		}
	}

	editor.draw.on("touchmove", function(e){ e.preventDefault() });
	editor.draw.on("pinchZoomStart", preventWhenSel)
	editor.draw.on("pinchZoomStart", function() { State.panZoom |= zoomBit })
	editor.draw.on("pinchZoomEnd", function() { State.panZoom &= ~zoomBit})
	editor.draw.on("panStart", function() { State.panZoom |= panBit })
	editor.draw.on("panEnd", function() { State.panZoom &= ~panBit })
}

function selectHandler(event, editor, state) {
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
			attributes: { type: "button", value: "Delete" },
			handlers: { click: function() {
				editor.remove(...a)
			}},
		})
	)

	let ids = []
	for (let i in a) {
		ids[i] = lib.getID(a[i])
	}

	let groups = {}
	let cnt = 0
	for (let i = 0; i < ids.length; ++i) {
		let t = backend.idType(ids[i])
		if (groups[t] === undefined) {
			groups[t] = []
		}
		groups[t].push(ids[i])
		++cnt
	}

	if (groups.pnt && groups.pnt.length === cnt) {
		const pmode = function(mode) { State.pointOp = mode }
		// NOTE: Not sure if this is the behavior I want.
		//pmode("Create")
		c.appendChild(
			selector({ Create: true, Move: true }, pmode, { current: State.pointOp })
		)
	}

	let maps = []
	if (groups.pntmap !== undefined) {
		for (let i = 0; i < groups.pntmap.length; ++i) {
			maps.push(editor.backend.cache.pointmaps[groups.pntmap[i]])
		}
	}

	if (maps.length > 0) {
		const changeTypes = function(newvalue) {
			for (let i in maps) {
				editor.mapPoints(newvalue, maps[i].a, maps[i].b)
			}
		}
		let current = maps[0].type
		for (let i = 0; i < maps.length; ++i) {
			if (current !== maps[i].type) {
				current = null
				break;
			}
		}
		c.appendChild(
			selector({ wall: true, door: true }, changeTypes, { current, text: "Type:" })
		)
	}

	let fmaps = ids.filter(function(item) { return backend.idType(item) === "furmap" })
	if (fmaps.length !== 1) {
		document.querySelectorAll(".furniture_menu").forEach(
			function(e) {
				e.remove()
			}
		)
	} else {
		furnitureMenu(editor, fmaps[0])
	}

	if (old) {
		old.replaceWith(c)
	} else {
		document.querySelector(".toolbar")
			.appendChild(c)
	}
}

function selector(things, select, options) {
	options = options ?? {}

	let form = document.createElement("form")
	form.classList.add("selection")

	if (options.text) {
		form.appendChild(document.createTextNode(options.text))
	}

	let list = form.appendChild(document.createElement("ul"))
	for (let thing in things) {
		console.debug("selector", options.text ?? "something", thing)
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
	Precise: {
		points: true,
		handlers: {
			contextmenu: preventDefaultHandler,
			pointerdown: [selectionHandler, precisePointHandler, precisePointMapHandler, furnitureHandler],
			pointermove: [precisePointHandler, furnitureHandler],
			pointerup: [precisePointHandler, precisePointMapHandler, furnitureHandler],
			keydown: [controlKeyHandler, zoomKeysHandler, undoRedoHandler],
			dblclick: [precisePointMapHandler, furnitureHandler],
			select: selectHandler
		}
	}
}

// pointerdown
function selectionHandler(event, editor) {
	if (event.pointerType === "mouse" && event.button === buttons.right) {
		return
	}

	let p = editor.draw.point(event.clientX, event.clientY)

	let x = editor.thingAt(p, "#" + editor.layoutG())
	if (x) {
		x.select()
		return
	}

	x = editor.thingAt(p, "#points")
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
	escape()
}

function controlKeyHandler(ev, editor) {
	if (ev.type === "keydown" && ev.key === "Escape") {
		escape()
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
	editor.updateGrid()
	handled(event)
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
				handled(event)
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
		handled(event)
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
	handled(event)
}

// pointerdown, pointermove, pointerup
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
			let len =  editor.units.snapTo(unitInput(editor, event.target.value), editor.unit)
			if (len == null) {
				return
			}
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
			delete state[i]
		}
	}
	const updatePoint = function(p, options) {
		options = options ?? {}

		if (state.snapmap == null) {
			editor.movePoint(state.to, p)
		}

		let points = editor.thingsAt(p, "#points")
		let fid = lib.getID(state.from)
		let tid
		if (state.snapmap == null) {
			tid = lib.getID(state.to)
		}
		let instead
		for (let i in points) {
			let id = lib.getID(points[i])
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
				state.to = editor.findObj(instead)
				if (state.removeSnapmap == undefined) {
					state.removeSnapmap = editor.backend.whichPointMap(
						lib.getID(state.from), lib.getID(state.to)
					) == null
				}
				state.snapmap = editor.mapPoints("wall", state.from, state.to)
			}
		} else if (state.snapmap != null) {
			if (state.removeSnapmap) {
				editor.remove(state.snapmap)
				delete state.removeSnapmap
			}
			state.snapmap = null
			state.to = editor.addPoint(p, true)
			editor.mapPoints("wall", state.from, state.to)
			state.to = editor.findObj(state.to)
		}

		if (!options.leave_input) {
			unitInput(editor, state.len,
			    editor.units.snapTo(state.origin.distanceTo(p), editor.unit))
		}
	}
	const doMove = function() {
		const ad = function(a, b) {
			return Math.abs(a - b)
		}
		const updsnaps = function(snaps, k, from, test) {
			let d = ad(from[k], test[k])
			if (d <= params.threshold) {
				if (!snaps[k] || d < snaps[k].d) {
					snaps[k] = { d, v: test[k] }
				}
			}
		}

		// This is racy
		state.moveTimeout = null
		if (state.nosnap) {
			updatePoint(state.move)
			return
		}

		let snapped = snap(editor.units.snapTo(state.move, editor.unit), state.origin, 8)

		let points = editor.backend.cache.points
		let snaps = {}
		let exclude = lib.getID(state.to)
		for (let p in points) {
			if (p != exclude) {
				updsnaps(snaps, "x", snapped, points[p])
				updsnaps(snaps, "y", snapped, points[p])
			}
		}
		if (snaps.x != null) {
			snapped.x = snaps.x.v
		}
		if (snaps.y != null) {
			snapped.y = snaps.y.v
		}
		updatePoint(snapped)
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

	if (event.type === "pointermove") {
		if (!primaryMove(event)) {
			return
		}
	} else if (!truelyPrimary(event)) {
		return
	}

	let cursor = editor.draw.point(event.clientX, event.clientY).vec()
	if (state.to == undefined) {
		if (event.type === "pointerdown") {
			if (state.from != undefined) {
				return
			}

			state.from = editor.selectedPoint()
			if (!state.from) {
				return
			}

			if  (State.pointOp === 'Move') {
				state.to = state.from
				state.from = null

				// I want the first pointmap defined, but this for now
				let m = editor.backend.mappedPoints[lib.getID(state.to)]
				for (let point in m) {
					state.from = editor.findObj(point)
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
		} else if (event.type === "pointerup") {
			if (state.from) {
				cleanup()
			} else {
				return
			}
		} else if (event.type === "pointermove" && state.origin != undefined &&
		    state.origin.distanceTo(cursor) > 200) {
			state.to = editor.addPoint(cursor, true)
			editor.mapPoints("wall", state.from, state.to)
			state.to = editor.findObj(state.to)
			init()
		} else {
			return
		}
		handled(event)
		return
	}

	if (state.to == undefined) {
		return
	}
	if (!state.from) {
		throw new Error("Hmm")
	}

	if (event.type === "pointermove") {
		// This is still far too expensive, it runs up my fans in seconds.
		state.move = cursor
		state.nosnap = event.shiftKey
		if (state.moveTimeout == null) {
			state.moveTimeout = setTimeout(doMove, 35)
		}
	} else if (event.type === "pointerup") {
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
	}

	handled(event)
}

// pointerdown, pointerup, dblclick
function precisePointMapHandler(event, editor, state) {
	const cleanup = function() {
		for (let i in state) {
			delete state[i]
		}
	}

	let cursor = editor.draw.point(event.clientX, event.clientY).vec()
	if (editor.thingAt(cursor, "#points")) {
		return
	}

	if (state.door && event.type === "pointerup") {
		handled(event)

		let door = editor.findObj(state.doorID)
		if (state.doorSwingFrom.distanceTo(cursor) < 500) {
			cleanup()
			return
		}
		let o = door.point_offset(cursor)
		if (state.hinge === "b") {
			o = -o
		}
		let s = (o > 0 ? "+" : "-")
		editor.backend.mapPoints(state.door.type, state.door.a, state.door.b, { door_swing: state.hinge + s })
		cleanup()
		return
	}

	let map = editor.thingAt(cursor, "#pointmaps")
	if (map == null) {
		return
	}

	let id = lib.getID(map)
	let data = editor.backend.obj(id)

	// TODO: Stop using double click
	// Explicitly check button in case UA isn't complient
	if (event.type === "dblclick" && data.type === "wall" && event.button == buttons.left) {
		handled(event)

		let sub = map.whereIsPoint(cursor.x, cursor.y)
		if (sub == null) {
			throw new Error("Expected point on line")
		}

		sub = editor.addPoint(sub)
		editor.mapPoints("wall", data.a, sub)
		editor.mapPoints("wall", sub, data.b)
		editor.remove(map)
		return
	}

	if (data.type !== "door" || !truelyPrimary(event)) {
		return
	}

	if (event.type === "pointerdown") {
		handled(event)
		state.door = data
		state.doorID = id
		state.doorSwingFrom = cursor.clone()
		state.hinge = Math.round(editor.findObj(id).closestLinearInterpolation(cursor)) ? "b" : "a"
	} else {
		console.log("Hmm", event)
	}
}

// pointerdown, pointerup, pointermove
function furnitureHandler(ev, editor, state) {
	const doMove = function() {
		// racy
		if (state.move) {
			let id = state.moving.attr("id")
			editor.mapFurniture({ x: state.move.x, y: state.move.y }, id)
			delete state.move
			state.moved = true
		}
	}
	const cleanup = function() {
		if (state.moved) {
			editor.finishAction()
		}
		for (let k in state) {
			delete state[k]
		}
	}

	if (state.panZoom) {
		cleanup()
		return
	}

	let press = editor.draw.point(ev.clientX, ev.clientY).vec()
	let sel = editor.draw.find("#furniture_layouts > * > .selected").array()
	if (sel.length !== 1) {
		return
	}

	if (ev.type === "pointerdown" && truelyPrimary(ev)) {
		handled(ev)
		state.moving = sel[0]
		state.origin = press
		return
	}

	if (!state.moving) {
		return
	}

	if (ev.type === "pointermove" && primaryMove(ev)) {
		if (press.distanceTo(state.origin) < params.threshold) {
			return
		}
		handled(ev)
		if (state.move) {
			state.move = press
		} else {
			state.move = press
			setTimeout(doMove, 60)
		}
		return
	}

	if (ev.type === "pointerup" && truelyPrimary(ev)) {
		handled(ev)
		doMove()
		cleanup()
		return
	}
}

function enumSelection(input, values, selected) {
	let a = typeof(values.keys) === "function"
	for (let i in values) {
		let opt = input.appendChild(document.createElement("option"))
		opt.appendChild(document.createTextNode(a ? values[i] : i))
	}
}

function furnitureMenu(editor, pointOrID) {
	let oldMenu = document.getElementById("furniture_menu")
	let menu = furnitureMenuX(editor, pointOrID)
	menu.id = "furniture_menu"
	if (oldMenu) {
		oldMenu.replaceWith(menu)
	} else {
		document.body.append(menu)
	}
}

function furnitureMenuX(editor, pointOrID) {
	const def = function(obj) {
		return obj[defKey(obj)]
	}
	const defKey = function(obj) {
		for (let i in obj) {
			return i
		}
	}

	editor.finishAction()
	let p
	let id
	let params
	if (typeof pointOrID === "string") {
		id = pointOrID
		params = editor.backend.reqObj(id)
		let fp = editor.backend.reqObj(params.furniture_id)
		for (let k in fp) {
			params[k] = fp[k]
		}
	} else {
		if (pointOrID == null) {
			p = { x: 0, y: 0 }
		} else if (typeof pointOrID === "object") {
			p = pointOrID
		}
		let type = "any"
		let vars = editor.furniture_types[type].varieties
		let v
		if (def(vars)) {
			v = def(vars)
		} else {
			let s = editor.units.get("inch", 32)
			v = { width: s, depth: s }
		}
		params = {
			x: p.x,
			y: p.y,
			type,
			width: v.width,
			depth: v.depth,
			name: null

		}
		id = editor.addMappedFurniture(params)
	}

	let items = [
		menuItem("name", "Name", { attributes: { value: params.name ?? "" } }),
		menuItem("type", "Type", { break: false, enum: editor.furniture_types, attributes: { value: params.type, required: true } }),
		menuItem("variety", "Variety", { enum: editor.furniture_types[params.type].varieties, attributes: { value: editor.varietyFrom(params) } }),
		menuItem("width", "Width", { attributes: { value: userLength(editor, params.width), required: true } }),
		menuItem("depth", "Depth", { attributes: { value: userLength(editor, params.depth), required: true } }),
		menuItem("angle", "Angle", { attributes: { value: params.angle ?? 0, min: 0, max: 359, type: "number", required: true } })
	]
	let keys = {}
	for (let i in items) {
		keys[items[i].attributes.name] = i
	}

	const fromVariety = function(type, variety) {
		console.log(`Setting with and depth to ${variety} ${type}`)
		if (variety == null) {
			return
		}

		let v = editor.furniture_types[type].varieties[variety]
		params.width = v.width
		items[keys.width].input.value = userLength(editor, v.width)
		params.depth = v.depth
		items[keys.depth].input.value = userLength(editor, v.depth)
		editor.addMappedFurniture(params, id)
	}
	const newVariety = function(init) {
		let vars = editor.furniture_types[items[keys.type].input.value].varieties
		if (vars == undefined) {
			items[keys.variety].container.classList.add("hidden")
			fromVariety()
			return
		}
		let v = menuItem("variety", "Variety", { enum: vars })
		let c = makeItem(v)
		items[keys.variety].container.replaceWith(c)
		items[keys.variety] = v
		items[keys.variety].input.value = editor.varietyFrom(params)
		fromVariety(items[keys.type].input.value, init ? null : defKey(vars))

		c.addEventListener("change", function(ev) {
			fromVariety(items[keys.type].input.value, ev.target.value)
		})
	}

	let menu = makeMenu(items)
	items[keys.type].input.value = params.type
	newVariety(true)
	items[keys.type].input.addEventListener("change", function(ev) {
		newVariety()
	})
	menu.addEventListener("change", function(ev) {
		handled(ev)
		try {
			console.debug("furnitureMenu.change(event)", event.target.name, event.target.value)
			if (event.target.name === "width" || event.target.name === "depth") {
				let u = unitInput(editor, event.target)
				if (u == undefined) {
					return
				}
				params[event.target.name] = u
				items[keys.variety].input.value = editor.varietyFrom(params)
			} else {
				params[event.target.name] = event.target.value
			}
			editor.addMappedFurniture(params, id)
		}
		catch(err) {
			etc.error(err, menu)
			throw err
		}
	})
	let commitHandler = function(ev) {
		handled(ev)
		editor.finishAction()
		menu.remove()
	}
	menu.addEventListener("submit", commitHandler)
	menu.addEventListener("escape", commitHandler)

	return menu
}

function makeMenu(items) {
	let c = document.createElement("form")
	c.classList.add("furniture_menu")
	c.classList.add("escapable")

	// In case I make c != form later
	let form = c

	for (let i in items) {
		form.append(makeItem(items[i]))
		if (items[i].break) {
			form.appendChild(document.createElement("br"))
		}
	}

	return c
}

function makeItem(item) {
	if (item.label != null) {
		item.container = document.createElement("label")
		let label = item.container
		label.appendChild(document.createTextNode(item.label + ": "))
	}

	item.input = document.createElement(item.enum ? "select" : "input")
	if (!item.container) {
		item.container = item.input
	} else {
		item.container.appendChild(item.input)
	}

	if (item.enum != null) {
		enumSelection(item.input, item.enum)
	}
	for (let a in item.attributes ?? {}) {
		item.input.setAttribute(a, item.attributes[a])
	}
	for (let c in item.classes ?? {}) {
		item.container.classList.add(item.classes[c])
	}
	/*
	if (item.break) {
		// NOTE: Want this to be done in CSS instead of with <br>s
		item.container.classList.add("break")
	}
	*/
	return item.container
}

function menuItem(name, label, options) {
	options = options ?? {}
	let attributes = options.attributes ?? {}

	if (options.enum != null && typeof options.enum != "object") {
		throw new Error("Expected object for menuItem enum")
	}
	if (name == undefined) {
		throw new Error("Must have name")
	}

	attributes.name = name
	if (options.value != undefined) {
		attributes.value = options.value
	}
	if (attributes.title == undefined && label != undefined) {
		attributes.title = label
	}

	return {
		label,
		attributes,
		enum: options.enum,
		break: options.break == null ? true : options.break
	}
}

function unitInput(editor, input, value) {
	if (value != null) {
		input.value = userLength(editor, value)
		return
	}

	try {
		return parseUserLength(editor, input.value)
	}
	catch(err) {
		input.setCustomValidity(err)
		input.reportValidity()
		console.warn(err)
	}
}


function parseUserLength(editor, length) {
	let a = length.replaceAll(" ", "").split(/([0-9.]+)/)
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

function preventDefaultHandler(event) {
	handled(event)
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

function handled(event) {
	event.stopImmediatePropagation()
	event.preventDefault()
}

function escape() {
	document.body.querySelectorAll(".escapable").forEach(function(e) {
		console.debug("Escape", e)
		e.dispatchEvent(escapeEvent)
	})
}

function truelyPrimary(ev) {
	if (ev.pointerType === "mouse") {
		return ev.button === buttons.left
	}
	return ev.isPrimary
}

function primaryMove(ev) {
	if (ev.pointerType === "mouse") {
		return true
	}
	return ev.isPrimary
}

window.onload = init
