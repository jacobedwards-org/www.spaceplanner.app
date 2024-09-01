import * as etc from "/lib/etc.js"
import * as api from "/lib/api.js"

function main() {
        if (!api.authorized()) {
                window.location.href = "/login"
        }

	api.fetch("POST", "users/" + localStorage.getItem("username") + "/services/billingportal")
		.then(function(body) {
			window.location.href = body.url
		})
		.catch(function(err) {
			console.error("Unable to display billing portal:", err)
			etc.error("There was an unexpected error.")
		})
}

main()
