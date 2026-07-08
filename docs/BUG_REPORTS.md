# EdgeRules Engine Bug Reports

## Ruleset CRUD findings — resolved (@edgerules/web + @edgerules/node, 2026-07-08)

The eight bugs previously logged here (found 2026-07-07 against alpha.202607071338 while building the
Decision Table Editor: cell-level `when` unary tests rejected, failed `set` not rolled back, `remove`
unsupported on `when` cells/`@default`, `get`/`set` path asymmetry on rule sub-paths, `get` denormalizing
authored unary tests, `rename` not relinking call sites, ruleset parameters unable to carry defaults, and
bare special values failing to parse as portable expression strings) are all fixed as of
**alpha.202607080846**. Verified with repro scripts re-running each case against the upgraded
`@edgerules/node`/`@edgerules/web`/`@edgerules/portable` packages — every case now returns the expected
success result instead of an error, and previously-corrupted-model scenarios leave the model intact.

No open bugs at this time.
