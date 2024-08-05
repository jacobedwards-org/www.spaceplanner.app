let default_page = "/floorplans"

function handle_token(resp) {
	api_update_token(resp.token)
	window.location.href = default_page
}

function login(username, password, err_callback) {
	api_fetch("POST", "tokens", { "username": username, "password": password })
		.then(handle_token)
		.catch(err_callback)
	return false;
}

function init() {
	if (api_authorized_duration() > 0) {
		window.location.href = default_page
	}

	let username_input = document.getElementById("username")
	let password_input = document.getElementById("password")
	if (!username_input || !password_input) {
		throw new Error("unable to select username or password")
	}

	let login_form = document.getElementById("login")
	if (!login_form) {
		throw new Error("unable to get login form")
	}
	login_form.onsubmit = function () {
		return login(
			username_input.value, password_input.value,
			function (error) { return set_error(error, login_form) }
		);
	};
}

window.onload = init
