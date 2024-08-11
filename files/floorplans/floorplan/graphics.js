export const svg = {
	element: function(name) {
		return document.createElementNS("http://www.w3.org/2000/svg",  name)
	},

	line: function(x1, y1, x2, y2) {
		let line = svg.element("line")
		line.setAttribute("x1", x1)
		line.setAttribute("y1", y1)
		line.setAttribute("x2", x2)
		line.setAttribute("y2", y2)
		return line
	},

	transform: function(svg, element, method, ...values) {
		let t = svg.createSVGTransform()
		console.debug("transform", method, values)
		t[method](...values)

		element.transform.baseVal.appendItem(t)
		return t
	}
}

export function point(x, y) {
	return { x: x, y: y }
}

export function rect(x, y, width, height) {
	return { x: x, y: y, width: width, height: height }
}
