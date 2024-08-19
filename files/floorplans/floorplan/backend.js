import * as api from "/lib/api.js"

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

		/*
		 * Considered making a diff tree, decided against
		 * since I don't know how I would display it to the
		 * user usefully. Can still be done in the future.
		 *
		 * Array of diff sets (meant to be one user action).
		 * Oldest last, same with diffs: inside
		 *  [
		 *  	// Array of diffs
		 *  	{
		 * 		// In a map for future metadata
		 *  		// Ordered array of differences, in JSON patch format
		 *  		diff: [
		 *  			{ op: XXX, path: YYY, value: ZZZ, time: Date.now() }
		 * 			// e.g.:
		 *  			{ op: "add", path: "points/399", value: { x: 302, y: 422 }: time: Date.now() }
		 *  		]
		 *  	}
		 *  ]
		*/

		/*
		 * I considered making a diff tree, but decided against it
		 * because I won't know how much value there would be
		 * in it, especially considering the difficulty in providing
		 * users access to it.
		 *   Nonetheless it can be added later if I like.
		 *
		 * [
		 * 	// Array of diffs, a set for each user action
		 * 	{
		 * 		[dirty: true]
		 * 		diff: <JSON Patch>
		 * 	}
		 * 	[...]
		 * ]
		 */
		this.diffs = []

		// The cache's state in relation to the diffs
		this.diff = null
	}

	get endpoint() {
		return "floorplans/" + this.floorplan.user + "/" + this.floorplan.name + "/data"
	}

	// Start writing new differences to a new diff set
	newDiff() {
		if (this.diffs.length > 0 && this.diffs[this.diff].diff.length === 0) {
			console.warn("Current diff empty, not creating new one")
			return this.diff
		}

		for (let i = this.diffs.length - 1; i > this.diff; --i) {
			delete this.diffs[i]
		}
		this.diff = this.diffs.push({
			diff: []
		}) - 1
		console.debug("newDiff", this.diff)
		this.cb("newdiff")
		return this.diff
	}

	// Add to current diff
	addToDiff(op, path, value, options) {
		if (!op || !path) {
			throw new Error("Requires op and path")
		}
		if (op === "add") {
			if (!value) {
				throw new Error("Add requires a value")
			}
		} else if (op !== "remove") {
			throw new Error("Only add and remove operations supported")
		}

		if (!this.diff) {
			this.newDiff()
		}
		let diff = {
			op: op,
			path: path,
			value: value,
			time: Date.now()
		}
		if (!options.clean) {
			diff.dirty = true
		}
		if (options.new) {
			diff.new = true
		}
		this.diffs[this.diff].diff.push(diff)
		console.debug("Backend.addToDiff", diff)
	}

	// Apply's diffs in order to get to the state at the beginning of the given diff id
	// reconstructTo(diff) {}

	// Updates since the given time
	updatesSince(time) {
		return this.updatesBetween(time)
	}

	// Inclusive updates between time1 and time2, returned in the order required
	// to get from time1 to time2
	updatesBetween(time1, time2) {
		let updates = []
		let reverse = false

		if (this.diffs.length === 0 || this.diffs[0].length === 0) {
			return []
		}

		if (time1 && time2 && time1 > time2) {
			reverse = !reverse
			let t = time1
			time1 = time2
			time2 = t
		}

		for (let i in this.diffs) {
			for (let j in this.diffs[i].diff) {
				let diff = this.diffs[i].diff[j]
				if (!time1 || diff.time >= time1) {
					updates.push(diff)
				} else if (time2 && diff.time > time2) {
					return reverse ? updates.reverse() : updates
				}
			}
		}

		return reverse ? updates.reverse() : updates
	}

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
		if (!this.cache[type][key]) {
			options.new = true
		}
		this.cache[type][key] = value

		// May want to use replace op if it's appropriate.
		// Doing this first so it can set new appropriately.
		if (!options.nodiff) {
			this.addToDiff("add", diffPath(type, key), this.cache[type][key], options)
		}

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
			this.addToDiff("remove", diffPath(type, key), null, options)
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

	dirty() {
		let a = []
		for (let i = 0; i <= this.diff; ++i) {
			for (let diff in this.diffs[i].diff) {
				if (this.diffs[i].diff[diff].dirty) {
					a.push(this.diffs[i].diff[diff])
				}
			}
		}
		console.debug("Backend.dirty", a)
		return a
	}

	cb(name, arg) {
		if (this.callbacks[name]) {
			this.callbacks[name](arg)
		}
	}

	// Push updates to the server
	push() {
		// Need a method of making sure we're only sending these once...
		let dirty = this.dirty()
		let patch = []

		for (let i in dirty) {
			let op
			if (dirty[i].op != "add") {
				op = dirty[i].op
			} else {
				if (dirty[i].new) {
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
	 * (Set AddData diff option to false, and call newDiff()
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
		this.newDiff()
		for (let i in diff) {
			let ref = parsePath(diff[i].path)
			if (diff[i].op === "remove") {
				this.removeData(ref.type, ref.id, options)
			} else {
				this.addData(ref.type, diff[i].value, ref.id, options)
			}
		}
		this.newDiff()
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
