import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import { Vector2 } from "/lib/github.com/mrdoob/three.js/math/Vector2.js"

SVG.extend(SVG.Point, {
	vec: function() {
		return new Vector2(this.x, this.y)
	}
})

SVG.extend(SVG.Circle, {
	vec: function() {
		return new Vector2(this.cx(), this.cy())
	}
})

SVG.extend(SVG.Shape, {
	vec: function() {
		return new Vector2(this.x(), this.y())
	},

	distanceTo: function(x, y) {
		return this.bbox().distanceTo(x, y)
	},

	touching: function(x, y, minsize) {
		let b = this.bbox()
		if (b.width < minsize) {
			b.x -= (minsize - b.width) / 2
			b.width = minsize
		}
		if (b.height < minsize) {
			b.y -= (minsize - b.height) / 2
			b.height = minsize
		}
		return x >= b.x && x <= b.x + b.width &&
			y >= b.y && y <= b.y + b.height
	}
})

SVG.extend(SVG.Line, {
	vecs: function() {
		let a = this.array()
		let vecs = []
		for (let i in a) {
			vecs.push(new Vector2(a[i][0], a[i][1]))
		}
		return vecs
	},

	// See https://math.stackexchange.com/questions/274712/calculate-on-which-side-of-a-straight-line-is-a-given-po
	vecs_top_first: function() {
		let v = this.vecs()
		return v[1].y > v[0].y ? v : [v[1], v[0]];
	},

	point_offset: function(point) {
		const cross = function(a, b, o) {
			return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
		}
		const t = this.vecs_top_first()
  		return cross(point, t[1], t[0])
	},

	/*
	 * Most of this copied from the svg.js math library,
	 * but I didn't particularly like the look of the
	 * library itself so I wrote equivilents here.
	 */
	segmentLengthSquared: function() {
		let vecs = this.vecs()
		return vecs[0].distanceToSquared(vecs[1])
	},

	closestLinearInterpolation: function(p) {
		let vecs = this.vecs()
		let d = vecs[1].clone().sub(vecs[0])
		let x = p.clone().sub(vecs[0]).multiply(d)
		return (x.x + x.y) / this.segmentLengthSquared()
	},

	interpolatedPoint: function(t) {
		let vecs = this.vecs()
		return vecs[0].lerp(vecs[1], t)
	},

	closestPoint: function(p) {
		return this.interpolatedPoint(
			Math.min(1, Math.max(0, this.closestLinearInterpolation(p)))
		)
	},

	intersection: function(line2) {
		let d = this.a * line2.b - line2.a * this.b;

		return {
			parallel: (d === 0),
			x: (line2.b * this.c - this.b * line2.c) / d,
			y: (this.a * line2.c - line2.a * this.c) / d
		}
	},

	whereIsPoint: function(x, y, width) {
		let p = new Vector2(x, y)
		if (width == null) {
			width = this.attr("stroke-width") ?? 1
		}
		let closest = this.closestPoint(p)

		/*
		 * Note that this doesn't work very accurately for
		 * lines that aren't at 90 degree angles. Check out
		 * Harry Stevens's geometric library with the lineOnPoint
		 * function and the epsilon number
		 */
		let h = width / 2
		if (p.x > closest.x - h && p.x < closest.x + h &&
		    p.y > closest.y - h && p.y < closest.y + h) {
			return closest
		}
		return null
	},

	// This must use x and y to be compatible with Shape's inside()
	inside: function(x, y) {
		return this.whereIsPoint(x, y) != null
	},

	touching: function(x, y, width) {
		return this.whereIsPoint(x, y, width) != null
	},

	closestEdge: function(x, y) {
		let p = new Vector2(x, y)
		let w = this.attr("stroke-width") ?? 1
		let c = this.closestPoint(p)

		let b = new SVG.Box(c.x - w / 2, c.y - w / 2, w, w)
		return b.closestEdge(p.x, p.y)
	},

	distanceTo: function(x, y) {
		return this.closestEdge(x, y).distanceTo(new Vector2(x, y))
	}
})

SVG.extend(SVG.Box, {
	closestEdge: function(x, y) {
		let ex
		if (x < this.x) {
			ex = this.x
		} else if (x > this.x + this.width) {
			ex = this.x + this.width
		} else {
			ex = x
		}
		let ey
		if (y < this.y) {
			ey = this.y
		} else if (y > this.y + this.height) {
			ey = this.y + this.height
		} else {
			ey = y
		}

		let ev = new Vector2(ex, ey)
		return ev
	},

	distanceTo: function(x, y) {
		return this.closestEdge(x, y).distanceTo(new Vector2(x, y))
	}
})

export function rad(deg) {
	return deg * Math.PI / 180
}

export function length(a, b, length) {
	if (!length) {
		return a.distanceTo(b)
	}

	/*
	 * Not sure if a zero length line is worth supporting, it doesn't
	 * really work naturally. To support it you would need another
	 * store of information in addition to the vector
	 */
	if (length <= 0) {
		throw new Error("Zero length line wouldn't be able to be lengthened again")
	}
	/*
	 * Basically make it's origin zero, normalize it to be from
	 * 0-1, multiply it by length, then add the origin back to it.
	 */
	return b.sub(a).normalize().multiplyScalar(length).add(a)
}
