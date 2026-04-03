const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const XLSX = require('xlsx');

const app = express();
const PORT = 3000;

// ── Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ─────────────────────────────────────────────────────────────

// GET /api/games — return all games
app.get('/api/games', (req, res) => {
    try {
        const games = db.getAllGames.all();
        res.json(games)
    } catch (err) {
        res,status(500).json({error: err.message});
    }
});

// GET /api/teams — return list of all team names
app.get('/api/teams', (req, res) => {
  try {
    const teams = db.getTeams.all().map(row => row.team);
    res.json(teams);
  } catch (err) {
    console.error('Get teams error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/teams/:name/stats', (req, res) => {
  try {
    const stats = db.getStatsByTeam.all(req.params.name);
    res.json(stats);
  } catch (err) {
    console.error('Get team stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/games — save a new game
app.post('/api/games', (req, res) => {
  try {
    const id = db.saveGame(req.body);
    res.status(201).json({ id });
  } catch (err) {
    console.error('Save game error:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/games/:id', (req, res) => {
  try {
    db.deleteGame.run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Player routes ───────────────────────────────────────────────────────

app.post('/api/games/:id/players', (req, res) => {
  try {
    const { players } = req.body;
    const gameId = req.params.id;
    const inserted = players.map(p =>
      db.insertPlayer.run({ game_id: gameId, team: p.team, name: p.name, number: p.number })
    );
    res.status(201).json({ count: inserted.length });
  } catch (err) {
    console.error('Insert players error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/games/:id/players', (req, res) => {
  try {
    const players = db.getPlayersByGame.all(req.params.id);
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/games/:id/export', async (req, res) => {
  try {
    const gameId  = req.params.id;
    const game    = db.getGameById.get(gameId);
    const events  = db.getEventsByGame.all(gameId);
    const players = db.getPlayersByGame.all(gameId);
    const pStats  = db.getPlayerStats.all(gameId);

    const wb   = XLSX.utils.book_new();

    // ── Cover sheet ──────────────────────────────────────────────────
    const coverData = [
      [`${game.round ? game.round + ' - ' : ''}${game.team_a} ${game.score_a}-${game.score_b} ${game.team_b}`],
      [],
      ['', game.team_a, '', game.team_b],
      ['Stat', game.team_a, game.team_b],
    ];

    // Compile stats for cover
    function compileForExport(team, oppTeam) {
      const te  = events.filter(e => e.team === team);
      const opp = events.filter(e => e.team === oppTeam);
      const carries  = te.filter(e => e.event_type === 'carry');
      const bds      = te.filter(e => e.event_type === 'breakdown');
      const scrums   = te.filter(e => e.event_type === 'scrum');
      const lineouts = te.filter(e => e.event_type === 'lineout');
      const kicks    = te.filter(e => e.event_type === 'kick');
      const tries    = te.filter(e => e.event_type === 'try');
      const convMade = te.filter(e => e.event_type === 'conversion' && e.outcome === 'made');
      const convTot  = te.filter(e => e.event_type === 'conversion');
      const pgkMade  = te.filter(e => e.event_type === 'kick' && e.sub_type === 'penalty_goal' && e.outcome === 'made');
      const pgkTot   = te.filter(e => e.event_type === 'kick' && e.sub_type === 'penalty_goal');
      const pens     = te.filter(e => e.event_type === 'penalty');
      const toWon    = te.filter(e => e.event_type === 'turnover').length;
      const toConc   = opp.filter(e => e.event_type === 'turnover').length;
      const scrumWon = scrums.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const loWon    = lineouts.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const loLost   = lineouts.filter(e => e.outcome && e.outcome.startsWith('lost')).length;
      const gainMade = carries.filter(e => e.outcome === 'gainline_made').length;
      const fastBall = bds.filter(e => e.outcome === 'won_fast').length;
      const bdWon    = bds.filter(e => e.outcome === 'won_fast' || e.outcome === 'won_slow').length;
      const totalPoss = events.filter(e => e.event_type === 'possession_start').length || 1;
      const teamPoss  = te.filter(e => e.event_type === 'possession_start').length;

      return {
        possession:  Math.round(teamPoss / totalPoss * 100) + '%',
        tries:       tries.length,
        conversions: `${convMade.length}/${convTot.length}`,
        penKicked:   `${pgkMade.length}/${pgkTot.length}`,
        kicksInPlay: kicks.filter(e => ['contestable','uncontestable','grubber'].includes(e.sub_type)).length,
        gainline:    carries.length ? Math.round(gainMade / carries.length * 100) + '%' : '0%',
        breakdowns:  bdWon,
        fastBall:    bds.length ? Math.round(fastBall / bds.length * 100) + '%' : '0%',
        toWon,
        toConc,
        scrumWon:    `${scrumWon}/${scrums.length}`,
        loWon:       `${loWon}/${loWon + loLost}`,
        penConc:     pens.length,
      };
    }

    const sA = compileForExport(game.team_a, game.team_b);
    const sB = compileForExport(game.team_b, game.team_a);

    const stats = [
      ['Possession (%)',   sA.possession,  sB.possession],
      ['Tries Scored',     sA.tries,       sB.tries],
      ['Conversions',      sA.conversions, sB.conversions],
      ['Penalty Kicks',    sA.penKicked,   sB.penKicked],
      ['Kicks in Play',    sA.kicksInPlay, sB.kicksInPlay],
      ['Gainline %',       sA.gainline,    sB.gainline],
      ['Breakdowns Won',   sA.breakdowns,  sB.breakdowns],
      ['Fast Ball %',      sA.fastBall,    sB.fastBall],
      ['Turnovers Won',    sA.toWon,       sB.toWon],
      ['Turnovers Conc',   sA.toConc,      sB.toConc],
      ['Scrum (Won/Tot)',  sA.scrumWon,    sB.scrumWon],
      ['Lineout (Won/Tot)',sA.loWon,       sB.loWon],
      ['Penalties Conc',   sA.penConc,     sB.penConc],
    ];

    const coverSheet = XLSX.utils.aoa_to_sheet([...coverData, ...stats]);
    XLSX.utils.book_append_sheet(wb, coverSheet, 'Summary');

    // ── Events sheet ─────────────────────────────────────────────────
    const eventRows = [
      ['Time', 'Half', 'Team', 'Event', 'Outcome', 'Sub Type', 'Player', 'Player 2', 'Zone', 'Phase']
    ];
    events.forEach(e => {
      eventRows.push([
        e.match_time  || '',
        e.half        || '',
        e.team        || '',
        e.event_type  || '',
        e.outcome     || '',
        e.sub_type    || '',
        e.player_name || '',
        e.player_name_2 || '',
        e.field_zone  || '',
        e.phase       || '',
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(eventRows), 'Events');

    // ── Player stats sheet ───────────────────────────────────────────
    const playerRows = [
      ['Team', '#', 'Player', 'Carries', 'Gainline Made', 'Gainline %', 'Passes',
       'Tackles Made', 'Tackles Dominant', 'Tackles Missed', 'Tackle %',
       'Turnovers Won', 'Penalties Conceded', 'Tries', 'Lineout Throws']
    ];
    pStats.forEach(p => {
      const totalTackles = p.tackles_made + p.tackles_dominant + p.tackles_missed;
      const tackleSuccess = totalTackles ? Math.round((p.tackles_made + p.tackles_dominant) / totalTackles * 100) + '%' : '0%';
      const gainlinePct  = p.carries ? Math.round(p.gainline_made / p.carries * 100) + '%' : '0%';
      playerRows.push([
        p.team, p.number || '', p.name,
        p.carries, p.gainline_made, gainlinePct,
        p.passes,
        p.tackles_made, p.tackles_dominant, p.tackles_missed, tackleSuccess,
        p.turnovers_won, p.penalties_conceded,
        p.tries, p.lineout_throws
      ]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(playerRows), 'Player Stats');

    // ── Turnovers sheet ──────────────────────────────────────────────
    const toEvents = events.filter(e => e.event_type === 'turnover');
    const toRows = [['Time', 'Half', 'Team', 'Type', 'Player', 'Phase']];
    toEvents.forEach(e => toRows.push([
      e.match_time || '', e.half || '', e.team,
      (e.sub_type || '').replace(/_/g, ' '), e.player_name || '', e.phase || ''
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(toRows), 'Turnovers');

    // ── Penalties sheet ──────────────────────────────────────────────
    const penEvents = events.filter(e => e.event_type === 'penalty');
    const penRows = [['Time', 'Half', 'Team', 'Type', 'Option Taken', 'Player', 'Phase']];
    penEvents.forEach(e => penRows.push([
      e.match_time || '', e.half || '', e.team,
      (e.sub_type || '').replace(/_/g, ' '),
      (e.outcome  || '').replace(/_/g, ' '),
      e.player_name || '', e.phase || ''
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(penRows), 'Penalties');

    // ── Kicks sheet ──────────────────────────────────────────────────
    const kickEvents = events.filter(e => e.event_type === 'kick' && e.sub_type !== 'penalty_goal');
    const kickRows = [['Time', 'Half', 'Team', 'Type', 'Zone', 'Outcome', 'Player', 'Phase']];
    kickEvents.forEach(e => kickRows.push([
      e.match_time || '', e.half || '', e.team,
      (e.sub_type  || '').replace(/_/g, ' '),
      (e.field_zone || '').replace(/_/g, ' '),
      (e.outcome   || '').replace(/_/g, ' '),
      e.player_name || '', e.phase || ''
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kickRows), 'Kicks');

    // ── Send file ────────────────────────────────────────────────────
    const filename = `${game.round || 'Game'}_${game.team_a}_v_${game.team_b}.xlsx`.replace(/\s+/g, '_');
    const buffer   = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Event routes ────────────────────────────────────────────────────────

app.post('/api/games/:id/events', (req, res) => {
  try {
    const event = { ...req.body, game_id: req.params.id };
    const result = db.insertEvent.run(event);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Insert event error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/games/:id/events', (req, res) => {
  try {
    const events = db.getEventsByGame.all(req.params.id);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', (req, res) => {
  try {
    db.deleteEvent.run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/games/:id/player-stats', (req, res) => {
  try {
    const stats = db.getPlayerStats.all(req.params.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Compile events into team stats ──────────────────────────────────────
app.post('/api/games/:id/compile', (req, res) => {
  try {
    const gameId = req.params.id;
    const game   = db.getGameById.get(gameId);
    const events = db.getEventsByGame.all(gameId);

    function compileTeam(team, oppTeam) {
      const te  = events.filter(e => e.team === team);
      const opp = events.filter(e => e.team === oppTeam);

      const scrums   = te.filter(e => e.event_type === 'scrum');
      const lineouts = te.filter(e => e.event_type === 'lineout');
      const carries  = te.filter(e => e.event_type === 'carry');
      const bds      = te.filter(e => e.event_type === 'breakdown');
      const kicks    = te.filter(e => e.event_type === 'kick');
      const tries    = te.filter(e => e.event_type === 'try');
      const convMade = te.filter(e => e.event_type === 'conversion' && e.outcome === 'made');
      const convTot  = te.filter(e => e.event_type === 'conversion');
      const pgkMade  = te.filter(e => e.event_type === 'kick' && e.sub_type === 'penalty_goal' && e.outcome === 'made');
      const pgkTot   = te.filter(e => e.event_type === 'kick' && e.sub_type === 'penalty_goal');
      const yc       = te.filter(e => e.event_type === 'yellow_card');
      const entries  = te.filter(e => e.event_type === '22m_entry');
      const pensConc = te.filter(e => e.event_type === 'penalty');

      // Scrums — only count losses when feeding team loses their own ball
      const scrumWon  = scrums.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const scrumLost = scrums.filter(e => e.outcome && e.outcome.startsWith('lost')).length;

      // Lineouts — only count losses when throwing team loses their own ball
      const loWon  = lineouts.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const loLost = lineouts.filter(e => e.outcome && e.outcome.startsWith('lost')).length;

      // Turnovers — won by this team, conceded = won by opposition
      const toWon  = te.filter(e => e.event_type === 'turnover').length;
      const toConc = opp.filter(e => e.event_type === 'turnover').length;

      // Breakdowns
      const bdWon    = bds.filter(e => e.outcome === 'won_fast' || e.outcome === 'won_slow').length;
      const fastBall = bds.filter(e => e.outcome === 'won_fast').length;

      // Gainline
      const gainlineMade = carries.filter(e => e.outcome === 'gainline_made').length;

      // Possession — based on possession_start events
      const totalPoss = events.filter(e => e.event_type === 'possession_start').length || 1;
      const teamPoss  = te.filter(e => e.event_type === 'possession_start').length;

      // Kicks in play (excludes penalty goals and kicks to touch at lineout)
      const kicksInPlay = kicks.filter(e =>
        e.sub_type === 'in_play' ||
        e.sub_type === 'contestable' ||
        e.sub_type === 'uncontestable'
      ).length;

      return {
        possession:    Math.round(teamPoss / totalPoss * 100),
        territory:     0,
        time_22:       0,
        attacks:       carries.length + scrums.length + lineouts.length,
        entries_22:    entries.length,
        gainline:      carries.length ? Math.round(gainlineMade / carries.length * 100) : 0,
        kicks_in_play: kicksInPlay,
        fast_ball:     bds.length ? Math.round(fastBall / bds.length * 100) : 0,
        scrum_won:     scrumWon,
        scrum_total:   scrumWon + scrumLost,
        lo_won:        loWon,
        lo_total:      loWon + loLost,
        to_won:        toWon,
        to_conceded:   toConc,
        breakdowns:    bdWon,
        pen_conceded:  pensConc.length,
        tries:         tries.length,
        conversions:   `${convMade.length}/${convTot.length}`,
        pen_kicked:    `${pgkMade.length}/${pgkTot.length}`,
        yellow_cards:  yc.length,
      };
    }

    const statsA = compileTeam(game.team_a, game.team_b);
    const statsB = compileTeam(game.team_b, game.team_a);

    db.updateTeamStats(gameId, game.team_a, 1, statsA);
    db.updateTeamStats(gameId, game.team_b, 0, statsB);

    res.json({ success: true, teamA: statsA, teamB: statsB });
  } catch (err) {
    console.error('Compile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`RugbyIQ running at http://localhost:${PORT}`);
});