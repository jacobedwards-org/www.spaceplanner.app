import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

let default_page = "/floorplans"

function handle_creation(resp) {
	window.location.href = "/login"
}

function register(username, password, err_callback) {
	api.fetch("POST", "users", { "username": username, "password": password })
		.then(handle_creation)
		.catch(err_callback)
	return false;
}

function init() {
	if (api.authorized_duration() > 0) {
		// Maybe don't do this?
		window.location.href = default_page
	}

	let username_input = document.getElementById("username")
	let password_input = document.getElementById("password")
	if (!username_input || !password_input) {
		throw new Error("unable to select username or password")
	}

	let form = document.getElementById("register")
	if (!form) {
		throw new Error("unable to get register form")
	}
	form.onsubmit = function () {
		return register(
			username_input.value, password_input.value,
			function (error) { return etc.error(error, form) }
		);
	};
}

window.onload = etc.handle_wrap(init)
