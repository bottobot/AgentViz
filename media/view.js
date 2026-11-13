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
        return `<g class="station ${station.kind} ${active ? 'active' : ''} clickable" data-open="station:${station.kind}">
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
        return `<g class="${kind}${bucket.total || bucket.markers.length ? ' clickable' : ''}"${bucket.total || bucket.markers.length ? ` data-open="bar:${bucket.start}"` : ''}><title>${clock(bucket.start)}: ${bucket.total} calls${bucket.errors ? `, ${bucket.errors} errors` : ''}${bucket.markers.length ? `, ${bucket.markers.join(', ')}` : ''}</title>
          <rect x="${index * 15 + 2}" y="${76 - height}" width="10" height="${height}" rx="2" class="activity-bar ${bucket.total ? '' : 'silent'}"/>
          ${bucket.errors ? `<rect x="${index * 15 + 5}" y="10" width="3" height="66" class="error-tick"/>` : ''}
          ${bucket.markers.length ? `<circle cx="${index * 15 + 7}" cy="7" r="3" class="marker"/>` : ''}</g>`;
      }).join('')}
    </svg>`;
  }

  // The Recent activity rows, newest first: runs of the same label, kind and outcome folded into one row that
  // keeps its member events, so a click on the row lists every call behind it.
  function recentGroups(events) {
    const groups = [];
    for (const event of events) {
      const last = groups.at(-1);
      if (last && last.label === event.label && last.kind === event.kind && last.outcome === event.outcome) {
        last.count++;
        last.time = event.time;
        last.members.push(event);
      } else groups.push({ ...event, count: 1, members: [event] });
    }
    return groups.slice(-8).reverse();
  }

  function recent(events) {
    return recentGroups(events).map((event, index) => `<li class="event ${escape(event.kind)}"><button type="button" class="event-open" data-open="recent:${index}" aria-label="${escape(`Show details: ${event.label}${event.count > 1 ? `, ${event.count} times` : ''}${event.outcome === 'error' ? ', error' : ''}, ${clock(event.time)}`)}">
      <span class="event-dot ${event.outcome === 'error' ? 'failed' : ''}" aria-hidden="true"></span>
      <span class="event-label">${escape(event.label)}${event.count > 1 ? ` <span class="repeat">×${event.count}</span>` : ''}</span>
      <span class="event-outcome">${event.outcome === 'error' ? 'Error' : event.outcome === 'running' ? 'Started' : ''}</span>
      <time>${clock(event.time)}</time></button></li>`).join('');
  }

  // Details on click: the events one clickable thing stands for, newest first, each with the lane it belongs to.
  // `spec` is the data-open value: station:<kind>, bar:<start>, recent:<row>, lane:<key> or file:<key>.
  function eventsFor(session, spec, now = Date.now()) {
    const lanes = familyLanes(session);
    const events = familyEvents(lanes);
    const [type, ...rest] = String(spec || '').split(':');
    const value = rest.join(':');
    let picked = [];
    let lane = null;
    if (type === 'station') picked = events.filter(event => event.kind === value);
    else if (type === 'bar') { const start = Number(value); picked = Number.isFinite(start) ? events.filter(event => event.time >= start && event.time < start + 30000 && event.time <= now) : []; }
    else if (type === 'recent') picked = recentGroups(events)[Number(value)]?.members || [];
    else if (type === 'lane') { lane = lanes.find(entry => entry.key === value) || null; picked = lane ? lane.events.map(event => ({ ...event, lane: lane.key, laneName: laneName(lane) })) : []; }
    else if (type === 'file') {
      const file = (Array.isArray(session.footprint?.files) ? session.footprint.files : []).find(entry => entry && entry.key === value);
      const ids = new Set(Array.isArray(file?.events) ? file.events : []);
      picked = events.filter(event => event.lane === lanes[0].key && ids.has(event.id));
      return { title: file ? `File ${file.label}` : 'File', events: picked.slice().reverse(), lane: null, file };
    }
    const station = stations.find(entry => entry.kind === value);
    const title = type === 'station' ? `${station ? station.name : 'Other'} calls` : type === 'bar' ? `Activity ${clock(Number(value))}–${clock(Number(value) + 30000)}` : type === 'recent' ? (picked[0]?.label || 'Recent activity') : type === 'lane' ? (lane ? laneName(lane) : 'Lane') : 'Details';
    return { title, events: picked.slice().reverse(), lane, facts: lane ? laneFacts(lane) : null };
  }

  // Agent lanes (S04). Counting rule, used by the stations, the totals, the strip, the recent list and the lanes
  // alike: the family is the followed session plus the subagent lanes the host loaded for it, and each tool call
  // counts once, in the lane of the agent that made it. Starting a subagent is a call in the parent's lane.
  function familyLanes(session) {
    const sent = Array.isArray(session.family?.lanes) ? session.family.lanes.filter(lane => lane && typeof lane === 'object') : [];
    const root = sent.find(lane => lane.depth === 0) || { key: 'main', depth: 0, role: session.parent ? 'subagent' : 'main', start: { time: session.startedAt || null, source: 'own' }, end: { state: 'open', time: null }, updatedAt: session.updatedAt, parentKnown: true };
    const seen = new Set([root.key]);
    const lanes = [{ ...root, depth: 0, events: session.events }];
    // A lane key the host repeats is drawn once.
    for (const lane of sent) {
      if (lane === root || seen.has(lane.key)) continue;
      seen.add(lane.key);
      lanes.push({ ...lane, depth: Math.max(1, Number.isInteger(lane.depth) ? lane.depth : 1), events: Array.isArray(lane.events) ? lane.events : [] });
    }
    return lanes;
  }

  const laneName = lane => lane.depth === 0 ? (lane.role === 'subagent' ? 'Followed subagent' : 'Main session') : String(lane.label || 'Subagent');

  // Each event keeps the key and name of its lane, so a click can ask the host about it in the right transcript.
  function familyEvents(lanes) {
    const mainName = laneName(lanes[0]);
    const merged = lanes[0].events.map(event => ({ ...event, lane: lanes[0].key, laneName: mainName }));
    if (lanes.length === 1) return merged;
    for (const lane of lanes.slice(1)) {
      const name = laneName(lane);
      for (const event of lane.events) merged.push({ ...event, label: `${event.label} · ${name}`, lane: lane.key, laneName: name });
    }
    // Stable sort: records with the same time keep main first, then lane order.
    return merged.sort((a, b) => a.time - b.time);
  }

  function laneCounts(events) {
    let calls = 0;
    let errors = 0;
    for (const event of events) {
      if (!kinds.includes(event.kind)) continue;
      calls++;
      if (event.outcome === 'error') errors++;
    }
    return { calls, errors };
  }

  const familyScope = lanes => lanes.length > 1 ? `${lanes[0].role === 'subagent' ? 'followed subagent' : 'main'} + ${lanes.length - 1} subagent ${lanes.length === 2 ? 'lane' : 'lanes'}` : 'followed session only';
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  // What a lane states about itself. A duration appears only between two recorded times; an end that the source
  // did not record is called that, never estimated from the last record.
  function laneFacts(lane, at = clock) {
    const { calls, errors } = laneCounts(lane.events);
    const facts = [`${plural(calls, 'call')}${errors ? `, ${plural(errors, 'error')}` : ''}`];
    if (lane.missing) facts.push('Transcript not found (deleted, moved or not written yet)');
    else if (lane.unreadable) facts.push('Transcript could not be read');
    else if (lane.loading) facts.push('Loading history');
    const start = lane.start || {};
    const started = Number.isFinite(start.time);
    facts.push(started ? `${start.source === 'parent' ? 'Launch recorded by parent' : 'First record'} ${at(start.time)}` : 'Start not recorded');
    if (lane.depth === 0) {
      if (lane.updatedAt) facts.push(`Last record ${at(lane.updatedAt)}`);
      return facts;
    }
    const end = lane.end || {};
    const word = { completed: 'Completed', failed: 'Failed', stopped: 'Stopped', ended: 'Ended' }[end.state];
    if (word && Number.isFinite(end.time)) {
      facts.push(`${word} ${at(end.time)} (reported to parent)`);
      if (started && end.time >= start.time) facts.push(`${elapsed(end.time - start.time)} from ${start.source === 'parent' ? 'recorded launch' : 'first record'} to reported end`);
    } else {
      facts.push(end.state === 'finished' ? 'Marked finished; end time not recorded' : 'No end recorded');
      if (lane.updatedAt) facts.push(`Last record ${at(lane.updatedAt)}`);
      if (lane.status === 'complete') facts.push('Its own last turn is complete');
      else if (lane.status === 'paused') facts.push('Its own last turn was interrupted');
    }
    if (lane.parentKnown === false) facts.push('Parent lane not loaded; shown under the followed session');
    if (lane.duplicates) facts.push(`${plural(lane.duplicates, 'call')} copied from the parent not counted`);
    if (lane.omitted) facts.push(`${plural(lane.omitted, 'earlier event')} omitted`);
    return facts;
  }

  // One time axis for every lane: from the first to the last time any lane recorded.
  function laneAxis(lanes) {
    let from = Infinity;
    let to = -Infinity;
    const see = time => { if (Number.isFinite(time) && time > 0) { from = Math.min(from, time); to = Math.max(to, time); } };
    for (const lane of lanes) {
      see(lane.start?.time); see(lane.end?.time); see(lane.updatedAt);
      for (const event of lane.events) see(event.time);
    }
    if (from === Infinity) return null;
    if (to - from < 60000) to = from + 60000;
    return { from, to, x: time => Math.round(Math.min(1, Math.max(0, (time - from) / (to - from))) * 9000) / 10 };
  }

  function lanesPanel(lanes, family) {
    const axis = laneAxis(lanes);
    const wide = axis && axis.to - axis.from > 20 * 3600000;
    const at = time => wide ? new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : clock(time);
    const rows = lanes.map(lane => {
      const name = laneName(lane);
      const facts = laneFacts(lane, at).join(' · ');
      let track = '';
      if (axis) {
        let first = Number.isFinite(lane.start?.time) ? lane.start.time : Infinity;
        let last = Number.isFinite(lane.updatedAt) && lane.updatedAt > 0 ? lane.updatedAt : -Infinity;
        const columns = new Map();
        for (const event of lane.events) {
          first = Math.min(first, event.time);
          last = Math.max(last, event.time);
          if (!kinds.includes(event.kind)) continue;
          const column = Math.min(149, Math.floor(axis.x(event.time) / 6));
          columns.set(column, columns.get(column) || event.outcome === 'error');
        }
        const ended = lane.depth > 0 && Number.isFinite(lane.end?.time);
        const until = ended ? lane.end.time : last;
        if (first !== Infinity && until >= first) {
          const x = axis.x(first);
          const x2 = Math.max(x + 2, axis.x(until));
          track += `<rect x="${x}" y="7" width="${Math.round((x2 - x) * 10) / 10}" height="4" rx="2" class="lane-span"/>`;
          // A solid end mark is a recorded end. A dashed one only marks the last record; the end is not known.
          if (ended) track += `<rect x="${Math.min(897, x2 - 1)}" y="1" width="3" height="16" class="lane-end ${lane.end.state === 'failed' ? 'failed' : ''}"/>`;
          else if (lane.depth > 0) track += `<path d="M${x2} 1V17" class="lane-open"/>`;
        }
        track += [...columns].map(([column, failed]) => `<rect x="${column * 6}" y="4" width="5" height="10" rx="1" class="lane-tick ${failed ? 'failed' : ''}"/>`).join('');
      }
      return `<li class="lane depth-${Math.min(4, lane.depth)}${lane.missing ? ' missing' : ''}">
        <div class="lane-name">${lane.depth ? '<span aria-hidden="true">↳ </span>' : ''}<button type="button" class="link-button" data-open="lane:${escape(lane.key)}"><b>${escape(name)}</b></button>${lane.depth ? ` <span class="lane-id">${escape(String(lane.key).slice(0, 8))}</span>` : ''}</div>
        <svg class="lane-track" viewBox="0 0 900 18" preserveAspectRatio="none" role="img" aria-label="${escape(name)} on the shared time axis. ${escape(facts)}">${track}</svg>
        <p class="lane-facts">${escape(facts)}</p></li>`;
    }).join('');
    const notes = Array.isArray(family?.notes) ? family.notes : [];
    return `<section class="lanes-panel panel"><div class="panel-heading"><h2>Agent lanes</h2><span>ONE TIME AXIS · FIRST TO LAST RETAINED RECORD</span></div>
      ${notes.length ? `<p class="lane-note" role="status">${notes.map(escape).join(' ')}</p>` : ''}
      <ol class="lanes">${rows}</ol>
      ${lanes.length === 1 ? '<p class="muted lane-empty">No subagent transcripts were found for this session.</p>' : ''}
      <div class="timeline-labels"><span>${axis ? at(axis.from) : ''}</span><span>Line = first to last record <i class="legend-end"></i> recorded end <i class="legend-open"></i> end not recorded <i class="legend-error"></i> tool error</span><span>${axis ? at(axis.to) : ''}</span></div></section>`;
  }

  // Task list progress (S05). The numbers come only from a list the agent itself recorded: Claude TodoWrite or
  // Task records, or Codex update_plan records. Tool activity never feeds them. A list belongs to the one transcript
  // that recorded it, so the followed session and each subagent lane are shown apart and never added together.
  // A task label is written only inside the progress area.
  const progressSources = {
    'claude-todos': 'Claude TodoWrite records',
    'claude-tasks': 'Claude Task records (TaskCreate, TaskUpdate, TaskList)',
    'codex-plan': 'Codex update_plan records'
  };

  function progressFacts(progress) {
    const listed = Boolean(progress) && typeof progress === 'object';
    const available = listed && Object.hasOwn(progressSources, progress.source) && Array.isArray(progress.items);
    const items = available ? progress.items.filter(item => item && typeof item === 'object') : [];
    const count = status => items.filter(item => item.status === status).length;
    const whole = value => listed && Number.isInteger(value) && value > 0 ? value : 0;
    const completed = count('completed');
    const inProgress = count('in_progress');
    const pending = count('pending');
    return { available, source: available ? progressSources[progress.source] : '', items, total: items.length, completed, inProgress, pending,
      unknown: items.length - completed - inProgress - pending, current: items.filter(item => item.status === 'in_progress'),
      omitted: whole(progress?.omitted), unread: whole(progress?.unread), unmatched: whole(progress?.unmatched), unreadable: whole(progress?.unreadable),
      updatedAt: listed && Number.isFinite(progress.updatedAt) ? progress.updatedAt : 0 };
  }

  const countLine = facts => `${facts.completed} of ${facts.total} listed ${facts.total === 1 ? 'item' : 'items'} completed`;
  const taskLabel = item => `<span class="task-label">${escape(item.label)}</span> <span class="lane-id">ITEM ${escape(item.id)}</span>`;

  function progressGaps(facts) {
    const gaps = [];
    if (facts.omitted) gaps.push(`${facts.omitted} further ${facts.omitted === 1 ? 'item' : 'items'} in the source list are not shown or counted (limit 200).`);
    if (facts.unmatched) gaps.push(`${plural(facts.unmatched, 'update')} named a task this transcript did not create; not counted.`);
    if (facts.unreadable) gaps.push(`${plural(facts.unreadable, 'list record')} could not be read; not counted.`);
    if (facts.unread) gaps.push(`${plural(facts.unread, 'code call')} named the plan tool; a plan written as program text is not read.`);
    return gaps;
  }

  // The full statement for the followed session.
  function progressBody(facts, status) {
    const gaps = progressGaps(facts);
    const gapText = gaps.length ? `<p class="muted progress-gap" role="status">${gaps.map(escape).join(' ')}</p>` : '';
    if (!facts.available) return `<p class="muted">No explicit task list is recorded in this transcript. Supported lists: Claude TodoWrite and Task records, Codex update_plan records. Tool activity is not used to estimate progress.</p>${gapText}`;
    const source = `<p class="muted progress-source">${escape(`Source: ${facts.source} in this transcript${facts.updatedAt ? ` (last list record ${clock(facts.updatedAt)})` : ''}. This is the agent's own plan, not independently measured project completion.`)}</p>`;
    if (!facts.total) return `<p class="progress-count">The recorded list is empty.</p>${source}${gapText}`;
    const open = facts.total - facts.completed;
    const parts = [`<b>${countLine(facts)}</b>`, `${facts.inProgress} in progress`, `${facts.pending} not started`];
    if (facts.unknown) parts.push(`${facts.unknown} with a status this view does not recognise`);
    let current = '<p class="progress-current">No item is marked in progress.</p>';
    if (facts.current.length) current = `<p class="progress-current">Current ${facts.current.length === 1 ? 'item' : 'items'}, as marked by the agent:</p>
      <ul class="task-list">${facts.current.slice(0, 3).map(item => `<li>${taskLabel(item)}</li>`).join('')}${facts.current.length > 3 ? `<li class="muted">and ${facts.current.length - 3} more marked in progress</li>` : ''}</ul>`;
    else if (!open) current = '<p class="progress-current">Every listed item is marked completed.</p>';
    const ended = open && (status === 'complete' || status === 'paused') ? `<p class="progress-ended" role="status">The last turn ${status === 'paused' ? 'was interrupted' : 'ended'} with ${open} listed ${open === 1 ? 'item' : 'items'} still open.</p>` : '';
    return `<progress class="task-bar" max="${facts.total}" value="${facts.completed}" aria-label="${countLine(facts)}, from the agent's own task list">${countLine(facts)}</progress>
      <p class="progress-count">${parts.join(' · ')}</p>${current}${ended}${source}${gapText}`;
  }

  // One line for a subagent lane's own list.
  function progressLine(facts) {
    if (!facts.available) return `No explicit task list is recorded in this transcript.${facts.unread ? ` ${escape(progressGaps(facts).join(' '))}` : ''}`;
    if (!facts.total) return `The recorded list is empty. ${escape(facts.source)}.`;
    const current = facts.current.length ? ` · Current: ${taskLabel(facts.current[0])}${facts.current.length > 1 ? ` and ${facts.current.length - 1} more` : ''}` : '';
    const gaps = progressGaps(facts);
    return `${countLine(facts)}${current} · ${escape(facts.source)}${gaps.length ? ` · ${escape(gaps.join(' '))}` : ''}`;
  }

  function progressPanel(session, lanes) {
    const facts = progressFacts(session.progress);
    const head = !facts.available ? 'Unavailable' : facts.total ? `${facts.completed} / ${facts.total} COMPLETED` : 'EMPTY LIST';
    const children = lanes.slice(1).filter(lane => !lane.missing);
    const loaded = children.filter(lane => 'progress' in lane);
    let below = '';
    if (loaded.length) below += `<p class="muted">Subagent lists are separate. Each is that subagent's own plan and is not added to the list above.</p>
      <ul class="progress-lanes">${loaded.map(lane => `<li><span aria-hidden="true">↳ </span><b>${escape(laneName(lane))}</b> <span class="lane-id">${escape(String(lane.key).slice(0, 8))}</span><span class="progress-lane-facts">${progressLine(progressFacts(lane.progress))}</span></li>`).join('')}</ul>`;
    const unloaded = children.length - loaded.length;
    if (unloaded) below += `<p class="muted">Task lists of the ${unloaded} subagent ${unloaded === 1 ? 'lane' : 'lanes'} are not loaded in this view. The list above covers the ${lanes[0].role === 'subagent' ? 'followed subagent' : 'main session'} only.</p>`;
    return `<div class="progress-block panel"><div class="context-title"><h2>Task list progress</h2><span>${head}</span></div>
      <p class="muted progress-owner">${lanes[0].role === 'subagent' ? 'Followed subagent' : 'Main session'}</p>
      ${progressBody(facts, session.status)}${below ? `<div class="progress-subagents">${below}</div>` : ''}</div><!-- /progress -->`;
  }

  // File activity footprint (S06). The host builds it from the same retained events the stations count, under one
  // rule: every recorded call counts once at its station; a Files or Edits call either named a file through a
  // recognized structured file tool or it did not. Files station = named read calls + calls naming no file, and
  // the same for Edits. Per file, a call recorded as failed is shown as failed, not as a read or an edit.
  // A footprint belongs to one transcript, so the followed session and each subagent lane are shown apart.
  const HOT_EDITS = 3;
  const footprintTools = 'Read, Edit, Write, MultiEdit, NotebookEdit, read_file, edit_file, write_file, view_image and the file headers of apply_patch';

  function footprintFacts(footprint, events) {
    const listed = Boolean(footprint) && typeof footprint === 'object';
    const whole = value => listed && Number.isInteger(value) && value > 0 ? value : 0;
    const files = (listed && Array.isArray(footprint.files) ? footprint.files : [])
      .filter(file => file && typeof file === 'object' && typeof file.key === 'string' && typeof file.label === 'string')
      .map(file => ({ key: file.key, label: file.label, reads: Number.isInteger(file.reads) && file.reads > 0 ? file.reads : 0, edits: Number.isInteger(file.edits) && file.edits > 0 ? file.edits : 0,
        failed: Number.isInteger(file.failed) && file.failed > 0 ? file.failed : 0, shared: file.shared === true }));
    const uses = new Map();
    for (const file of files) uses.set(file.label, (uses.get(file.label) || 0) + 1);
    for (const file of files) { file.shared = file.shared || uses.get(file.label) > 1; file.hot = file.edits >= HOT_EDITS; }
    const facts = { loaded: listed, files, total: Math.max(whole(footprint?.total), files.length), reads: whole(footprint?.reads), edits: whole(footprint?.edits),
      readCalls: whole(footprint?.readCalls), editCalls: whole(footprint?.editCalls), unnamedReads: whole(footprint?.unnamedReads), unnamedEdits: whole(footprint?.unnamedEdits), failedCalls: whole(footprint?.failedCalls) };
    facts.stationReads = 0;
    facts.stationEdits = 0;
    for (const event of Array.isArray(events) ? events : []) {
      if (event?.kind === 'files') facts.stationReads++;
      else if (event?.kind === 'edits') facts.stationEdits++;
    }
    facts.agrees = facts.readCalls + facts.unnamedReads === facts.stationReads && facts.editCalls + facts.unnamedEdits === facts.stationEdits;
    return facts;
  }

  const footprintHead = facts => `${plural(facts.total, 'file')} · ${plural(facts.reads, 'read')} · ${plural(facts.edits, 'edit')}`;
  const fileLabel = file => `<span class="file-label">${escape(file.label)}</span>${file.shared ? ` <span class="lane-id">${escape(file.key.slice(2, 8))}</span>` : ''}`;

  function footprintBody(facts, dropped) {
    const coverage = `<p class="muted footprint-source">${escape(`Covers recognized structured file tools (${footprintTools}) in the retained history of this transcript. Files touched by shell commands, searches or program text are not seen. A label is at most the last two segments of a path; full paths stay in the extension host.`)}</p>`;
    const outside = dropped ? `<p class="muted footprint-gap" role="status">${escape(`${plural(dropped, 'earlier event')} ${dropped === 1 ? 'is' : 'are'} outside retained history and ${dropped === 1 ? 'is' : 'are'} not counted here.`)}</p>` : '';
    let rule = '';
    if (facts.stationReads || facts.stationEdits) {
      const parts = [];
      if (facts.stationReads) parts.push(`Of its ${plural(facts.stationReads, 'Files call')}, ${facts.readCalls} named one file and ${facts.unnamedReads} named no single file (searches, listings, code calls or a missing path).`);
      if (facts.stationEdits) parts.push(`Of its ${plural(facts.stationEdits, 'Edits call')}, ${facts.editCalls} named a file and ${facts.unnamedEdits} named none.`);
      parts.push('A failed call counts at its station and is listed as failed, not as a read or an edit. A patch that names several files counts once at the station and once for each file.');
      rule = `<p class="muted footprint-rule">${escape(parts.join(' '))}</p>`;
    }
    const mismatch = facts.loaded && !facts.agrees ? '<p class="footprint-gap" role="status">These file counts do not match the station totals for this lane; the two were not taken from the same records.</p>' : '';
    if (!facts.loaded) return `<p class="muted">File activity was not sent for this transcript.</p>${coverage}`;
    if (!facts.files.length) return `<p class="muted">No file paths are recorded in the retained history of this transcript.</p>${rule}${mismatch}${outside}${coverage}`;
    const rows = facts.files.map(file => `<li><button type="button" class="link-button" data-open="file:${escape(file.key)}">${fileLabel(file)}</button><span class="file-counts">${plural(file.reads, 'read')} · ${plural(file.edits, 'edit')}${file.failed ? ` · ${file.failed} failed` : ''}</span>${file.hot ? `<span class="file-hot">EDITED ${HOT_EDITS}+ TIMES</span>` : ''}</li>`).join('');
    const more = facts.total - facts.files.length;
    const shared = facts.files.some(file => file.shared) ? '<p class="muted">Different files with the same short label are told apart by the code after the label.</p>' : '';
    return `<ol class="file-list">${rows}</ol>
      <p class="muted footprint-order">Ranked by recorded edits, then reads.${more > 0 ? ` ${more} more ${more === 1 ? 'file is' : 'files are'} not listed; the totals above include ${more === 1 ? 'it' : 'them'}.` : ''} A file is marked after ${HOT_EDITS} recorded edits.</p>${shared}${rule}${mismatch}${outside}${coverage}`;
  }

  // One line for a subagent lane's own footprint.
  function footprintLine(facts) {
    if (!facts.files.length) return `No file paths are recorded in the retained history of this transcript.${facts.unnamedReads + facts.unnamedEdits ? ` ${plural(facts.unnamedReads + facts.unnamedEdits, 'file tool call')} named no file.` : ''}`;
    const top = facts.files[0];
    const hot = facts.files.filter(file => file.hot).length;
    return `${footprintHead(facts)} · ${top.edits ? 'Most edited' : 'Most read'}: ${fileLabel(top)}${hot ? ` · <span class="file-hot">${plural(hot, 'file')} EDITED ${HOT_EDITS}+ TIMES</span>` : ''}`;
  }

  function footprintPanel(session, lanes) {
    const facts = footprintFacts(session.footprint, session.events);
    const children = lanes.slice(1).filter(lane => !lane.missing);
    const loaded = children.filter(lane => 'footprint' in lane);
    let below = '';
    if (loaded.length) below += `<p class="muted">Subagent lanes are counted apart. A file call belongs to the agent that made it and is not added to the list above.</p>
      <ul class="progress-lanes">${loaded.map(lane => `<li><span aria-hidden="true">↳ </span><b>${escape(laneName(lane))}</b> <span class="lane-id">${escape(String(lane.key).slice(0, 8))}</span><span class="progress-lane-facts">${footprintLine(footprintFacts(lane.footprint, lane.events))}</span></li>`).join('')}</ul>`;
    const unloaded = children.length - loaded.length;
    if (unloaded) below += `<p class="muted">File activity of the ${unloaded} subagent ${unloaded === 1 ? 'lane' : 'lanes'} is not loaded in this view. The list above covers the ${lanes[0].role === 'subagent' ? 'followed subagent' : 'main session'} only; the Files and Edits stations also count the subagent lanes.</p>`;
    return `<div class="footprint-block panel"><div class="context-title"><h2>File activity</h2><span>${facts.files.length ? escape(footprintHead(facts).toUpperCase()) : 'NO FILE PATHS'}</span></div>
      <p class="muted progress-owner">${lanes[0].role === 'subagent' ? 'Followed subagent' : 'Main session'}</p>
      ${footprintBody(facts, session.droppedEvents)}${below ? `<div class="footprint-subagents progress-subagents">${below}</div>` : ''}</div><!-- /footprint -->`;
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
    const lanes = familyLanes(session);
    const events = familyEvents(lanes);
    const scope = familyScope(lanes);
    const summary = summarize(events);
    const age = now - Math.max(session.updatedAt, ...lanes.map(lane => Number.isFinite(lane.updatedAt) ? lane.updatedAt : 0));
    const quiet = age >= 30000;
    const status = options.example ? 'Example session' : session.loading ? 'Loading history' : session.status === 'complete' ? 'Turn complete' : session.status === 'paused' ? 'Paused' : quiet ? 'Quiet' : 'Recent activity';
    const activeKind = !quiet && session.status === 'active' ? summary.last?.kind : null;
    const context = Number.isFinite(session.context) ? Math.min(100, Math.max(0, session.context)) : null;
    const warnings = [...(options.warnings || [])];
    if (session.invalidLines) warnings.push(`${session.invalidLines} malformed records skipped.`);
    if (session.oversizedLines) warnings.push(`${session.oversizedLines} records above the 4 MB line limit skipped.`);
    if (session.droppedEvents) warnings.push(`Showing the latest 10000 events; ${session.droppedEvents} earlier events omitted.`);
    const childGaps = lanes.slice(1).reduce((sum, lane) => ({ invalid: sum.invalid + (lane.invalidLines || 0) + (lane.oversizedLines || 0), omitted: sum.omitted + (lane.omitted || 0) }), { invalid: 0, omitted: 0 });
    if (childGaps.invalid) warnings.push(`${childGaps.invalid} malformed or oversized records skipped in subagent transcripts.`);
    if (childGaps.omitted) warnings.push(`${childGaps.omitted} earlier subagent events omitted; each lane keeps its latest ${session.family?.eventLimit || 2000}.`);
    return `<header class="session-heading">${identityHeading(identity, options.example, options.example ? 'A sample run through explore, edit and verify.' : `Last record ${elapsed(age)} ago`)}
      <span class="status ${!quiet && session.status === 'active' && !options.example ? 'receiving' : ''}"><span aria-hidden="true"></span>${status}</span></header>
      ${warnings.length ? `<aside class="notice" role="status">${warnings.map(escape).join(' ')}</aside>` : ''}
      <div class="workspace-grid"><section class="map-panel panel"><div class="panel-heading"><h2>Where the work went</h2><span>FIXED STATIONS · ${escape(scope.toUpperCase())}</span></div>${map(summary, activeKind)}
        <div class="station-totals">${stations.map(station => `<button type="button" class="${station.kind}" data-open="station:${station.kind}" aria-label="${station.name}: ${plural(summary.counts[station.kind], 'call')}. Show them"><i aria-hidden="true"></i>${station.name}<b>${summary.counts[station.kind]}</b></button>`).join('')}${summary.counts.other ? `<button type="button" class="other" data-open="station:other" aria-label="Other: ${plural(summary.counts.other, 'call')}. Show them">Other<b>${summary.counts.other}</b></button>` : ''}</div></section>
      <section class="detail-panel"><div class="metrics"><div><span>RECORDED CALLS</span><strong>${summary.total}</strong></div><div><span>TOOL ERRORS</span><strong class="${summary.errors ? 'error-number' : ''}">${summary.errors}</strong></div></div>
      <div class="context-block panel"><div class="context-title"><h2>Context window</h2><span>${context === null ? 'Unavailable' : `${session.context}%`}</span></div>
        ${context === null ? '<p class="muted">This source has not reported usage and capacity.</p>' : `<meter min="0" max="100" low="70" high="90" optimum="0" value="${context}" aria-label="Context window usage">${context}%</meter><p class="muted">Reported by the session. Amber at 70%, red at 90%.</p>`}</div>
      ${progressPanel(session, lanes)}
      ${footprintPanel(session, lanes)}
      <div class="recent-panel panel"><div class="panel-heading"><h2>Recent activity</h2><span>SIMILAR EVENTS FOLDED</span></div><ol>${recent(events) || '<li class="muted">No tool activity recorded yet.</li>'}</ol></div>
      <p class="privacy-note">Click a station, a recent item, a lane, a file or a bar for details. Commands, output, messages, model and tokens are read from the transcript only when you ask, and shown only in the details panel.</p></section></div>
      ${lanesPanel(lanes, session.family)}
      <section class="timeline-panel panel"><div class="panel-heading"><h2>Activity over time</h2><span>LAST 30 MINUTES · 30s PER BAR · ${escape(scope.toUpperCase())}</span></div>${timeline(events, now)}
      <div class="timeline-labels"><span>${clock(Math.floor(now / 30000) * 30000 - 59 * 30000)}</span><span>Gaps = silence <i class="legend-error"></i> tool error <i class="legend-marker"></i> turn / compaction</span><span>Now</span></div></section>
      <footer>Counts cover loaded, retained history of the ${escape(scope)}. Stations, totals, lanes and the strip count each call once, in the lane of the agent that made it; starting a subagent counts in the parent's lane. File activity lists files named by recognized structured file tools in retained history, one lane at a time. The strip shows 30 minutes. Quiet means no recent records; it does not prove the agent stopped.</footer>`;
  }

  function demoSession(now = Date.now()) {
    const start = now - 18 * 60000;
    const events = [{ id: 'prompt', time: start, kind: 'prompt', label: 'User prompt', outcome: 'success' }];
    for (let index = 0; index < 76; index++) {
      const kind = index < 26 ? 'files' : index < 48 ? 'edits' : index < 60 ? 'shell' : ['files', 'shell', 'agents', 'network', 'memory'][index % 5];
      const label = { files: `Reading src/${index % 3 ? 'session' : 'extension'}.js`, edits: 'Editing src/session.js', shell: index % 3 ? 'Running tests' : 'Building', network: 'Fetching code.visualstudio.com', agents: 'Working with agents', memory: 'Updating plan' }[kind];
      events.push({ id: `demo-${index}`, time: start + index * 13000 + (index > 42 ? 45000 : 0), kind, label, outcome: index === 52 ? 'error' : 'success' });
    }
    // A made-up family: two overlapping subagents, one of them with a child of its own.
    const calls = (prefix, from, labels, failed = -1) => labels.map((label, index) => ({ id: `${prefix}-${index}`, time: from + index * 20000, kind: /^Read|^Search/.test(label) ? 'files' : /^Edit/.test(label) ? 'edits' : 'shell', label, outcome: index === failed ? 'error' : 'success' }));
    const lane = (key, label, parentKey, depth, from, end, labels, failed) => {
      const laneEvents = calls(key, from + 5000, labels, failed);
      return { key, parentKey, parentKnown: true, depth, role: 'subagent', label, link: 'spawn', start: { time: from, source: 'own' }, end, status: end.time ? 'complete' : 'active', updatedAt: laneEvents.at(-1).time, events: laneEvents, omitted: 0, duplicates: 0, invalidLines: 0, oversizedLines: 0, loading: false, missing: false, unreadable: false };
    };
    const lanes = [
      { key: 'main', parentKey: '', parentKnown: true, depth: 0, role: 'main', label: '', link: '', start: { time: start, source: 'own' }, end: { state: 'open', time: null }, status: 'active', updatedAt: events.at(-1).time, omitted: 0, duplicates: 0, invalidLines: 0, oversizedLines: 0, loading: false, missing: false, unreadable: false },
      lane('demo-explore', 'Explore', 'main', 1, start + 4 * 60000, { state: 'completed', time: start + 9 * 60000 }, ['Searching files', 'Reading src/session.js', 'Reading src/extension.js', 'Reading files']),
      lane('demo-nested', 'Checker', 'demo-explore', 2, start + 6 * 60000, { state: 'failed', time: start + 7 * 60000 }, ['Running tests', 'Running tests'], 1),
      lane('demo-tests', 'Test runner', 'main', 1, start + 7 * 60000, { state: 'open', time: null }, ['Reading files', 'Running tests', 'Editing test/session.test.js', 'Running tests'])
    ];
    // Made-up task lists: one for the main session, one for a subagent, kept apart.
    const list = (source, updatedAt, rows) => ({ source, items: rows.map(([status, label], index) => ({ id: String(index + 1), status, label })), omitted: 0, unread: 0, unmatched: 0, unreadable: 0, updatedAt });
    const progress = list('claude-tasks', start + 14 * 60000, [['completed', 'Read the session reader'], ['completed', 'Add the example fixture'], ['in_progress', 'Run the test suite'], ['pending', 'Update the notes'], ['pending', 'Package the extension']]);
    // Made-up file activity, counted from the made-up events above under the same rule as the stations.
    const footprint = laneEvents => {
      const files = new Map();
      const totals = { reads: 0, edits: 0, readCalls: 0, editCalls: 0, unnamedReads: 0, unnamedEdits: 0, failedCalls: 0 };
      for (const event of laneEvents) {
        if (event.kind !== 'files' && event.kind !== 'edits') continue;
        const reading = event.kind === 'files';
        const name = event.label.split(' ')[1];
        if (!name || !name.includes('.')) { totals[reading ? 'unnamedReads' : 'unnamedEdits']++; continue; }
        totals[reading ? 'readCalls' : 'editCalls']++;
        const entry = files.get(name) || { key: `f:demo${String(files.size).padStart(16, '0')}`, label: name, reads: 0, edits: 0, failed: 0, shared: false, events: [] };
        files.set(name, entry);
        entry.events.push(event.id);
        if (event.outcome === 'error') { entry.failed++; totals.failedCalls++; }
        else { entry[reading ? 'reads' : 'edits']++; totals[reading ? 'reads' : 'edits']++; }
      }
      const ranked = [...files.values()].sort((a, b) => b.edits - a.edits || b.reads - a.reads || a.label.localeCompare(b.label));
      return { files: ranked, total: ranked.length, ...totals, limit: 12 };
    };
    for (const row of lanes.slice(1)) row.footprint = footprint(row.events);
    lanes[1].progress = list('claude-todos', start + 8 * 60000, [['completed', 'Find the readers'], ['completed', 'Summarise the call sites']]);
    lanes[2].progress = null;
    lanes[3].progress = null;
    return { provider: 'claude', id: 'example-session', project: 'AgentViz', parent: null, events, updatedAt: events.at(-1).time, startedAt: start, status: 'active', context: 66, progress, footprint: footprint(events), invalidLines: 0, oversizedLines: 0, droppedEvents: 0,
      family: { lanes, found: 3, limit: 24, eventLimit: 2000, notes: [] } };
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

  const api = { summarize, activityBuckets, render, recentGroups, eventsFor, kinds, demoSession, progressFacts, footprintFacts, familyLanes, familyEvents, laneCounts, laneFacts, laneAxis, demoCatalogue, demoIdentity, filterSessions, navigate, workspaceChoices, idLabels, sessionLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AgentViz = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
