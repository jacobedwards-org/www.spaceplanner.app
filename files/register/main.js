import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

function init() {
	if (api.authorized_duration() > 0) {
		// Maybe don't do this?
		window.location.href = "/floorplans"
	}

	let email_input = document.getElementById("email")
	let email_strict_input = document.getElementById("email-strict")
	let username_input = document.getElementById("username")
	let password_input = document.getElementById("password")
	if (!email_input || !email_strict_input || !username_input || !password_input) {
		throw new Error("Unable to select email, username and password fields")
	}

	let form = document.getElementById("register")
	if (!form) {
		throw new Error("Unable to select registration form")
	}
	form.addEventListener("submit", function(event) {
		event.preventDefault()
		api.register(username_input.value, password_input.value, email_input.value,
		    { email_policy: email_strict_input.value })
			.then(function() {
				api.login(username_input.value, password_input.value)
					.then(function() {
						window.location.href = "/settings/verify-email"
					})
					.catch(function(err) {
						console.error("Created user but was unable to login")
						window.location.href = "/login"
					})
			})
			.catch(function (error) {
				return etc.error(error, form)
			})
	})
}

window.onload = etc.handle_wrap(init)
