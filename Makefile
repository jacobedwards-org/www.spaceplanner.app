prefix = /var/www/htdocs/www.spaceplanner.app
libs =\
	github.com/svgdotjs/svg.js@3.2.4 \
	github.com/svgdotjs/svg.panzoom.js@2.1.2

install:
	rsync $$(libnames ${libs} | sed 's/^/--exclude=lib\//') -va --del files/ ${prefix}

uninstall:
	rm -rf ${prefix}/*

install_libs: update_libs
	for lib in $$(libnames ${libs}); do \
		rm -rf ${prefix}/lib/"$$lib"; \
		mkdir -p ${prefix}/lib/"$$lib"; \
		(cd "lib/$$lib"/src/src && pax -w .) | (cd ${prefix}/lib/"$$lib" && pax -r); \
	done

update_libs:
.for lib in ${libs}
	getlib "${lib}"
.endfor

clean:
	rm -rf lib/

.PHONY: install install_libs update_libs
