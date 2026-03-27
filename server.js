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

// ── Start server ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`RugbyIQ running at http://localhost:${PORT}`);
});