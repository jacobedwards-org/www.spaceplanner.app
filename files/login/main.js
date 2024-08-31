import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

let default_page = "/floorplans"

function init() {
	if (api.authorized_duration() > 0) {
		window.location.href = default_page
	}

	let login = document.getElementById("login")
	let username = document.getElementById("username")
	let password = document.getElementById("password")
	if (!login || !username || !password) {
		throw new Error("Expected login form, username, password fields")
	}

	login.addEventListener("submit", function(event) {
		event.preventDefault()
		api.login(username.value, password.value)
			.then(function() {
				window.location.href = default_page
			})
	})
}

window.onload = etc.handle_wrap(init)
