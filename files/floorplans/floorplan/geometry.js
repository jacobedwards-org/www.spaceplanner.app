import { default as SVG } from "/lib/github.com/svgdotjs/svg.js/svg.js"
import { Vector2 } from "/lib/github.com/ros2jsguy/threejs-math/math/Vector2.js"

SVG.extend(SVG.Point, {
	vec: function() {
		return new Vector2(this.x, this.y)
	}
})

SVG.extend(SVG.Shape, {
	vec: function() {
		return new Vector2(this.x(), this.y())
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

	whereIsPoint: function(x, y) {
		let p = new Vector2(x, y)
		let width = this.attr("stroke-width") ?? 1
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
		return this.whereIsPoint(x, y) != null ? true : false
	}
})
