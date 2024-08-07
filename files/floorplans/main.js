import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

// These are in the order they should appear
const editables = [ "name", "synopsis", "address" ]

function init() {
	etc.authorize()
	etc.bar()

	let display_button = document.getElementById("display_method")
	if (!display_button) {
		throw new Error("Expected #display_method")
	}
	gridview()
	display_button.replaceWith(
		ui.toggle(
			ui.button("List", "Switch to list view", "list"), listview,
			ui.button("Grid", "Switch to grid view", "grid"), gridview,
		)
	)

	api.fetch("GET", "floorplans/" + localStorage.getItem("username"))
		.then(show_floorplans)
}

function listview() {
	document.getElementById("floorplans").removeAttribute("class")
}

function gridview() {
	document.getElementById("floorplans").setAttribute("class", "grid")
}

function commit_editable_floorplan_func(element, data) {
	let update_display = function() {
		let parent = element.querySelector("header")
		for (let i in editables) {
			let c = floorplan_info_class(editables[i])
			let field = parent.querySelector("." + c)
			if (!field) {
				throw new Error("Expected ." + c + ", got nothing")
			}
			if (!field.value) {
				field.remove()
			} else {
				let creator = create_field[editables[i]]
				if (!creator) {
					throw new Error("Expected " + editables[i] + "in create_field")
				}
				field.replaceWith(creator(field.value))
			}
		}
	}

	return function () {
		let patches = []
		let fields = Array.from(element.querySelectorAll("header > input"))
		for (let i in fields) {
			let name = floorplan_info_name(fields[i].getAttribute("class"))
			let value = fields[i].value
			console.debug(fields[i], name, value)
			if (value === data[name]) {
				continue;
			} else if (value) {
				patches.push({ op: "add", path: name, value: value })
			} else if (!value) {
				patches.push({ op: "remove", path: name })
			}
		}

		if (patches.length == 0) {
			console.debug("No changes, skipping PATCH")
			update_display()
			return
		}

		return api.fetch("PATCH", "floorplans/" + localStorage.getItem("username") + "/" + data.name, patches)
			.then(function(data) {
				for (let i in data) {
					data[i] = data[i]
				}
				update_display()
			})
			.catch(function(err) {
				etc.error(err, element)
				throw err
			})
	}
}

function editable_floorplan_func(element, data) {
	return function() {
		let prev
		let parent = element.querySelector("header")
		for (let i in editables) {
			let input
			let c = floorplan_info_class(editables[i])
			let e = parent.querySelector("." + c) // .getElementsByClassName()
			if (e) {
				input = make_input(editables[i], { value: e.textContent })
				input.setAttribute("class", c)
				e.replaceWith(input)
			} else {
				input = make_input(editables[i])
				input.setAttribute("class", c)
				if (prev) {
					prev.after(input)
				} else {
					parent.append(input)
				}
			}
			prev = input
		}
	}
}

function floorplan_info_class(name) {
	return "fp_" + name;
}

function floorplan_info_name(classname) {
	if (!classname.match("^fp_")) {
		throw new Error("Expected floorplan info class")
	}
	return classname.substring(3)
}

function make_input(name, options) {
	if (!name) {
		throw new Error("No name provided")
	}
	if (!options) {
		options = {}
	}

	let input = document.createElement("input")
	input.name = name
	input.placeholder = name
	if (options["type"]) {
		input.type = options["type"]
	}
	if (options["value"]) {
		input.value = options["value"]
	}
	return input
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
	if (!floorplan.name) {
		throw new Error("Expected floorplan name")
	}

	let root = document.createElement("div")
	root.setAttribute("class", "floorplan")

	let aside = document.createElement("aside")
	aside.append(
		ui.toggle(
			ui.button("Edit", "Edit floorplan", "create"), editable_floorplan_func(root, floorplan),
			ui.button("Save", "Save floorplan", "save"), commit_editable_floorplan_func(root, floorplan),
		)
	)

	aside.append(ui.button("Delete", "Delete floorplan", "trash", delete_floorplan_func(root, floorplan)))

	root.append(aside)

	let header = document.createElement("header")
	header.append(create_field.name(floorplan.name))
	if (floorplan.synopsis) {
		header.append(create_field.synopsis(floorplan.synopsis))
	}
	if (floorplan.address) {
		header.append(create_field.address(floorplan.address))
	}

	root.append(header)

	if (floorplan.user != localStorage.getItem("username")) {
		let footer = document.createElement("footer")
		// TODO: Link to user page, when it exists
		footer.append(document.createTextNode("By " + floorplan.user))
		root.append(footer)
	}

	return root
}

var create_field = {
	name: function(text) {
		let heading = document.createElement("h2")
		heading.setAttribute("class", floorplan_info_class("name"))
		let link = document.createElement("a")
		link.href = "floorplans/" + localStorage.getItem("username") + "/" + text
		link.appendChild(document.createTextNode(text))
		heading.append(link)
		return heading
	},
	
	synopsis: function(text) {
		let synopsis = document.createElement("span")
		synopsis.setAttribute("class", floorplan_info_class("synopsis"))
		synopsis.appendChild(document.createTextNode(text))
		return synopsis
	},
	
	address: function(text) {
		let address = document.createElement("address")
		address.setAttribute("class", floorplan_info_class("address"))
		address.appendChild(document.createTextNode(text))
		return address
	}
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
