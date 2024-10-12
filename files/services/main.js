import * as etc from "/lib/etc.js"
import * as api from "/lib/api.js"

etc.handle_wrap(main)

function main() {
	let wait = document.body.appendChild(document.createElement("p"))
	wait.appendChild(document.createTextNode("Please wait..."))
	wait.id = "wait"

	etc.userService()
		.then(function(service) {
			if (service) {
				window.location.href = "/billing"
			} else {
				api.fetch("GET", "services")
					.then(function(services) {
						if (services.length === 1) {
							chooseService(services[0])
						} else {
							for (let service in services) {
								addService(services[service])
							}
							wait.remove()
							document.getElementById("services")
								.removeAttribute("hidden", false)
						}
					})
			}
		})
		.catch(function() {
			// Assume they need to signup for now
			window.location.href = "/register"
		})
}

function chooseService(service) {
        console.log("Choose service", service.id)

        if (!api.authorized()) {
                window.location.href = "/register"
        }

	api.verifiedEmail()
		.then(function(email) {
			if (!email) {
				window.location.href = "/settings/verify-email"
				return
			}
			api.fetch("POST", "users/:user/services/checkout",
				{ prices: [ service.prices[0].id ] }).then(function(body) {
					window.location.href = body.url
				})
				.catch(function(err) {
					console.error("Unable to checkout:", err)
					etc.error("There was an unexpected error.")
				})
		})
}

function addService(service) {
	let container = document.createElement("div")
	container.classList.add("service")

	let info = container

	let button = document.createElement("input")
	button.setAttribute("type", "button")
	button.setAttribute("value", "Choose " + service.name)
	button.addEventListener("click", function() { chooseService(service) })

	let name = info.appendChild(document.createElement("span"))
	name.classList.add("name")
	name.appendChild(document.createTextNode(service.name))

	info.appendChild(document.createTextNode(" "))

	let price = info.appendChild(document.createElement("span"))
	price.classList.add("price")
	price.appendChild(document.createTextNode(costDuration(service.prices[0])))

	if (service.description != null) {
		let desc = info.appendChild(document.createElement("p"))
		desc.appendChild(document.createTextNode(service.description))
		desc.classList.add("description")
	}

	container.appendChild(button)
	document.getElementById("services")
		.appendChild(container)
}

function costDuration(price) {
	return "$" + String(price.amount / 100) + "/" + durationString(price)
}

function durationString(price) {
	if (price.interval != "month") {
		throw new Error("Expecting month")
	}
	if (price.intervalCount === 1) {
		return "mo"
	}
	return String(price.intervalCount) + "mo"
}
