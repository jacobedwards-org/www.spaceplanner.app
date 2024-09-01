import * as etc from "/lib/etc.js"
import * as api from "/lib/api.js"

function main() {
	api.fetch("GET", "services")
		.then(function(services) {
			console.warn(services)
			for (let service in services) {
				addService(services[service])
			}
		})
}

function chooseService(service) {
        console.log("Choose service", service.id)

        if (!api.authorized()) {
                window.location.href = "/register"
        }

        api.fetch("POST", "users/" + localStorage.getItem("username") + "/services/checkout",
                { prices: [ service.prices[0].id ] }).then(function(body) {
			console.warn(body)
                        window.location.href = body.url
                })
                .catch(function(err) {
                        console.error("Unable to checkout:", err)
                        etc.error("There was an unexpected error.")
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

main()
