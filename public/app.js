// ═══════════════════════════════════════════════════════════════════════
// API — all communication with the server lives here
// ═══════════════════════════════════════════════════════════════════════

const API = {
    async getGames() {
        const res = await fetch('/api/games');
        return res.json();
    },

    async getTeams() {
        const res = await fetch ('/api/teams');
        return res.json();
    },

    async getTeamStats(name) {
        const res = await fetch(`/api/teams/${encodeURIComponent(name)}/stats`);
        return res.json();
    },

    async saveGame(game) {
        const res = await fetch('/api/games', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(game)
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Server error');
        }
        return res.json();
    },

    async deleteGame(id) {
        const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Server error');
        }
        return res.json();
    }
};

// ═══════════════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════════════

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.page).classList.add('active');
    if (tab.dataset.page === 'teams')   await renderTeams();
    if (tab.dataset.page === 'trends')  await renderTrendPage();
    if (tab.dataset.page === 'compare') await renderComparePage();
    if (tab.dataset.page === 'games')   await renderGames();
    if (tab.dataset.page === 'tagger')  addDefaultRows();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function pct(n)  { return Math.round(n); }
function dp1(n)  { return Math.round(n * 10) / 10; }

function avg(arr, key) {
  const vals = arr.map(x => x[key]).filter(v => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function scrumPct(arr) {
  const tot = arr.reduce((s, x) => s + x.scrum_total, 0);
  const won = arr.reduce((s, x) => s + x.scrum_won, 0);
  return tot ? won / tot * 100 : 0;
}

function loPct(arr) {
  const tot = arr.reduce((s, x) => s + x.lo_total, 0);
  const won = arr.reduce((s, x) => s + x.lo_won, 0);
  return tot ? won / tot * 100 : 0;
}

async function updateTeamDatalist() {
  const teams = await API.getTeams();
  ['a', 'b'].forEach(s => {
    const dl = document.getElementById('team-list-' + s);
    if (dl) dl.innerHTML = teams.map(t => `<option value="${t}">`).join('');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// EXCEL PARSER
// ═══════════════════════════════════════════════════════════════════════

function findByLabel(sheet, labelCol, valCol, labelText, range = 60) {
  for (let r = 0; r < range; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: labelCol });
    const cell = sheet[addr];
    if (cell && typeof cell.v === 'string' && cell.v.trim().toLowerCase() === labelText.toLowerCase()) {
      const valAddr = XLSX.utils.encode_cell({ r, c: valCol });
      return sheet[valAddr] ? sheet[valAddr].v : null;
    }
  }
  return null;
}

function asNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v > 0 && v < 1 ? Math.round(v * 24 * 60 * 10) / 10 : v;
  if (typeof v === 'string') return parseFloat(v.replace(/[^0-9.]/g, '')) || 0;
  return 0;
}

function asPct(v) {
  if (typeof v === 'number' && v <= 1 && v >= 0) return Math.round(v * 100);
  if (typeof v === 'number') return Math.round(v);
  return 0;
}

function parseExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const cover = wb.Sheets['Cover'];
  if (!cover) throw new Error('No "Cover" sheet found');

  const titleCell = cover[XLSX.utils.encode_cell({ r: 1, c: 1 })];
  const rawTitle = titleCell ? titleCell.v : '';
  let round = '', teamA = '', teamB = '', scoreA = 0, scoreB = 0;
  const m = rawTitle.match(/^(R\d+)\s*[-–]\s*(.+?)\s+(\d+)-(\d+)\s+(.+)$/i);
  if (m) { round = m[1]; teamA = m[2].trim(); scoreA = parseInt(m[3]); scoreB = parseInt(m[4]); teamB = m[5].trim(); }

  const cA = (label) => findByLabel(cover, 6, 5, label, 40);
  const cB = (label) => findByLabel(cover, 6, 8, label, 40);

  const atk = wb.Sheets['Attacks'];
  const scr = wb.Sheets['Scrums'];
  const lo  = wb.Sheets['Lineout Results'];
  const tov = wb.Sheets['Turnovers'];
  const pen = wb.Sheets['Penalties Conceded'];

  const scrumWonA  = scr ? asNum(findByLabel(scr, 7, 8,  'Scrums Won',  40)) : 0;
  const scrumWonB  = scr ? asNum(findByLabel(scr, 7, 13, 'Scrums Won',  40)) : 0;
  const scrumLostA = scr ? asNum(findByLabel(scr, 7, 8,  'Scrums Lost', 40)) : 0;
  const scrumLostB = scr ? asNum(findByLabel(scr, 7, 13, 'Scrums Lost', 40)) : 0;
  const loWonA     = lo  ? asNum(findByLabel(lo,  3, 4,  'Lineouts Won',  25)) : 0;
  const loWonB     = lo  ? asNum(findByLabel(lo,  3, 28, 'Lineouts Won',  25)) : 0;
  const loLostA    = lo  ? asNum(findByLabel(lo,  3, 4,  'Lineouts Lost', 25)) : 0;
  const loLostB    = lo  ? asNum(findByLabel(lo,  3, 28, 'Lineouts Lost', 25)) : 0;

  return {
    round, date: '', teamA, teamB, scoreA, scoreB,
    a: {
      possession:  asPct(cA('Possession (%)')),
      territory:   asPct(cA('Territory')),
      time22:      asNum(cA("Time in Opp's 22m")),
      attacks:     atk ? asNum(findByLabel(atk, 6, 5, 'Total Attacks', 30)) : 0,
      entries22:   atk ? asNum(findByLabel(atk, 6, 5, 'No. 22m Entries', 20)) : 0,
      gainline:    asPct(cA('Gainline %')),
      kicksInPlay: asNum(cA('Kicks in Play')),
      fastBall:    asPct(cA('Fast Ball %')),
      scrumWon:    scrumWonA, scrumTotal: scrumWonA + scrumLostA,
      loWon:       loWonA,    loTotal:    loWonA + loLostA,
      toWon:       tov ? asNum(findByLabel(tov, 11, 9,  'Turnovers Won',      25)) : asNum(cA('Turnovers Won')),
      toConc:      tov ? asNum(findByLabel(tov, 11, 9,  'Turnovers Conceded', 25)) : asNum(cA('Turnovers Conceded')),
      breakdowns:  asNum(cA('Breakdowns Won')),
      penConc:     pen ? asNum(findByLabel(pen, 11, 9,  'Penalties Conceded', 40)) : asNum(cA('Penalties Conceded')),
      tries:       asNum(cA('Tries Scored')),
      conversions: String(cA('Conversions Kicks') || ''),
      penKicked:   String(cA('Penalty Kicks') || ''),
      yellowCards: asNum(cA('Yellow Cards')),
    },
    b: {
      possession:  asPct(cB('Possession (%)')),
      territory:   asPct(cB('Territory')),
      time22:      asNum(cB("Time in Opp's 22m")),
      attacks:     atk ? asNum(findByLabel(atk, 6, 8, 'Total Attacks', 30)) : 0,
      entries22:   atk ? asNum(findByLabel(atk, 6, 8, 'No. 22m Entries', 20)) : 0,
      gainline:    asPct(cB('Gainline %')),
      kicksInPlay: asNum(cB('Kicks in Play')),
      fastBall:    asPct(cB('Fast Ball %')),
      scrumWon:    scrumWonB, scrumTotal: scrumWonB + scrumLostB,
      loWon:       loWonB,    loTotal:    loWonB + loLostB,
      toWon:       tov ? asNum(findByLabel(tov, 11, 13, 'Turnovers Won',      25)) : asNum(cB('Turnovers Won')),
      toConc:      tov ? asNum(findByLabel(tov, 11, 13, 'Turnovers Conceded', 25)) : asNum(cB('Turnovers Conceded')),
      breakdowns:  asNum(cB('Breakdowns Won')),
      penConc:     pen ? asNum(findByLabel(pen, 11, 13, 'Penalties Conceded', 40)) : asNum(cB('Penalties Conceded')),
      tries:       asNum(cB('Tries Scored')),
      conversions: String(cB('Conversions Kicks') || ''),
      penKicked:   String(cB('Penalty Kicks') || ''),
      yellowCards: asNum(cB('Yellow Cards')),
    }
  };
}

// ── Drop zone ──────────────────────────────────────────────────────────
const dropZone  = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click',      () => fileInput.click());
dropZone.addEventListener('dragover',   e  => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave',  ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',       e  => { e.preventDefault(); dropZone.classList.remove('drag-over'); processFiles([...e.dataTransfer.files]); });
fileInput.addEventListener('change',    e  => processFiles([...e.target.files]));

function processFiles(files) {
  const valid = files.filter(f => f.name.match(/\.xlsx?$/i));
  if (!valid.length) { toast('No .xlsx files found', 'error'); return; }
  valid.forEach(processFile);
}

function processFile(file) {
  const listEl = document.getElementById('file-list');
  const item = document.createElement('div');
  item.className = 'file-item';
  item.innerHTML = `<div><div class="file-item-name">${file.name}</div><div class="file-item-status">Reading…</div></div><div>⏳</div>`;
  listEl.appendChild(item);

  const reader = new FileReader();
  reader.onload = async (e) => {
  try {
    const game = parseExcel(e.target.result);
    const result = await API.saveGame(game);
    item.querySelector('.file-item-status').innerHTML =
      `<span class="file-item-ok">✓ Imported</span> &nbsp; ${game.round ? game.round + ' · ' : ''}${game.teamA} ${game.scoreA}–${game.scoreB} ${game.teamB}`;
    item.querySelector('div:last-child').textContent = '✅';
    updateTeamDatalist();
    showImportSummary(game);
  } catch (err) {
    console.error('Import error:', err);
    item.querySelector('.file-item-status').innerHTML = `<span class="file-item-err">Error: ${err.message}</span>`;
    item.querySelector('div:last-child').textContent = '❌';
  }
};
  reader.readAsArrayBuffer(file);
}

function showImportSummary(game) {
  document.getElementById('import-preview-area').innerHTML = `
  <div class="import-preview" style="margin-top:16px">
    <h4>Last imported: ${game.round ? game.round + ' — ' : ''}${game.teamA} ${game.scoreA}–${game.scoreB} ${game.teamB}</h4>
    <div class="import-fields">
      <div class="import-field"><span>Possession: </span>${game.a.possession}% / ${game.b.possession}%</div>
      <div class="import-field"><span>Territory: </span>${game.a.territory}% / ${game.b.territory}%</div>
      <div class="import-field"><span>Tries: </span>${game.a.tries} / ${game.b.tries}</div>
      <div class="import-field"><span>Gainline: </span>${game.a.gainline}% / ${game.b.gainline}%</div>
      <div class="import-field"><span>Scrum: </span>${game.a.scrumWon}/${game.a.scrumTotal} vs ${game.b.scrumWon}/${game.b.scrumTotal}</div>
      <div class="import-field"><span>Lineout: </span>${game.a.loWon}/${game.a.loTotal} vs ${game.b.loWon}/${game.b.loTotal}</div>
      <div class="import-field"><span>Turnovers won: </span>${game.a.toWon} / ${game.b.toWon}</div>
      <div class="import-field"><span>Penalties: </span>${game.a.penConc} / ${game.b.penConc}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// MANUAL ENTRY
// ═══════════════════════════════════════════════════════════════════════

document.getElementById('save-btn').addEventListener('click', saveManual);
document.getElementById('clear-btn').addEventListener('click', () => {
  document.querySelectorAll('#page-entry input').forEach(i => i.value = '');
});

async function saveManual() {
  const g = id => document.getElementById(id).value;
  const n = id => parseFloat(document.getElementById(id).value) || 0;
  const teamA = g('in-team-a').trim();
  const teamB = g('in-team-b').trim();
  if (!teamA || !teamB) { toast('Enter both team names', 'error'); return; }

  const game = {
    round: g('in-round'), date: g('in-date'), teamA, teamB,
    scoreA: n('in-score-a'), scoreB: n('in-score-b'),
    a: {
      possession: n('in-poss-a'), territory: n('in-terr-a'), time22: n('in-22-a'),
      attacks: n('in-att-a'), entries22: n('in-ent-a'), gainline: n('in-gain-a'),
      kicksInPlay: n('in-kicks-a'), fastBall: n('in-fast-a'),
      scrumWon: n('in-scrum-won-a'), scrumTotal: n('in-scrum-tot-a'),
      loWon: n('in-lo-won-a'), loTotal: n('in-lo-tot-a'),
      toWon: n('in-to-won-a'), toConc: n('in-to-conc-a'),
      breakdowns: n('in-bd-a'), penConc: n('in-pen-a'),
      tries: n('in-tries-a'), conversions: g('in-conv-a'),
      penKicked: g('in-pgk-a'), yellowCards: n('in-yc-a'),
    },
    b: {
      possession: n('in-poss-b'), territory: n('in-terr-b'), time22: n('in-22-b'),
      attacks: n('in-att-b'), entries22: n('in-ent-b'), gainline: n('in-gain-b'),
      kicksInPlay: n('in-kicks-b'), fastBall: n('in-fast-b'),
      scrumWon: n('in-scrum-won-b'), scrumTotal: n('in-scrum-tot-b'),
      loWon: n('in-lo-won-b'), loTotal: n('in-lo-tot-b'),
      toWon: n('in-to-won-b'), toConc: n('in-to-conc-b'),
      breakdowns: n('in-bd-b'), penConc: n('in-pen-b'),
      tries: n('in-tries-b'), conversions: g('in-conv-b'),
      penKicked: g('in-pgk-b'), yellowCards: n('in-yc-b'),
    }
  };

  const result = await API.saveGame(game);
  if (result.error) { toast(result.error, 'error'); return; }
  toast('Game saved!');
  updateTeamDatalist();
  const msg = document.getElementById('save-msg');
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 2500);
}

// ═══════════════════════════════════════════════════════════════════════
// GAME LOG
// ═══════════════════════════════════════════════════════════════════════

document.getElementById('clear-all-btn').addEventListener('click', async () => {
  if (!confirm('Delete ALL game data? This cannot be undone.')) return;
  const games = await API.getGames();
  await Promise.all(games.map(g => API.deleteGame(g.id)));
  toast('All data cleared');
  renderGames();
});

async function renderGames() {
  const games = await API.getGames();
  if (!games.length) {
    document.getElementById('games-content').innerHTML = '<div class="empty"><div class="empty-icon">📋</div>No games yet.</div>';
    return;
  }
  const rows = [...games].reverse().map(g => `
  <tr>
    <td><strong>${g.round || '–'}</strong></td>
    <td>${g.date || '–'}</td>
    <td><strong>${g.team_a}</strong></td>
    <td style="text-align:center;font-size:16px;font-weight:700">${g.score_a}–${g.score_b}</td>
    <td><strong>${g.team_b}</strong></td>
    <td style="text-align:center">${pct(g.a_tries)} / ${pct(g.b_tries)}</td>
    <td style="text-align:center">${pct(g.a_possession)}% / ${pct(g.b_possession)}%</td>
    <td style="text-align:center">${g.a_toWon} / ${g.b_toWon}</td>
    <td><a href="/api/games/${g.id}/export" class="btn btn-secondary" style="font-size:12px;padding:5px 10px;text-decoration:none">↓ Excel</a></td>
    <td><button class="btn btn-danger" data-id="${g.id}">Delete</button></td>
  </tr>`).join('');

  document.getElementById('games-content').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Round</th><th>Date</th><th>Home</th>
        <th style="text-align:center">Score</th><th>Away</th>
        <th style="text-align:center">Tries H/A</th>
        <th style="text-align:center">Possession H/A</th>
        <th style="text-align:center">TOs Won H/A</th>
        <th>Export</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

  document.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this game?')) return;
      await API.deleteGame(btn.dataset.id);
      renderGames();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════

async function renderTeams() {
  const teams = await API.getTeams();
  console.log('Teams:', teams);
  if (!teams.length) {
    document.getElementById('teams-content').innerHTML = '<div class="empty"><div class="empty-icon">🏉</div>No games yet.</div>';
    return;
  }
  let html = '';
  for (const team of teams) {
    const tg = await API.getTeamStats(team);
    console.log('Stats for', team, ':', tg);
    const wins = tg.filter(x => (x.team === x.team_a ? x.score_a > x.score_b : x.score_b > x.score_a)).length;
    html += `
    <div class="card mb-20">
      <div class="flex-between mb-16">
        <div>
          <h3 style="font-size:17px">${team}</h3>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">${tg.length} game${tg.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${wins}W ${tg.length - wins}L</div>
        </div>
        <span class="badge badge-${wins / tg.length >= 0.6 ? 'green' : 'blue'}">${pct(wins / tg.length * 100)}% win rate</span>
      </div>
      <div class="grid-5">
        <div class="metric"><div class="metric-label">Avg Possession</div><div class="metric-value">${pct(avg(tg, 'possession'))}%</div></div>
        <div class="metric"><div class="metric-label">Avg Territory</div><div class="metric-value">${pct(avg(tg, 'territory'))}%</div></div>
        <div class="metric"><div class="metric-label">Gainline %</div><div class="metric-value">${pct(avg(tg, 'gainline'))}%</div></div>
        <div class="metric"><div class="metric-label">Scrum Win %</div><div class="metric-value">${pct(scrumPct(tg))}%</div></div>
        <div class="metric"><div class="metric-label">Lineout Win %</div><div class="metric-value">${pct(loPct(tg))}%</div></div>
        <div class="metric"><div class="metric-label">Turnovers Won</div><div class="metric-value">${dp1(avg(tg, 'to_won'))}</div></div>
        <div class="metric"><div class="metric-label">Turnovers Conceded</div><div class="metric-value">${dp1(avg(tg, 'to_conceded'))}</div></div>
        <div class="metric"><div class="metric-label">Penalties Conceded</div><div class="metric-value">${dp1(avg(tg, 'pen_conceded'))}</div></div>
        <div class="metric"><div class="metric-label">Avg Tries</div><div class="metric-value">${dp1(avg(tg, 'tries'))}</div></div>
        <div class="metric"><div class="metric-label">Fast Ball %</div><div class="metric-value">${pct(avg(tg, 'fast_ball'))}%</div></div>
      </div>
    </div>`;
  }
  document.getElementById('teams-content').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// TRENDS
// ═══════════════════════════════════════════════════════════════════════

let trendCharts = {};

async function renderTrendPage() {
  const teams = await API.getTeams();
  const sel = document.getElementById('trend-team-select');
  const cur = sel.value;
  sel.innerHTML = teams.map(t => `<option value="${t}" ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
  if (!teams.length) sel.innerHTML = '<option>No teams yet</option>';
  else renderTrends();
}

document.getElementById('trend-team-select').addEventListener('change', renderTrends);

async function renderTrends() {
  Object.values(trendCharts).forEach(c => c.destroy());
  trendCharts = {};
  const team = document.getElementById('trend-team-select').value;
  if (!team) return;
  const tg = await API.getTeamStats(team);
  if (!tg.length) { document.getElementById('trends-content').innerHTML = '<div class="empty">No games for this team.</div>'; return; }

  const labels = tg.map(x => x.round || x.date || 'Game');

  document.getElementById('trends-content').innerHTML = `
  <div class="grid-2" style="gap:16px">
    <div class="card"><div class="card-title">Possession & Territory (%)</div><div class="chart-container chart-h200"><canvas id="tc-poss"></canvas></div></div>
    <div class="card"><div class="card-title">Tries Scored</div><div class="chart-container chart-h200"><canvas id="tc-tries"></canvas></div></div>
    <div class="card"><div class="card-title">Gainline %</div><div class="chart-container chart-h200"><canvas id="tc-gain"></canvas></div></div>
    <div class="card"><div class="card-title">Set Piece Win %</div><div class="chart-container chart-h200"><canvas id="tc-set"></canvas></div></div>
    <div class="card"><div class="card-title">Turnovers Won vs Conceded</div><div class="chart-container chart-h200"><canvas id="tc-to"></canvas></div></div>
    <div class="card"><div class="card-title">Penalties Conceded</div><div class="chart-container chart-h200"><canvas id="tc-pen"></canvas></div></div>
  </div>`;

  const mk = (id, datasets, opts = {}) => {
    trendCharts[id] = new Chart(document.getElementById(id), {
      type: opts.type || 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: { x: { ticks: { font: { size: 11 } } }, y: { ticks: { font: { size: 11 } }, beginAtZero: opts.beginAtZero ?? true, max: opts.max } },
        elements: { point: { radius: 4 }, line: { tension: 0.3 } }
      }
    });
  };

  mk('tc-poss', [
    { label: 'Possession %', data: tg.map(x => x.possession), borderColor: '#1d6b4a', backgroundColor: 'rgba(29,107,74,0.1)', fill: true },
    { label: 'Territory %',  data: tg.map(x => x.territory),  borderColor: '#2563a8', backgroundColor: 'rgba(37,99,168,0.1)',  fill: true },
  ], { max: 100 });
  mk('tc-tries', [{ label: 'Tries', data: tg.map(x => x.tries), borderColor: '#1d6b4a', backgroundColor: 'rgba(29,107,74,0.15)', fill: true }], { type: 'bar' });
  mk('tc-gain',  [{ label: 'Gainline %', data: tg.map(x => x.gainline), borderColor: '#c2410c', backgroundColor: 'rgba(194,65,12,0.1)', fill: true }], { max: 100 });
  mk('tc-set', [
    { label: 'Scrum %',   data: tg.map(x => x.scrum_total  ? Math.round(x.scrum_won / x.scrum_total * 100) : 0), borderColor: '#7c3aed', fill: false },
    { label: 'Lineout %', data: tg.map(x => x.lo_total ? Math.round(x.lo_won    / x.lo_total    * 100) : 0), borderColor: '#0891b2', fill: false },
  ], { max: 100 });
  mk('tc-to', [
    { label: 'Won',      data: tg.map(x => x.to_won),      borderColor: '#1d6b4a', backgroundColor: 'rgba(29,107,74,0.2)',  fill: true },
    { label: 'Conceded', data: tg.map(x => x.to_conceded), borderColor: '#c2410c', backgroundColor: 'rgba(194,65,12,0.2)', fill: true },
  ]);
  mk('tc-pen', [{ label: 'Penalties', data: tg.map(x => x.pen_conceded), borderColor: '#c2410c', backgroundColor: 'rgba(194,65,12,0.15)', fill: true }], { type: 'bar' });
}

// ═══════════════════════════════════════════════════════════════════════
// COMPARE
// ═══════════════════════════════════════════════════════════════════════

let cmpCharts = {};

async function renderComparePage() {
  const teams = await API.getTeams();
  ['cmp-a', 'cmp-b'].forEach(id => {
    const sel = document.getElementById(id);
    const cur = sel.value;
    sel.innerHTML = '<option value="">Select…</option>' + teams.map(t => `<option value="${t}" ${t === cur ? 'selected' : ''}>${t}</option>`).join('');
  });
  renderCompare();
}

document.getElementById('cmp-a').addEventListener('change', renderCompare);
document.getElementById('cmp-b').addEventListener('change', renderCompare);

async function renderCompare() {
  Object.values(cmpCharts).forEach(c => c.destroy());
  cmpCharts = {};
  const ta = document.getElementById('cmp-a').value;
  const tb = document.getElementById('cmp-b').value;
  if (!ta || !tb || ta === tb) {
    document.getElementById('compare-content').innerHTML = '<div class="empty">Select two different teams.</div>';
    return;
  }
  const [a, b] = await Promise.all([API.getTeamStats(ta), API.getTeamStats(tb)]);
  if (!a.length || !b.length) {
    document.getElementById('compare-content').innerHTML = '<div class="empty">Not enough data for one or both teams.</div>';
    return;
  }

  function vsRow(label, aVal, bVal, higherBetter = true, suffix = '') {
    const total = aVal + bVal || 1;
    const ap = aVal / total * 100;
    const bp = bVal / total * 100;
    const aWin = higherBetter ? aVal >= bVal : aVal <= bVal;
    return `<div class="vs-row">
      <span class="vs-label">${label}</span>
      <span class="vs-val" style="color:${aWin ? 'var(--accent)' : 'var(--warn)'}">${dp1(aVal)}${suffix}</span>
      <div class="vs-bars"><div class="vs-bar-a" style="width:${ap.toFixed(1)}%"></div><div class="vs-bar-b" style="width:${bp.toFixed(1)}%"></div></div>
      <span class="vs-val-r" style="color:${!aWin ? 'var(--accent)' : 'var(--warn)'}">${dp1(bVal)}${suffix}</span>
    </div>`;
  }

  document.getElementById('compare-content').innerHTML = `
  <div class="flex-between mb-20">
    <div style="display:flex;align-items:center;gap:10px"><div style="width:13px;height:13px;border-radius:50%;background:#1d6b4a"></div><strong>${ta}</strong> (${a.length} game${a.length !== 1 ? 's' : ''})</div>
    <div style="display:flex;align-items:center;gap:10px"><strong>${tb}</strong> (${b.length} game${b.length !== 1 ? 's' : ''})<div style="width:13px;height:13px;border-radius:50%;background:#2563a8"></div></div>
  </div>
  <div class="grid-2" style="gap:16px;margin-bottom:16px">
    <div class="card">
      <div class="card-title">Possession & Territory</div>
      ${vsRow('Avg Possession',   avg(a,'possession'), avg(b,'possession'), true,  '%')}
      ${vsRow('Avg Territory',    avg(a,'territory'),  avg(b,'territory'),  true,  '%')}
      ${vsRow('Time in Opp 22',   avg(a,'time_22'),    avg(b,'time_22'),    true      )}
      ${vsRow('22m Entries',      avg(a,'entries_22'), avg(b,'entries_22'), true      )}
    </div>
    <div class="card">
      <div class="card-title">Attack</div>
      ${vsRow('Gainline %',    avg(a,'gainline'),      avg(b,'gainline'),      true,  '%')}
      ${vsRow('Fast Ball %',   avg(a,'fast_ball'),     avg(b,'fast_ball'),     true,  '%')}
      ${vsRow('Tries Scored',  avg(a,'tries'),         avg(b,'tries'),         true      )}
      ${vsRow('Kicks in Play', avg(a,'kicks_in_play'), avg(b,'kicks_in_play'), false     )}
    </div>
    <div class="card">
      <div class="card-title">Set Piece</div>
      ${vsRow('Scrum Win %',   scrumPct(a), scrumPct(b), true, '%')}
      ${vsRow('Lineout Win %', loPct(a),    loPct(b),    true, '%')}
      ${vsRow('Breakdowns Won', avg(a,'breakdowns'), avg(b,'breakdowns'), true)}
    </div>
    <div class="card">
      <div class="card-title">Defence & Discipline</div>
      ${vsRow('Turnovers Won',      avg(a,'to_won'),       avg(b,'to_won'),       true )}
      ${vsRow('Turnovers Conceded', avg(a,'to_conceded'),  avg(b,'to_conceded'),  false)}
      ${vsRow('Penalties Conceded', avg(a,'pen_conceded'), avg(b,'pen_conceded'), false)}
    </div>
  </div>
  <div class="card">
    <div class="card-title">Strengths & Weaknesses Radar</div>
    <div class="chart-container chart-h300"><canvas id="radar-cmp"></canvas></div>
    <div class="radar-legend">
      <span><span class="legend-dot" style="background:#1d6b4a;display:inline-block"></span>${ta}</span>
      <span><span class="legend-dot" style="background:#2563a8;display:inline-block"></span>${tb}</span>
    </div>
  </div>`;

  cmpCharts['radar'] = new Chart(document.getElementById('radar-cmp'), {
    type: 'radar',
    data: {
      labels: ['Possession', 'Territory', 'Gainline', 'Scrum Win', 'Lineout Win', 'Turnovers Won', 'Fast Ball', 'Tries'],
      datasets: [
        { label: ta, data: [avg(a,'possession'), avg(a,'territory'), avg(a,'gainline'), scrumPct(a), loPct(a), Math.min(avg(a,'to_won')*5,100), avg(a,'fast_ball'), Math.min(avg(a,'tries')*20,100)], borderColor: '#1d6b4a', backgroundColor: 'rgba(29,107,74,0.15)', pointBackgroundColor: '#1d6b4a' },
        { label: tb, data: [avg(b,'possession'), avg(b,'territory'), avg(b,'gainline'), scrumPct(b), loPct(b), Math.min(avg(b,'to_won')*5,100), avg(b,'fast_ball'), Math.min(avg(b,'tries')*20,100)], borderColor: '#2563a8', backgroundColor: 'rgba(37,99,168,0.15)', pointBackgroundColor: '#2563a8' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { r: { min: 0, max: 100, ticks: { display: false }, pointLabels: { font: { size: 11 } } } }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TAGGER
// ═══════════════════════════════════════════════════════════════════════

const taggerState = {
  gameId:     null,
  teamA:      '',
  teamB:      '',
  possession: 'a',
  half:       1,
  phase:      1,
  players:    [],
  events:     [],
};

// ── Setup ──────────────────────────────────────────────────────────────

function addPlayerRow(side) {
  const container = document.getElementById('squad-' + side);
  const row = document.createElement('div');
  row.className = 'squad-row';
  row.innerHTML = `
    <input class="num-input" type="number" placeholder="#" min="1" max="23"
      style="width:55px;padding:7px 8px;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)">
    <input type="text" placeholder="Player name"
      style="flex:1;padding:7px 8px;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)">
    <button onclick="this.parentElement.remove()"
      style="padding:5px 8px;border-radius:4px;border:1px solid var(--border);background:none;color:var(--text-muted);cursor:pointer;font-size:13px">✕</button>
  `;
  container.appendChild(row);
}

function addDefaultRows() {
  ['a','b'].forEach(side => {
    const container = document.getElementById('squad-' + side);
    container.innerHTML = '';
    for (let i = 1; i <= 23; i++) {
      const row = document.createElement('div');
      row.className = 'squad-row';
      row.innerHTML = `
        <input class="num-input" type="number" value="${i}" min="1" max="23"
          style="width:55px;padding:7px 8px;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)">
        <input type="text" placeholder="Player ${i}"
          style="flex:1;padding:7px 8px;font-size:13px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text)">
        <button onclick="this.parentElement.remove()"
          style="padding:5px 8px;border-radius:4px;border:1px solid var(--border);background:none;color:var(--text-muted);cursor:pointer;font-size:13px">✕</button>
      `;
      container.appendChild(row);
    }
  });
}

function getSquadFromDOM(side, teamName) {
  const rows = document.querySelectorAll(`#squad-${side} .squad-row`);
  const players = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    const number = parseInt(inputs[0].value) || null;
    const name   = inputs[1].value.trim();
    if (name) players.push({ team: teamName, name, number });
  });
  return players;
}

async function startTagging() {
  const teamA  = document.getElementById('tg-team-a').value.trim();
  const teamB  = document.getElementById('tg-team-b').value.trim();
  const round  = document.getElementById('tg-round').value.trim();
  const date   = document.getElementById('tg-date').value;
  const scoreA = parseInt(document.getElementById('tg-score-a').value) || 0;
  const scoreB = parseInt(document.getElementById('tg-score-b').value) || 0;

  if (!teamA || !teamB) { toast('Enter both team names', 'error'); return; }

  // Save the game first to get an ID
  const result = await API.saveGame({ round, date, teamA, teamB, scoreA, scoreB, a: {}, b: {} });
  if (!result || result.error) { toast('Failed to create game', 'error'); return; }

  taggerState.gameId     = result.id;
  taggerState.teamA      = teamA;
  taggerState.teamB      = teamB;
  taggerState.possession = 'a';
  taggerState.half       = 1;
  taggerState.phase      = 1;
  taggerState.events     = [];

  // Save players
  const playersA = getSquadFromDOM('a', teamA);
  const playersB = getSquadFromDOM('b', teamB);
  const allPlayers = [...playersA, ...playersB];

  if (allPlayers.length) {
    const res = await fetch(`/api/games/${result.id}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: allPlayers })
    });
    const saved = await res.json();
    // Reload players with their DB ids
    const players = await fetch(`/api/games/${result.id}/players`).then(r => r.json());
    taggerState.players = players;
  }

  // Show tagging screen
  document.getElementById('tagger-setup').style.display = 'none';
  document.getElementById('tagger-main').style.display  = 'block';
  document.getElementById('tg-match-title').textContent = `${teamA} vs ${teamB}${round ? ' — ' + round : ''}`;
  document.getElementById('poss-btn-a').textContent = teamA;
  document.getElementById('poss-btn-b').textContent = teamB;
  setPossession('a');
  setHalf(1);
  renderEventLog();
}

// ── Controls ───────────────────────────────────────────────────────────

function setPossession(side) {
  taggerState.possession = side;
  document.getElementById('poss-btn-a').className = side === 'a' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('poss-btn-b').className = side === 'b' ? 'btn btn-primary' : 'btn btn-secondary';
}

function setHalf(half) {
  taggerState.half = half;
  document.getElementById('half-1-btn').className = half === 1 ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('half-2-btn').className = half === 2 ? 'btn btn-primary' : 'btn btn-secondary';
  resetTimer();
}

function resetPhase() {
  taggerState.phase = 1;
  document.getElementById('phase-display').textContent = 1;
}

function incrementPhase() {
  taggerState.phase++;
  document.getElementById('phase-display').textContent = taggerState.phase;
}

// Events that reset the phase counter
const PHASE_RESET_EVENTS = ['scrum','lineout','turnover','kick','try','penalty'];
const PHASE_INCREMENT_EVENTS = ['carry','pass','breakdown'];

// ── Tagging ────────────────────────────────────────────────────────────

// ── Timer ──────────────────────────────────────────────────────────────
const timer = {
  seconds:   0,
  running:   false,
  interval:  null,
};

function toggleTimer() {
  if (timer.running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  if (timer.running) return;
  timer.running  = true;
  timer.interval = setInterval(() => {
    timer.seconds++;
    updateTimerDisplay();
  }, 1000);
  document.getElementById('timer-btn').textContent = 'Pause';
  document.getElementById('timer-btn').style.background = 'var(--warn)';
  document.getElementById('timer-btn').style.color      = 'white';
  document.getElementById('timer-btn').style.borderColor= 'var(--warn)';
}

function pauseTimer() {
  if (!timer.running) return;
  timer.running = false;
  clearInterval(timer.interval);
  timer.interval = null;
  document.getElementById('timer-btn').textContent      = 'Resume';
  document.getElementById('timer-btn').style.background = 'var(--card)';
  document.getElementById('timer-btn').style.color      = 'var(--text)';
  document.getElementById('timer-btn').style.borderColor= 'var(--border)';
}

function resetTimer() {
  pauseTimer();
  timer.seconds = 0;
  updateTimerDisplay();
  document.getElementById('timer-btn').textContent      = 'Start';
  document.getElementById('timer-btn').style.background = 'var(--card)';
  document.getElementById('timer-btn').style.color      = 'var(--text)';
  document.getElementById('timer-btn').style.borderColor= 'var(--border)';
}

function updateTimerDisplay() {
  const m = Math.floor(timer.seconds / 60).toString().padStart(2, '0');
  const s = (timer.seconds % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

function getMatchTime() {
  const m = Math.floor(timer.seconds / 60).toString().padStart(2, '0');
  const s = (timer.seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getPossessingTeam() {
  return taggerState.possession === 'a' ? taggerState.teamA : taggerState.teamB;
}

function tagEvent(eventType, outcome, subType = null) {
  const team = getPossessingTeam();
  saveEvent({
    event_type:  eventType,
    outcome:     outcome,
    sub_type:    subType,
    team:        team,
    player_id:   null,
    player_id_2: null,
    match_time:  getMatchTime(),
    half:        taggerState.half,
    phase:       taggerState.phase,
    field_zone:  null,
  });
  if (PHASE_RESET_EVENTS.includes(eventType)) resetPhase();
  else if (PHASE_INCREMENT_EVENTS.includes(eventType)) incrementPhase();
  if (eventType === 'turnover') {
    setPossession(taggerState.possession === 'a' ? 'b' : 'a');
  }
}

function tagLineout(outcome) {
  const zone   = document.getElementById('lo-zone').value;
  const option = document.getElementById('lo-option').value;
  const team   = getPossessingTeam();
  saveEvent({
    event_type:  'lineout',
    outcome:     outcome,
    sub_type:    option,
    team:        team,
    player_id:   null,
    player_id_2: null,
    match_time:  getMatchTime(),
    half:        taggerState.half,
    phase:       taggerState.phase,
    field_zone:  zone,
  });
  resetPhase();
  if (outcome.startsWith('lost')) {
    setPossession(taggerState.possession === 'a' ? 'b' : 'a');
  }
}

function tagPenalty(subType) {
  const option = document.getElementById('pen-option').value;
  const team   = getPossessingTeam();
  saveEvent({
    event_type:  'penalty',
    outcome:     option,
    sub_type:    subType,
    team:        team,
    player_id:   null,
    player_id_2: null,
    match_time:  getMatchTime(),
    half:        taggerState.half,
    phase:       taggerState.phase,
    field_zone:  null,
  });
  resetPhase();
}

function tagScrum(outcome) {
  const team = getPossessingTeam();
  saveEvent({
    event_type:  'scrum',
    outcome:     outcome,
    sub_type:    null,
    team:        team,
    player_id:   null,
    player_id_2: null,
    match_time:  getMatchTime(),
    half:        taggerState.half,
    phase:       taggerState.phase,
    field_zone:  null,
  });
  resetPhase();
  if (outcome.startsWith('lost')) {
    setPossession(taggerState.possession === 'a' ? 'b' : 'a');
  }
}

function tagBreakdown(outcome) {
  const team = getPossessingTeam();
  saveEvent({
    event_type:  'breakdown',
    outcome:     outcome,
    sub_type:    null,
    team:        team,
    player_id:   null,
    player_id_2: null,
    match_time:  getMatchTime(),
    half:        taggerState.half,
    phase:       taggerState.phase,
    field_zone:  null,
  });
  if (outcome === 'lost') {
    setPossession(taggerState.possession === 'a' ? 'b' : 'a');
  }
}

function tagKick(subType) {
  const zone    = document.getElementById('kick-zone').value;
  const outcome = document.getElementById('kick-outcome').value;
  const team    = getPossessingTeam();
  saveEvent({
    event_type:  'kick',
    outcome:     outcome,
    sub_type:    subType,
    team:        team,
    player_id:   null,
    player_id_2: null,
    match_time:  getMatchTime(),
    half:        taggerState.half,
    phase:       taggerState.phase,
    field_zone:  zone,
  });
  resetPhase();
  if (outcome === 'won_by_receiver') {
    setPossession(taggerState.possession === 'a' ? 'b' : 'a');
  }
}

function getOpposingTeam() {
  return taggerState.possession === 'a' ? taggerState.teamB : taggerState.teamA;
}

async function saveEvent(event) {
  const res = await fetch(`/api/games/${taggerState.gameId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  const result = await res.json();
  event.id = result.id;

  // Find player name for display
  const player = taggerState.players.find(p => p.id === event.player_id);
  event.player_name = player ? `#${player.number} ${player.name}` : null;

  taggerState.events.push(event);
  renderEventLog();
}

async function undoLastEvent() {
  if (!taggerState.events.length) return;
  const last = taggerState.events[taggerState.events.length - 1];
  await fetch(`/api/events/${last.id}`, { method: 'DELETE' });
  taggerState.events.pop();

  // Decrement phase if it was an incrementing event
  if (PHASE_INCREMENT_EVENTS.includes(last.event_type) && taggerState.phase > 1) {
    taggerState.phase--;
    document.getElementById('phase-display').textContent = taggerState.phase;
  }
  renderEventLog();
  toast('Event undone');
}

// ── Event log ──────────────────────────────────────────────────────────

const EVENT_LABELS = {
  carry:            'Carry',
  pass:             'Pass',
  tackle:           'Tackle',
  breakdown:        'Breakdown',
  kick:             'Kick',
  scrum:            'Scrum',
  lineout:          'Lineout',
  turnover:         'Turnover Won',
  penalty:          'Penalty Conceded',
  try:              'Try',
  conversion:       'Conversion',
  '22m_entry':      '22m Entry',
  yellow_card:      'Yellow Card',
  possession_start: 'Possession',
};

function renderEventLog() {
  const log = document.getElementById('event-log');
  if (!taggerState.events.length) {
    log.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--text-muted)">No events yet</div>';
    return;
  }
  // Show most recent at top
  log.innerHTML = [...taggerState.events].reverse().map(e => `
    <div class="event-item">
      <div class="event-item-time">${e.match_time || ''}</div>
      <div class="event-item-team">${e.team}</div>
      <div class="event-item-type">${EVENT_LABELS[e.event_type] || e.event_type}${e.outcome ? ' — ' + e.outcome.replace(/_/g,' ') : ''}</div>
      ${e.player_name ? `<div class="event-item-detail">${e.player_name}</div>` : ''}
      ${e.sub_type ? `<div class="event-item-detail">${e.sub_type.replace(/_/g,' ')}</div>` : ''}
      <div style="font-size:10px;color:var(--text-hint)">Phase ${e.phase} · H${e.half}</div>
    </div>
  `).join('');
}

// ── Finish ─────────────────────────────────────────────────────────────

async function finishTagging() {
  if (!confirm('Finish tagging and compile stats?')) return;
  resetTimer();

  const res = await fetch(`/api/games/${taggerState.gameId}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const result = await res.json();

  if (!result.success) { toast('Compile failed', 'error'); return; }

  toast(`Saved! ${taggerState.teamA} ${result.teamA.tries} tries, ${taggerState.teamB.tries} tries`);

  // Reset tagger
  document.getElementById('tagger-main').style.display  = 'none';
  document.getElementById('tagger-setup').style.display = 'block';
  taggerState.gameId  = null;
  taggerState.events  = [];
  taggerState.players = [];
  addDefaultRows();
}

// ── Spacebar to pause/resume timer ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Only trigger when tagger is active and not typing in an input
  if (e.code !== 'Space') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (document.getElementById('tagger-main').style.display === 'none') return;
  e.preventDefault();
  toggleTimer();
});

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
(async () => {
  await updateTeamDatalist();
})();