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

export function toggle(a, afunc, b, bfunc) {
	a.addEventListener("click", function() {
		let r = afunc()
		if (r && typeof r.then == "function") {
			r.then(function() { a.replaceWith(b) })
		} else {
			a.replaceWith(b)
		}
	}, false)
	b.addEventListener("click", function() {
		let r = bfunc()
		if (r && typeof r.then == "function") {
			r.then(function() { b.replaceWith(a) })
		} else {
			b.replaceWith(a)
		}
	}, false)
	return a
}
