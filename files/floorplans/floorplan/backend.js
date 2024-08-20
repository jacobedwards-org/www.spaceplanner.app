import * as api from "/lib/api.js"

class BackendHistory {
	constructor() {
			// The current position in history (diffs)
			this.place = null,
	
			// Metadata for diff groups
			this.groups = [],
	
			// Actual changes
			this.diffs = []
	}

	get diff() {
		return this.diffs[this.place]
	}

	get group() {
		if (!this.diff) {
			if (this.groups.length === 1) {
				return this.groups[0]
			}
			return undefined
		}
		return this.groups[this.diff.group]
	}

	newGroup() {
		console.log(this.groups, this.diff, this.group)
		if (this.groups.length > 0) {
			if (this.group.length === 0) {
				console.warn("Backend.History.newGroup",
					"Not creating new group: In an empty group")
				return this.group.id
			}
			this.group.last = this.place
			if (this.group.id < this.groups.length) {
				// Truncate history to this point since we're altering it
				this.groups = this.groups.slice(0, this.group.id)
			}
		}

		let group = {
			type: "group",
			length: 0
		}
		group.id = this.groups.push(group) - 1
		console.debug("Backend.History.newGroup", group.id)
		// NOTE: New diff callback function
		return group.id
	}

	addDiff(op, path, value, oldvalue, options) {
		if (!op || !path) {
			throw new Error("Requires op and path")
		}
		if (op === "add") {
			if (!value) {
				throw new Error("add: Requires value")
			}
		} else if (op !== "remove") {
			throw new Error("Only add and remove operations supported")
		}

		if (!this.diff) {
			this.newGroup()
		}

		let diff = {
			type: "diff",
			group: this.group.id,
			op: op,
			path: path,
			value: value,
			oldValue: oldvalue, // Should probably do some checks on oldvalue
			time: Date.now()
		}

		if (!options.clean) {
			diff.dirty = true
		}

		diff.id = this.diffs.push(diff) - 1
		this.group.length += 1
		this.place = diff.id
		console.debug("History.Backend.addDiff", diff.id)
		return diff.id
	}

	// Get the required operations to go from a, a group or
	// diff, to b, another group or diff
	between(a, b) {
		const getDiff = function(v) {
			if (typeof(v) === "object") {
				if (!v.id) {
					throw new Error("Doesn't have an id")
				}
				if (v.type === "diff") {
					return v.id
				} else if (v.type === "group") {
					return this.groups[v.id].first
				}
				throw new Error("Not a valid type")
			}
			// Diff id
			return Number(v)
		}

		a = a ? getDiff(a) : 0
		b = b ? getDiff(b) : (this.diffs.length - 1)
		if (a < 0 || a >= this.diffs.length ||
		    b < 0 || b >= this.diffs.length) {
			throw new Error("Invalid diff range")
		}

		if (a == b) {
			return []
		}

		let reverse = false
		if (a < b) {
			b = this.groups[this.diffs[b].group].last
			if (!b) {
				b = this.diffs.length - 1
			}
		} else {
			reverse = true
			let t = a
			a = b
			b = t
		}

		let diffs = this.diffs.slice(a, b + 1)
		if (!reverse) {
			return diffs
		}
		for (let i in updates) {
			diffs[i] = reverseDiff(diffs[i])
		}
		return diffs.reverse()
	}

	reverseDiff(diff) {
		diff = structuredClone(diff)

		if (diff.op === "add") {
			if (diff.oldValue) {
				diff.op = "replace"
				diff.value = diff.oldValue
			} else {
				diff.op = "remove"
				diff.value = null
			}
		} else if (diff.op === "remove") {
			if (!diff.oldValue) {
				throw new Error("There should be an old value")
			}
			diff.op = "add"
			diff.value = diff.oldValue
		} else {
			throw new Error("Unsupported operation")
		}

		return diff
	}

	dirty() {
		return this.diffs.filter(item => item.dirty)
	}
}

export class FloorplanBackend {
	constructor(floorplan, options) {
		if (!options) {
			options = {}
		}

		if (!floorplan || !floorplan.user || !floorplan.name) {
			throw new Error("Requires floorplan")
		}
		this.floorplan = floorplan

		if (!options.server) {
			// This does nothing at the moment
			this.server = "https://api.spaceplanner.app"
		} else {
			this.server = options.server
		}

		if (options.callbacks) {
			this.callbacks = options.callbacks
		}

		// Cache for server (both from and to)
		this.cache = {
			// { pointId: { x: Number, y: Number } }
			points: {},

			/*
			 * { pointMapId: { type: mapType*, from: pointId, to: pointId } }
			 *
			 * [*] The only map types I think are needed are wall and door
			 * 	at the moment.
			 */
			pointmaps: {}

			// There will be here more later, such as furnature
		}

		this.history = new BackendHistory()
	}

	get endpoint() {
		return "floorplans/" + this.floorplan.user + "/" + this.floorplan.name + "/data"
	}

	// Apply's diffs in order to get to the state at the beginning of the given diff id
	// reconstructTo(diff) {}

	/*
	 * Add some type of data within the cache.
	 * If key is not given, a random one will be generated.
	 * If clean is not given, it is marked dirty
	 * (thus data from the server, with a known key, can be marked clean)
	 */
	addData(type, value, key, options) {
		if (!options) {
			options = {}
		}

		if (!key) {
			/*
			 * We'll have to generate a temporary id for it here
			 * since we can't wait for the server to respond with
			 * the ID it decides. It will need to be updated once
			 * we do get the server response.
			 */
			key = uniqueKey(this.cache[type])
		}

		console.debug("Backend.addData", type, key, value)
		if (!options.nodiff) {
			this.history.addDiff("add", diffPath(type, key), value, this.cache[type][key], options)
		}
		this.cache[type][key] = value

		return key
	}

	removeData(type, key, options) {
		if (!options) {
			options = {}
		}

		console.debug("Backend.removeData", type, key)
		if (!this.cache[type][key]) {
			throw new Error("Expected " + key + " to exist")
		}
		if (!options.nodiff) {
			this.addDiff("remove", diffPath(type, key), null, this.cache[type][key], options)
		}
		delete this.cache[type][key]
	}

	addPoint(point, options) {
		if (typeof point.x !== "number" || typeof point.y !== "number") {
			console.error("Backend.addPoint", point)
			throw new Error("Point must have x and y be numbers")
		}
		// I suppose point could have other keys, that's okay though
		return this.addData("points", { x: Math.round(point.x), y: Math.round(point.y) }, options)
	}

	removePoint(id, options) {
		return this.removeData("points", id, options)
	}

	// Returns map id
	mapPoints(type, a, b, options) {
		if (type != "wall") {
			throw new Error("Only walls allowed in pointmap so far")
		}
		if (!this.cache.points[a] || !this.cache.points[b]) {
			throw new Error("Pointmap must reference existing points")
		}

		// NOTE: For now, a and b are numbers. May not always be the case
		return this.addData("pointmaps", {
			type: type,
			a: a,
			b: b
		}, options)
	}

	unmapPoints(id, options) {
		return removeData("pointmaps", id, options)
	}

	reqId(type, id) {
		let obj = this.byId(type, id)
		if (!obj) {
			throw new Error(id + " for " + type + " doesn't exist")
		}
		return obj
	}

	byId(type, id) {
		if (!this.cache[type]) {
			throw new Error(type + ": Invalid type")
		}
		return this.cache[type][id]
	}

	cb(name, arg) {
		if (this.callbacks[name]) {
			this.callbacks[name](arg)
		}
	}

	// Push updates to the server
	push() {
		// Need a method of making sure we're only sending these once...
		let dirty = this.history.dirty()
		let patch = []

		for (let i in dirty) {
			let op
			if (dirty[i].op != "add") {
				op = dirty[i].op
			} else {
				if (!dirty[i].oldValue) {
					op = "new"
				} else {
					op = "replace"
				}
			}
			patch.push( { op: op, path: dirty[i].path, value: dirty[i].value })

			let ref = parsePath(dirty[i].path)
			if (ref.type === "pointmaps") {
				dirty[i].value.a = Number(dirty[i].value.a)
				dirty[i].value.b = Number(dirty[i].value.b)
			}
		}

		console.debug("Backend.push (patch)", patch)

		let backend = this
		return api.fetch("PATCH", this.endpoint, patch)
			.then(function(data) {
				updateIds(backend, data)
				for (let i in dirty) {
					delete dirty[i].dirty
					delete dirty[i].new
				}
				backend.cb("push")
			})
	}

	/*
	 * Pull updates from the server.
	 * (Set AddData diff option to false, and call newGroup()
	 * once at the end.)
	 */
	pull() {
		let backend = this
		return api.fetch("GET", this.endpoint)
			.then(function(data) {
				let diff = gendiff("", backend.cache, data)
				console.log("Backend.Pull (diff)", diff)
				backend.applyDiff(diff, { clean: true })
				backend.cb("pull")
			})
	}

	applyDiff(diff, options) {
		this.history.newGroup()
		for (let i in diff) {
			let ref = parsePath(diff[i].path)
			if (diff[i].op === "remove") {
				this.removeData(ref.type, ref.id, options)
			} else {
				this.addData(ref.type, diff[i].value, ref.id, options)
			}
		}
		this.history.newGroup()
	}
}

function gendiff(path, a, b) {
	let diffs = []

	for (let ak in a) {
		let p = path + "/" + ak
		if (!b[ak]) {
			diffs.push({ op: "remove", path: p })
		} else if (typeof a === "object") {
			diffs = diffs.concat(gendiff(p, a[ak], b[ak]))
		} else if (a[ak] != b[ak]) {
			diffs.push({ op: "replace", path: p, value: b[ak] })
		}
	}
	for (let bk in b) {
		if (!a[bk]) {
			diffs.push({ op: "add", path: path + "/" + bk, value: b[bk] })
		}
	}

	return diffs
}

function updateIds(backend, newdata) {
	for (let type in newdata) {
		for (let id in newdata[type]) {
			let x = newdata[type][id]
			if (x.old_id) {
				console.debug("Backend.updateIds", `ID ${x.old_id} > ${id}`)
				if (backend.cache[type][id]) {
					throw new Error("ERROR: Pull id conflict")
				}
				backend.cache[type][id] = backend.cache[type][x.old_id]
				// Both old and new exist at the moment, hense;
				backend.cb("updateId", { type: type, old: x.old_id, new: id })
				delete backend.cache[type][x.old_id]
			}
		}
	}
}

function diffPath(type, id) {
	return "/" + type + "/" + id
}

export function parsePath(path) {
	let a = path.split("/")
	if (a.length != 3) {
		throw new Error("Invalid path")
	}
	return newRef(a[1], a[2])
}

export function newRef(type, id) {
	return { type: type, id: id }
}

function uniqueKey(obj) {
	let key
	do {
		key = Number(Math.random().toString().split(".").join(""))
	} while (obj[key])

	// Wonder if there's an atomic way of testing whether a key is undefined and doing this?
	// Doesn't matter much for my purposes probably.
	obj[key] = null
	return key
}
