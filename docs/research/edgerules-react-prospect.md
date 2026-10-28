# edgerules-react — Prospect (October 2026)

_A realistic look at the component library: what exists, what it is worth, where it can win, and where it cannot. It is
the UI companion to the engine's
[PROSPECT_UPDATE_202607.md](../../../edgerules/doc/architecture/prospect/PROSPECT_UPDATE_202607.md) and reuses its
conclusions instead of repeating them. Written for the maintainer, not for an investor._

---

## 1. Facts first (verified against the repo, 2026-10-23)

| Area                  | Status                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Age and cadence       | 162 commits since 2026-07-04, one author. 103 commits in July, 3 in August, 0 in September, 56 in October                                                                          |
| Size                  | ~22.5K lines of source, ~12.8K lines of tests (77 test files, ~860 test cases, all against the real engine — no mocks), 22 Playwright specs                                        |
| Shipped components    | Code Editor, Code Editor Cell, Boxed Editor, Decision Table, Flow Editor (Input/Terms/Function/Ruleset/Output/Chart nodes), Tests Manager + TestRunner, Project Explorer, Shell    |
| Non-GUI services      | Project Session (bundle load/save, IndexedDB repository), Documentation Service, Test Cases Service                                                                                |
| Not built             | Types Editor; any `explain()`/trace view; table static analysis UI; versioning/diff UI                                                                                             |
| Distribution          | **Not on npm** (`edgerules-react` 0.1.0 is unpublished). No hosted Storybook, no hosted studio, no CI workflow in the repo (checks run only through local agent hooks)             |
| Engine dependency     | `@edgerules/web` `0.1.0-alpha.*`, pinned as a regular dependency. 4 open engine defects in [engine-bug-reports.md](../engine-bug-reports.md), several with UI-side workarounds     |
| Engine binary         | Prod WASM is now **754 KB** (617 KB in July). It is already above the 700 KB budget the engine prospect proposed                                                                   |
| Peer stack            | React 18/19, **Mantine 9** (required), CodeMirror 6, `@xyflow/react` 12, `@tanstack/charts` — the last three optional per component                                                |
| Internal architecture | Layered, enforced by dependency-cruiser; per-component subpath exports; `index.ts` public API vs `internal.ts`; ~6.7K lines of specs and stories                                   |
| Target architecture   | [global-project-management.md](../global-project-management.md) (1.3K lines) designs cloud persistence (PostgreSQL), a GitHub App connector, a ~200-project examples repo, and MCP |

**The headline:** in roughly three active months, one person built a broad, well-tested editor suite with an engineering
bar most component libraries never reach. It also has **zero users, zero distribution, and no public place where anyone
can see it run.** That is the engine's diagnosis again: the semantic and engineering rows are green, and every
distribution row is empty.

---

## 2. What the suite actually is

Strip the component names, and the suite is three things:

1. **One model, three synchronized views.** Code (DSL text), Boxed (a typed treegrid of fields, functions, rulesets,
   optimisations, collections) and Flow (a node canvas of the annotated fields). All three read and write the same
   engine model. The engine stays the only authority — the UI never re-implements semantics. See
   [model-decomposition.md](../model-decomposition.md).
2. **A live, in-browser decision workbench.** Every edit is re-linked and can be re-executed in the browser, with no
   server. Results appear in place: the Boxed Editor's test-result column, Output nodes, Chart nodes, the Tests Manager
   grid. The flow screenshot (a loan with an amortization schedule and live charts) is the clearest picture of this.
3. **Testing as a first-class part of the model.** Test cases are generated from the model's typed schema, persisted
   apart from the engine, re-run on demand, and marked stale after edits.

Each piece exists somewhere else. The **combination** is rare: a text DSL with real language tooling, plus DMN-style
structured views, plus live in-browser evaluation and tests, all over a statically typed, total engine.

---

## 3. Competitive reality

| Option                                                          | What it is                                                          | Where edgerules-react is better                                                          | Where it is worse                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **GoRules JDM editor** (`@gorules/jdm-editor`)                  | Open-source React editor for GoRules graphs, tables and expressions | Text view with completion/diagnostics; typed cells; Boxed view; integrated tests; charts | Published, used in production, many engine bindings, a company behind it, templates |
| **dmn-js (bpmn.io)**, **Apache KIE DMN**                        | DMN editors (DRD, decision tables, boxed expressions) over XML/FEEL | No XML; a compact DSL; runs fully in the browser; live evaluation without a JVM          | Standard compliance (DMN), huge installed base, enterprise familiarity              |
| **Commercial studios** (DecisionRules, Nected, Taktile, Higson) | Hosted rule editors with deployment, versioning, audit              | Embeddable; open source; no vendor cloud                                                 | Versioning, approvals, audit trails, support, polish — everything buyers pay for    |
| **react-querybuilder** and similar                              | Generic condition builders                                          | Real language, tables, functions, tests                                                  | Engine-agnostic, tiny, trivially adoptable                                          |
| **Spreadsheets**                                                | What business analysts really use                                   | Types, tests, reviewable text, no copy-paste drift                                       | Everyone already knows Excel                                                        |

Three honest readings:

- **GoRules already gives away a React editor.** "Open-source embeddable rules editor" is not a differentiator on its
  own. The differentiators are the text view, the type system shown in every cell, and the in-place tests and results.
- **The components only work with the EdgeRules engine.** Their market is therefore capped by the engine's adoption.
  They cannot become a generic DMN or rules UI. Their realistic job is to **make the engine adoptable** — not to be a
  separate product with a separate market.
- **Business users do not choose editors; vendors and developers do.** The buyer for an embeddable editor is a developer
  at a SaaS company who must let their customers or analysts edit rules. That is a real but narrow audience, and it
  evaluates on "how fast can I drop this in" first.

---

## 4. Strengths (substantiated)

- **Engine-as-authority design.** The UI holds no rule semantics, so each view is consistent with execution by
  construction. This is the correct architecture, and it is rare: most rule editors carry a second, drifting copy of the
  semantics in the UI.
- **Code ↔ structured round-trip.** Developers keep a diffable DSL; analysts get grids and canvases. Very few tools
  serve both without an export/import step. This is the strongest single selling point of the suite.
- **Live evaluation in the browser.** No backend is needed to author, run, chart, or test a model. This makes a zero-
  infrastructure hosted studio possible, and it suits offline and privacy-sensitive use (data never leaves the browser).
- **Integrated tests with schema pre-generation and stale tracking.** Most rule editors treat tests as an add-on. Here
  they are part of the authoring loop.
- **Rules + optimisation in one editor.** The Boxed Editor edits `optimise` blocks (variables, objective, constraints)
  next to rulesets, with binding/slack results. Lightweight tools that combine auditable rules with an LP solver are
  scarce. The market is small, but the competition is smaller.
- **Engineering discipline.** Real-engine tests, enforced layering, a minimal public API, and an engine bug log are what
  a technical evaluator looks for — and what makes the code safe to hand to a second contributor.

---

## 5. Weaknesses (the section that matters)

- **Nobody can see it.** It is not on npm, there is no hosted Storybook, and there is no demo URL. For a UI project this
  matters more than for the engine: a UI sells through screenshots, GIFs and a link people can click. Today the best
  artifact is two PNGs in the README.
- **The engine's best features are invisible in the UI.** `explain()`, special-value provenance and link-time
  verification are the engine's main differentiators. The suite renders special values as strings in the Tests Manager
  and has no explain/trace view. Every demo therefore looks like "another rules editor" instead of showing "why did this
  decision come out this way".
- **Mantine is a required peer.** A host that does not use Mantine must add Mantine, its provider and its stylesheet to
  embed one decision table. For a library whose audience is "embed this into an existing product", this is a real
  adoption filter. It is acceptable for a studio application, and costly for an embeddable library.
- **Coupled to an alpha engine.** The engine is a pinned regular dependency, so every engine release forces a library
  release. Six open engine defects already require UI workarounds. External users inherit both.
- **Scope is drifting toward a platform.** Shell, ProjectSession, IndexedDB repositories and a 1.3K-line cloud/Git/MCP
  target architecture are application work. With zero users, the cloud, GitHub App and examples-repo plans are
  speculative investment. The risk is building the castle before anyone visits.
- **Incomplete in visible places.** The Types Editor is missing, the Flow Editor is marked partial, and no consumer-
  facing "embed in 5 minutes" guide exists. The docs are excellent internal specs, written for agents and the
  maintainer.
- **Bus factor 1, now across two repos (plus three small sibling repos).** The August–September gap shows how cadence
  depends on one person's availability. The engine prospect already names solo-maintainer burnout as a threat; the UI
  suite doubles the surface that one person must keep green.
- **No CI in the repo.** Quality relies on local hooks. Outside contributors and evaluators read a missing CI badge as
  "unmaintained".

---

## 6. Where it can shine — niches ranked by fit × reachability

### 6.1 The engine's front door (highest priority, near-certain value)

A hosted, backend-free **EdgeRules Studio** — Shell + Project Session + local IndexedDB storage + shareable model links
— is the single most valuable thing this repo can produce. The engine prospect lists "hosted playground with shareable
model links" as a Stage 1 adoption item; this repo already holds ~80% of it. Value does not depend on anyone embedding
the components: it turns the engine from "read the docs" into "click a link and change a number".

Realistic outcome: the main funnel for the engine. This alone justifies the repo.

### 6.2 Explainable financial decisions (the vertical demo)

The flow screenshot already shows a loan schedule with live charts. Add a decision table, tests and an explain view, and
it becomes a **credit-affordability model that explains each decision** — the exact shape the engine prospect picks as
its commercial wedge (EU consumer credit, CCD2 from November 2026). A reference project of this kind is the asset a
fintech developer forwards to their compliance lead.

Realistic outcome: the best demo for design-partner conversations. It is not a product on its own.

### 6.3 Human review of agent-authored rules

The engine prospect's fallback thesis is "agents author it, the linker proves it". The missing third step is **a human
approves it**. A coding agent writes DSL; a reviewer sees the same model as a decision table and a boxed grid, with
tests and live results next to each rule. That is a credible human-oversight surface, and the Code ↔ structured
round-trip is exactly what it needs.

Realistic outcome: a strong narrative and a differentiated demo. It is unproven, and it depends on the engine's LLM
authoring eval coming out well. Pursue as positioning, not as a build commitment.

### 6.4 Embedded editors in vertical SaaS

Lending, insurance or pricing platforms that let customers configure rules could embed the Decision Table and Tests
Manager. This is the "component library" use case the repo is structured for. It needs: npm publication, a stable API,
engine stability, and a lighter styling dependency.

Realistic outcome: possible after the engine has users, and probably only a handful of integrations. GoRules competes
directly here with a head start.

### 6.5 Rules + optimisation workbench

Operations planning (production mix, staffing, allocation) where rule-derived numbers feed an LP solver. Few lightweight
tools exist. The audience is small and technical; solver hosting adds friction.

Realistic outcome: a differentiating showcase; a niche, not a market.

### Not where it should compete

- A general workflow or automation builder (n8n, Dify) — different problem, crowded.
- A standards-compliant DMN editor — the engine is deliberately not DMN.
- A full enterprise BRMS (governance, approvals, roles) — not reachable by one person before users exist.

---

## 7. Showcase examples for the studio pitch

Every example below uses only shipped engine features: rulesets and scorecards, loops (`while` and fold), finance
functions, dates and business days, `optimise`, `explain()` with special values, user types, list functions such as
`groupBy`, and host-provided external functions.

**Selection rule:** an example earns a place only if it shows something a spreadsheet or plain TypeScript cannot do well
— an explanation per decision, typed handling of missing data, tests inside the model, or the same model running in the
browser and on the backend.

**Existing material:** `../edgerules/tests/wasm/models/` already holds loan origination, a scorecard, order pricing, a
temporal model and optimisation; `OPTIMISE_EXAMPLES.md` adds factory production, feed blending and order sourcing. They
are written as engine tests, not as stories, but they are the starting point.

### 7.1 Tier 1 — strongest pitch value

1. **"Can I afford this home?"** Mortgage affordability with an amortization chart, an affordability decision table,
   stress-test scenarios and a plain-language reason for each verdict.
   - **Shows:** finance functions, Flow with charts, decision tables, `explain()`.
   - **Why it fits:** anyone understands it, and it is the consumer face of the credit (CCD2) wedge. The loan screenshot
     in the README is already 60% of it.
2. **Sales commission plan** _(new candidate)_. Tiered rates, accelerators above quota, caps and clawbacks, and a "why
   is my payout €X?" breakdown per rep.
   - **Shows:** `groupBy`/`sumBy` over deal lists, rulesets, `explain()`, one test case per rep.
   - **Why it fits:** commission plans are a well-known spreadsheet pain. Payout disputes are exactly the "explain this
     number" problem, and the dedicated SaaS tools are expensive. Probably the best fit not considered before.
3. **Payroll / tax calculator as "rules as code"** _(new candidate)_. For example, a Lithuanian net-to-gross salary
   calculator (income-tax brackets, social-insurance contributions, tax-free allowance) or a benefit-eligibility check.
   - **Why it fits:** governments and the OECD-backed "Rules as Code" movement publish laws as executable models.
     OpenFisca, the main reference tool, is Python and server-based. EdgeRules runs entirely in the browser, so a
     citizen's data never leaves the device — a privacy pitch no server-based tool can make.
   - **Caveat:** effective-dated rules do not exist yet, so tax years must be modelled as a ruleset keyed on year.
4. **Refund guardrail for an AI agent.** "May the support agent refund €X to this customer?" The answer comes from order
   age, customer tier, refund history and amount limits, and returns approve, escalate or deny with a reason.
   - **Why it fits:** it is the concrete demo behind the agent-guardrail and human-review thesis (§6.3). It works
     without an MCP server and gets stronger once one exists.

### 7.2 Tier 2 — strong, more specialised

5. **Production / sourcing plan.** Rules produce costs and compliance gates; the LP solver picks the mix. The Boxed view
   shows binding constraints and slack. The data already exists. The most distinctive demo, for a technical audience.
6. **Solar + battery ROI or EV charging plan.** NPV/IRR over a multi-year loop, time-of-use tariff rules, optionally an
   LP for the charging schedule. Chart-heavy and topical in the EU; combines finance, loops and optimisation in one
   story.
7. **Debt payoff simulator (avalanche vs snowball)** or a **retirement / financial-independence projection.** A
   month-by-month simulation with a fold loop and a chart comparing the strategies. Month-by-month simulations are where
   spreadsheets get messy with dragged formulas; here the loop is typed and checked.
8. **Insurance premium rating.** Rating tables, scorecard loadings, discounts and a premium breakdown. The second
   vertical and a classic decision-table shape.

### 7.3 Tier 3 — memorable, use with care

9. **Clinical risk score with missing data** (CHA₂DS₂-VASc-style). The best possible demo of `Missing` vs
   `NotApplicable`: "no lab result" and "does not apply to this patient" are different, and most engines treat both as
   null. Present it strictly as a language demo, never as medical software, because of regulatory risk.
10. **Cap table liquidation waterfall / vesting schedule.** Liquidation preferences confuse even founders; explaining
    who gets what and why lands well with a startup audience. Uses dates for vesting cliffs.
11. **Cart promotions with stacking rules.** The same WASM runs in the cart preview and at checkout, so the price shown
    always equals the price charged. The clearest demo of browser/backend parity, in a crowded market.

### 7.4 Pitch structure

- **One hero demo:** #1 (affordability) for a fintech audience, or #2 (commissions) for a broader business audience.
- **A gallery of four to five more:** #3, #4, #5, #7 and #9 together cover every engine capability.
- **The same three-step walkthrough in each:** change an input, see the result and chart update live, click the result
  to see why. The third step needs the explain/trace view (§9, item 3), which does not exist yet; the gallery makes it
  more urgent.

A good gallery makes EdgeRules look capable but does not prove anyone wants it. Treat commissions (#2) and rules-as-code
calculators (#3) as hypotheses worth one conversation each with potential users before building them in full.

---

## 8. Realistic trajectories

| Scenario                    | What it looks like in 12–18 months                                                                                            | Likelihood (judgement)                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Engine studio**           | Hosted studio and playground; the components mainly power EdgeRules' own tools; npm package has a few downloads               | **Most likely** — mostly in own control                              |
| **Studio + early adopters** | Studio drives a small number of external engine users; one or two embed a component; a credit-domain reference project exists | Plausible if §9 items 1–4 ship soon                                  |
| **Commercial studio**       | The suite becomes the hosted studio of the engine prospect's commercial path (lifecycle plane, approvals, evidence packs)     | Possible but distant; needs design partners and more than one person |
| **Stall**                   | Engine adoption does not come; the suite stays a well-built private tool                                                      | Real base rate for DSL ecosystems                                    |

The library's fate is tied to the engine's. A great editor cannot rescue an engine nobody runs, but a visible editor is
one of the cheapest ways to get the engine run.

---

## 9. Recommendations, ranked by leverage

1. **Make it visible.** Add CI (typecheck, lint, depcruise, tests). Deploy Storybook to GitHub Pages. Record a short GIF
   of the three views editing one model. Cheap and overdue.
2. **Ship the hosted studio** (§6.1) with share-by-link and three to five curated example projects (§7). Merge it with,
   or link it from, the existing examples page instead of keeping two playgrounds.
3. **Build an explain/trace view.** Click a result and see why: the contributing fields, the matched rule, and the
   origin of any special value. It is the feature that makes every demo show the engine's real differentiator.
4. **Build one vertical reference project** — credit affordability with tests and explanations (§6.2).
5. **Publish `0.1.0` to npm** with a compatibility note (which engine version) and an "embed in 5 minutes" guide. Do
   this only once the engine publishes its own stability contract; until then, label it experimental.
6. **Freeze platform scope.** Park the cloud persistence, GitHub App and 200-project examples repo until external users
   ask for them. Keep `global-project-management.md` as a target; do not build towards it now.
7. **Decide the styling dependency deliberately.** Either accept Mantine and position the suite as a studio (not a
   drop-in library), or plan a path to fewer required peers. Do not leave it as an accident.
8. **Finish the visible gaps last:** Types Editor, Flow Editor completeness. They matter less than visibility and
   explain.

**Do not prioritise:** more node types, more editing affordances, or more internal refactoring. The editing surface is
already ahead of what any user has seen.

---

## 10. Signals to watch

- **Positive:** someone outside the project shares a studio link; an issue or question from a stranger; a fintech
  developer asks to embed a decision table; the engine's LLM authoring eval reports good results (which strengthens
  §6.3).
- **Negative:** six months after the studio and npm release, still no external usage → stop adding UI features and put
  the effort into engine distribution (Python bindings, importers), which the engine prospect ranks higher.
- **Sustainability:** if engine work and UI work keep alternating in multi-month gaps, choose one as the primary focus
  per quarter instead of advancing both slowly.

---

## 11. Bottom line

The suite is good — well-architected, well-tested, and with one genuinely uncommon idea at its centre: one typed model,
shown as code, grid and canvas at once, running live in the browser. That idea is worth something **only as the engine's
front door.** As a standalone component library it competes with a free, established GoRules editor, for an audience
limited to engine users, with a heavy peer stack.

The pragmatic path: stop widening the editors, put a hosted studio and an explain view in front of people, build one
credit-domain example, and let real usage decide whether the platform architecture is ever worth building.
