# Simulator tests

No dependencies, no browser, no waiting. Playback is driven with fake time (`player.tick(ms)`).

    node tys/tests/run.js

`engine.test.js` covers the scenario library and its validation, the four difficulty levels, profile and session
building, portfolio and order math, the moon bag and capital tracker, revenge-trading detection, behavior analytics
and a fuzz test of rapid random orders. `session.test.js` covers sessionStorage recovery, presenter pause / resume,
NEXT EVENT, fast-forward, stage hand-offs and the replay engine.

## Adding a scenario

1. Copy any file in `js/scenarios/` (see the header of `js/scenario.js` for the shape).
2. Add a `<script>` line for it in `index.html` (and to the list in `tests/load.js` if it is not picked up by name).
3. Run the tests. `Scenarios.validateAll()` checks it at all four levels.
