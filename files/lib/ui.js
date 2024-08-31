import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

export function input(name, memo, options) {
	if (!name) {
		throw new Error("No name provided")
	}

	let e = document.createElement("input")
	e.name = name
	e.placeholder = name
	e.setAttribute("title", memo)

	if (!options) {
		options = {}
	}
	if (options.attributes) {
		for (let i in options.attributes) {
			console.debug("Input", name, i, options.attributes[i])
			e.setAttribute(i, options.attributes[i])
		}
	}
	if (options.handlers) {
		for (let i in options.handlers) {
			e.addEventListener(i, options.handlers[i], false)
		}
	}

	return e
}

export function button(name, memo, icon, options) {
	let button = input(name, memo, options)
	let attrs = {
		alt: name,
		type: "image",
		class: "icon",
	 	src: "/icons/" + icon + "-outline.svg"
	}
	for (let i in attrs) {
		console.debug("Button", name, i, attrs[i])
		button.setAttribute(i, attrs[i])
	}

	return button
}

export function toggle(a, b, options) {
	if (!options) {
		options = {}
	}
	if (options.swap) {
		let t = a
		a = b
		b = t
	}
	if (options.init) {
		// Should this be run like in the event listener, handling .then methods?
		b.func()
	}
	toggle_setup_button(a, b)
	toggle_setup_button(b, a)
	return a.button
}

function toggle_setup_button(a, b) {
	a.button.addEventListener("click", function() {
		let swap = function() { a.button.replaceWith(b.button) }
		let r = a.func()
		if (r && typeof r.then == "function") {
			r.then(swap)
		} else {
			swap()
		}
	}, false)
}

export function login(callback) {
	let form = document.createElement("form")
	form.classList.add("credentials")

	let label = form.appendChild(document.createElement("label"))
	label.appendChild(document.createTextNode("Username:"))
	label.setAttribute("for", "username")
	let username = form.appendChild(document.createElement("input"))
	username.id = "username"
	username.setAttribute("autocomplete", "username")
	username.setAttribute("name", "username")

	label = form.appendChild(document.createElement("label"))
	label.appendChild(document.createTextNode("Password:"))
	label.setAttribute("for", "password")
	let password = form.appendChild(document.createElement("input"))
	password.setAttribute("autocomplete", "current-password")
	password.setAttribute("type", "password")
	password.setAttribute("name", "password")

	let button = form.appendChild(document.createElement("input"))
	button.setAttribute("type", "submit")
	button.setAttribute("value", "Login")

	form.addEventListener("submit", function(event) {
		event.preventDefault()
		api.login(username.value, password.value)
			.then(function() {
				form.remove()
				callback()
			})
			.catch(function(err) {
				etc.error(err + ": Unable to login", form)
			})
	})

	return form
}

export function prettyName(name, options) {
	options = options ?? {}
	options.separator = options.separator ?? /[-_]/
	options.title = options.title ?? true

	let words = name.split(options.separator)
	for (let i in words) {
		words[i] = capitalize(words[i])
		if (!options.title) {
			break
		}
	}

	return words.join(" ")
}

export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.substr(1)
}

export function warning(content) {
	let warning = document.createElement("span")
	warning.classList.add("warning")

	let icon = warning.appendChild(
		document.createElement("img")
	)
	icon.classList.add("icon")
	icon.setAttribute("src", "/icons/warning-outline.svg")

	if (typeof content === "string") {
		let s = content
		content = document.createElement("p")
		content.appendChild(
			document.createTextNode(s)
		)
	}

	// appendChild can make sure it's correct
	warning.appendChild(content)
	content.classList.add("content")

	return warning
}
