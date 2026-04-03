const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

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

    function compileTeam(team) {
      const te  = events.filter(e => e.team === team);
      const opp = events.filter(e => e.team !== team);

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
      const tos      = te.filter(e => e.event_type === 'turnover');
      const pensConc = te.filter(e => e.event_type === 'penalty');
      const entries  = te.filter(e => e.event_type === '22m_entry');
      const yc       = te.filter(e => e.event_type === 'yellow_card');

      const gainlineMade = carries.filter(e => e.outcome === 'gainline_made').length;
      const fastBalls    = bds.filter(e => e.outcome === 'won_fast').length;
      const bdWon        = bds.filter(e => e.outcome === 'won_fast' || e.outcome === 'won_slow').length;
      const scrumWon     = scrums.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const loWon        = lineouts.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const toConc       = opp.filter(e => e.event_type === 'turnover').length;
      const totalPoss    = events.filter(e => e.event_type === 'possession_start').length || 1;
      const teamPoss     = te.filter(e => e.event_type === 'possession_start').length;

      return {
        possession:    Math.round(teamPoss / totalPoss * 100),
        territory:     0,
        time_22:       0,
        attacks:       carries.length + scrums.length + lineouts.length,
        entries_22:    entries.length,
        gainline:      carries.length ? Math.round(gainlineMade / carries.length * 100) : 0,
        kicks_in_play: kicks.filter(e => e.sub_type === 'in_play').length,
        fast_ball:     bds.length ? Math.round(fastBalls / bds.length * 100) : 0,
        scrum_won:     scrumWon,
        scrum_total:   scrums.length,
        lo_won:        loWon,
        lo_total:      lineouts.length,
        to_won:        tos.length,
        to_conceded:   toConc,
        breakdowns:    bdWon,
        pen_conceded:  pensConc.length,
        tries:         tries.length,
        conversions:   `${convMade.length}/${convTot.length}`,
        pen_kicked:    `${pgkMade.length}/${pgkTot.length}`,
        yellow_cards:  yc.length,
      };
    }

    const statsA = compileTeam(game.team_a);
    const statsB = compileTeam(game.team_b);

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