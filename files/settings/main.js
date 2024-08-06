import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

function init() {
	etc.authorize()
	etc.bar()
	main()
}

function main() {
	let errfunc = function(err) { etc.error("Unable to get settings: " + err, document.querySelector("#settings")) }
	api.fetch("GET", "settings")
		.then(function(params) {
			api.fetch("GET", "users/" + localStorage.getItem("username") + "/settings")
				.then(function(current) {
					show_settings(current, params)
				})
		})
		.catch(errfunc)

	let profile = document.createElement("h2")
	profile.appendChild(document.createTextNode("Profile"))
	document.body.append(profile)
	let del = delete_form()
	del.onsubmit = delete_user
	document.body.append(del)
}

function delete_form() {
	let form = document.createElement("form")
	form.id = "delete_user_form"

	let label = document.createElement("label")
	label.setAttribute("for", "delete_user_confirm")
	label.appendChild(document.createTextNode("Confirm "))
	form.append(label)

	let check = document.createElement("input")
	check.id = "delete_user_confirm"
	check.type = "checkbox"
	check.setAttribute("required", true)
	form.append(check)

	let submit = document.createElement("input")
	submit.type = "submit"
	submit.value = "Delete User"
	form.append(submit)

	form.appendChild(document.createTextNode("This action cannot be undone."))

	return form
}

function delete_user() {
	api.fetch("DELETE", "users/" + localStorage.getItem("username"))
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
		
		label.appendChild(document.createTextNode(name[0].toUpperCase() + name.substring(1) + " "))
		item.append(label)

		let input = create_input(name, params[name], current[name])
		input.id = id
		item.append(input)

		/*
		 *desc = document.createElement("label")
		 *desc.setAttribute("for", id)
		 *desc.append(document.createElement("br"))
		 *desc.appendChild(document.createTextNode(params[name].description))
		 *item.append(desc)
		 */

		list.append(item)
	}

	let submit = document.createElement("input")
	submit.value = "Update"
	submit.type = "submit"
	form.append(submit)

	form.onsubmit = function () { return update_settings(current, params) }

	let current_form = document.querySelector("#settings")
	current_form.replaceWith(form)
}

function update_settings(current, params) {
	let settings = Array.from(document.querySelectorAll("form#settings > ul > li > input"))
	let patch = []
	for (let name in settings) {
		let newvalue = settings[name].value
		if (params.default && newvalue == params.default)
			continue
		let oldvalue = current[name]
		if (oldvalue && newvalue == oldvalue)
			continue
		patch.push({ op: "add", path: settings[name].name, value: newvalue })
	}

	api.fetch("PATCH", "users/" + localStorage.getItem("username") + "/settings", patch)
		.catch(function(err) { etc.error("Unable to update settings: " + err) })
	return false
}

function create_input(name, setting, current_value) {
	let input = document.createElement("input")
	if (setting.type == "string") {
		input.type = "text"
	} else {
		throw new Error("Unexpected setting type")
	}

	input.name = name
	if (current_value) {
		input.value = current_value
	}

	return input
}

window.onload = etc.handle_wrap(init)
