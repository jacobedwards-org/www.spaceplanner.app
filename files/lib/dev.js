let _settings = {
	devapi: { name: "Developer API", type: "bool", brief: "Use the Developer API URL." },
	apiurl: { name: "Developer API URL", type: "string", brief: "URL for the Developer API." }
}

for (let k in _settings) {
	switch (_settings[k].type) {
	case "bool": 
	case "string": 
		break;
	default:
		console.error(`"${k}" developer setting has an invalid type (${_settings[k].type}); deleting`)
		delete _settings[k]
		continue
	}
	_settings[k].key = k
}

export const settings = _settings

export function setting(k, v) {
	if (v === undefined) {
		if (settings[k] == undefined) {
			console.error(`Tried to access undefined setting "${k}": ${new Error("").stack}`)
			return undefined
		}
		return getValue(k)
	}
	setValue(k, v)
}

function getValue(k) {
	let v = localStorage.getItem(storageKey(k))
	console.log("dev.getValue", k, v)
	if (settings[k].type === "bool") {
		return v == "true"
	} else if (settings[k].type === "string") {
		return v
	}
	throw new Error("Invalid setting type")
}

function setValue(k, v) {
	console.log("dev.setValue", k, v)
	if (v == null) {
		localStorage.removeItem(storageKey(k))
	} else {
		localStorage.setItem(storageKey(k), v)
	}
}

function storageKey(k) {
	return "dev-" + k
}
