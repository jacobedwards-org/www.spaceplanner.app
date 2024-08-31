const proto = "http"
const host = "api.spaceplanner.app"
const version = "v0"

function verify_response(response) {
	let type = response.headers.get("Content-Type")
	if (type != "application/json; charset=utf-8") {
		return Promise.reject(new Error("API returned unacceptable format: " + type))
	} else {
		return Promise.resolve(response)
	}
}

function parse_response(response) {
	return response.json()
}

function status(response) {
        // response.code is from appleboy's golang JWT LoginHandler
	// May figure out how to change in the future
	if (response.code >= 200 || response.code < 300) {
		return Promise.resolve(response)
	}
	if (response.status == "ok") {
		return response.body
	}

	if (response.error) {
		return Promise.reject(new Error(response.error))
	}
	return Promise.reject(new Error("Error undefined"))
}

function api_fetch(method, endpoint, body) {
	let params = { "method": method, "headers": { "Content-Type": "application/json" } };
	let t = token()
	if (authorized_duration(t) > 0) {
		params["headers"]["Authorization"] = "Bearer " + t
	}

	if (body) {
		params["body"] = JSON.stringify(body)
	}
	
	return fetch(proto + "://" + host + "/" + version + "/" + endpoint, params)
		.then(verify_response)
		.then(parse_response)
		.then(status)
}

export { api_fetch as fetch }

export function register(username, password, email, options) {
	options = options ?? {}

	let req = {
		email: email,
		credentials: { username: username, password: password, email: email }
	}
	if (options.email_policy != null) {
		req.email_policy = options.email_policy
	}

	return api_fetch("POST", "users", req)
		.then(function(response) {
			console.log("api.register", req)
		})
}

export function login(username, password) {
	let req = { "username": username, "password": password }
        return api_fetch("POST", "tokens", req)
		.then(function(resp) {
			console.log("api.login", req)
			update_token(resp.token)
		})
}

export function refresh_token() {
	api_fetch("GET", "tokens")
		.then(function(resp) {
			update_token(resp.token)
		})
}

export function update_token(t) {
	console.log("update_token", t)
	if (!t) {
		localStorage.removeItem("token")
		localStorage.removeItem("username")
	} else {
		localStorage.setItem("token", t)
		localStorage.setItem("username", token_payload(t)["id"])
	}
}

export function token() {
	return localStorage.getItem("token")
}

export function token_payload(t) {
	if (!t) {
		t = token()
		if (!t) {
			return t
		}
	}
	let a = t.split('.')
	if (a.length != 3) {
		throw new Error("Invalid token")
	}
	return JSON.parse(atob(a[1]))
}

// Returns seconds until authorization expires, or negative the
// number of seconds it has been expired.
export function authorized_duration(t) {
	let payload = token_payload(t)
	if (!payload) {
		return -1
	}

	return payload["exp"] - (Date.now() / 1000)
}

export function logged_in() {
	return authorized_duration() > 0
}
