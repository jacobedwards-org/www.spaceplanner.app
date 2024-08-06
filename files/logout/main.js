let default_page = "/"

import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

function init() {
	api.update_token(null)
	window.location.href = default_page 
}

window.onload = etc.handle_wrap(init)
