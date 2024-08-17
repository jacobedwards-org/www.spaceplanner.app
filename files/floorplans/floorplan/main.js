import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import "/lib/github.com/svgdotjs/svg.panzoom.js/svg.panzoom.js"
import * as ui from "/lib/ui.js"
import * as etc from "/lib/etc.js"
import { FloorplanEditor as Editor } from "./editor.js"

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
				},
				newdiff: function() {
					suffix.data = "*"
					editor.updateDisplay()
				}
			}
		}
	})
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
	editor.useMode("testing")
	editor.useGrid("imperial")

	let toolbar = document.querySelector("header")
		.appendChild(document.createElement("ul"))
	toolbar.classList.add("toolbar")

	toolbar.append(pushpull)
	toolbar.append(item(
		selector(editor, editor.modes, function(mode) { editor.useMode(mode) },
			{ current: editor.mode, text: "Modes:" }
		)
	))
	toolbar.append(item(
		selector(editor, editor.grids, function(system) { editor.useGrid(system) },
			{ current: "imperial", text: "Grid systems:" }
		)
	))

	editor.backend.pull()
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
	none: {
		handlers: {
			contextmenu: preventDefaultHandler
		}
	},
	testing: {
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
	}
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
		editor.mapPoints("wall")
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
