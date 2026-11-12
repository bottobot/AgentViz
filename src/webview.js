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
<label class="picker-label" for="session">SESSION</label><select id="session" aria-label="Session"><option value="">Finding local sessions…</option></select>
<div class="spacer"></div><button id="refresh" type="button">Refresh</button><button id="example" type="button">Show example</button>
</nav><div id="connection" class="toolbar-note" role="status" aria-live="polite"></div><main id="content" aria-label="Session activity"></main>
<script nonce="${nonce}" src="${attribute(view)}"></script><script nonce="${nonce}" src="${attribute(app)}"></script></body></html>`;
}

module.exports = { webviewHtml };
