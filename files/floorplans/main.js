import * as api from "/lib/api.js"
import * as etc from "/lib/etc.js"
import * as ui from "/lib/ui.js"

// These are in the order they should appear
const editables = [ "name", "address", "synopsis" ]

etc.handle_wrap(init)

function init() {
	etc.authorize()
	etc.bar()

	let f = document.getElementById("filter")
	f.removeAttribute("disabled")
	f.addEventListener("input", function(ev) {
		document.querySelectorAll("#floorplans > li").forEach(function(item) {
			if (item.querySelector("#adder")) {
				return
			}

			let data = {}
			let h = item.querySelector(".floorplan > header")
			const tc = function(sel) {
				const e = h.querySelector(sel)
				return e ? e.textContent : null
			}
			data.name = tc(".name_div > h2 > a")
			data.address = tc(".address")
			data.synopsis = tc(".synopsis")
			item.hidden = !matchFloorplan(data, ev.target.value)
		})
	})

	api.fetch("GET", "floorplans/:user")
		.then(show_floorplans)
		.catch(etc.error)
}

function commit_editable_floorplan_func(element, data) {
	return function () {
		let patches = []
		let fields = Array.from(element.querySelectorAll(".fp_metadata"))
		let updated = false
		let newdata = {}
		for (let i in fields) {
			let name = fields[i].name
			let value = fields[i].value
			if (value.length === 0) {
				value = null
			}

			console.debug(fields[i], name, value)
			newdata[name] = value;
			if (newdata[name] !== data[name]) {
				updated = true
			}
		}

		if (!updated) {
			console.debug("No changes, skipping")
			element.replaceWith(create_floorplan(data))
			return
		}

		return api.fetch("PUT", `floorplans/:user/${data.id}`, newdata)
			.then(function(rdata) {
				for (let i in rdata) {
					data[i] = rdata[i]
				}
				element.replaceWith(create_floorplan(data))
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
			let name = fields[i].name
			let value = fields[i].value
			console.debug(fields[i], name, value)
			if (value) {
				data[name] = value
			}
		}

		return api.fetch("POST", "floorplans/:user", data)
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
			let memo = "Edit floorplan " + editables[i]
			let e = parent.querySelector("." + editables[i])

			input = ui.input(editables[i], memo, {
				attributes: { value: e ? e.textContent : "" }
			})
			input.classList.add("fp_metadata")
			input.classList.add(editables[i])
			input.name = editables[i]

			if (e) {
				e.replaceWith(input)
			} else {
				if (prev) {
					if (prev.name === "name") {
						parent.append(input)
					} else {
						prev.after(input)
					}
				} else {
					parent.append(input)
				}
			}
			prev = input
		}
	}
}

function delete_floorplan_func(item, floorplan) {
	return function() {
		api.fetch("DELETE", `floorplans/:user/${floorplan.id}`)
			.then(function() {
				item.parentElement.remove()
			})
			.catch(function(err) {
				etc.error("Unable to delete floorplan: " + err, item)
			})
	}
}

function ask_delete_floorplan_func(item, floorplan) {
	return function() {
		document.querySelectorAll(".delete_dialog").forEach(function(e) { e.remove() })
		let c = document.body.appendChild(document.createElement("div"))
		c.classList.add("delete_dialog")
		let mkbutton = function(value) {
			let b = document.createElement("input")
			b.type = "button"
			b.value = value
			return b
		}

		let t = c.appendChild(document.createElement("p"))
		t.appendChild(document.createTextNode("Delete "))
		let q = t.appendChild(document.createElement("q"))
		q.appendChild(document.createTextNode(floorplan.name))
		t.append(document.createTextNode("?"))

		let yes = c.appendChild(mkbutton("Yes"))
		let no = c.appendChild(mkbutton("No"))

		let p = new Promise(function(res, rej) {})
		let hand = function(ev) {
			if (ev.target.value == "Yes") {
				delete_floorplan_func(item, floorplan)()
			}
			c.remove()
		}
		yes.addEventListener("click", hand)
		no.addEventListener("click", hand)

		return p
	}
}

function create_floorplan_item(floorplan) {
	let item = document.createElement("li")
	item.append(create_floorplan(floorplan))
	return item
}

function create_floorplan(floorplan) {
	let root = document.createElement("div")
	root.classList.add("class", "floorplan")

	let aside = document.createElement("div")
	aside.classList.add("fp_ops")
	if (floorplan) {
		let a = aside.appendChild(document.createElement("a"))
		a.href = `./floorplan/?id=${floorplan.id}`
		a.append(document.createTextNode("Editor"))

		let ops = aside.appendChild(document.createElement("div"))
		ops.classList.add("fp_buttons")

		ops.append(ui.button("Copy", "Copy floorplan", null, { handlers: { click: function() { copy_floorplan(floorplan) } } }))
		ops.append(ui.button("Delete", "Delete floorplan", null, { handlers: { click: ask_delete_floorplan_func(root, floorplan) } }))
	} else {
		root.id = "adder"
		root.addEventListener("keydown", function(ev) {
			if (ev.key === "Enter") {
				ev.preventDefault()
				editable_floorplan_create_func(root)()
			}
		})
		aside.append(ui.button("Create", "Create floorplan", null, { handlers: { click: editable_floorplan_create_func(root) } }))
	}

	let header = document.createElement("header")
	header.append(aside)
	root.append(header)

	if (!floorplan) {
		editable_floorplan_func(root, {})()
	} else {
		if (!floorplan.name) {
			throw new Error("Expected floorplan name")
		}
		let nameDiv = header.appendChild(document.createElement("div"))
		nameDiv.classList.add("name_div")
		nameDiv.append(create_field.name(floorplan.name, floorplan.id))
		nameDiv.append(ui.toggle(
			{ button: ui.button("Edit", "Edit floorplan metadata", "create"), func: editable_floorplan_func(root, floorplan) },
			{ button: ui.button("Save", "Save floorplan metadata", "save"), func: commit_editable_floorplan_func(root, floorplan) },
		))

		if (floorplan.address) {
			header.append(create_field.address(floorplan.address))
		}
		if (floorplan.synopsis) {
			header.append(create_field.synopsis(floorplan.synopsis))
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
	name: function(text, id) {
		let heading = document.createElement("h2")
		heading.classList.add("fp_metadata")
		heading.classList.add("name")
		let link = document.createElement("a")
		link.href = `./floorplan/?id=${id}`
		link.appendChild(document.createTextNode(text))
		heading.append(link)
		return heading
	},
	
	synopsis: function(text) {
		let synopsis = document.createElement("span")
		synopsis.classList.add("fp_metadata")
		synopsis.classList.add("synopsis")
		synopsis.appendChild(document.createTextNode(text))
		return synopsis
	},
	
	address: function(text) {
		let address = document.createElement("address")
		address.classList.add("fp_metadata")
		address.classList.add("address")
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

function insertFloorplan(floorplan) {
	let e = create_floorplan_item(floorplan)

	let adder = document.getElementById("adder")
	if (adder) {
		adder.parentElement.after(e)
	} else {
		let list = document.getElementById("floorplans")
		list.prepend(create_floorplan(floorplan))
	}
}
	

function copy_floorplan(floorplan, name, depth) {
	if (!name) {
		name = floorplan.name + " (Copy)"
	}
	api.fetch("GET", `floorplans/${floorplan.user}/${floorplan.id}/data`)
		.then(function(data) {
			let f = structuredClone(floorplan)
			f.name = name
			return api.fetch("POST", "floorplans/:user", f)
				.then(function(floorplan) {
					insertFloorplan(floorplan)
					return api.fetch("PUT", `floorplans/${floorplan.user}/${floorplan.id}/data`, data)
						.catch(function(err) {
							api.fetch("DELETE", `floorplans/:user/${floorplan.id}`)
							throw err
						})
				})
				.catch(function(err) {
					depth = depth ?? 0
					if (depth < 10 && err.message.indexOf('violates unique constraint "id"')) {
						return copy_floorplan(floorplan, name + " (Copy)", depth + 1)
					} else {
						etc.error(err)
						throw err
					}
				})
		})
}

function matchFloorplan(floorplan, exp) {
	const ms = function(s, e) {
		return s ? s.toLowerCase().includes(e) : false
	}

	exp = exp.toLowerCase()
	return ms(floorplan.name, exp) || ms(floorplan.address, exp) || ms(floorplan.synopsis, exp)
}
