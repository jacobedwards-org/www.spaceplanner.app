import * as dev from "/lib/dev.js"

main()

function main() {
	let f = document.getElementById("settings")


	for (let k in dev.settings) {
		f.append(makeLabel(dev.settings[k]))
		f.append(makeInput(dev.settings[k]))
		f.append(makeDescription(dev.settings[k]))
		f.append(document.createElement("br"))
	}
	let inputs = document.querySelectorAll("#settings > input")

	let reset = f.appendChild(document.createElement("input"))
	reset.type = "button"
	reset.value = "Restore"
	reset.setAttribute("title", "Restore default settings")
	reset.addEventListener("click", function(ev) {
		inputs.forEach(function(i) {
			if (dev.settings[i.id].type === "bool") {
				i.checked = false
			} else if (dev.settings[i.id].type === "string") {
				i.value = ""
			} else {
				throw new Error("Invalid type")
			}
			dev.setting(i.id, null)
		})
	})
}

function makeLabel(setting) {
	let l = document.createElement("label")

	l.append(document.createTextNode(setting.name + ": "))
	l.setAttribute("for", setting.key)
	l.setAttribute("title", setting.brief)

	return l
}

function makeInput(setting) {
	let c = document.createElement("input")
	let i = c

	i.id = setting.key
	i.setAttribute("title", setting.brief)
	let v = dev.setting(setting.key)
	if (setting.type === "bool") {
		i.type = "checkbox"
		if (v) {
			i.setAttribute("checked", true)
		}
	} else if (setting.type === "string") {
		i.value = v
	} else {
		throw new Error("Invalid type")
	}

	i.addEventListener("change", inputChangeHandler)

	return c
}

function makeDescription(setting) {
	let l = document.createElement("label")

	l.classList.add("description")
	l.setAttribute("for", setting.key)
	l.append(document.createTextNode(setting.description ?? setting.brief))

	return l
}

function inputChangeHandler(ev) {
	console.log("inputChangeHandler", ev.target.id, ev.target.value)
	try {
		dev.setting(ev.target.id, dev.settings[ev.target.id].type === "bool" ? ev.target.checked : ev.target.value)
	}
	catch(err) {
		ev.target.setCustomValidity(err)
		ev.target.reportValidity()
	}
}
