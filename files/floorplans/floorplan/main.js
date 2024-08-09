import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

function init() {
	etc.authorize()
	etc.bar()

	let floorplan = (new URLSearchParams(new URL(document.URL).search)).get("name")
	document.querySelector("h1").textContent = floorplan
}

window.onload = etc.handle_wrap(init)
