export class FloorplanBackend {
	constructor() {
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
		 * }
		 */
		this.diffs = []

		// The cache's state in relation to the diffs
		this.diff = null
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
		return this.diff
	}

	// Add to current diff
	addToDiff(op, path, value, dirty) {
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
		if (dirty) {
			diff.dirty = true
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
		let reverse = true

		if (this.diffs.length === 0 || this.diffs[0].length === 0) {
			return []
		}

		if (!time1) {
			time1 = this.diffs[0].diff[0].time
		}
		if (!time2) {
			// Could use Date.now() I suppose
			time2 = this.diffs.at(-1).diff.at(-1).time
		}

		if (time1 > time2) {
			reverse = !reverse
			let t = time1
			time1 = time2
			time2 = t
		}

		for (let i in this.diffs) {
			for (let j in this.diffs[i].diff) {
				let diff = this.diffs[i].diff[j]
				if (diff.time >= time1) {
					updates.push(diff)
				} else if (diff.time > time2) {
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
			options = { diff: true, clean: false }
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
		this.cache[type][key] = value

		// May want to use replace op if it's appropriate.
		if (options.diff) {
			this.addToDiff("add", diffPath(type, key), this.cache[type][key], !options.clean)
		}
		return key
	}

	removeData(type, key, options) {
		if (!options) {
			options = { diff: true, clean: false }
		}

		console.debug("Backend.removeData", type, key)
		if (!this.cache[type][key]) {
			throw new Error("Expected " + key + " to exist")
		}
		if (options.diff) {
			this.addToDiff("remove", diffPath(type, key), null, !options.clean)
		}
		delete this.cache[type][key]
	}

	addPoint(point, options) {
		if (typeof point.x !== "number" || typeof point.y !== "number") {
			console.error("Backend.addPoint", point)
			throw new Error("Point must have x and y be numbers")
		}
		// I suppose point could have other keys, that's okay though
		return this.addData("points", point, options)
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
			throw new Error(id + " for " + type + "doesn't exist")
		}
		return obj
	}

	byId(type, id) {
		if (!this.cache[type]) {
			throw new Error(type + ": Invalid type")
		}
		return this.cache[type][id]
	}

	// Push updates to the server
	//push() {}

	/*
	 * Pull updates from the server.
	 * (Set AddData diff option to false, and call newDiff()
	 * once at the end.)
	 */
	//pull() {}
}

function diffPath(type, id) {
	return type + "/" + id
}

function uniqueKey(obj, prefix) {
	let key
	do {
		key = (prefix ? prefix : "") + Math.random().toString().split(".").join("")
	} while (obj[key])

	// Wonder if there's an atomic way of testing whether a key is undefined and doing this?
	// Doesn't matter much for my purposes probably.
	obj[key] = true
	return key
}
