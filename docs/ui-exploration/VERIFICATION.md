# Mock-up verification

Checked 12 November 2026 in Chrome using the local `index.html` file.

| Check | Observed result |
|---|---|
| Desktop visual inspection | All three concepts rendered; hierarchy, isometric scene and timeline inspected in browser screenshots |
| Desktop viewport | 1440-pixel emulated viewport; no page overflow |
| Narrow layouts | 768- and 390-pixel emulated viewports; no page or mock-up horizontal overflow; comparison table scrolls within its container |
| Error disclosure | Click expanded the shell error explanation |
| Historical selection | Each of the three radio controls displayed exactly one matching panel, with 48, 58 or 76 calls respectively |
| Keyboard | ArrowLeft moved from 14:22 to 14:18; ArrowRight twice returned to 14:28; corresponding visible panels asserted |
| Narrow control alignment | Fixed a radio button separating from its label at 390 pixels; visually rechecked and asserted each radio remains within its label's vertical bounds |
| Anchors and IDs | All section anchors resolve; no duplicate IDs |
| Resources | No script elements; no HTTP or HTTPS resource requests observed |
| Scope | Only `docs/ui-exploration/` added; production code and package configuration unchanged |

The gallery uses browser-native disclosures and radio controls, CSS, and inline SVG. No executable application logic or dependencies were added. Screenshots were inspected through the browser tool; screenshot files are not part of the deliverable.

Not checked: real users, real session data, VS Code extension-host integration, high-contrast themes, screen-reader announcements, printing or other browser engines. The existing extension unit suite was not rerun because no extension source was modified. These checks establish a usable local comparison artifact, not a production-ready UI or measured usability ranking.
