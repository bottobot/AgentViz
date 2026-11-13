'use strict';
const { randomBytes } = require('node:crypto');

function webviewHtml({ css, view, app, cspSource }) {
  const nonce = randomBytes(18).toString('base64');
  const attribute = value => String(value).replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${attribute(cspSource)}; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none';">
<title>AgentViz</title><link rel="stylesheet" href="${attribute(css)}"></head>
<body><nav class="toolbar" aria-label="Session controls">
<div class="brand"><span class="brand-mark" aria-hidden="true">◎</span>AgentViz</div>
<div class="spacer"></div><button id="refresh" type="button">Refresh</button><button id="settings" type="button">Settings</button><button id="example" type="button">Show example</button>
</nav><section class="finder" role="search" aria-label="Find a session">
<div class="field"><label class="field-label" for="workspace">Project / workspace</label><select id="workspace"><option value="">All projects</option></select></div>
<div class="field"><label class="field-label" for="name-filter">Session name</label><input id="name-filter" type="search" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Any name"></div>
<div class="field"><label class="field-label" for="id-filter">Session ID (optional)</label><input id="id-filter" type="search" autocomplete="off" spellcheck="false" maxlength="200" placeholder="Full or partial ID"></div>
<div class="field field-action"><button id="clear-filters" type="button" disabled>Clear filters</button></div>
<div class="field field-wide"><label class="field-label" for="session">Session</label><select id="session"><option value="">Finding local sessions…</option></select></div>
<p id="matches" class="finder-note" role="status" aria-live="polite"></p>
</section><section id="selection" class="selection" aria-label="Followed session" hidden>
<span class="selection-part"><span class="selection-key">Project</span><span id="selected-workspace"></span></span>
<span class="selection-part"><span class="selection-key">Name</span><span id="selected-name"></span></span>
<span class="selection-part"><span class="selection-key">ID</span><code id="selected-id" class="selection-id"></code><button id="copy-id" type="button" aria-label="Copy full session ID">Copy ID</button></span>
<span id="selected-provider" class="selection-detail"></span>
<span id="copy-status" class="selection-detail" role="status" aria-live="polite"></span>
<span id="selection-note" class="selection-note" role="status" aria-live="polite"></span>
</section><div id="connection" class="toolbar-note" role="status" aria-live="polite"></div><main id="content" aria-label="Session activity"></main>
<aside id="drawer" class="drawer" aria-labelledby="drawer-title" hidden><div class="drawer-head"><button id="drawer-back" type="button" hidden>Back</button><h2 id="drawer-title"></h2><button id="drawer-close" type="button" aria-label="Close details">Close</button></div><div id="drawer-body" class="drawer-body"></div></aside>
<script nonce="${nonce}" src="${attribute(view)}"></script><script nonce="${nonce}" src="${attribute(app)}"></script></body></html>`;
}

module.exports = { webviewHtml };
