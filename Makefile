proto = https
domain = www.spaceplanner.app
urlprefix = ${proto}://${domain}

prefix = /var/www/htdocs/www.spaceplanner.app
libs =\
	github.com/svgdotjs/svg.js@3.2.4 \
	github.com/svgdotjs/svg.panzoom.js@2.1.2 \
	github.com/mrdoob/three.js@r169 \

install: update_policies files/sitemap.txt
	rsync $$(./libnames ${libs} | sed 's/^/--exclude=lib\//') -va --del files/ ${prefix}

uninstall:
	rm -rf ${prefix}/*

install_libs: update_libs
	for lib in $$(./libnames ${libs}); do \
		rm -rf ${prefix}/lib/"$$lib"; \
		mkdir -p ${prefix}/lib/"$$lib"; \
		(cd "lib/$$lib"/src/src && pax -w .) | (cd ${prefix}/lib/"$$lib" && pax -r); \
	done

update_libs:
.for lib in ${libs}
	./getlib "${lib}"
.endfor

update_policies:
	for p in ./files/policies/*.md; do ./bin/make_policy $$p > $${p%.md}.html; done

clean:
	rm -rf lib/

files/sitemap.txt:
	find files -type f -name '*.html' | \
		awk -vp=${urlprefix} '!match($$0, "/dev/") { sub("files/", "", $$0); printf "%s/%s\n", p, $$0 }' > $@

# sitemap.txt isn't really phony, but I don't want to maintain a
# list of the html files in here right now
.PHONY: install install_libs update_libs update_policies files/sitemap.txt
