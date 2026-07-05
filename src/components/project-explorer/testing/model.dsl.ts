/**
 * The exact example model from docs/PROJECT_EXPLORER_STORY.md's "Implementation Details" section
 * (decision-table rule syntax adjusted to the confirmed-working form from edgerules-v2's own
 * tests/wasm/decision-tables.test.ts). Shared by ProjectExplorer.test.tsx (via `@edgerules/node`,
 * a real Node-loadable build of the engine) and the Storybook stories (via `@edgerules/web`, real
 * in an actual browser) — one source of truth for "the example model", built from a real service
 * in both places, never a hand-built fixture.
 */
export const MODEL_DSL = `{
    type Person: {
        name: <string>; age: <number>; tags: <string[]>
    }
    type PeopleList: <Person[]>
    globalConst: 42
    nested: {
        func deep(): {
            subField: 10
            deepContext: {
                x: 1
            }
            return: subField
        }
    }
    list: [{a: 1}, {a: 2}]
    risk: firstMatch({
        inputs: { age: 20 }
        rules: [
            { when: { age: 18..25 }, then: { level: "high" } }
        ]
        default: { level: "none" }
    })
}`;
