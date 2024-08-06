function authorize() {
        if (api_authorized_duration() <= 0) {
                // Maybe add a parameter which has /login redirect
                // back to the page that was trying to be accessed
                window.location.href = "/login"
        }
}

function delete_element_func(element) {
	return function() {
		element.remove()
	}
}

function set_error(message, on) {
        if (!on) {
                on = document.body
        }

        let err_elem = on.parentElement.querySelector(":scope > .error")
        if (err_elem) {
                err_elem.textContent = message
        } else {
                let err_elem = document.createElement("div")
                err_elem.setAttribute("class", "error")

		let msg = document.createElement("p")
		msg.appendChild(document.createTextNode(message))
		err_elem.append(msg)

		let close = document.createElement("input")
		close.type = "image"
		close.src = "/icons/close-outline.svg"
		close.addEventListener("click", delete_element_func(err_elem), false)
		close.setAttribute("class", "icon")

		err_elem.append(close)

                on.before(err_elem)
        }
}

function handle_wrap(func, on) {
	return function() {
		try {
			func()
		}
		catch(err) {
			set_error("There was an issue with the page: " + err, on)
		}
	}
}
