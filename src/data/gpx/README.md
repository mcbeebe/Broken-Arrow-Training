# Course GPX files

Drop each course's official GPX trace here as `<courseId>.gpx`.

For the Broken Arrow 18K 2026 edition, that's:

```
src/data/gpx/broken-arrow-18k-2026.gpx
```

The 3D renderer (Cesium) picks it up automatically via
`src/data/gpx/index.ts`'s `import.meta.glob` — no schema changes, no
code changes. Just commit the file and merge.

When no GPX is present for a course, the renderer falls back to the
hand-traced `elevationProfile` waypoints in the course seed.

## Sources

- Official race page: https://brokenarrowskyrace.com — they publish
  GPX downloads for each distance.
- Or export your own route from Strava: route page → ⋯ → Export GPX.

GPX files are gitignored only if you set them to be (they aren't by
default). Keep filenames stable across years (`broken-arrow-18k-2026.gpx`,
not `broken-arrow-18k.gpx`) so a re-routed 2027 edition can ship
its own trace without overwriting the 2026 one.
