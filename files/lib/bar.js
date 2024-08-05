function link(name, href) {
	let a = document.createElement("a")
	a.href = href
	a.appendChild(document.createTextNode(name))
	return a
}

function additem(list, element) {
	let i = document.createElement("li")
	i.appendChild(element)
	return list.append(i)
}

function show_bar(on) {
	if (!on) {
		on = document.querySelector("body")
	}

	let nav = document.createElement("nav")
	let left = document.createElement("ul")
	nav.appendChild(left)
	let right = document.createElement("ul")
	nav.appendChild(right)

	if (!api_logged_in()) {
		additem(right, link("Login", "/login"))
	} else {
		let jwt_payload = api_token_payload()
		let li = document.createElement("li")
		li.appendChild(document.createTextNode("Welcome "))
		li.appendChild(link(jwt_payload["id"], "/settings"))
		left.appendChild(li)
		additem(right, link("Floorplans", "/floorplans"))
		additem(right, link("Logout", "/logout"))
	}

	on.prepend(nav)
}
