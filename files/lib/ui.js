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
		afunc()
		a.replaceWith(b)
	}, false)
	b.addEventListener("click", function() {
		bfunc()
		b.replaceWith(a)
	}, false)
	return a
}