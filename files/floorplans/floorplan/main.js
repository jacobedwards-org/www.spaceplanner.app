import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import "/lib/github.com/svgdotjs/svg.panzoom.js/svg.panzoom.js"
import * as ui from "/lib/ui.js"
import * as etc from "/lib/etc.js"
import * as lib from "./editor.js"	// Confusing, but I don't want to fix variable conflict
import { Vector2 } from "/lib/github.com/mrdoob/three.js/math/Vector2.js"
import * as geometry from "./geometry.js"
import * as backend from "./backend.js"
import * as api from "/lib/api.js"

const defaultMode = "Precise"
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

const modes = {
	None: {
		handlers: {
			contextmenu: preventDefaultHandler
		}
	},
	Precise: {
		points: true,
		handlers: {
			contextmenu: preventDefaultHandler,
			pointerdown: [singlePointerHandler, selectionHandler, precisePointHandler, precisePointMapHandler, furnitureHandler],
			pointermove: [singlePointerHandler, precisePointHandler, furnitureHandler],
			pointerup: [singlePointerHandler, precisePointHandler, precisePointMapHandler, furnitureHandler],
			pointercancel: [singlePointerHandler,  selectionHandler, precisePointHandler, precisePointMapHandler, furnitureHandler],
			keydown: [keyHandler],
			dblclick: [precisePointMapHandler, furnitureHandler],
			select: selectHandler,
			reselect: selectHandler
		}
	},
	Select: {
		points: true,
		handlers: {
			contextmenu: preventDefaultHandler,
			pointerdown: selectionHandler,
			keydown: keyHandler,
			select: selectHandler,
			reselect: selectHandler
		}
	}
}

let State = {
	panZoom: 0,
	pointOp: 'Create',
	snapAngle: true,
	snapPoints: true,
	selectMode: false,
	lastClick: null
}

const debug = (new URLSearchParams(new URL(document.URL).search)).get("debug") != undefined

// turn off bubbling
const escapeEvent = new Event("escape")
const cancelEvent = new PointerEvent("pointercancel")

etc.handle_wrap(init)

function init() {
	ui.wait("Loading data...")

	let floorplan_id = (new URLSearchParams(new URL(document.URL).search)).get("id")
	if (!floorplan_id) {
		document.location.href = "/floorplans"
		return
	}

	let floorplan
	if (floorplan_id === "flp_demo") {
		let f = document.body.appendChild(document.createElement("footer"))
		f.id = "demo_footer"
		f.append(document.createTextNode("Missing something? Click "))
		let a = f.appendChild(document.createElement("a"))
		a.append(document.createTextNode("here"))
		a.href = "/features/upcoming.html"
		f.append(document.createTextNode(" to see upcoming features or put in a request"))
	} else {
		etc.authorize()
		floorplan = { user: localStorage.getItem("username"), id: floorplan_id }
	}

	etc.bar()

	let h1 = document.querySelector("h1")
	let suffix = h1.appendChild(document.createTextNode(""))
	if (!floorplan) {
		h1.textContent = "Demo"
	} else {
		api.fetch("GET", `floorplans/:user/${floorplan.id}`)
			.then(function(metadata) {
				h1.textContent = metadata.name
			})
			.catch(function(err) {
				document.location.href = "/floorplans"
			})
	}

	let draw = SVG()
		.addTo("#editor")
		.panZoom({
			panButton: buttons.left,
			// These need to be set using device size
			zoomMin: .001,
			zoomMax: .5,
			zoomFactor: .5
		})

	let editor = new lib.FloorplanEditor(draw, floorplan,
		{ backend: {
			callbacks: {
				pull: function() {
					suffix.data = ""
				},
				push: function() {
					suffix.data = ""
				},
				pusherror: function(err) {
					notify("Failed to push: " + err)
				}
			}
		}
	})

	editor.initialized
		.then(function() { run(editor) })
		.catch(etc.error)
}

function run(editor) {
	ui.wait("Initializing editor...")

	editor.useUnits("imperial")
	editor.draw.hide()

	for (let mode in modes) {
		editor.addMode(mode, modes[mode])
	}
	editor.useMode(defaultMode)

	let toolbar = document.querySelector("header")
		.appendChild(document.createElement("ul"))
	toolbar.classList.add("toolbar")

	let undoRedo = document.createElement("li")
	// These could be hidden when they wouldn't have any effect
	undoRedo.append(ui.button("Undo",
		"Undo last action (you may also press control-z)",
		"arrow-undo-circle", {
			handlers: {
				click: function() {
					editor.undo()
				}
			}
		})
	)
	undoRedo.append(ui.button("Redo",
		"Redo next action (you may also press control-y)",
		"arrow-redo-circle", {
			handlers: {
				click: function() {
					editor.redo()
				}
			}
		})
	)

	let addFurn = ui.button("Add Furniture", "Add furniture", null, { handlers: {
		// TODO: Create it at the last clicked point if on screen, else somewhere reasonable on screen
		click: function() {
			let p
			const v = editor.draw.viewbox()
			const c = { x: v.x + v.width / 2, y: v.y + v.height / 2 }
			if (State.lastClick != null) {
				p = State.lastClick
				if (p.x < v.x || p.x > v.x + v.width || p.y < p.height || p.y > p.y + p.height) {
					p = c
				}
			} else {
				p = c
			}
			furnitureMenu(editor, p)
		}
	}})

	toolbar.append(item(ui.button("Fit to view", "Fit the floor plan into view", null, {
		handlers: { click: function() {
			editor.fitToView()
		}}
	})))
	toolbar.append(undoRedo)
	toolbar.append(item(addFurn))
	toolbar.append(item(checkToggle("Angle snap", {
			title: "Snap points to 45° angle",
			off: function() { State.snapAngle = false },
			on: function() { State.snapAngle = true },
			value: State.snapAngle
	})))
	toolbar.append(item(checkToggle("Point snap", {
			title: "Snap points to other points",
			off: function() { State.snapPoints = false },
			on: function() { State.snapPoints = true },
			value: State.snapPoints
	})))
	toolbar.append(item(checkToggle("Select mode", {
			title: "Enter selection mode",
			off: function() { editor.useMode(defaultMode); State.selectMode = false },
			on: function() { editor.useMode("Select"); State.selectMode = true },
			value: State.selectMode
	})))

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

	editor.useGrid()
	editor.draw.show()
	editor.backend.pull()
		.then(function() {
			ui.wait()
			if (editor.draw.findExactlyOne("#points").children().length === 0) {
				editor.addPoint({ x: 0, y: 0 })
			}
			editor.useGrid("imperial")
			editor.fitToView()
		})

	editor.draw.on("touchmove", function(e){ e.preventDefault() });
	editor.draw.on("pinchZoomStart", function() { State.panZoom |= zoomBit })
	editor.draw.on("pinchZoomEnd", function() { State.panZoom &= ~zoomBit})
	editor.draw.on("panStart", function() { State.panZoom |= panBit })
	editor.draw.on("panEnd", function() { State.panZoom &= ~panBit })
}

function checkToggle(name, params) {
	if (!params || !params.off || !params.on) {
		throw new Error("Requires on and off values")
	}

	const run = function(value) {
		if (value) {
			params.on()
		} else {
			params.off()
		}
	}

	let c = document.createElement("form")
	c.classList.add("check_toggle")

	let label = c.appendChild(document.createElement("label"))
	label.append(document.createTextNode(name + ": "))

	let input = c.appendChild(document.createElement("input"))
	input.setAttribute("type", "checkbox")
	input.setAttribute("checked", params.value ?? false)
	input.addEventListener("change", function(ev) { run(ev.target.checked) })
	if (params.title) {
		input.setAttribute("title", params.title)
	}

	if (params.value != undefined) {
		input.checked = params.value
		run(params.value)
	}
	return c
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

	const refresh = function() {
		selectHandler(event, editor, state)
	}

	c.append(ui.button("Unselect", "Unselect selection", null, {
		handlers: { click: function() { editor.draw.select() } }
	}))

	c.append(ui.input("Delete", "Delete selected objects", {
			attributes: { type: "button", value: "Delete" },
			handlers: { click: function() {
				editor.remove(...a)
				editor.finishAction()
			}},
		})
	)

	let ids = []
	for (let i = 0; i < a.length; ++i) {
		ids.push(lib.getID(a[i]))
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

	if (groups.pntmap !== undefined || groups.pnt !== undefined) {
		const getMaps = function() {
			let maps = {}
			if (groups.pnt) {
				for (let i = 0; i < groups.pnt.length; ++i) {
					for (let id in editor.backend.mappedPoints[groups.pnt[i]]) {
						id = editor.backend.mappedPoints[groups.pnt[i]][id]
						maps[id] = editor.backend.reqObj(id)
					}
				}
			}
			if (groups.pntmap) {
				for (let i = 0; i < groups.pntmap.length; ++i) {
					maps[groups.pntmap[i]] = editor.backend.cache.pointmaps[groups.pntmap[i]]
				}
			}
			return maps
		}
		const changeTypes = function(newvalue) {
			editor.finishAction()
			const maps = getMaps()
			for (let id in maps) {
				editor.mapPoints({ type: newvalue }, id)
			}
			editor.finishAction()
			return refresh()
		}

		let current
		const maps = getMaps()
		for (let id in maps) {
			if (current === undefined) {
				current = maps[id].type
			} else if (current !== maps[id].type) {
				current = null
				break;
			}
		}
		c.appendChild(
			selector(editor.backend.params.pointmaps.types, changeTypes, { current, text: "Type:" })
		)
	}

	if (groups.pntmap && cnt === 1) {
		c.appendChild(document.createElement("li"))
			.appendChild(ui.button("Subdivide", "Subdivide pointmap", null, {
				handlers: {
					click: function(ev) {
						handled(ev)
						let pm = editor.findObj(groups.pntmap[0])
						let p
						if (State.lastClick) {
							// This will mostly work well, but if the user manages to click
							// somewhere else and keep this selected it'll maybe not be where
							// they want.
							p = pm.closestPoint(new Vector2(State.lastClick.x, State.lastClick.y))
						} else {
							p = pm.interpolatedPoint(0.5)
						}
						let pid = editor.addPoint(p)
						pm = editor.backend.reqObj(groups.pntmap[0])
						editor.mapPoints({ a: pid, b: pm.a })
						editor.mapPoints({ a: pid, b: pm.b })
						editor.remove(groups.pntmap[0])
					}
				}
			}))
		c.appendChild(document.createElement("li"))
			.appendChild(document.createTextNode("Length: " +
		    userLength(editor, editor.pointmapLength(groups.pntmap[0]))))

		const dolengths = function(m, point) {
			let intr = m.closestLinearInterpolation(new Vector2(point.x, point.y))
			let points = m.vecs()
			let len = geometry.length(points[0], points[1])
			let al = len * intr
			let bl = len * (1.0 - intr) 
			if (!geometry.compareVecs(points[0], points[1])) {
				let t = al
				al = bl
				bl = t
			}

			let it = c.appendChild(document.createElement("li"))
			it.id = "pointmap_lengths"
			it.append(document.createTextNode("("))
			let a = it.appendChild(document.createElement("span"))
			it.append(document.createTextNode(" × "))
			let b = it.appendChild(document.createElement("span"))
			it.append(document.createTextNode(")"))

			a.textContent = userLength(editor, al)
			b.textContent = userLength(editor, bl)
		}
		let m = editor.findObj(groups.pntmap[0])
		dolengths(m, State.lastClick)
		/*
		 * In the future, I could change the function to update the values,
		 * but it wouldn't work well on touch devices anyway.
		 *m.on("pointermove", function(ev) { dolengths(m, editor.draw.point(ev.clientX, ev.clientY)) })
		 */

		let pm = editor.backend.reqObj(groups.pntmap[0])
		if (pm.type === "door") {
			const swingButton = function(backward) {
				return ui.button(backward ? "prevswing" : "swing",
					`Swing door${backward ? " backward" : ""} (you may also click, drag, and release on a door)`,
					backward ? "arrow-back" : "arrow-forward", {
					handlers: {
						click: function() {
							let pm = editor.backend.reqObj(groups.pntmap[0])
							editor.mapPoints({ door_swing: (backward ? prevSwing : nextSwing)(pm.door_swing) }, groups.pntmap[0])
						}
					}
				})
			}
			let swingOps = c.appendChild(document.createElement("li"))
			swingOps.append(document.createTextNode("Swing: "))
			swingOps.append(swingButton(true))
			swingOps.append(swingButton(false))
			swingOps.append(ui.button("Reset", "Reset door swing", null, {
					handlers: {
						click: function() {
							editor.mapPoints({ door_swing: null }, groups.pntmap[0])
						}
					}
				}))
		}
	}

	if (groups.furmap) {
		if (groups.furmap.length !== 1) {
			document.querySelectorAll(".furniture_menu").forEach(
				function(e) {
					e.remove()
				}
			)
		} else {
			furnitureMenu(editor, groups.furmap[0])
		}
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
		form.appendChild(document.createTextNode(options.text + " "))
	}

	let list = form.appendChild(document.createElement("select"))
	list.addEventListener("change", function(event) { select(event.target.value) })

	let isArray = Array.isArray(things)
	for (let thing in things) {
		if (isArray) {
			thing = things[thing]
		}

		console.debug("selector", options.text ?? "something", thing)
		list.appendChild(document.createElement("option"))
			.appendChild(document.createTextNode(thing))
	}

	list.value = options.current

	return form
}

// pointerdown
function selectionHandler(event, editor) {
	let sel

	if (event.pointerType === "mouse" && event.button === buttons.right) {
		return
	}

	let p = editor.draw.point(event.clientX, event.clientY)
	State.lastClick = structuredClone(p)
	let order = [ "#" + editor.layoutG(), "#points", "#pointmaps" ]
	for (let i = 0; !sel && i < order.length; ++i) {
		sel = editor.thingAt(p, order[i])
	}

	if (!sel) {
		let close = editor.thingsAt(p, order.join(","), { method: "touching", minsize: 3500 })
		let dist
		let closest
		for (let i = 0; i < close.length; ++i) {
			let tmp = close[i].distanceTo(p.x, p.y)
			if (dist == null || tmp < dist) {
				dist = tmp
				closest = close[i]
			}
		}
		sel = closest
	}

	if (sel != null) {
		if (!State.selectMode) {
			sel.select()
		} else {
			let selection = addSelection(editor, sel, true)
			if (selection.length === 0) {
				editor.draw.select()
			} else {
				selection.selectList()
			}
		}
	} else {
		if (!State.selectMode) {
			editor.draw.select()
		}
		escape()
	}
}

function keyHandler(ev, editor) {
	if (ev.key === "Escape") {
		escape()
	/*} else if (ev.key === "Backspace" || ev.key === "Delete") {
		editor.remove(...editor.draw.find(".selected").array())*/
	} else if (ev.key === "+") {
		editor.draw.zoom(editor.draw.zoom() * 1.25)
		editor.updateGrid()
	} else if (ev.key === "-" || ev.key === "_") {
		editor.draw.zoom(editor.draw.zoom() / 1.25)
		editor.updateGrid()
	} else {
		if (!event.ctrlKey) {
			return
		}
		if (event.key === "z") {
			editor.undo()
		} else if (event.key === "y") {
			editor.redo()	
		} else {
			return
		}
	}

	handled(ev)
}

function addSelection(editor, objects, flip) {
	if (!Array.isArray(objects)) {
		objects = [objects]
	}

	let sel = editor.draw.find(".selected")
	for (let i = 0; i < objects.length; ++i) {
		let si = sel.indexOf(objects[i])
		if (si >= 0) {
			if (flip) {
				sel.splice(si, 1)
			}
		} else {
			sel.push(objects[i])
		}
	}
	return sel
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
				vecs[1] = geometry.length(vecs[0], vecs[1], len)
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

		let points = editor.thingsAt(p, "#points")
		let fid = !state.moveOp ? lib.getID(state.from) : null
		let tid = lib.getID(state.to)
		delete state.onPoint
		for (let i in points) {
			let id = lib.getID(points[i])
			if (id !== tid && (!fid || id !== fid)) {
				state.onPoint = id
				p = editor.backend.obj(id)
			}
		}

		editor.movePoint(state.to, p)

		if (!options.leave_input) {
			unitInput(editor, state.len,
			    editor.units.snapTo(state.origin.distanceTo(p), editor.unit))
		}
	}

	const doMove = function() {
		const ad = function(a, b) {
			return Math.abs(a - b)
		}

		// This is racy
		state.moveTimeout = null
		if (state.nosnap) {
			updatePoint(state.move)
			return
		}

		let snapped = state.move
		if (State.snapAngle) {
			snapped = snap(editor.units.snapTo(state.move, editor.unit), state.origin, 8)
		}

		if (State.snapPoints) {
			const updsnaps = function(snaps, k, from, test) {
				let d = ad(from[k], test[k])
				if (d <= params.threshold) {
					if (!snaps[k] || d < snaps[k].d) {
						snaps[k] = { d, v: test[k] }
					}
				}
			}

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

	const onMap = function(p) {
		let maps = editor.thingsAt(p, "#pointmaps")
		let toMaps = editor.backend.mappedPoints[state.to]

		let map
		for (let i = 0; !map && i < maps.length; ++i) {
			let mid = lib.getID(maps[i])
			let good = true
			for (let k in toMaps) {
				if (toMaps[k] === mid) {
					good = false
					break
				}
			}
			if (good) {
				map = maps[i]
			}
		}

		if (map == null) {
			return null
		}
		return { point: map.whereIsPoint(p.x, p.y), map: map }
	}

	const commit = function() {
		if (state.onPoint) {
			let tid = lib.getID(state.to)
			for (let oth in editor.backend.mappedPoints[tid]) {
				if (oth !== state.onPoint) {
					editor.mapPoints({ a: state.onPoint, b: oth }, editor.backend.mappedPoints[state.to][oth])
				}
			}
			editor.remove(tid)
			state.to = editor.findObj(state.onPoint)
		}

		let on = onMap(state.to.vec())
		if (on !== null) {
			let mapD = editor.backend.reqObj(lib.getID(on.map))
			editor.movePoint(state.to, on.point)
			editor.mapPoints({ a: mapD.a, b: state.to })
			editor.mapPoints({ a: mapD.b, b: state.to })
			editor.remove(on.map)
		}
		editor.finishAction()
		cleanup()
	}

	if (State.panZoom || event.type === "pointercancel") {
		if (state.to) {
			revert()
		}
		return
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
				state.moveOp = true

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
			editor.mapPoints({ type: "wall", a: state.from, b: state.to})
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
		if (!state.moveOp && state.from && state.from.inside(cursor.x, cursor.y)) {
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

	if (event.type === "pointercancel") {
		cleanup()
		return
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

		let v = door.vecs()
		if (v[0].y < v[1].y) {
			o = -o
		}

		let s = (o > 0 ? "+" : "-")
		editor.backend.mapPoints({ door_swing: state.hinge + s }, state.doorID)
		editor.finishAction()
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
		editor.mapPoints({ type: "wall", a: data.a, b: sub })
		editor.mapPoints({ type: "wall", a: sub, b: data.b })
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
		state.hinge = Math.round(editor.findObj(id).closestLinearInterpolation(cursor)) ? "a" : "b"
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

	if (state.panZoom || ev.type === "pointercancel") {
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
		if (!state.moved && press.distanceTo(state.origin) < params.threshold) {
			return
		}
		state.moved = true
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
	let id
	if (typeof pointOrID === "string") {
		id = pointOrID
	} else {
		id = newFurniture(editor, pointOrID)
	}

	let menu = document.createElement("div")
	menu.id = "furniture_menu"
	menu.classList.add("escapable")

	let subs = []
	menu.addEventListener("escape", function() {
		editor.finishAction()
		menu.remove()
	})

	subs.push(menu.appendChild(furnitureTools(editor, id)))
	menu.append(document.createElement("hr"))
	subs.push(menu.appendChild(furnitureParamsMenu(editor, id)))

	let oldMenu = document.getElementById("furniture_menu")
	if (oldMenu) {
		oldMenu.replaceWith(menu)
	} else {
		document.body.append(menu)
	}
}

function furnitureTools(editor, id) {
	let c = document.createElement("div")

	c.append(ui.button("Duplicate", "Duplicate furniture parameters into a new piece", null, {
		handlers: { click:
			function() {
				editor.finishAction()
				let params = allFurnitureParams(editor, id)
				params.x += params.width * .6
				params.y -= params.depth * .6
				delete params.name
				delete params.furniture_id
				editor.finishAction()
				id = editor.addMappedFurniture(params)
				editor.findObj(id).select()
			}
		}
	}))

	return c
}

function furnitureParamsMenu(editor, id) {
	const styles = function(type) {
		let styles = ['default']
		if (editor.backend.params.furniture[type].styles == null) {
			return styles
		}
		return styles.concat(editor.backend.params.furniture[type].styles)
	}

	editor.finishAction()

	let params = allFurnitureParams(editor, id)
	delete params.x
	delete params.y

	let items = [
		menuItem("name", "Name", { attributes: { value: params.name ?? "" } }),
		menuItem("type", "Type", { break: false, enum: editor.backend.params.furniture, attributes: { value: params.type, required: true } }),
		menuItem("style", "Style"),
		menuItem("variety", "Variety"),
		menuItem("width", "Width", { attributes: { value: userLength(editor, params.width), required: true } }),
		menuItem("depth", "Depth", { attributes: { value: userLength(editor, params.depth), required: true } }),
		menuItem("angle", "Angle", { attributes: { value: params.angle ?? 0, min: 0, max: 359, step: 1, type: "range", required: true } })
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

		let v = editor.backend.params.furniture[type].varieties[variety]
		params.width = v.width
		items[keys.width].input.value = userLength(editor, v.width)
		params.depth = v.depth
		items[keys.depth].input.value = userLength(editor, v.depth)
		tryUpdate()
	}
	const newVariety = function(init) {
		let vars = editor.backend.params.furniture[items[keys.type].input.value].varieties
		if (vars == undefined) {
			items[keys.variety].container.classList.add("hidden")
			fromVariety()
			return
		}

		let cnt = 0
		for (let k in vars) {
			if (++cnt > 1) {
				break
			}
		}

		let v
		if (cnt === 1) {
			v = menuItem("variety", "Variety", { attributes: { type: "button", value: "Reset" } })
		} else {
			v = menuItem("variety", "Variety", { enum: vars })
		}
		let c = makeItem(v)
		items[keys.variety].container.replaceWith(c)
		items[keys.variety] = v
		updateVariety()
		fromVariety(items[keys.type].input.value, init ? null : defKey(vars))
		if (cnt > 1) {
			c.addEventListener("input", function(ev) {
				fromVariety(items[keys.type].input.value, ev.target.value)
			})
		} else {
			c.addEventListener("click", function() {
				fromVariety(items[keys.type].input.value, defKey(vars))
				updateVariety()
			})
		}
	}
	const newStyle = function() {
		let typeStyles = styles(params.type)
		if (typeStyles.length === 1) {
			items[keys.style].container.classList.add("hidden")
		} else {
			let s = menuItem("style", "Style", { enum: typeStyles })
			items[keys.style].container.replaceWith(makeItem(s))
			items[keys.style] = s
			if (params.style != null) {
				items[keys.style].input.value = params.style
			}
		}
	}
	const updateVariety = function() {
		let vars = editor.backend.params.furniture[params.type].varieties
		let cnt = 0
		for (let k in vars) {
			if (++cnt > 1) {
				break
			}
		}
		if (cnt > 1) {
			items[keys.variety].input.value = editor.varietyFrom(params)
		} else if (cnt === 1) {
			if (editor.varietyFrom(params)) {
				items[keys.variety].input.setAttribute("disabled", true)
			} else {
				items[keys.variety].input.removeAttribute("disabled")
			}
		}
	}
	const tryUpdate = function() {
			let err = menu.querySelector(".error")
			if (err) {
				err.remove()
			}
			for (let i in items) {
				// If invalid, don't even try
				if (!items[i].input.validity.valid) {
					return
				}
			}
			editor.addMappedFurniture(params, id)
	}

	let menu = makeMenu(items)
	menu.classList.add("furniture_params_menu")
	items[keys.type].input.value = params.type
	newVariety(true)
	newStyle()
	menu.addEventListener("input", function(ev) {
		handled(ev)
		try {
			console.debug("furnitureMenu.input(ev)", ev.target.name, ev.target.value)
			if (ev.target.name === "width" || ev.target.name === "depth") {
				let u = unitInput(editor, ev.target)
				if (u == undefined) {
					return
				}
				if (u <= 0) {
					ev.target.setCustomValidity(ui.capitalize(ev.target.name) + " must be greater than zero")
				} else {
					ev.target.setCustomValidity("")
				}
				ev.target.reportValidity()
				params[ev.target.name] = u
				updateVariety()
			} else {
				if (ev.target.name === "style" && ev.target.value === "default") {
					params[ev.target.name] = null
				} else {
					if (ev.target.name === "angle") {
						let a
						if (ev.target.value.length === 0) {
							a = 0
						} else {
							const snapOn = 45
							const snapAt = 12
							a = ev.target.value
							let d = (a % snapOn)
							if (d < snapAt) {
								a -= d
							} else if (d > (snapOn - snapAt)) {
								a -= d - snapOn
							}
							a %= 360
						}
						params[ev.target.name] = a
					} else {
						params[ev.target.name] = ev.target.value.length === 0 ? null : ev.target.value
					}
				}
				if (ev.target.name === "type") {
					newVariety()
					newStyle()
				}
			}
			tryUpdate()
		}
		catch(err) {
			etc.error(err, menu)
			throw err
		}
	})

	return menu
}

function allFurnitureParams(editor, id) {
	let params = structuredClone(editor.backend.reqObj(id))
	let fp = editor.backend.reqObj(params.furniture_id)
	for (let k in fp) {
		params[k] = fp[k]
	}
	return params
}

function newFurniture(editor, point) {
	if (point == null) {
		point = { x: 0, y: 0 }
	}

	let type = "any"
	let vars = editor.backend.params.furniture[type].varieties
	let v
	if (def(vars)) {
		v = def(vars)
	} else {
		let s = editor.units.get("inch", 32)
		v = { width: s, depth: s }
	}
	let params = {
		x: point.x,
		y: point.y,
		type,
		width: v.width,
		depth: v.depth,
		name: null

	}
	let id = editor.addMappedFurniture(params)

	editor.finishAction()
	editor.findObj(id).select()

	return id
}

function makeMenu(items) {
	let c = document.createElement("form")

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
	let a = length
		.replaceAll(" ", "")
		.replaceAll("‘", "'")
		.replaceAll("’", "'")
		.replaceAll("“", '"')
		.replaceAll("”", '"')
		.split(/([0-9.]+)/)

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
	let a = editor.units.separate(units, editor.unitSystem, { whole: true })
	let words = []
	for (let i in a) {
		if (!a[i].unit) {
			// We don't allow anything smaller than smallest defined unit,
			// though maybe this should be an error condition
			continue
		}

		words.push(a[i].amount + (a[i].symbol ?? a[i].name ?? ""))
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

function preventDefaultHandler(event) {
	handled(event)
}

function singlePointerHandler(ev, editor, state) {
	if (ev.type === "pointerdown") {
		state[ev.pointerId] = true
		console.warn("singlePointerHandler", ev.pointerId, true)
	} else if (ev.type === "pointerup" || ev.type === "pointercancel") {
		delete state[ev.pointerId]
		console.warn("singlePointerHandler", ev.pointerId, false)
	}

	// Send all events but pointerdown on to the other handlers
	if (ev.type !== "pointerdown" && ev.type !== "pointermove") {
		return
	}

	let cnt = 0
	for (let k in state) {
		if (++cnt > 1) {
			editor.draw.fire(cancelEvent);
			handled(ev)
			return
		}
	}
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

function precision(a) {
	if (!isFinite(a)) {
		return 0;
	}
	let e = 1
	let p = 0
	while (Math.round(a * e) / e !== a) {
		e *= 10
		p++
	}
	return p
}

function nextSwing(swing) {
	let next
	if (!swing) {
		next = 'a-'
	} else if (swing[1] === '-') {
		next = (swing[0] === 'a' ? 'b' : 'a') + '+'
	} else {
		next = swing[0] + '-'
	}
	console.debug("nextSwing", `${swing} -> ${next}`)
	return next
}

function prevSwing(swing) {
	let prev
	if (!swing) {
		prev = 'a-'
	} else if (swing[1] === '+') {
		prev = (swing[0] === 'a' ? 'b' : 'a') + '-'
	} else {
		prev = swing[0] + '+'
	}
	console.debug("prevSwing", `${swing} -> ${prev}`)
	return prev
}

function def(obj) {
	return obj[defKey(obj)]
}

function defKey(obj) {
	for (let i in obj) {
		return i
	}
}
