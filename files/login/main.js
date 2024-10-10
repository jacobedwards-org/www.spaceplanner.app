import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

let default_page = "/floorplans"

function init() {
	if (api.authorized()) {
		window.location.href = default_page
		return
	}

	etc.bar()
	document.body.appendChild(ui.login({ callback: function() { window.location.href = default_page } }))
}

window.onload = etc.handle_wrap(init)
