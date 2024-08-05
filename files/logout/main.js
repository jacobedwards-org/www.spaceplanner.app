let default_page = "/"

function init() {
	api_update_token(null)
	window.location.href = default_page 
}

window.onload = init
