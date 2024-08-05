function authorize() {
        if (api_authorized_duration() <= 0) {
                // Maybe add a parameter which has /login redirect
                // back to the page that was trying to be accessed
                window.location.href = "/login"
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
                let err_elem = document.createElement("p")
                err_elem.textContent = message
                err_elem.classList = "error"
                on.before(err_elem)
        }
}
