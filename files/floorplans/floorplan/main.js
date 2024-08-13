import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import "/lib/github.com/svgdotjs/svg.panzoom.js/svg.panzoom.js"
import * as ui from "/lib/ui.js"
import { FloorplanEditor as Editor } from "./editor.js"

const buttons = {
	left: 0,
	middle: 1,
	right: 2
}
	
function init() {
	let floorplan = (new URLSearchParams(new URL(document.URL).search)).get("name")
	if (!floorplan) {
		document.location.href = "/floorplans"
	}
	document.querySelector("h1").textContent = floorplan

	let draw = SVG()
		.addTo("#floorplan_container")
		.viewbox("0 0 400 400")
		.panZoom({
			panButton: buttons.right,
			zoomMin: .25,
			zoomMax: 4,
			zoomFactor: .5
		})

	let editor = new Editor(draw)
	for (let mode in modes) {
		editor.addMode(mode, modes[mode])
	}
	editor.useMode("testing")

	let toolbar = document.querySelector("header")
		.appendChild(document.createElement("ul"))
	toolbar.classList.add("toolbar")
	toolbar.appendChild(modesSelector(editor, "Modes:"))
}

function modesSelector(editor, text) {
	let form = document.createElement("form")
	form.classList.add("modes_selector")
	if (text) {
		form.appendChild(document.createTextNode(text))
	}

	let list = form.appendChild(document.createElement("ul"))
	for (let mode in editor.modes) {
		let selector = list.appendChild(document.createElement("li"))
			.appendChild(ui.input(mode, "Switch to " + mode + " mode", {
				attributes: { type: "button", value: mode },
				handlers: { click: function(event) {
					editor.useMode(event.target.name)
					event.target.parentNode.parentNode
						.querySelectorAll("li > .selected")
						.forEach(function(sel) {
							sel.classList.remove("selected")
						})
					event.target.classList.add("selected")
				}}
			}))
		selector.classList.add("mode_selector")
		if (mode == editor.mode) {
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
	if (editor.draw.findOne("#points").children().length >= 2) {
		editor.mapPoints("wall")
	}
	editor.finishAction()
	click.preventDefault()
}

function preventDefaultHandler(event) {
	event.preventDefault()
}

window.onload = init
