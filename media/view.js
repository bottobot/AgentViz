(function (root) {
  'use strict';

  const stations = [
    { kind: 'files', name: 'Files', icon: '01', x: 260, y: 64 },
    { kind: 'edits', name: 'Edits', icon: '02', x: 408, y: 149 },
    { kind: 'shell', name: 'Shell', icon: '03', x: 408, y: 319 },
    { kind: 'network', name: 'Network', icon: '04', x: 260, y: 404 },
    { kind: 'agents', name: 'Agents', icon: '05', x: 112, y: 319 },
    { kind: 'memory', name: 'Memory', icon: '06', x: 112, y: 149 }
  ];
  const kinds = [...stations.map(station => station.kind), 'other'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const clock = time => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const elapsed = ms => ms < 60000 ? `${Math.max(0, Math.floor(ms / 1000))}s` : ms < 3600000 ? `${Math.floor(ms / 60000)}m` : `${Math.floor(ms / 3600000)}h ${Math.floor(ms % 3600000 / 60000)}m`;

  function summarize(events) {
    const counts = Object.fromEntries(kinds.map(kind => [kind, 0]));
    let errors = 0;
    let last = null;
    let errorsByKind = {};
    for (const event of events) {
      if (event.kind === 'prompt') errorsByKind = {};
      if (!(event.kind in counts)) continue;
      counts[event.kind]++;
      last = event;
      if (event.outcome === 'error') { errors++; errorsByKind[event.kind] = (errorsByKind[event.kind] || 0) + 1; }
    }
    return { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), errors, errorsByKind, last };
  }

  function activityBuckets(events, now) {
    const width = 30000;
    const start = Math.floor(now / width) * width - 59 * width;
    const buckets = Array.from({ length: 60 }, (_, index) => ({ start: start + index * width, total: 0, errors: 0, counts: {}, markers: [] }));
    for (const event of events) {
      const index = Math.floor((event.time - start) / width);
      if (index < 0 || index >= buckets.length || event.time > now) continue;
      const bucket = buckets[index];
      if (kinds.includes(event.kind)) {
        bucket.total++;
        bucket.counts[event.kind] = (bucket.counts[event.kind] || 0) + 1;
        if (event.outcome === 'error') bucket.errors++;
      } else bucket.markers.push(event.kind);
    }
    return buckets;
  }

  function map(summary, activeKind) {
    return `<svg viewBox="0 0 520 468" role="img" aria-label="Tool activity by category. ${summary.total} calls. Read the category totals below for details.">
      <defs><pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M 26 0 L 0 0 0 26" class="grid-line"/></pattern></defs>
      <rect width="520" height="468" fill="url(#grid)"/>
      <circle cx="260" cy="234" r="170" class="orbit"/><circle cx="260" cy="234" r="110" class="orbit inner"/>
      <path d="M260 24V444M50 234H470" class="crosshair"/>
      ${stations.map(station => {
        const count = summary.counts[station.kind];
        const active = activeKind === station.kind;
        return `<g class="station ${station.kind} ${active ? 'active' : ''}">
          <path d="M260 234L${station.x} ${station.y}" class="spoke ${count ? 'used' : ''}" stroke-width="${count ? Math.min(8, 1 + Math.log2(count + 1)) : 1}"/>
          <circle cx="${station.x}" cy="${station.y}" r="25" class="station-ring"/>
          <text x="${station.x}" y="${station.y + 4}" class="station-icon">${station.icon}</text>
          <text x="${station.x}" y="${station.y + 44}" class="station-name">${station.name.toUpperCase()}</text>
          <text x="${station.x}" y="${station.y + 61}" class="station-count">${count}</text>
          ${summary.errorsByKind[station.kind] ? `<circle cx="${station.x + 20}" cy="${station.y - 19}" r="5" class="error-dot"><title>${summary.errorsByKind[station.kind]} errors since last prompt</title></circle>` : ''}
        </g>`;
      }).join('')}
      <circle cx="260" cy="234" r="48" class="hub"/>
      <text x="260" y="233" class="hub-count">${summary.total}</text><text x="260" y="253" class="hub-label">TOOL CALLS</text>
    </svg>`;
  }

  function timeline(events, now) {
    const buckets = activityBuckets(events, now);
    const max = Math.max(1, ...buckets.map(bucket => bucket.total));
    return `<svg viewBox="0 0 900 90" preserveAspectRatio="none" role="img" aria-label="Activity over the last 30 minutes. Each bar is 30 seconds; gaps mean no recorded calls.">
      <path d="M0 76H900M0 42H900M0 8H900" class="timeline-grid"/>
      ${buckets.map((bucket, index) => {
        const kind = Object.keys(bucket.counts).sort((a, b) => bucket.counts[b] - bucket.counts[a])[0] || 'other';
        const height = bucket.total ? Math.max(4, bucket.total / max * 56) : 1;
        return `<g class="${kind}"><title>${clock(bucket.start)}: ${bucket.total} calls${bucket.errors ? `, ${bucket.errors} errors` : ''}${bucket.markers.length ? `, ${bucket.markers.join(', ')}` : ''}</title>
          <rect x="${index * 15 + 2}" y="${76 - height}" width="10" height="${height}" rx="2" class="activity-bar ${bucket.total ? '' : 'silent'}"/>
          ${bucket.errors ? `<rect x="${index * 15 + 5}" y="10" width="3" height="66" class="error-tick"/>` : ''}
          ${bucket.markers.length ? `<circle cx="${index * 15 + 7}" cy="7" r="3" class="marker"/>` : ''}</g>`;
      }).join('')}
    </svg>`;
  }

  function recent(events) {
    const groups = [];
    for (const event of events) {
      const last = groups.at(-1);
      if (last && last.label === event.label && last.kind === event.kind && last.outcome === event.outcome) {
        last.count++;
        last.time = event.time;
      } else groups.push({ ...event, count: 1 });
    }
    return groups.slice(-8).reverse().map(event => `<li class="event ${escape(event.kind)}">
      <span class="event-dot ${event.outcome === 'error' ? 'failed' : ''}" aria-hidden="true"></span>
      <span class="event-label">${escape(event.label)}${event.count > 1 ? ` <span class="repeat">×${event.count}</span>` : ''}</span>
      <span class="event-outcome">${event.outcome === 'error' ? 'Error' : event.outcome === 'running' ? 'Started' : ''}</span>
      <time>${clock(event.time)}</time></li>`).join('');
  }

  // Navigation (S02). These work on the catalogue the host sends; they never see paths or transcript content.
  const needle = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const providerName = provider => provider === 'claude' ? 'Claude' : 'Codex';

  function filterSessions(sessions, filters = {}) {
    const name = needle(filters.name);
    const id = needle(filters.id);
    const workspaceKey = typeof filters.workspaceKey === 'string' ? filters.workspaceKey : '';
    return sessions.filter(session => (!workspaceKey || session.workspaceKey === workspaceKey)
      && (!name || String(session.name ?? '').toLowerCase().includes(name))
      && (!id || String(session.sessionId ?? '').toLowerCase().includes(id)));
  }

  // The selected entry is looked up in the whole catalogue, never in the matches, so a filter cannot swap it.
  function navigate(sessions, filters = {}, selectedId = '') {
    const matches = filterSessions(sessions, filters);
    const selected = (selectedId && sessions.find(session => session.id === selectedId)) || null;
    return {
      matches, selected,
      excluded: Boolean(selected) && !matches.includes(selected),
      active: Boolean(filters.workspaceKey || needle(filters.name) || needle(filters.id))
    };
  }

  function workspaceChoices(sessions) {
    const byKey = new Map();
    for (const session of sessions) {
      const choice = byKey.get(session.workspaceKey) || { key: session.workspaceKey, label: String(session.workspaceLabel || 'Unknown workspace'), count: 0 };
      choice.count++;
      byKey.set(session.workspaceKey, choice);
    }
    const choices = [...byKey.values()];
    const uses = new Map();
    for (const choice of choices) uses.set(choice.label, (uses.get(choice.label) || 0) + 1);
    // Different directories that still share a label are told apart by a fragment of their opaque key.
    for (const choice of choices) if (uses.get(choice.label) > 1) choice.label = `${choice.label} · ${String(choice.key).slice(3, 9)}`;
    return choices.sort((a, b) => a.label.localeCompare(b.label) || String(a.key).localeCompare(String(b.key)));
  }

  // Eight characters where that is enough to tell sessions apart, otherwise as many as it takes.
  function idLabels(sessions) {
    const lower = sessions.map(session => String(session.sessionId).toLowerCase());
    const labels = new Map();
    sessions.forEach((session, index) => {
      const full = String(session.sessionId);
      let length = Math.min(8, full.length);
      while (length < full.length && lower.some((other, at) => at !== index && other !== lower[index] && other.startsWith(lower[index].slice(0, length)))) length++;
      labels.set(session.id, length >= full.length - 3 ? full : `${full.slice(0, length)}…`);
    });
    return labels;
  }

  function sessionLabel(session, idLabel) {
    return `${session.workspaceLabel} › ${session.name} · ${idLabel || session.sessionId} · ${providerName(session.provider)}${session.child ? ' subagent' : ''} · ${clock(session.modified)}`;
  }

  function identityHeading(identity, example, detail) {
    return `<div><div class="eyebrow">${example ? 'SYNTHETIC EXAMPLE' : 'LOCAL SESSION'} · PROJECT</div>
      <p class="session-workspace">${escape(identity.workspaceLabel)}</p><h1>${escape(identity.name)}</h1>
      <p class="session-caption">ID <span class="session-id">${escape(identity.sessionId)}</span> · ${identity.provider === 'claude' ? 'Claude Code' : 'Codex'}${identity.child ? ' · subagent' : ''}${detail ? ` · ${detail}` : ''}</p></div>`;
  }

  function render(session, options = {}) {
    if (!session && options.identity) return `<header class="session-heading">${identityHeading(options.identity, false, '')}<span class="status"><span aria-hidden="true"></span>Loading history</span></header>
      <section class="empty"><span class="eyebrow">WAITING FOR A SIGNAL</span><p>Activity for this session has not arrived yet.</p><p class="muted">If this stays empty, press Refresh or choose another session.</p></section>`;
    if (!session) return `<section class="empty"><span class="eyebrow">WAITING FOR A SIGNAL</span><h1>No session selected</h1><p>Choose a session above to see where the work is going.</p><p class="muted">Run Claude Code or Codex locally, then refresh. You can also explore the example session.</p></section>`;
    const now = options.now ?? Date.now();
    const identity = options.identity || { workspaceLabel: session.project || 'Unknown workspace', name: 'Unnamed session', sessionId: session.id, provider: session.provider, child: Boolean(session.parent) };
    const summary = summarize(session.events);
    const age = now - session.updatedAt;
    const quiet = age >= 30000;
    const status = options.example ? 'Example session' : session.loading ? 'Loading history' : session.status === 'complete' ? 'Turn complete' : session.status === 'paused' ? 'Paused' : quiet ? 'Quiet' : 'Recent activity';
    const activeKind = !quiet && session.status === 'active' ? summary.last?.kind : null;
    const context = Number.isFinite(session.context) ? Math.min(100, Math.max(0, session.context)) : null;
    const warnings = [...(options.warnings || [])];
    if (session.invalidLines) warnings.push(`${session.invalidLines} malformed records skipped.`);
    if (session.oversizedLines) warnings.push(`${session.oversizedLines} records above the 4 MB line limit skipped.`);
    if (session.droppedEvents) warnings.push(`Showing the latest 10000 events; ${session.droppedEvents} earlier events omitted.`);
    return `<header class="session-heading">${identityHeading(identity, options.example, options.example ? 'A sample run through explore, edit and verify.' : `Last record ${elapsed(age)} ago`)}
      <span class="status ${!quiet && session.status === 'active' && !options.example ? 'receiving' : ''}"><span aria-hidden="true"></span>${status}</span></header>
      ${warnings.length ? `<aside class="notice" role="status">${warnings.map(escape).join(' ')}</aside>` : ''}
      <div class="workspace-grid"><section class="map-panel panel"><div class="panel-heading"><h2>Where the work went</h2><span>FIXED STATIONS</span></div>${map(summary, activeKind)}
        <div class="station-totals">${stations.map(station => `<span class="${station.kind}"><i aria-hidden="true"></i>${station.name}<b>${summary.counts[station.kind]}</b></span>`).join('')}${summary.counts.other ? `<span class="other">Other<b>${summary.counts.other}</b></span>` : ''}</div></section>
      <section class="detail-panel"><div class="metrics"><div><span>RECORDED CALLS</span><strong>${summary.total}</strong></div><div><span>TOOL ERRORS</span><strong class="${summary.errors ? 'error-number' : ''}">${summary.errors}</strong></div></div>
      <div class="context-block panel"><div class="context-title"><h2>Context window</h2><span>${context === null ? 'Unavailable' : `${session.context}%`}</span></div>
        ${context === null ? '<p class="muted">This source has not reported usage and capacity.</p>' : `<meter min="0" max="100" low="70" high="90" optimum="0" value="${context}" aria-label="Context window usage">${context}%</meter><p class="muted">Reported by the session. Amber at 70%, red at 90%.</p>`}</div>
      <div class="recent-panel panel"><div class="panel-heading"><h2>Recent activity</h2><span>SIMILAR EVENTS FOLDED</span></div><ol>${recent(session.events) || '<li class="muted">No tool activity recorded yet.</li>'}</ol></div>
      <p class="privacy-note">Names only. Prompts, command arguments and tool output stay out of this view.</p></section></div>
      <section class="timeline-panel panel"><div class="panel-heading"><h2>Activity over time</h2><span>LAST 30 MINUTES · 30s PER BAR</span></div>${timeline(session.events, now)}
      <div class="timeline-labels"><span>${clock(Math.floor(now / 30000) * 30000 - 59 * 30000)}</span><span>Gaps = silence <i class="legend-error"></i> tool error <i class="legend-marker"></i> turn / compaction</span><span>Now</span></div></section>
      <footer>Counts cover loaded, retained history. The strip shows 30 minutes. Quiet means no recent records; it does not prove the agent stopped.</footer>`;
  }

  function demoSession(now = Date.now()) {
    const start = now - 18 * 60000;
    const events = [{ id: 'prompt', time: start, kind: 'prompt', label: 'User prompt', outcome: 'success' }];
    for (let index = 0; index < 76; index++) {
      const kind = index < 26 ? 'files' : index < 48 ? 'edits' : index < 60 ? 'shell' : ['files', 'shell', 'agents', 'network', 'memory'][index % 5];
      const label = { files: `Reading src/${index % 3 ? 'session' : 'extension'}.js`, edits: 'Editing src/session.js', shell: index % 3 ? 'Running tests' : 'Building', network: 'Fetching code.visualstudio.com', agents: 'Working with agents', memory: 'Updating plan' }[kind];
      events.push({ id: `demo-${index}`, time: start + index * 13000 + (index > 42 ? 45000 : 0), kind, label, outcome: index === 52 ? 'error' : 'success' });
    }
    return { provider: 'claude', id: 'example-session', project: 'AgentViz', parent: null, events, updatedAt: events.at(-1).time, status: 'active', context: 66, invalidLines: 0, oversizedLines: 0, droppedEvents: 0 };
  }

  const demoIdentity = { workspaceLabel: 'AgentViz', name: 'Example session', sessionId: 'example-session', provider: 'claude', child: false };

  // Made-up sessions for the page when it runs without a host: two projects share a title, and two IDs share a prefix.
  function demoCatalogue(now = Date.now()) {
    const workspace = letter => `ws:${letter.repeat(20)}`;
    const rows = [
      ['claude', '5e1f0a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b', '1', 'example-shop', 'Fix checkout rounding', false],
      ['codex', '5e1f0a2b-3c4d-4e5f-8a6b-7c8d9e0f1a99', '1', 'example-shop', 'Fix checkout rounding', false],
      ['claude', 'a7b8c9d0-1e2f-4a3b-9c4d-5e6f7a8b9c0d', '2', 'example-docs', 'Rewrite install guide', false],
      ['codex', '0b1c2d3e-4f5a-4b6c-8d7e-8f9a0b1c2d3e', '2', 'example-docs', 'Fix checkout rounding', false],
      ['claude', 'c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f', '3', 'example-tools', 'Unnamed session', false],
      ['claude', 'f9e8d7c6-b5a4-4f3e-8d2c-1b0a9f8e7d6c', '3', 'example-tools', 'Unnamed session', true]
    ];
    return rows.map(([provider, sessionId, key, workspaceLabel, name, child], index) => ({
      id: `demo:${index}`, sessionId, provider, project: workspaceLabel, child, modified: now - index * 7 * 60000,
      workspaceKey: workspace(key), workspaceLabel, name, nameSource: name === 'Unnamed session' ? 'none' : 'custom'
    }));
  }

  const api = { summarize, activityBuckets, render, demoSession, demoCatalogue, demoIdentity, filterSessions, navigate, workspaceChoices, idLabels, sessionLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AgentViz = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
