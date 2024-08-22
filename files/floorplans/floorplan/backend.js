import * as api from "/lib/api.js"

class BackendHistory {
	constructor() {
			// The current position in history (diffs)
			// -1 for before everything
			this.place = -1,

			// Metadata for diff groups
			this.groups = [],

			// Actual changes
			this.diffs = [],

			// Says the time at which the diffs were truncated
			// It's purpose is to tell the backend it can't just
			// update the server with the diffs.
			this.truncated = null
	}

	set diff(diff) {
		this.place = diff.id
		return diff
	}

	get diff() {
		return this.diffs[this.place]
	}

	get last() {
		return this.diffs.length - 1
	}

	get group() {
		if (!this.diff) {
			if (this.groups.length > 1) {
				throw new Error("Expected at most one group")
			}
			return this.groups[0]
		}
		return this.groups[this.diff.group]
	}

	groupLength(group) {
		if (group == undefined) {
			return 0
		}
		if (typeof group === "number") {
			group = this.groups[group]
		}

		if (group.first == undefined) {
			return 0;
		}
		if (group.last == undefined) {
			return this.diffs.length - 1 - group.first
		}
		return group.last - group.first
	}

	newGroup() {
		const pushGroup = function(history) {
			let group = {
				type: "group",
			}
			group.id = history.groups.push(group) - 1
			console.debug("Backend.History.newGroup", group.id)
			return group
		}

		if (this.groups.length === 0) {
			return pushGroup(this)
		}

		if (this.groupLength(this.group) === 0) {
			console.warn("Backend.History.newGroup",
				"Not creating new group: In an empty group")
			return null
		}

		if (this.group.last && this.group.last != this.diffs.at(-1).id) {
			throw new Error("I don't think this should happen")
		}
		this.group.last = this.diffs.at(-1).id
		return pushGroup(this)
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

		this.truncate()

		let group
		if (this.groups.length === 0) {
			group = this.newGroup()
		} else {
			group = this.groups.at(-1)
		}

		let diff = {
			type: "diff",
			group: group.id,
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
		if (group.first  == undefined) {
			group.first = diff.id
		}
		this.place = diff.id
		console.debug("History.Backend.addDiff", diff.id, diff)
		return diff.id
	}

	truncate() {
		if (!this.diff || this.diff.id === this.diffs.at(-1).id) {
			return
		}

		this.truncated = Date.now()

		console.debug("Backend.History.truncate", this.diff.id, "from", this.diffs.length - 1)
		this.diffs = this.between(-1, this.diff.id)
		this.groups = this.groups.slice(0, this.group.id + 1)
		if (this.group.last != undefined) {
			this.group.last = this.diff.id
		}
		this.newGroup()
	}

	// Get the required operations to go from a, a group or
	// diff, to b, another group or diff
	between(a, b) {
		const backend = this
		const getDiff = function(v) {
			if (typeof v === "number") {
				if (v < -1) {
					return -1
				}
				return v
			}
			if (typeof(v) === "object") {
				if (!v.id) {
					throw new Error("Doesn't have an id")
				}
				if (v.type === "diff") {
					return v.id
				} else if (v.type === "group") {
					return backend.groups[v.id].first
				}
				throw new Error("Not a valid type")
			}
			throw new Error(v + ": Invalid diff")
		}
		const getParams = function(from, to, max) {
			from = getDiff(from)
			to = getDiff(to)

			if (from > max || to > max) {
				throw new Error(from + ":" + to + ": Maximum range of " + max)
			}
			from += 1
			to += 1
			if (from === to) {
				return null
			}
			if (from > to) {
				return { reverse: true, from: to, to: from }
			}
			return { from: from, to: to }
		}

		/*
		 * So 'a' is already applied, and we want the state to look
		 * like what it did when 'b' was added, so if we're going
		 * forward, skip 'a', but if going backward include it.
		 */
		let params = getParams(a, b, this.diffs.length)
		if (!params) {
			return []
		}
		let diffs = this.diffs.slice(params.from, params.to)
		if (params.reverse) {
			diffs = this.reverseDiffs(diffs)
		}
		console.debug("Backend.History.between",
			params.reverse ? "reversed" : "forward", params.from, params.to, diffs)
		return diffs
	}

	reverseDiffs(diffs) {
		for (let i in diffs) {
			diffs[i] = this.reverseDiff(diffs[i])
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

	// Step to the end of the next group
	forward(diff) {
		console.debug("Backend.History.forward", diff)
		if (diff < 0) {
			if (this.groups[0].last == undefined) {
				return this.diffs.at(-1).id
			}
			return this.groups[0].last
		}

		diff = this.diffs[diff]
		if (!diff) {
			throw new Error("Diff does not exist")
		}

		if (diff.group === this.groups.at(-1).id) {
			return this.diffs.at(-1).id
		}
		let group = this.groups[diff.group + 1]
		if (group.last == undefined) {
			throw new Error("Last should be defined. Bug!")
		}
		return group.last
	}

	// Step to the beginning of the previous group
	backward(diff) {
		if (diff < 0) {
			throw new Error("Cannot go backward")
		}

		diff = this.diffs[diff]
		if (!diff) {
			throw new Error("Cannot go backward from nowhere! Bug!")
		}

		if (diff.group === 0) {
			return -1;
		}
		let group = this.groups[diff.group - 1]
		if (!group || group.last == undefined) {
			throw new Error("This should not happen")
		}
		return group.last
	}

	updateId(type, oldId, newId) {
		for (let i in this.diffs) {
			let diff = this.diffs[i]
			let r = parsePath(diff.path)
			console.debug(r, type, oldId)
			if (r.type === "pointmaps" && type === "points") {
				if (diff.value.a === oldId) {
					diff.value.a = newId
				} else if (diff.value.b === oldId) {
					diff.value.b = newId
				}
			} else if (r.type === type && r.id == oldId) {
				// NOTE: Above r.id is string, oldId is number
				console.debug("Backend.History.updateId", type, oldId, newId)
				diff.path = diffPath(r.type, newId)
			}
		}
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

		// Reverse lookup table for pointmaps
		this.mappedPoints = {
			/*
			 * pointA: {
			 * 	pointB: pointmap
			 * }
			 * (and pointB: { pointA: pointmap })
			 */
		}

		this.history = new BackendHistory()

		// Server's position in history
		this.serverPosition = -1

		// Time of last server update
		this.serverUpdated = null
	}

	get endpoint() {
		return "floorplans/" + this.floorplan.user + "/" + this.floorplan.name + "/data"
	}

	// Apply's diffs in order to get to the state at the beginning of the given diff id
	reconstructTo(diff) {
		let diffs = this.history.between(this.history.place, diff)
		this.applyDiff(diffs, { nodiff: true })
		this.history.place = diff
		console.debug("Backend.reconstructTo", "Reconstructed state to", diff)
		return diff
	}

	undo() {
		this.reconstructTo(this.history.backward(this.history.place))
	}

	redo() {
		this.reconstructTo(this.history.forward(this.history.place))
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

		if (type === "pointmaps") {
			this.updateMappedPoints(value.a, value.b, key)
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
			throw new Error("Expected " + type + "/" + key + " to exist")
		}

		if (type === "pointmaps") {
			this.updateMappedPoints(this.cache[type][key].a, this.cache[type][key].b, null)
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
		if (type != "wall" && type != "door") {
			throw new Error("Only walls and doors allowed in pointmap so far")
		}
		if (!this.cache.points[a] || !this.cache.points[b]) {
			throw new Error("Pointmap must reference existing points")
		}

		// NOTE: For now, a and b are numbers. May not always be the case
		return this.addData("pointmaps", {
			type: type,
			a: a,
			b: b
		}, this.whichPointMap(a, b), options)
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

	push() {
		// WARNING: This needs a lock
		let put = (this.history.truncated &&
		    (!this.lastUpdated || this.lastUpdated < this.history.truncated))

		this.lastUpdated = Date.now()

		if (put) {
			return this.putServer()
		}

		let dirty = this.history.between(this.serverPosition, this.history.last)
		if (dirty.length === 0) {
			console.log("Not updating server: already up to date")
			return Promise.resolve()
		}

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
				backend.serverPosition = dirty.at(-1).id
				updateIds(backend, data)
				for (let i in dirty) {
					delete dirty[i].dirty
				}
				backend.cb("push")
			})
	}

	putServer() {
		// WARNING: This needs a lock
		let backend = this

		return api.fetch("PUT", this.endpoint, this.cache)
			.then(function() {
				backend.serverPosition = backend.history.place
			})
	}

	/*
	 * Pull updates from the server.
	 * (Set AddData diff option to false, and call newGroup()
	 * once at the end.)
	 */
	pull() {
		// WARNING: This probably needs a lock

		// Since we set serverPosition below
		if (this.history.place != this.serverPosition) {
			throw new Error("Push updates first")
		}

		let backend = this
		return api.fetch("GET", this.endpoint)
			.then(function(data) {
				let diff = gendiff("", backend.cache, data)
				console.debug("Backend.Pull (diff)", diff)
				backend.applyDiff(diff, { clean: true })
				backend.cb("pull")
				backend.serverPosition = backend.history.place
			})
	}

	applyDiff(diff, options) {
		options = options ?? {}
		if (!options.nodiff) {
			this.history.newGroup()
		}
		for (let i in diff) {
			let ref = parsePath(diff[i].path)
			if (diff[i].op === "remove") {
				this.removeData(ref.type, ref.id, options)
			} else {
				this.addData(ref.type, diff[i].value, ref.id, options)
			}
		}
		if (!options.nodiff) {
			this.history.newGroup()
		}
	}

	updateMappedPoints(a, b, pointmap) {
		const update = function(backend, a, b, pointmap) {
			if (!backend.mappedPoints[a]) {
				backend.mappedPoints[a] = {}
			}
			if (pointmap == null) {
				delete backend.mappedPoints[a][b]
				let id
				for (id in backend.mappedPoints[a]) {
					break
				}
				if (id == null) {
					delete backend.mappedPoints[a]
				}
			} else {
				backend.mappedPoints[a][b] = pointmap
			}
		}
		update(this, a, b, pointmap)
		update(this, b, a, pointmap)
		console.debug("Backend.updateMappedPoints", `Set ${a}+${b} to ${pointmap}`)
		console.debug("Backend.updateMappedPoints", this.mappedPoints)
	}

	whichPointMap(a, b) {
		if (!this.mappedPoints[a]) {
			return undefined
		}
		return this.mappedPoints[a][b]
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
			if (x.old_id == undefined) {
				continue
			}

			backend.history.updateId(type, x.old_id, id)
			console.debug("Backend.updateIds", `ID ${x.old_id} > ${id}`)
			if (backend.cache[type][id]) {
				// NOTE: I don't think this can actually happen
				throw new Error("ERROR: Pull id conflict")
			}

			backend.cache[type][id] = backend.cache[type][x.old_id]
			// Both old and new exist at the moment, hense;
			backend.cb("updateId", { type: type, old: x.old_id, new: id })
			delete backend.cache[type][x.old_id]

			if (type === "points") {
				for (let i in backend.cache.pointmaps) {
					if (backend.cache.pointmaps[i].a === x.old_id) {
					console.debug(`Updated pointmap ${i} from ${x.old_id} to ${id}`)
					backend.cache.pointmaps[i].a = id
					} else if (backend.cache.pointmaps[i].b === x.old_id) {
						backend.cache.pointmaps[i].b = id
						console.debug(`Updated pointmap ${i} from ${x.old_id} to ${id}`)
					}
				}
				if (backend.mappedPoints[x.old_id]) {
					backend.mappedPoints[id] = backend.mappedPoints[x.old_id]
					delete backend.mappedPoints[x.old_id]
					for (let a in backend.mappedPoints) {
						if (backend.mappedPoints[a][x.old_id]) {
							backend.updateMappedPoints(a, id, backend.mappedPoints[a][x.old_id])
							backend.updateMappedPoints(a, x.old_id, null)
						}
					}
				}
			} else if (type === "pointmaps") {
				// WARNING: This requires that pointmap a and b do not get
				// modified, which I believe will hold true throughout the life
				// cycle of the program. I'll probably forget and mess up but
				// hopefully this provides some assistance.
				backend.updateMappedPoints(x.a, x.b, id)
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
