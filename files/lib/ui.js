export function button(name, memo, icon, func) {
	let button = document.createElement("input")
	button.alt = name
	button.type = "image"
	button.src = "/icons/" + icon + "-outline.svg"
	if (func) {
		button.addEventListener("click", func, false)
	}
	button.setAttribute("title", memo)
	button.setAttribute("class", "icon")
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
