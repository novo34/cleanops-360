# Local demonstration map assets

MapLibre GL JS ES module worker and shared module 6.15.0: https://github.com/maplibre/maplibre-gl-js (BSD-3-Clause; see MAPLIBRE-LICENSE.txt). Copied byte-for-byte from the pinned npm package's dist/maplibre-gl-worker.mjs and dist/maplibre-gl-shared.mjs. Updating the dependency requires updating this worker and its checksum evidence together. No remote worker, token, tiles or glyph provider is used.

region.geojson: selected country polygons from Natural Earth 1:50m admin_0_countries and Lake Geneva from Natural Earth 1:10m lakes. Natural Earth data is public domain: https://www.naturalearthdata.com/about/terms-of-use/ . Sources: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson . Properties reduced to name/kind; geometry retained. These are generalized geographic boundaries, not a routing/navigation basemap. Territorial and lake data are illustrative context, not site geocoding.

Operation points are deliberately fictional demo coordinates near the city named by each synthetic company. No geolocation, worker tracking, real client address or route optimization is represented.
