# Reference: the approved landing page design

Design “A v2: adapts to every athlete”, Signal palette, approved by the owner
on 2026-10-05. These are design artifacts. Build from
[../design-spec.md](../design-spec.md), [../copy.md](../copy.md) and
[../tokens.json](../tokens.json); use these files to check how it should look
and behave.

| File | What it shows |
|---|---|
| `A2-Signal.html` | Static render of the full page in its default state (Running tab, Racing chart). Open in a browser. Tabs and buttons do not respond in this render |
| `A2-Signal-desktop.jpg` | Full page at 1280px |
| `A2-Signal-phone-fluid.jpg` | The same page at 390px (how the fluid layout stacks) |
| `A2-phone.jpg` | Hand-tuned phone layout, with the HYROX tab selected |
| `hero-hyrox-tab.jpg`, `hero-trail-tab.jpg` | The hero card on two other tabs |
| `chart-no-race.jpg` | The plan chart in No race mode |
| `signup-flow.jpg` | Landing page → confirmation → admin approval → approval email → `/app/` sign-in |
| `palettes.jpg` | Signal (approved), Glacier and Slate, for the record |
| `A2.design-source.html` | Source of the design artboard, including its interaction logic (`renderVals()`) |
| `interaction_tests.cjs` | 19 behavior tests run against that logic. `node interaction_tests.cjs A2.design-source.html` → “19 tests passed”. PR 4 ports these to vitest |

The live, editable design canvas is “Attune landing page options” in the
owner’s Claude artifacts. It is not reachable from a Claude Code session; these
files are the copy that is.
