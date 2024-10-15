import * as api from "/lib/api.js"

// Sequence numbers for uniqueKey
let sequences = {}

const objectPaths = {
	pnt: "points",
	pntmap:  "pointmaps",
	fur: "furniture",
	furmap: "furniture_maps"
}

const objectTypes = {
	points: "pnt",
	pointmaps: "pntmap",
	furniture: "fur",
	furniture_maps: "furmap"
}

class BackendHistory {
	constructor() {
			// The current position in history (diffs)
			// -1 for before everything
			this.place = -1,

			// Points in this.diffs which represent
			// a completed action, etc. (Previously
			// called groups.)
			//   The diff marked is the final in the
			// "group"
			this.marks = [],

			// Actual changes
			this.diffs = [],

			// Says the time at which the diffs were truncated
			// It's purpose is to tell the backend it can't just
			// update the server with the diffs.
			this.truncated = null
	}

	set place(v) {
		console.debug("Backend.History.place", "set", v)
		this._place = v
	}

	get place() {
		return this._place
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

	mark() {
		if (this.marks.at(-1) === this.place) {
			console.warn("Backend.History.mark", this.place, "Diff already marked")
			return null
		}
		let mark = this.marks.push(this.place) - 1
		console.debug("Backend.History.mark", mark, this.place)
		return mark
	}

	addDiff(op, path, value, options) {
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

		if (this.place != this.last) {
			this.truncate()
		}

		/*
		 * TODO: Keep a table of the last diffs for various paths
		 * to speed this up
		 */
		let oldDiff
		for (let i = this.place; !oldDiff && i >= 0; --i) {
			if (this.diffs[i].path === path) {
				if (this.diffs[i].op === "remove") {
					throw new Error("Cannot reuse old ID")
				}
				oldDiff = i
			}
		}

		let m = this.diffMark()
		if (op === "add" && oldDiff != undefined && this.marks[m] != this.place &&
		    this.diffMark(oldDiff) === m) {
			let d = this.diffs[oldDiff]
			d.value = value
			d.time = Date.now()
			this.truncated = Date.now()
			console.debug("Backend.History.addDiff", "replacing", d.id)
			return d
		}

		let oldValue = oldDiff ? this.diffs[oldDiff].value : undefined
		if (op === "add") {
			op = oldValue ? "replace" : "new"
		} else {
			if (oldValue == null) {
				throw new Error("Remove requires oldValue")
			}
		}

		let diff = {
			type: "diff",
			op: op,
			path: path,
			time: Date.now()
		}

		if (value) {
			diff.value = structuredClone(value)
		}

		if (oldValue) {
			diff.oldValue = structuredClone(oldValue)
		}

		if (!options.clean) {
			diff.dirty = true
		}

		diff.id = this.diffs.push(diff) - 1
		this.place = diff.id
		console.debug("Backend.History.addDiff", diff.id, diff)
		return diff
	}

	diffMark(diff) {
		const r = function(mark) {
			console.debug("Backend.History.diffMark", { diff, mark })
			return mark
		}

		diff = diff ?? this.place
		if (!this.marks[0] || diff < this.marks[0]) {
			return r(-1)
		}

		// Use efficient algorithm
		for (let i = 0; i < this.marks.length; ++i) {
			if (diff <= this.marks[i]) {
				return r(i)
			}
		}

		return r(this.marks.length - 1)
	}

	truncate() {
		if (this.place >= this.last) {
			if (this.place > this.last) {
				throw new Error("There is a bug in history")
			}
			return
		}

		let mark = this.diffMark(this.place)
		console.log("Backend.History.truncate", { diff: this.place, mark })
		this.diffs = this.between(-1, this.place)
		this.marks = this.marks.slice(0, mark + 1)
		this.mark()
		this.truncated = Date.now()
	}

	betweenMarks(a, b) {
		return between(this.marks[a], this.marks[b])
	}

	// Get the required operations to go from diff a to diff b
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
				if (!v.type || v.type !== "diff") {
					throw new Error(v + ": Expected 'diff' value for type field")
				}
				return v.id
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

		if (diff.op === "new") {
			diff.op = "remove"
			diff.oldValue = diff.value
			delete diff.value
		} else if (diff.op === "replace") {
			let t = diff.value
			diff.value = diff.oldValue
			diff.oldValue = t
		} else if (diff.op === "remove") {
			if (!diff.oldValue) {
				throw new Error("There should be an old value")
			}
			diff.op = "new"
			diff.value = diff.oldValue
			delete diff.oldValue
		} else {
			throw new Error(diff.op + ": Unsupported operation")
		}

		return diff
	}

	dirty() {
		return this.diffs.filter(item => item.dirty)
	}

	// Step to the end of the next group
	forward(diff) {
		let cur = this.diffMark(diff)
		let to = cur + 1
		console.debug("Backend.History.forward", diff, `from ${cur} to ${to}`)
		if (this.marks[to] == undefined || this.marks[to] == this.last) {
			console.warn("Cannot go forward; at the end")
			return this.last
		}
		if (to == this.marks.length - 1) {
			return this.last
		}
		return this.marks[to]
	}

	// Step to the beginning of the previous group
	backward(diff) {
		let cur = this.diffMark(diff)
		let to = cur - 1
		console.debug("Backend.History.backward", diff, `from ${cur} to ${to}`)
		if (to < 0) {
			if (cur < 0) {
				console.warn("Cannot go backward; already at beginning")
			}
			return -1
		}
		return this.marks[to]
	}
}

export class FloorplanBackend {
	constructor(floorplan, options) {
		let backend = this
		if (!options) {
			options = {}
		}

		if (floorplan && (!floorplan.user || !floorplan.id)) {
			throw new Error("Invalid floorplan given")
		}
		this.floorplan = floorplan

		if (options.callbacks) {
			this.callbacks = options.callbacks
		}

		this.params = {}
		this.initialized = api.fetch("GET", "pointmaps")
			.then(function(resp) {
				backend.params.pointmaps = resp
			})
		this.initialized = Promise.all([this.initialized,
			api.fetch("GET", "furniture")
				.then(function(furniture) {
					backend.params.furniture = furniture
				})
			])

		// Cache for server (both from and to)
		this.cache = {
			// { pointId: { x: Number, y: Number } }
			points: {},

			/*
			 * { pointMapId: { type: mapType, from: pointId, to: pointId } }
			 */
			pointmaps: {},

			/*
			 * Furniture definitions:
			 * { id: { type: furnitureType, name: name, width: width, depth: depth } }
			 */
			furniture: {},

			/*
			 * Furniture map definitions:
			 * { id: { furniture_id*: id, layout: layout, x: x, y: y, angle: angle } }
			 *
			 * [*] references if from furniture/defs
			 */
			furniture_maps: {}
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

		// A map of server idPaths pointing to localIDs
		this.localIDs = {}

		// A map of local ids pointing to server ids
		this.serverIDs = {}
	}

	get endpoint() {
		if (!this.floorplan) {
			throw new Error("Cannot access API: No floorplan (in demo mode)")
		}
		return `floorplans/${this.floorplan.user}/${this.floorplan.id}/data`
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
		this.reconstructTo(this.history.backward())
	}

	redo() {
		this.reconstructTo(this.history.forward())
	}

	/*
	 * Add some type of data within the cache.
	 * If key is not given, a random one will be generated.
	 * If clean is not given, it is marked dirty
	 * (thus data from the server, with a known key, can be marked clean)
	 */
	addData(idOrType, value, options) {
		options = options ?? {}

		let id
		try {
			id = idString(parseID(idOrType))
		}
		catch {
			id = this.newID(objectTypes[idOrType])
		}

		if (idType(id) === "pntmap") {
			this.updateMappedPoints(value.a, value.b, id)
		}

		console.debug("Backend.addData", id, value)
		let t = idTable(id)
		if (!options.nodiff) {
			this.cb("patch",  this.history.addDiff("add", idPath(id), value, options))
		}
		this.cache[t][id] = value

		return id
	}

	removeData(id, options) {
		options = options ?? {}

		console.debug("Backend.removeData", id)
		let t = idTable(id)
		if (!this.cache[t][id]) {
			throw new Error("Expected " + id + " to exist")
		}

		if (idType(id) === "pntmap") {
			this.updateMappedPoints(this.cache[t][id].a, this.cache[t][id].b, null)
		}

		if (!options.nodiff) {
			this.cb("patch", this.history.addDiff("remove", idPath(id), null, options))
		}
		delete this.cache[t][id]
	}

	addPoint(params, id) {
		const p = this.updatedObject(params, id, {
			x: {
				required: true,
				parse: parseInt
			},
			y: {
				required: true,
				parse: parseInt
			}
		})
		return this.addData(id ?? "points", p)
	}

	removePoint(id, options) {
		options = options ?? {}

		if (!this.mappedPoints[id]) {
			return this.removeData(id, options)
		}

		if (!options.unmap && !options.recurse) {
			throw new Error("Point is mapped")
		}

		for (let other in this.mappedPoints[id]) {
			this.unmapPoints(this.mappedPoints[id][other])
		}

		this.removeData(id, options)

		if (options.recurse) {
			this.removeOrphans()
		}
	}

	mapPoints(params, id) {
		const backend = this
		const validPoint = function(id) {
			return idType(id) === "pnt" && backend.obj(id)
		}
		const m = this.updatedObject(params, id, {
			type: {
				required: true,
				validate: function(type) {
					let types = backend.params.pointmaps.types
					for (let i = 0; i < types.length; ++i) {
						if (type === types[i]) {
							return true
						}
					}
					return false
				}
			},
			a: {
				required: true,
				validate: validPoint
			},
			b: {
				required: true,
				validate: validPoint
			},
			door_swing: {
				validate: function(swing) {
					switch (swing) {
					case "a+": case "a-": case "b+": case "b-":
						return true
					default:
						return false
					}
				}
			}
		})
		if (m.a === m.b) {
			throw new Error(`${m.a}:${m.b}: Cannot map a point to itself`)
		}
		this.addData(this.whichPointMap(m.a, m.b) ?? "pointmaps", m)
	}

	unmapPoints(id, options) {
		options = options ?? {}
		this.removeData(id, options)
		if (options.recurse) {
			this.removeOrphans()
		}
	}

	addFurniture(params, id) {
		const f = this.updatedObject(params, id, {
			width: {
				required: true,
				parse: parseSize
			},
			depth: {
				required: true,
				parse: parseSize
			},
			type: {
				required: true,
				type: "string"
			},
			name: {
				type: "string"
			},
			// Could do with verifying this
			style: {
				type: "string"
			}
		})

		return this.addData(id ?? "furniture", f)
	}

	removeFurniture(id, options) {
		for (let map in this.cache.furniture_maps) {
			if (map.furniture === id) {
				this.unmapFurniture(map)
			}
		}
		this.removeData(id, options)
	}

	mapFurniture(params, id) {
		let backend = this

		let fm = this.updatedObject(params, id, {
			x: {
				required: true,
				parse: parseInt
			},
			y: {
				required: true,
				parse: parseInt
			},
			angle: {
				required: true,
				default: 0,
				parse: function(input) {
					let angle = parseInt(input)
					if (angle < 0 || angle >= 360) {
						throw new Error(angle + ": Angle must be between 0 and 359 degrees")
					}
					return angle
				}
			},
			layout: {
				required: true,
				default: "1",
				validate: function(input) {
					return typeof input === "string"
				}
			},
			furniture_id: {
				required: true,
				validate: function(id) {
					return idType(id) === "fur" && backend.obj(id)
				}
			}
		})

		return this.addData(id ?? "furniture_maps", fm)
	}

	unmapFurniture(id, options) {
		this.removeData(id, options)
	}

	addMappedFurniture(params, id) {
		params.furniture_id = this.addFurniture(params, id ? this.reqObj(id).furniture_id : null)
		return this.mapFurniture(params, id)
	}

	updatedObject(params, id, vd) {
		let obj = id ? structuredClone(this.reqObj(id)) : {}

		params = structuredClone(params)
		for (let k in vd) {
			let vdk = vd[k]
			if (params[k] === undefined) {
				if (obj[k] !== undefined || vdk.default == undefined) {
					continue
				}
				params[k] = vdk.default
					
			}
			if (params[k] === null) {
				if (vdk.required) {
					throw new Error(`Cannot delete required parameter ("${k}")`)
				}
				delete obj[k]
				continue
			}
			if (typeof vdk.type === "string") {
				if (typeof params[k] !== vdk.type) {
					throw new Error(`Invalid value for "${k}" parameter (type was ${typeof params[k]} when expecting ${vdk.type}`)
				}
				obj[k] = params[k]
			}
			if (typeof vdk.parse === "function") {
				obj[k] = vdk.parse(params[k])
			} else if (typeof vdk.validate === "function") {
				if (!vdk.validate(params[k])) {
					throw new Error(`Invalid value for "${k}" parameter ("${params[k]}")`)
				}
				obj[k] = params[k]
			} else if (typeof vdk.type !== "string") {
				throw new Error(`"${k}" parameter missing type constraint, or validate or parse function`)
			}
		}

		for (let k in vd) {
			if (vd[k].required && obj[k] === undefined) {
				console.warn(params, obj)
				throw new Error(`Cannot omit required parameter ("${k}")`)
			}
		}

		return obj
	}

	reqObj(id) {
		let obj = this.obj(id)
		if (obj == null) {
			throw new Error(id + " doesn't exist")
		}
		return obj
	}

	obj(id) {
		return this.cache[idTable(id)][id]
	}

	cb(name, arg) {
		if (this.callbacks[name]) {
			console.debug("Backend.cb", name, arg)
			this.callbacks[name](arg)
		}
	}

	push() {
		if (!this.floorplan) {
			return Promise.resolve()
		}
		// WARNING: This needs a lock

		let put = (this.history.truncated &&
		    (!this.lastUpdated || this.lastUpdated < this.history.truncated))

		this.lastUpdated = Date.now()

		if (put) {
			return this.putServer()
		}

		let newpos = this.history.place
		let dirty = this.history.between(this.serverPosition, newpos)
		if (dirty.length === 0) {
			console.log("Not updating server: already up to date")
			return Promise.resolve()
		}

		let patch = []
		for (let i in dirty) {
			let op = dirty[i].op
			let id = parsePath(dirty[i].path)
			let value = dirty[i].value ? this.remapIDsValue(dirty[i].value, this.serverIDs) : null
			if (op === "new" || this.serverIDs[id] == null) {
				patch.push({ op: op, path: dirty[i].path, value: value })
			} else {
				patch.push({ op: op, path: idPath(this.serverIDs[id]), value })
			}
		}

		console.debug("Backend.push (patch)", patch)

		let backend = this
		return api.fetch("PATCH", this.endpoint, patch)
			.then(function(data) {
				backend.serverPosition = newpos
				updateIDs(backend, data)
				for (let i in dirty) {
					delete dirty[i].dirty
				}
				backend.cb("push")
			})
			.catch(function(err) {
				console.error("Unable to PATCH floorplan, trying PUT", err)
				backend.putServer()
			})
	}

	putServer() {
		if (!this.floorplan) {
			return Promise.resolve()
		}

		// WARNING: This needs a lock
		let backend = this

		return api.fetch("PUT", this.endpoint, this.cache)
			.then(function(data) {
				updateIDs(backend, data)
				backend.serverPosition = backend.history.place
			})
	}

	/*
	 * Pull updates from the server.
	 * (Set AddData diff option to false, and call mark()
	 * once at the end.)
	 */
	pull() {
		if (!this.floorplan) {
			return Promise.resolve()
		}

		// WARNING: This probably needs a lock

		// Since we set serverPosition below
		if (this.history.place != this.serverPosition) {
			throw new Error("Push updates first")
		}

		let backend = this
		return api.fetch("GET", this.endpoint)
			.then(function(data) {
				data = backend.toLocalIDs(data)
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
			this.history.mark()
		}
		for (let i in diff) {
			let id = parsePath(diff[i].path)
			if (diff[i].op === "remove") {
				this.removeData(id, options)
			} else {
				this.addData(id, diff[i].value, options)
			}
			this.cb("patch", diff[i])
		}
		if (!options.nodiff) {
			this.history.mark()
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

	toLocalIDs(data) {
		return this.remapIDs(data, this.localIDs, { createLocal: true })
	}

	toServerIDs(data) {
		return this.remapIDs(data, this.serverIDs)
	}

	remapIDs(data, idMap) {
		let newdata = {}
		for (let t in data) {
			newdata[t] = {}
			for (let id in data[t]) {
				let nid = idMap[id]
				if (nid == null) {
					if (idMap == this.localIDs) {
						nid = this.newID(objectTypes[t], id)
					} else {
						// For my purposes this will be fine.
						console.warn("backend.remapIDs", "Not remapping; cannot create server ID")
						nid = id
					}
				}
				newdata[t][nid] = this.remapIDsValue(data[t][id], idMap)
			}
		}
		return newdata
	}

	remapIDsValue(value, newids) {
		value = structuredClone(value)
		let keys = ['a', 'b', 'furniture_id']

		for (let i in keys) {
			let id = value[keys[i]]
			if (id == null) {
				continue
			}
			if (newids[id] == null) {
				if (newids != this.localIDs) {
					continue
				}
				let map = this.newID(idType(value[keys[i]]), id)
			}
			value[keys[i]] = newids[id]
		}
		return value
	}

	whichPointMap(a, b) {
		if (!this.mappedPoints[a]) {
			return undefined
		}
		return this.mappedPoints[a][b]
	}

	removeOrphans() {
		let origin = this.originPoint()
		if (origin == undefined) {
			return
		}

		let connected = this.connected(origin)
		let again = false
		for (let id in this.cache.points) {
			if (!connected[id]) {
				this.removePoint(id, { unmap: true })
				again = true
			}
		}
		if (again) {
			this.removeOrphans()
		}
	}

	originPoint() {
		for (let i in this.history.diffs) {
			let id = parsePath(this.history.diffs[i].path)
			if (idType(id) === "pnt" && this.cache.points[id] != undefined) {
				return id
			}
		}

		return undefined
	}

	connected(p, map) {
		if (!map) {
			map = {}
		}
		map[p] = true
		for (let other in this.mappedPoints[p]) {
			if (!map[other]) {
				this.connected(other, map)
			}
		}
		return map
	}

	newID(type, serverID) {
		let local = uniqueKey(type + "_", this.serverIDs)
		console.debug("Backend.newID", local)
		if (serverID != null) {
			this.mapID(local, serverID)
		}
		return local
	}

	mapID(localID, serverID, options) {
		options = options ?? {}

		console.debug("Backend.mapID", localID, serverID)
		if (localID == null || serverID == null) {
			throw new Error("Requires local and server ID")
		}
		if (!options.remap) {
			if (this.serverIDs[localID] != undefined) {
				throw new Error("That local ID is already mapped to " + this.serverIDs[localID])
			}
			if (this.localIDs[serverID] != undefined) {
				throw new Error("That server ID is already mapped to " + this.localIDs[serverID])
			}
		}
		this.localIDs[serverID] = localID
		this.serverIDs[localID] = serverID
	}

	remapID(localID, serverID, options) {
		options = options ?? {}
		options.remap = true
		return this.mapID(localID, serverID, options)
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

function updateIDs(backend, newdata) {
	for (let t in newdata) {
		for (let srvID in newdata[t]) {
			let x = newdata[t][srvID]
			if (x.old_id != null) {
				backend.remapID(x.old_id, srvID)
			} else {
				backend.remapID(srvID, srvID)
			}
		}
	}
}

function uniqueKey(prefix, obj) {
	if (sequences[prefix] == undefined) {
		sequences[prefix] = 0
	}

	let key
	do {
		key = prefix + sequences[prefix]++
	} while (obj[key] !== undefined)

	// Wonder if there's an atomic way of testing whether a key is undefined and doing this?
	// Doesn't matter much for my purposes probably.
	obj[key] = null
	return key
}

export function parseID(s) {
	let a = s.split("_")
	if (a.length != 2) {
		throw new Error(s + ": Invalid ID")
	}
	return makeID(a[0], a[1])
}

function makeID(type, seq) {
	if (!type || !seq || objectPaths[type] == null || isNaN(seq = Number(seq))) {
		throw new Error(s + ": Invalid ID")
	}
	return { type, seq }
}

export function idString(id) {
	if (id.type == null || id.seq == null) {
		throw new Error("Invalid ID")
	}
	return id.type + "_" + id.seq
}

export function idType(id) {
	return parseID(id).type
}

export function idTable(id) {
	return objectPaths[idType(id)]
}

export function idPath(id) {
	let table = idTable(id)
	if (table == null) {
		throw new Error("Invalid ID type")
	}
	return `/${table}/${id}`
}

export function parsePath(path) {
	let a = path.split("/")
	if (a.length != 3) {
		throw new Error(path + ": Invalid path")
	}
	if (objectTypes[a[1]] == null) {
		throw new Error(path + ": Invalid path")
	}
	let id = parseID(a[2])
	if (id.type != objectTypes[a[1]]) {
		throw new Error(path + ": Invalid path for type")
	}
	return idString(id)
}

function parseSize(size) {
	let n = parseInt(size)
	if (n <= 0) {
		throw new Error("Size must be greater than 0")
	}
	return n
}

function parseInt(pos) {
	let n = Math.round(pos)
	if (isNaN(n)) {
		throw new Error("Invalid integer (NaN)")
	}
	return n
}
