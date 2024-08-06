import * as api from "/lib/api.js"

function link(name, href) {
	let a = document.createElement("a")
	a.href = href
	a.appendChild(document.createTextNode(name))
	return a
}

function additem(list, element) {
	let i = document.createElement("li")
	i.appendChild(element)
	list.append(i)
}

export function bar(on) {
	if (!on) {
		on = document.querySelector("body")
	}

	let nav = document.createElement("nav")
	let left = document.createElement("ul")
	nav.appendChild(left)
	let right = document.createElement("ul")
	nav.appendChild(right)

	if (!api.logged_in()) {
		additem(right, link("Login", "/login"))
	} else {
		let jwt_payload = api.token_payload()
		let li = document.createElement("li")
		li.appendChild(document.createTextNode("Welcome "))
		li.appendChild(link(jwt_payload["id"], "/settings"))
		left.appendChild(li)
		additem(right, link("Floorplans", "/floorplans"))
		additem(right, link("Logout", "/logout"))
	}

	on.prepend(nav)
}

export function authorize() {
        if (api.authorized_duration() <= 0) {
                // Maybe add a parameter which has /login redirect
                // back to the page that was trying to be accessed
                window.location.href = "/login"
        }
}

function delete_element_func(element) {
	return function() {
		element.remove()
	}
}

export function error(message, on) {
        if (!on) {
                on = document.body
        }

        let err_elem = on.parentElement.querySelector(":scope > .error")
        if (err_elem) {
                err_elem.textContent = message
        } else {
                let err_elem = document.createElement("div")
                err_elem.setAttribute("class", "error")

		let msg = document.createElement("p")
		msg.appendChild(document.createTextNode(message))
		err_elem.append(msg)

		let close = document.createElement("input")
		close.type = "image"
		close.src = "/icons/close-outline.svg"
		close.addEventListener("click", delete_element_func(err_elem), false)
		close.setAttribute("class", "icon")

		err_elem.append(close)

                on.before(err_elem)
        }
}

export function handle_wrap(func, on) {
	return function() {
		try {
			func()
		}
		catch(err) {
			error("There was an issue with the page: " + err, on)
		}
	}
}
