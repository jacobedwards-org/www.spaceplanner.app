export function input(name, memo, attributes) {
	if (!name) {
		throw new Error("No name provided")
	}

	let input = document.createElement("input")
	input.name = name
	input.placeholder = name
	for (let i in attributes) {
		input.setAttribute(i, attributes[i])
	}
	return input
}

export function button(name, memo, icon, func, options) {
	let button = input(name, memo, {
		alt: name,
		title: memo,
		type: "image",
		class: "icon",
	 	src: "/icons/" + icon + "-outline.svg"
	})
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
