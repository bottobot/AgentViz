# Mock-up verification

## Animated Station Observatory follow-up, 12 November 2026

`station.html` is the selected direction developed into an animated synthetic prototype. `node --check docs/ui-exploration/station.js` and `python docs/ui-exploration/verify-station.py` passed. The retained browser self-check uses installed Python Playwright and Microsoft Edge, with an isolated browser that closes in a finally block. Chrome's headless launch exited before creating a page on this machine, so this follow-up was verified in Edge.

Verified: playback advances a single 42-event fixture and emits animated signals; Pause stops advancement and clears signals; counts and error totals remain consistent at six timeline positions; all six SVG stations work with Enter; resources drill down to calls; event dialogs expose inputs and outputs; API 429 and test-failure payloads can be traversed; Escape restores focus; resource exploration clears the errors-only filter; flat view, empty state, speed, reduced motion, and 768/390-pixel layouts work. No JavaScript errors or HTTP/HTTPS requests were observed. Desktop, API-error and narrow-layout screenshots were visually inspected and retained under the ignored `artifacts/station-prototype` directory.

The station prototype uses HTML, CSS and JavaScript, with no new project dependency. It is separate from the original static comparison gallery described below. It has not been connected to real transcripts or integrated into the VS Code webview; production handling of sensitive inputs and outputs remains undesigned. The extension tests were not rerun for these documentation-only files.

## Original comparison gallery

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
