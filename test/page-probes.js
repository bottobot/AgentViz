'use strict';
// S09: measurements taken inside a rendered page. Each function is self-contained: it is turned into text and
// evaluated in the page (a real browser, or the real VS Code webview), so it may use nothing from this file.
// They read only what the page shows; with the synthetic fixtures every string they return is synthetic.

// WCAG 2 contrast of every visible piece of text against the background painted behind it.
// Colours are resolved by painting them on a canvas, so any CSS colour syntax is measured, not parsed.
// Not measured: text in disabled controls and aria-hidden decoration (both counted), and anything painted
// over an image or gradient (the stylesheet has none).
function contrastReport() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const pen = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = colour => {
    pen.clearRect(0, 0, 1, 1);
    pen.fillStyle = '#000';
    pen.fillStyle = colour;
    pen.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const luminance = c => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  // The page's own canvas: the root background, or white when none is painted.
  const backgroundOf = element => {
    const layers = [];
    for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
      const colour = rgba(getComputedStyle(node).backgroundColor);
      if (colour.a > 0) { layers.push(colour); if (colour.a === 1) break; }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };
  const opacityOf = element => { let value = 1; for (let node = element; node && node.nodeType === 1; node = node.parentElement) value *= Number(getComputedStyle(node).opacity); return value; };
  const visible = element => {
    if (!element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  };
  const where = element => { const names = []; for (let node = element; node && node.nodeType === 1 && names.length < 3; node = node.parentElement) names.unshift(node.id ? `#${node.id}` : node.classList && node.classList.length ? `.${[...node.classList].join('.')}` : node.tagName.toLowerCase()); return names.join(' > '); };
  const seen = new Map();
  let measured = 0, disabled = 0, decorative = 0, lowest = Infinity;
  const measure = (element, colour, sample, kind) => {
    const style = getComputedStyle(element);
    const background = backgroundOf(element);
    const ink = rgba(colour);
    const foreground = over({ ...ink, a: ink.a * opacityOf(element) }, background);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const value = ratio(foreground, background);
    measured++;
    lowest = Math.min(lowest, value);
    if (value >= (large ? 3 : 4.5)) return;
    const key = `${where(element)}|${hex(foreground)}|${hex(background)}`;
    if (!seen.has(key)) seen.set(key, { where: where(element), kind, ratio: Math.round(value * 100) / 100, needs: large ? 3 : 4.5, text: hex(foreground), background: hex(background), size: Math.round(size * 10) / 10, sample: String(sample).trim().slice(0, 40) });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim()) continue;
    const element = node.parentElement;
    if (!element || !visible(element) || element.closest('script, style, option, title')) continue;
    if (element.closest('[aria-hidden="true"]')) { decorative++; continue; }
    if (element.closest(':disabled')) { disabled++; continue; }
    const svg = element instanceof SVGElement;
    measure(element, svg ? getComputedStyle(element).fill : getComputedStyle(element).color, node.nodeValue, svg ? 'svg text' : 'text');
  }
  for (const control of document.querySelectorAll('select, input')) {
    if (!visible(control)) continue;
    if (control.disabled) { disabled++; continue; }
    if (control.tagName === 'INPUT' && !control.value && control.placeholder) measure(control, getComputedStyle(control, '::placeholder').color, control.placeholder, 'placeholder');
    else measure(control, getComputedStyle(control).color, control.tagName === 'SELECT' ? (control.selectedOptions[0] || {}).textContent || '' : control.value, 'control text');
  }
  return { measured, disabled, decorative, lowest: lowest === Infinity ? null : Math.round(lowest * 100) / 100, failures: [...seen.values()].sort((a, b) => a.ratio - b.ratio) };
}

// The focus indicator of the element that has focus now: its outline, and the outline's contrast against the
// background around the element (WCAG 1.4.11 asks 3:1 for the indicator).
function focusReport() {
  const element = document.activeElement;
  if (!element || element === document.body) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const pen = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = colour => { pen.clearRect(0, 0, 1, 1); pen.fillStyle = '#000'; pen.fillStyle = colour; pen.fillRect(0, 0, 1, 1); const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
  const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const luminance = c => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  let background = { r: 255, g: 255, b: 255, a: 1 };
  for (let node = element.parentElement; node; node = node.parentElement) { const colour = rgba(getComputedStyle(node).backgroundColor); if (colour.a === 1) { background = colour; break; } }
  const style = getComputedStyle(element);
  const ring = rgba(style.outlineColor);
  const x = luminance(ring), y = luminance(background);
  const box = element.getBoundingClientRect();
  // The width is also given in device pixels: a zoomed or scaled window snaps a 2px outline to whole device pixels.
  return { id: element.id, outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) || 0, devicePixels: Math.round((parseFloat(style.outlineWidth) || 0) * window.devicePixelRatio * 100) / 100, ratio: Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100,
    inView: box.width > 0 && box.left >= 0 && box.right <= window.innerWidth + 0.5 };
}

// Accessible names worked out from the page: a label element, aria-label, or the control's own text. Also the
// landmarks, live regions and named images, so a missing name shows up as an empty string.
function nameReport() {
  const nameOf = element => ((element.labels && element.labels[0] && element.labels[0].textContent) || element.getAttribute('aria-label') || (element.tagName === 'BUTTON' ? element.textContent : '') || '').trim();
  const shown = element => element.getClientRects().length > 0;
  return {
    controls: [...document.querySelectorAll('button, select, input, a[href]')].filter(shown).map(element => ({ id: element.id, tag: element.tagName.toLowerCase(), name: nameOf(element) })),
    landmarks: [...document.querySelectorAll('nav, main, [role="search"], section[aria-label]')].filter(shown).map(element => ({ tag: element.tagName.toLowerCase(), name: (element.getAttribute('aria-label') || '').trim() })),
    images: [...document.querySelectorAll('svg[role="img"], meter, progress')].filter(shown).map(element => (element.getAttribute('aria-label') || '').trim().slice(0, 60)),
    unnamedGraphics: [...document.querySelectorAll('svg:not([role="img"]):not([aria-hidden="true"])')].filter(shown).length,
    live: [...document.querySelectorAll('[role="status"][aria-live]')].map(element => element.id),
    lang: document.documentElement.lang, title: document.title,
    headings: [...document.querySelectorAll('h1, h2')].filter(shown).map(element => element.tagName.toLowerCase())
  };
}

// What the finder, the followed-session bar and the activity area show right now.
function viewState() {
  const text = id => { const node = document.getElementById(id); return node ? node.textContent : null; };
  const options = id => [...document.getElementById(id).options].map(option => ({ value: option.value, text: option.textContent }));
  const pick = selector => { const node = document.querySelector(selector); return node ? node.textContent.trim() : null; };
  const all = selector => [...document.querySelectorAll(selector)].map(node => node.textContent.trim());
  const picker = document.getElementById('session');
  return {
    sessions: options('session'), sessionValue: picker.value, sessionDisabled: picker.disabled, workspaces: options('workspace'), workspaceValue: document.getElementById('workspace').value,
    nameFilter: document.getElementById('name-filter').value, idFilter: document.getElementById('id-filter').value, clearDisabled: document.getElementById('clear-filters').disabled,
    matches: text('matches'), barHidden: document.getElementById('selection').hidden, barWorkspace: text('selected-workspace'), barName: text('selected-name'), barId: text('selected-id'),
    barProvider: text('selected-provider'), barNote: text('selection-note'), copyStatus: text('copy-status'), connection: text('connection'),
    exampleButton: text('example'), examplePressed: document.getElementById('example').getAttribute('aria-pressed'),
    eyebrow: pick('#content .eyebrow'), heading: pick('#content h1'), headingId: pick('#content .session-id'), caption: pick('#content .session-caption'), status: pick('#content .status'),
    notices: all('#content .notice'), laneNotes: all('#content .lane-note'), lanes: all('#content .lane .lane-name b'), panelScopes: all('#content .panel-heading > span'),
    calls: pick('#content .metrics strong'), bodyClass: document.body.className, focus: document.activeElement ? document.activeElement.id : ''
  };
}

// Layout facts for one viewport width: no sideways scroll, and every control inside the viewport.
function layoutReport() {
  const outside = [];
  for (const element of document.querySelectorAll('button, select, input, #selected-id, #content h1, #content .panel')) {
    if (!element.getClientRects().length) continue;
    const box = element.getBoundingClientRect();
    if (box.left < -0.5 || box.right > window.innerWidth + 0.5 || box.width < 24) outside.push(`${element.id || element.className || element.tagName}: ${Math.round(box.left)}..${Math.round(box.right)}`);
  }
  return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, outside };
}

const call = probe => `(${probe.toString()})()`;
module.exports = { contrastReport, focusReport, nameReport, viewState, layoutReport, call };
