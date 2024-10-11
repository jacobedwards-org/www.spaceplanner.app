import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

function init() {
	etc.authorize()
	etc.bar()
	main()
}

function main() {
	update_info("Username", localStorage.getItem("username"))

	let errfunc = function(err) { etc.error("Unable to get settings: " + err, document.querySelector("#settings")) }
	api.fetch("GET", "settings")
		.then(function(params) {
			api.fetch("GET", "users/:user/settings")
				.then(function(current) {
					show_settings(current, params)
				})
		})
		.catch(errfunc)

	let h = document.body.appendChild(
		document.createElement("h2")
	)
	h.appendChild(document.createTextNode("Delete Account"))
	let del = delete_form()
	del.onsubmit = delete_user
	document.body.append(del)
}

function delete_form() {
	let form = document.createElement("form")
	form.id = "delete_user_form"

	form.appendChild(ui.warning("This action cannot be undone."))

	let label = document.createElement("label")
	label.setAttribute("for", "delete_user_confirm")
	label.appendChild(document.createTextNode("Confirm: "))
	form.append(label)

	let check = document.createElement("input")
	check.id = "delete_user_confirm"
	check.type = "checkbox"
	check.setAttribute("required", true)
	form.append(check)

	form.appendChild(document.createTextNode(" "))

	let submit = document.createElement("input")
	submit.type = "submit"
	submit.value = "Delete Account"
	form.append(submit)

	return form
}

function delete_user() {
	api.fetch("DELETE", "users/:user")
		.then(function() {
			api.update_token(null)
			document.location.href = "/"
		})
		.catch(function(err) { etc.error("Unable to delete user: " + err, document.getElementById("#delete_form")) })
	return false
}

function show_settings(current, params) {
	let form = document.createElement("form")
	form.id = "settings"
	let list = document.createElement("ul")
	form.append(list)
	for (name in params) {
		let id = name + "_setting"
		let item = document.createElement("li")

		let label = document.createElement("label")
		label.setAttribute("for", id)
		
		label.appendChild(document.createTextNode(ui.prettyName(name, { title: false }) + " "))
		item.append(label)

		let input = create_input(name, params[name], current[name])
		input.id = id
		input.setAttribute("title", params[name].description)
		item.append(input)

		list.append(item)
	}

	let submit = document.createElement("input")
	submit.value = "Update"
	submit.type = "submit"
	form.append(submit)

	form.addEventListener("submit", function(event) {
		event.preventDefault()
		update_settings(current, params)
	})

	let current_form = document.querySelector("#settings")
	current_form.replaceWith(form)

	update_verified_email()
}

function update_settings(current, params) {
	let settings = Array.from(document.querySelectorAll("form#settings > ul > li > input"))
	let patch = []
	for (let i in settings) {
		let name = settings[i].name
		let oldvalue = current[name]
		let newvalue
		if (settings[i].getAttribute("type") == "checkbox") {
			newvalue = settings[i].checked
		} else {
			newvalue = settings[i].value
		}

		if (params.default && newvalue == params.default) {
			if (oldvalue != null) {
				patch.push({ op: "remove", path: name })
			}
		} else if (newvalue != oldvalue) {
			if (name === "email") {
				update_verified_email()
			}
			patch.push({ op: "add", path: name, value: newvalue })
		}
	}

	if (patch.length == 0) {
		return
	}
	api.fetch("PATCH", "users/:user/settings", patch)
		.then(function(updated) {
			for (let k in updated) {
				current[k] = updated[k]
			}
			// Alert in a less annoying way
			alert("Settings successfully updated")
		})
		.catch(function(err) { etc.error("Unable to update settings: " + err) })
}

function update_verified_email() {
	let setting_form = document.querySelector('input[name="email"]')
	if (!setting_form) {
		throw new Error("Expected email setting")
	}

	api.verifiedEmail()
		.then(function(verified) {
			update_info("Email", verified)
			let old_warning = document.getElementById("unverified_email_warning")
			if (verified == setting_form.value) {
				if (old_warning != null) {
					old_warning.remove()
				}
			} else if (verified == null || verified != setting_form.value) {
				let content = document.createElement("p")
				content.appendChild(document.createTextNode("This email is not verified. Please verify it "))
				let a = content.appendChild(document.createElement("a"))
				a.href = "./verify-email"
				a.appendChild(document.createTextNode("here."))

				let warning = ui.warning(content)
				warning.id = "unverified_email_warning"
				warning.classList.add("small")
			
				if (old_warning != null) {
					old_warning.replaceWith(warning)
				} else {
					setting_form.after(warning)
				}
			}
		})
}

function create_input(name, setting, current_value) {
	let input = document.createElement("input")
	if (setting.type == "string") {
		input.type = "text"
	} else if (setting.type == "bool") {
		input.type = "checkbox"
		if (current_value) {
			input.setAttribute("checked", "true")
		}
	} else {
		throw new Error("Unexpected setting type")
	}

	input.name = name
	if (current_value) {
		input.value = current_value
	}

	return input
}

function update_info(key, value) {
	let dl = document.getElementById("userinfo")

	if (value == null) {
		return
	}

	let v = get_info_element(key)
	if (v != undefined) {
		v.textContent = value
		return
	}

	let k = dl.appendChild(document.createElement("dt"))
	k.appendChild(document.createTextNode(key))
	v = dl.appendChild(document.createElement("dd"))
	v.appendChild(document.createTextNode(value))
}

function get_info_element(key) {
	let dl = document.getElementById("userinfo")

	let k
	let keys = Array.from(dl.querySelectorAll("dt"))
	for (let i in keys) {
		if (keys[i].textContent == key) {
			return keys[i].nextElementSibling
		}
	}

	return undefined
}

window.onload = etc.handle_wrap(init)
