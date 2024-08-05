prefix = /var/www/htdocs/www.spaceplanner.app

install:
	rsync -va --del files/ ${prefix}

.PHONY: install
