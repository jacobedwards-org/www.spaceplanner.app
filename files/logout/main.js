import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

let default_page = "/"

etc.handle_wrap(init)

function init() {
	api.update_token(null)
	window.location.href = default_page 
}
