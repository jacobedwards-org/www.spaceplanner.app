import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"

function init() {
	etc.authorize()
	etc.bar()

	let display_button = document.getElementById("display_method")
	if (!display_button) {
		throw new Error("Expected #display_method")
	}
	set_display_method(display_button, "grid")

	display_button.addEventListener("click", toggle_display_method_func(display_button), false)

	api.fetch("GET", "floorplans/" + localStorage.getItem("username"))
		.then(show_floorplans)
}

function toggle_display_method_func(button) {
	return function() {
		set_display_method(button, button.value)
	}
}

function set_display_method(button, method) {
	let floorplans = document.getElementById("floorplans")
	if (!floorplans) {
		throw new Error("expected #floorplans")
	}
	if (method === "list") {
		floorplans.removeAttribute("class")
		var other = "grid"
	} else if (method === "grid") {
		floorplans.setAttribute("class", "grid")
		var other = "list"
	} else {
		throw new Error("Invalid method")
	}
	button.value = other
	button.src = "/icons/" + other + "-outline.svg"
	button.setAttribute("title", "Switch to " + other + " layout")
}

function edit_floorplan_func(item, floorplan) {
	return function() {
		etc.error("Edit not implemented", item)
	}
}

function delete_floorplan_func(item, floorplan) {
	return function() {
		api.fetch("DELETE", "floorplans/" + floorplan.user + "/" + floorplan.name)
			.then(function() {
				item.parentElement.remove()
			})
			.catch(function(err) {
				etc.error("Unable to delete floorplan: " + err, item)
			})
	}
}

function create_floorplan(floorplan) {
	let root = document.createElement("div")
	root.setAttribute("class", "floorplan")

	let aside = document.createElement("aside")

	let button = document.createElement("input")
	button.addEventListener("click", edit_floorplan_func(root, floorplan), false)
	button.type = "image"
	button.src = "/icons/create-outline.svg"
	button.alt = "Edit"
	button.setAttribute("title", "Edit floorplan")
	button.setAttribute("class", "icon")
	aside.append(button)

	button = document.createElement("input")
	button.addEventListener("click", delete_floorplan_func(root, floorplan), false)
	button.type = "image"
	button.src = "/icons/trash-outline.svg"
	button.alt = "Delete"
	button.setAttribute("title", "Delete floorplan")
	button.setAttribute("class", "icon")
	aside.append(button)

	root.append(aside)

	let header = document.createElement("header")
	let heading = document.createElement("h2")
	header.append(heading)
	let link = document.createElement("a")
	heading.append(link)
	if (floorplan.synopsis) {
		let synopsis = document.createElement("span")
		synopsis.setAttribute("class", "synopsis")
		synopsis.appendChild(document.createTextNode(floorplan.synopsis))
		header.append(synopsis)
	}
	if (floorplan.address) {
		let address = document.createElement("address")
		address.appendChild(document.createTextNode(floorplan.address))
		header.append(address)
	}

	link.href = "floorplans/" + localStorage.getItem("username") + "/" + floorplan.name
	link.appendChild(document.createTextNode(floorplan.name))
	root.append(header)

	if (floorplan.user != localStorage.getItem("username")) {
		let footer = document.createElement("footer")
		// TODO: Link to user page, when it exists
		footer.append(document.createTextNode("By " + floorplan.user))
		root.append(footer)
	}

	return root
}

function show_floorplans(floorplans) {
	let list = document.getElementById("floorplans")
	if (!list) {
		throw new Error("expected #floorplans")
	}

	for (let i in floorplans) {
		let item = document.createElement("li")
		item.append(create_floorplan(floorplans[i]))
		list.append(item)
	}
}

window.onload = etc.handle_wrap(init)
