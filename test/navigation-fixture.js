'use strict';
// Synthetic catalogue in the shape the host whitelist sends (S01). No real titles, paths or IDs.
const WS_STORE = `ws:${'a'.repeat(20)}`;
const WS_VIZ = `ws:${'b'.repeat(20)}`;
const WS_DOCS = `ws:${'c'.repeat(20)}`;
const HOSTILE = '<img src=x onerror=alert(1)>"\'&';

const entry = (id, sessionId, provider, workspaceKey, workspaceLabel, name, extra = {}) => ({
  id, sessionId, provider, project: workspaceLabel, child: false, modified: 1800000000000,
  workspaceKey, workspaceLabel, name, nameSource: name === 'Unnamed session' ? 'none' : 'custom', ...extra
});

function catalogue() {
  return [
    // Two providers, one workspace, one title, and IDs that only differ after the first eight characters.
    entry('claude:a1', '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01', 'claude', WS_STORE, 'storefront', 'Fix login redirect'),
    entry('codex:b1', '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4b02', 'codex', WS_STORE, 'storefront', 'Fix login redirect'),
    entry('claude:c1', '9d8c7b6a-1111-4222-8333-444455556666', 'claude', WS_VIZ, 'agentviz', 'Add Session Filters'),
    entry('codex:d1', '019a0000-aaaa-7bbb-8ccc-ddddeeeeffff', 'codex', WS_VIZ, 'agentviz', 'Unnamed session', { child: true }),
    entry('claude:e1', 'ABCDEF12-0000-4000-8000-000000000001', 'claude', WS_DOCS, 'docs-site', 'Fix login redirect'),
    entry('claude:f1', '77770000-0000-4000-8000-00000000beef', 'claude', WS_DOCS, 'docs-site', HOSTILE)
  ];
}

const snapshot = (entry, label = 'Reading files') => ({
  provider: entry.provider, id: entry.sessionId, project: entry.project, parent: null, status: 'active', context: null,
  updatedAt: 1800000000000, invalidLines: 0, oversizedLines: 0, droppedEvents: 0,
  events: [{ id: `${entry.id}-event`, time: 1800000000000, kind: 'files', label, outcome: 'success' }]
});

module.exports = { catalogue, snapshot, WS_STORE, WS_VIZ, WS_DOCS, HOSTILE };
