import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

etc.handle_wrap(main)

function main() {
	api.fetch("GET", "users/:user/email/code")
		.then(function() {
			document.getElementById("wait").remove()
			document.body.appendChild(codeForm())
			document.body.appendChild(document.createElement("br"))
			document.body.appendChild(resendForm())
		})
		.catch(function(err) {
			etc.error(err + ": Unable to send code")

			let b = document.body.appendChild(document.createElement("input"))
			b.type = "button"
			b.value = "Retry"
			b.addEventListener("click", function() {
				b.remove()
				main()
			})
		})

}

function codeForm() {
	let form = document.createElement("form")
	form.id = "code_form"

	let label = form.appendChild(
		document.createElement("label")
	)
	label.setAttribute("for", "code")
	label.classList.add("break")

	label.appendChild(
		document.createTextNode("Please enter the code sent to your email:")
	)
	let input = form.appendChild(
		document.createElement("input")
	)
	input.id = "code"
	input.setAttribute("autofocus", true)

	let submit = form.appendChild(
		document.createElement("input")
	)
	submit.setAttribute("type", "submit")

	form.addEventListener("submit", function(event) {
		event.preventDefault()
		api.fetch("POST", "users/:user/email/code", { code: code.value })
			.then(function(body) {
				if (!body.valid) {
					etc.error("That was not the correct code, please try again.", form)
				} else {
					etc.userService()
						.then(function(service) {
							if (service) {
								window.location.href = "/settings"
							} else {
								window.location.href = "/services"
							}
						})
						.catch(function() {
							// Eh.
							window.location.href = "/settings"
						})
				}
			})
			.catch(function(err) {
				etc.error(err + ": Could not verify code", form)
			})
	})

	return form
}

function resendForm() {
	let form = document.createElement("form")
	form.id = "resend"

	let label = form.appendChild(
		document.createElement("label")
	)
	label.setAttribute("for", "resend")
	label.appendChild(
		document.createTextNode("Don't see the code? Click here to resend it: ")
	)

	let resend = form.appendChild(
		document.createElement("input")
	)
	resend.setAttribute("type", "submit")
	resend.setAttribute("value", "Resend")

	form.addEventListener("submit", function(event) {
		event.preventDefault()
		api.fetch("GET", "users/:user/email/code")
			.then(function(body) {
				console.log(body)
				let msg = document.createElement("p")
				msg.appendChild(document.createTextNode("Code resent."))
				form.before(msg)
				setTimeout(function() { msg.remove() }, 5500)
			})
			.catch(function(err) {
				etc.error(err + ": Unable to resend code", form)
			})
	})

	return form
}
