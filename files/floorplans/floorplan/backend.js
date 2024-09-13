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
			console.warn("Backend.History.mark", "Diff already marked")
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

		let oldValue
		for (let i = this.place; !oldValue && i >= 0; --i) {
			if (this.diffs[i].path === path) {
				if (this.diffs[i].op === "remove") {
					throw new Error("Cannot reuse old ID")
				}
				oldValue = this.diffs[i].value
			}
		}

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
		return diff.id
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
			pointmaps: {},

			// There will be here more later, such as furnature

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
			this.history.addDiff("add", idPath(id), value, options)
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
			this.history.addDiff("remove", idPath(id), null, options)
		}
		delete this.cache[t][id]
	}

	addPoint(point, options) {
		options = options ?? {}

		if (typeof point.x !== "number" || typeof point.y !== "number") {
			throw new Error(`Point's x (${point.x}) and y (${point.y}) are not numbers`)
		}
		return this.addData(options.replace ?? "points",
			{ x: Math.round(point.x), y: Math.round(point.y) }, options)
	}

	replacePoint(id, newpoint, options) {
		options = options ?? {}
		options.replace = id
		return this.addPoint(newpoint, options)
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

	// Returns map id
	mapPoints(type, a, b, options) {
		if (type != "wall" && type != "door") {
			throw new Error("Only walls and doors allowed in pointmap so far")
		}
		if (!this.cache.points[a] || !this.cache.points[b]) {
			throw new Error(`${a}, ${b}: Pointmap must reference existing points`)
		}

		return this.addData(this.whichPointMap(a, b) ?? "pointmaps", {
			type: type,
			a: a,
			b: b
		}, options)
	}

	unmapPoints(id, options) {
		options = options ?? {}
		this.removeData(id, options)
		if (options.recurse) {
			this.removeOrphans()
		}
	}

	addFurniture(params, id) {
		params = params ?? {}

		let f = id ? this.reqObj(id) : {}

		if (params.width != undefined) {
			f.width = Math.round(params.width)
			if (f.width <= 0) {
				throw new Error(params.width + ": rounded width must be greater than zero")
			}
		}
		if (params.depth != undefined) {
			f.depth = Math.round(params.depth)
			if (f.depth <= 0) {
				throw new Error(params.depth + ": rounded depth must be greater than zero")
			}
		}
		if (params.name != undefined) {
			if (typeof params.name !== "string") {
				throw new Error(params.name + ": Expected string name")
			}
			f.name = params.name
		}
		if (params.type != undefined) {
			if (typeof params.type !== "string") {
				throw new Error("Invalid type")
			}
			f.type = params.type
		}

		if (f.width == null || f.depth == null || f.type == null) {
			throw new Error("Missing required parameters")
		}
		return this.addData(id ?? "furniture", f)
	}

	removeFurniture(id, options) {
		for (let map in this.cache.furniture_maps) {
			this.unmapFurniture(map)
		}
		this.removeData(id, options)
	}

	mapFurniture(params, id) {
		let backend = this
		const validInt = function(input, cur) {
			let x = Math.round(input ?? cur)
			if (isNaN(x)) {
				throw new Error(input + " is NaN")
			}
			return x
		}
		let parsers = {
			x: validInt,
			y: validInt,
			angle: function(input, cur) {
				if (input == undefined) {
					return cur ?? 0
				}
				let x = validInt(input)
				if (x < 0 || x >= 360) {
					throw new Error(input + ": Angle must be between 0 and 359 degrees")
				}
				return x
			},
			layout: function(input, cur) {
				if (input == undefined) {
					return cur ?? "1"
				}
				if (typeof input !== "string") {
					throw new Error(input + ": Layout should be a string")
				}
				return input
			},
			furniture_id: function(id, cur) {
				if (id == undefined) {
					if (cur == null) {
						throw new Error("Missing furniture id")
					}
					return cur
				}
				if (backend.obj(id) == undefined) {
					throw new Error("invalid furniture id for furniture map")
				}
				return id
			}
		}

		let fm = id ? this.reqObj(id) : {}
		for (let param in parsers) {
			fm[param] = parsers[param](params[param], fm ? fm[param] : undefined)
		}

		return this.addData(id ?? "furniture_maps", fm)
	}

	unmapFurniture(id, options) {
		this.removeData(id, options)
	}

	addMappedFurniture(params, id) {
		params.furniture_id = this.addFurniture(params, id ? this.reqObj(id).furniture_id : null)
		return this.mapFurniture(params, id)
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
				backend.serverPosition = dirty.at(-1).id
				updateIDs(backend, data)
				for (let i in dirty) {
					delete dirty[i].dirty
				}
				backend.cb("push")
			})
	}

	putServer() {
		// WARNING: This needs a lock
		let backend = this

		return api.fetch("PUT", this.endpoint, this.toServerIDs(this.cache))
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
					if (idMap != this.localIDs) {
						throw new Error("Cannot create server ID")
					}
					nid = this.newID(objectTypes[t], id)
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

	mapID(localID, serverID) {
		console.debug("Backend.mapID", localID, serverID)
		if (localID == null || serverID == null) {
			throw new Error("Requires local and server ID")
		}
		if (this.serverIDs[localID] === undefined) {
			throw new Error("That local ID is already mapped to " + this.serverIDs[localID])
		}
		if (this.localIDs[serverID] !== undefined) {
			throw new Error("That server ID is already mapped to " + this.localIDs[serverID])
		}
		this.localIDs[serverID] = localID
		this.serverIDs[localID] = serverID
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
				backend.localIDs[srvID] = x.old_id
				backend.serverIDs[x.old_id] = srvID
			} else {
				backend.localIDs[srvID] = srvID
				backend.serverIDs[srvID] = srvID
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
