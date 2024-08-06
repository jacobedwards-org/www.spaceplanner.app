function init() {
	authorize()
	show_bar()
	api_fetch("GET", "floorplans/" + localStorage.getItem("username"))
		.then(show_floorplans)
}

function edit_floorplan_func(item, floorplan) {
	return function() {
		set_error("Edit not implemented", item)
	}
}

function delete_floorplan_func(item, floorplan) {
	return function() {
		api_fetch("DELETE", "floorplans/" + floorplan.user + "/" + floorplan.name)
			.then(function() {
				item.parentElement.remove()
			})
			.catch(function(err) {
				set_error("Unable to delete floorplan: " + err, item)
			})
	}
}

function create_floorplan(floorplan) {
	root = document.createElement("div")
	root.setAttribute("class", "floorplan")

	aside = document.createElement("aside")

	button = document.createElement("button")
	button.addEventListener("click", edit_floorplan_func(root, floorplan), false)
	// ! instead of a pencil for now
	button.appendChild(document.createTextNode("!"))
	button.setAttribute("title", "Edit metadata")
	aside.append(button)

	button = document.createElement("button")
	button.addEventListener("click", delete_floorplan_func(root, floorplan), false)
	// # instead of a trashcan for now
	button.appendChild(document.createTextNode("#"))
	button.setAttribute("title", "Delete floorplan")
	aside.append(button)

	root.append(aside)

	header = document.createElement("header")
	heading = document.createElement("h2")
	header.append(heading)
	link = document.createElement("a")
	heading.append(link)
	if (floorplan.synopsis) {
		synopsis = document.createElement("span")
		synopsis.setAttribute("class", "synopsis")
		synopsis.appendChild(document.createTextNode(floorplan.synopsis))
		header.append(synopsis)
	}
	if (floorplan.address) {
		address = document.createElement("address")
		address.appendChild(document.createTextNode(floorplan.address))
		header.append(address)
	}

	link.href = "floorplans/" + localStorage.getItem("username") + "/" + floorplan.name
	link.appendChild(document.createTextNode(floorplan.name))
	root.append(header)

	if (floorplan.user != localStorage.getItem("username")) {
		footer = document.createElement("footer")
		// TODO: Link to user page, when it exists
		footer.append(document.createTextNode("By " + floorplan.user))
		root.append(footer)
	}

	return root
}

function show_floorplans(floorplans) {
	list = document.getElementById("floorplans")
	if (!list) {
		throw new Error("expected #floorplans")
	}

	for (i in floorplans) {
		item = document.createElement("li")
		item.append(create_floorplan(floorplans[i]))
		list.append(item)
	}
}

window.onload = handle_wrap(init)
