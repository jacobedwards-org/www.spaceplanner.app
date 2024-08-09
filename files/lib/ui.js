export function input(name, memo, attributes) {
	if (!name) {
		throw new Error("No name provided")
	}

	let e = document.createElement("input")
	e.name = name
	e.placeholder = name
	e.setAttribute("title", memo)
	for (let i in attributes) {
		console.log(i,attributes[i])
		e.setAttribute(i, attributes[i])
	}
	return e
}

export function button(name, memo, icon, func, options) {
	let button_options = {
		alt: name,
		type: "image",
		class: "icon",
	 	src: "/icons/" + icon + "-outline.svg",
	}
	let button = input(name, memo, options)
	for (let i in button_options) {
		button.setAttribute(i, button_options[i])
	}

	if (func) {
		button.addEventListener("click", func, false)
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
