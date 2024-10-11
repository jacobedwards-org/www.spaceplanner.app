import * as api from "/lib/api.js"
import * as ui from "/lib/ui.js"

function link(name, href, icon) {
	let a = document.createElement("a")
	a.href = href
	if (icon) {
		let i = document.createElement("img")
		i.setAttribute("src", "/icons/" + icon + "-outline.svg")
		i.setAttribute("alt", name + " icon")
		i.classList.add("icon")
		a.appendChild(i)
	} else {
		a.appendChild(document.createTextNode(name))
	}
	return a
}

function additem(list, element) {
	let i = document.createElement("li")
	i.appendChild(element)
	list.append(i)
}

export function bar(on) {
	if (!on) {
		on = document.body
	}

	let nav = document.createElement("nav")
	nav.id = "bar"

	let left = nav.appendChild(document.createElement("ul"))
	left.classList.add("left")

	let right = nav.appendChild(document.createElement("ul"))
	right.classList.add("right")

	if (!api.authorized()) {
		let l = link("Spaceplanner", "/")
		additem(left, l)

		l = link("Login", "/login")
		l.classList.add("button")
		additem(right, l)
		l = link("Signup", "/register")
		l.classList.add("button")
		l.classList.add("pop")
		additem(right, l)
	} else {
		userService()
			.then(function(service) {
				if (service == null) {
					additem(left, link("Subscribe", "/services"))
				} else {
					additem(left, )
				}
			})
			.catch(function() {
				additem(left, link("Floorplans", "/floorplans"))
			})

		additem(right, link("Settings", "/settings", "settings"))
		additem(right, link("Logout", "/logout", "log-out"))
	}

	on.prepend(nav)
}

export function userService() {
	return api.fetch("GET", "users/:user/services/subscribed")
		.then(function(r) {
			if (r.services.length > 1) {
				console.error("Only returning one service when multiple are subscribed to")
			}
			return r.services[0]
		})
}

export function authorize() {
        if (!api.authorized()) {
                // Maybe add a parameter which has /login redirect
                // back to the page that was trying to be accessed
                window.location.href = "/login"
        }
	keep_authorized()
}

function keep_authorized() {
	return setInterval(function() {
		let left = Math.floor(api.authorized_duration() / 60)
		if (left < 0) {
			if (!document.getElementById("login")) {
				let params = {
					user: localStorage.getItem("username"),
					forceUser: true
				}
				let login = document.body.appendChild(ui.login(params))
				login.id = "login"
			}
		} else if (left < 30) {
			console.log("keep_authorized", "refreshing", left, "minutes left")
			api.refresh_token()
		}
	}, 1000 * 60)
}

export function error(message, on) {
        if (!on || !on.parentElement) {
                on = document.body
        }

        let err_elem = on.parentElement.querySelector(":scope > .error")
        if (err_elem) {
                err_elem.textContent = message
        } else {
                let err_elem = document.createElement("form")
		err_elem.addEventListener("submit", function(e) { e.preventDefault() })
                err_elem.setAttribute("class", "error")

		let msg = document.createElement("p")
		msg.appendChild(document.createTextNode(message))
		err_elem.append(msg)
		let b = err_elem.appendChild(ui.button("Dismiss", "Dismiss error", "close"))
		b.addEventListener("click", function(ev) { err_elem.remove(); ev.preventDefault() })

                on.prepend(err_elem)
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

export function url_literal(text) {
	return encodeURIComponent(text)
}

export function require_id(id) {
	let e = document.getElementById(id)
	if (!e) {
		throw new Error("'#" + id + "' is required to exist, but doesn't")
	}
	return e
}
