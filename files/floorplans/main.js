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

	let list = { button: ui.button("List", "Switch to list view", "list"), func: listview }
	let grid = { button: ui.button("Grid", "Switch to grid view", "grid"), func: gridview }
	let toggle
	if (localStorage.getItem("fp_gridview")) {
		toggle = ui.toggle(list, grid, { init: true })
	} else {
		toggle = ui.toggle(grid, list, { init: true })
	}
	display_button.replaceWith(toggle)

	api.fetch("GET", "floorplans/" + etc.url_literal(localStorage.getItem("username")))
		.then(show_floorplans)
}

function listview() {
	document.getElementById("floorplans").removeAttribute("class")
	localStorage.removeItem("fp_gridview")
}

function gridview() {
	document.getElementById("floorplans").setAttribute("class", "grid")
	localStorage.setItem("fp_gridview", "list")
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

		return api.fetch("PATCH", "floorplans/" + etc.url_literal(localStorage.getItem("username")) + "/" + etc.url_literal(data.name), patches)
			.then(function(rdata) {
				for (let i in rdata) {
					data[i] = rdata[i]
				}
				update_display()
			})
			.catch(function(err) {
				etc.error(err, element)
				throw err
			})
	}
}

function editable_floorplan_create_func(element) {
	return function () {
		let data = {}
		let fields = Array.from(element.querySelectorAll("header > input"))
		for (let i in fields) {
			let name = floorplan_info_name(fields[i].getAttribute("class"))
			let value = fields[i].value
			console.debug(fields[i], name, value)
			if (value) {
				data[name] = value
			}
		}

		return api.fetch("POST", "floorplans/" + etc.url_literal(localStorage.getItem("username")), data)
			.then(function(rdata) {
				for (let i in rdata) {
					data[i] = rdata[i]
				}
				for (let i in fields) {
					fields[i].value = ""
				}
				/* NOTE: I was going to try and not
				 * have these floorplans know anything
				 * about where they are, but I'm living
				 * with this.
				 */
				element.parentElement.after(create_floorplan_item(data))
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
			let memo = "Edit floorplan " + editables[i]
			if (e) {
				input = ui.input(editables[i], memo, {
					attributes: { value: e.textContent }
				})
				input.setAttribute("class", c)
				e.replaceWith(input)
			} else {
				input = ui.input(editables[i], memo)
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

function delete_floorplan_func(item, floorplan) {
	return function() {
		api.fetch("DELETE", "floorplans/" + etc.url_literal(floorplan.user) + "/" + etc.url_literal(floorplan.name))
			.then(function() {
				item.parentElement.remove()
			})
			.catch(function(err) {
				etc.error("Unable to delete floorplan: " + err, item)
			})
	}
}

function create_floorplan_item(floorplan) {
	let item = document.createElement("li")
	item.append(create_floorplan(floorplan))
	return item
}

function create_floorplan(floorplan) {
	let root = document.createElement("div")
	root.setAttribute("class", "floorplan")

	let aside = document.createElement("aside")

	if (floorplan) {
		aside.append(
			ui.toggle(
				{ button: ui.button("Edit", "Edit floorplan", "create"), func: editable_floorplan_func(root, floorplan) },
				{ button: ui.button("Save", "Save floorplan", "save"), func: commit_editable_floorplan_func(root, floorplan) },
			)
		)
		aside.append(ui.button("Delete", "Delete floorplan", "trash", { handlers: { click: delete_floorplan_func(root, floorplan) } }))
	} else {
		aside.append(ui.button("Create", "Create floorplan", "create", { handlers: { click: editable_floorplan_create_func(root) } }))
	}

	root.append(aside)
	let header = document.createElement("header")
	root.append(header)

	if (!floorplan) {
		editable_floorplan_func(root, {})()
	} else {
		if (!floorplan.name) {
			throw new Error("Expected floorplan name")
		}
		header.append(create_field.name(floorplan.name))
		if (floorplan.synopsis) {
			header.append(create_field.synopsis(floorplan.synopsis))
		}
		if (floorplan.address) {
			header.append(create_field.address(floorplan.address))
		}

		if (floorplan.user != localStorage.getItem("username")) {
			let footer = document.createElement("footer")
			// TODO: Link to user page, when it exists
			footer.append(document.createTextNode("By " + floorplan.user))
			root.append(footer)
		}
	}

	return root
}

var create_field = {
	name: function(text) {
		let heading = document.createElement("h2")
		heading.setAttribute("class", floorplan_info_class("name"))
		let link = document.createElement("a")
		link.href = "./floorplan/?name=" + etc.url_literal(text)
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

	list.append(create_floorplan_item())
	for (let i in floorplans) {
		list.append(create_floorplan_item(floorplans[i]))
	}
}

window.onload = etc.handle_wrap(init)
