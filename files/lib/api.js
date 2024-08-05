let api_proto = "http"
let api_host = "api.spaceplanner.app"
let api_version = "v0"

function api_verify_response(response) {
	let type = response.headers.get("Content-Type")
	if (type != "application/json; charset=utf-8") {
		return Promise.reject(new Error("API returned unacceptable format: " + type))
	} else {
		return Promise.resolve(response)
	}
}

function api_parse_response(response) {
	return response.json()
}

function api_status(response) {
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
	params = { "method": method, "headers": { "Content-Type": "application/json" } };

	let token = api_token()
	if (api_authorized_duration(token) > 0) {
		params["headers"]["Authorization"] = "Bearer " + token
	}

	if (body) {
		params["body"] = JSON.stringify(body)
	}
	
	return fetch(api_proto + "://" + api_host + "/" + api_version + "/" + endpoint, params)
		.then(api_verify_response)
		.then(api_parse_response)
		.then(api_status)
}

function api_refresh_token() {
	api_fetch("GET", "tokens/refresh")
		.then(function(resp) {
			api_update_token(resp.token)
		})
}

function api_update_token(token) {
	console.log("api_update_token(" + token + ")")
	if (!token) {
		localStorage.removeItem("token")
	} else {
		localStorage.setItem("token", token)
	}
}

function api_token() {
	let t = localStorage.getItem("token")
	console.log("api_token() > " + t)
	return t
}

function api_token_payload(token) {
	if (!token) {
		token = api_token()
		if (!token) {
			return token
		}
	}
	let a = token.split('.')
	if (a.length != 3) {
		throw new Error("Invalid token")
	}
	return JSON.parse(atob(a[1]))
}

// Returns seconds until authorization expires, or negative the
// number of seconds it has been expired.
function api_authorized_duration(token) {
	let payload = api_token_payload(token)
	if (!payload) {
		return -1
	}

	return payload["exp"] - (Date.now() / 1000)
}

function api_logged_in() {
	return api_authorized_duration() > 0
}
