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

app.get('/api/games/:id/export', (req, res) => {
  try {
    const gameId  = req.params.id;
    const game    = db.getGameById.get(gameId);
    const events  = db.getEventsByGame.all(gameId);
    const players = db.getPlayersByGame.all(gameId);
    const pStats  = db.getPlayerStats.all(gameId);

    if (!game) { res.status(404).json({ error: 'Game not found' }); return; }

    const wb = XLSX.utils.book_new();

    // ── Helpers ────────────────────────────────────────────────────────
    const NAVY   = '002722B0';
    const WHITE  = '00FFFFFF';
    const GREY   = '00D9D9D9';
    const BLACK  = '00000000';

    function hStyle(bold=true, size=11, color=WHITE, bg=NAVY, halign='center') {
      return {
        font:      { bold, size, color: { rgb: color }, name: 'Calibri' },
        fill:      { patternType: 'solid', fgColor: { rgb: bg } },
        alignment: { horizontal: halign, vertical: 'center', wrapText: true },
        border: {
          top:    { style: 'thin', color: { rgb: BLACK } },
          bottom: { style: 'thin', color: { rgb: BLACK } },
          left:   { style: 'thin', color: { rgb: BLACK } },
          right:  { style: 'thin', color: { rgb: BLACK } },
        }
      };
    }

    function dStyle(bold=false, size=11, halign='center') {
      return {
        font:      { bold, size, name: 'Calibri' },
        alignment: { horizontal: halign, vertical: 'center' },
        border: {
          top:    { style: 'thin', color: { rgb: '00CCCCCC' } },
          bottom: { style: 'thin', color: { rgb: '00CCCCCC' } },
          left:   { style: 'thin', color: { rgb: '00CCCCCC' } },
          right:  { style: 'thin', color: { rgb: '00CCCCCC' } },
        }
      };
    }

    function titleStyle() {
      return {
        font:      { bold: true, size: 18, name: 'Calibri' },
        alignment: { horizontal: 'left', vertical: 'center' },
      };
    }

    // Write a cell with style
    function writeCell(ws, addr, value, style) {
      if (!ws[addr]) ws[addr] = {};
      ws[addr].v = value;
      ws[addr].t = typeof value === 'number' ? 'n' : 's';
      ws[addr].s = style;
    }

    // Merge helper
    function addMerge(ws, r1, c1, r2, c2) {
      if (!ws['!merges']) ws['!merges'] = [];
      ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
    }

    function enc(r, c) { return XLSX.utils.encode_cell({ r, c }); }

    // ── Compile stats ─────────────────────────────────────────────────
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
      const yc       = te.filter(e => e.event_type === 'yellow_card');
      const entries  = te.filter(e => e.event_type === '22m_entry');

      const toWon    = te.filter(e => e.event_type === 'turnover').length;
      const toConc   = opp.filter(e => e.event_type === 'turnover').length;
      const scrumWon = scrums.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const scrumLost= scrums.filter(e => e.outcome && e.outcome.startsWith('lost')).length;
      const loWon    = lineouts.filter(e => e.outcome && e.outcome.startsWith('won')).length;
      const loLost   = lineouts.filter(e => e.outcome && e.outcome.startsWith('lost')).length;
      const gainMade = carries.filter(e => e.outcome === 'gainline_made').length;
      const fastBall = bds.filter(e => e.outcome === 'won_fast').length;
      const bdWon    = bds.filter(e => e.outcome === 'won_fast' || e.outcome === 'won_slow').length;
      const totalPoss = events.filter(e => e.event_type === 'possession_start').length || 1;
      const teamPoss  = te.filter(e => e.event_type === 'possession_start').length;
      const kicksInPlay = kicks.filter(e =>
        ['contestable','uncontestable','grubber','in_play'].includes(e.sub_type)
      ).length;

      return {
        possession:   (teamPoss / totalPoss),
        tries:        tries.length,
        conversions:  `${convMade.length}/${convTot.length}`,
        penKicked:    `${pgkMade.length}/${pgkTot.length}`,
        kicksInPlay,
        gainline:     carries.length ? gainMade / carries.length : 0,
        breakdowns:   bdWon,
        fastBall:     bds.length ? fastBall / bds.length : 0,
        toWon, toConc,
        scrumWon, scrumLost, scrumTotal: scrumWon + scrumLost,
        scrumPct:     (scrumWon + scrumLost) ? scrumWon / (scrumWon + scrumLost) : 0,
        loWon, loLost, loTotal: loWon + loLost,
        loPct:        (loWon + loLost) ? loWon / (loWon + loLost) : 0,
        penConc:      pens.length,
        yellowCards:  yc.length,
        entries22:    entries.length,
        // Turnover breakdown
        toTypes: {
          breakdown_steal: te.filter(e => e.event_type==='turnover' && e.sub_type==='breakdown_steal').length,
          interception:    te.filter(e => e.event_type==='turnover' && e.sub_type==='interception').length,
          loose_ball:      te.filter(e => e.event_type==='turnover' && e.sub_type==='loose_ball').length,
          lineout_steal:   te.filter(e => e.event_type==='turnover' && e.sub_type==='lineout_steal').length,
          scrum_steal:     te.filter(e => e.event_type==='turnover' && e.sub_type==='scrum_steal').length,
          stripped:        te.filter(e => e.event_type==='turnover' && e.sub_type==='stripped').length,
          opp_error:       te.filter(e => e.event_type==='turnover' && e.sub_type==='opp_error').length,
        },
        // Penalty breakdown
        penOptions: {
          kick_to_touch: pens.filter(e => e.outcome==='kick_to_touch').length,
          kick_at_goal:  pens.filter(e => e.outcome==='kick_at_goal').length,
          scrum:         pens.filter(e => e.outcome==='scrum').length,
          quick_tap:     pens.filter(e => e.outcome==='quick_tap').length,
          kick_in_play:  pens.filter(e => e.outcome==='kick_in_play').length,
        },
        // Lineout breakdown
        loOutcomes: {
          won_outright:   lineouts.filter(e => e.outcome==='won_outright').length,
          won_penalty:    lineouts.filter(e => e.outcome==='won_penalty').length,
          won_overthrow:  lineouts.filter(e => e.outcome==='won_overthrow').length,
          lost_outright:  lineouts.filter(e => e.outcome==='lost_outright').length,
          lost_error:     lineouts.filter(e => e.outcome==='lost_error').length,
          lost_overthrow: lineouts.filter(e => e.outcome==='lost_overthrow').length,
        },
        // Scrum breakdown
        scrumOutcomes: {
          won_outright:  scrums.filter(e => e.outcome==='won_outright').length,
          won_penalty:   scrums.filter(e => e.outcome==='won_penalty').length,
          won_free_kick: scrums.filter(e => e.outcome==='won_free_kick').length,
          lost_outright: scrums.filter(e => e.outcome==='lost_outright').length,
          lost_penalty:  scrums.filter(e => e.outcome==='lost_penalty').length,
          lost_free_kick:scrums.filter(e => e.outcome==='lost_free_kick').length,
        },
        // Kick breakdown
        kickTypes: {
          contestable:   kicks.filter(e => e.sub_type==='contestable').length,
          uncontestable: kicks.filter(e => e.sub_type==='uncontestable').length,
          box_kick:      kicks.filter(e => e.sub_type==='box_kick').length,
          grubber:       kicks.filter(e => e.sub_type==='grubber').length,
          to_touch:      kicks.filter(e => e.sub_type==='to_touch').length,
          restart:       kicks.filter(e => e.sub_type==='restart').length,
        },
        // Try breakdown
        tryPhases: {
          first:  tries.filter(e => e.phase === 1).length,
          two3:   tries.filter(e => e.phase >= 2 && e.phase <= 3).length,
          four6:  tries.filter(e => e.phase >= 4 && e.phase <= 6).length,
          seven:  tries.filter(e => e.phase >= 7).length,
        }
      };
    }

    const sA = compileForExport(game.team_a, game.team_b);
    const sB = compileForExport(game.team_b, game.team_a);
    const matchTitle = `${game.round ? game.round + ' - ' : ''}${game.team_a} ${game.score_a}-${game.score_b} ${game.team_b}`;

    // ── COVER SHEET ────────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:M30';

      // Title — row 1 (r=0), spans B2:M3 in original → we use A1:L2
      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 11);

      // Team headers — row 3 (r=2)
      writeCell(ws, enc(2,1), game.team_a, hStyle(true,16,WHITE,NAVY,'center'));
      addMerge(ws, 2, 1, 2, 3);
      writeCell(ws, enc(2,7), game.team_b, hStyle(true,16,WHITE,NAVY,'center'));
      addMerge(ws, 2, 7, 2, 9);

      // Stats label col header — row 3 middle
      writeCell(ws, enc(2,5), 'Stat', hStyle(true,11,WHITE,NAVY,'center'));

      // Player list headers — row 4 (r=3)
      writeCell(ws, enc(3,1), 'Position',    hStyle(true,10));
      writeCell(ws, enc(3,2), 'Player Name', hStyle(true,10));
      addMerge(ws, 3, 2, 3, 3);
      writeCell(ws, enc(3,7), 'Position',    hStyle(true,10));
      writeCell(ws, enc(3,8), 'Player Name', hStyle(true,10));
      addMerge(ws, 3, 8, 3, 9);

      // Player rows
      const teamAPlayers = players.filter(p => p.team === game.team_a).sort((a,b) => (a.number||99)-(b.number||99));
      const teamBPlayers = players.filter(p => p.team === game.team_b).sort((a,b) => (a.number||99)-(b.number||99));
      const maxPlayers   = Math.max(teamAPlayers.length, teamBPlayers.length);

      for (let i = 0; i < maxPlayers; i++) {
        const r  = 4 + i;
        const pA = teamAPlayers[i];
        const pB = teamBPlayers[i];
        if (pA) {
          writeCell(ws, enc(r,1), pA.number || i+1, dStyle(false,10,'center'));
          writeCell(ws, enc(r,2), pA.name,           dStyle(false,10,'left'));
          addMerge(ws, r, 2, r, 3);
        }
        if (pB) {
          writeCell(ws, enc(r,7), pB.number || i+1, dStyle(false,10,'center'));
          writeCell(ws, enc(r,8), pB.name,           dStyle(false,10,'left'));
          addMerge(ws, r, 8, r, 9);
        }
      }

      // Stats in the middle columns (col 4=D, 5=E label, 6=F value B)
      const statsRows = [
        ['Possession (%)',       sA.possession,                  sB.possession,                true,  'pct'],
        ['Tries Scored',         sA.tries,                       sB.tries,                     false, 'num'],
        ['Conversion Kicks',     sA.conversions,                 sB.conversions,               false, 'str'],
        ['Penalty Kicks',        sA.penKicked,                   sB.penKicked,                 false, 'str'],
        ['Kicks in Play',        sA.kicksInPlay,                 sB.kicksInPlay,               false, 'num'],
        ['Gainline %',           sA.gainline,                    sB.gainline,                  true,  'pct'],
        ['Breakdowns Won',       sA.breakdowns,                  sB.breakdowns,                false, 'num'],
        ['Fast Ball %',          sA.fastBall,                    sB.fastBall,                  true,  'pct'],
        ['Turnovers Won',        sA.toWon,                       sB.toWon,                     false, 'num'],
        ['Turnovers Conceded',   sA.toConc,                      sB.toConc,                    false, 'num'],
        ['Penalties Conceded',   sA.penConc,                     sB.penConc,                   false, 'num'],
        ['Yellow Cards',         sA.yellowCards,                 sB.yellowCards,               false, 'num'],
        ['Scrum Success %',      sA.scrumPct,                    sB.scrumPct,                  true,  'pct'],
        ['Lineout Success %',    sA.loPct,                       sB.loPct,                     true,  'pct'],
      ];

      statsRows.forEach((row, i) => {
        const r = 4 + i;
        const [label, valA, valB, isPct, type] = row;
        const dispA = type==='pct' ? (valA*100).toFixed(1)+'%' : type==='str' ? valA : valA;
        const dispB = type==='pct' ? (valB*100).toFixed(1)+'%' : type==='str' ? valB : valB;
        writeCell(ws, enc(r,4), dispA, dStyle(true,11,'right'));
        writeCell(ws, enc(r,5), label, hStyle(true,10,WHITE,NAVY,'center'));
        addMerge(ws, r, 5, r, 6);
        writeCell(ws, enc(r,10), dispB, dStyle(true,11,'left'));
      });

      ws['!cols'] = [
        { wch: 2  }, // A
        { wch: 8  }, // B - position
        { wch: 20 }, // C - name
        { wch: 8  }, // D
        { wch: 12 }, // E - stat value A
        { wch: 20 }, // F - stat label
        { wch: 4  }, // G
        { wch: 4  }, // H
        { wch: 8  }, // I - position B
        { wch: 20 }, // J - name B
        { wch: 4  }, // K
        { wch: 12 }, // L - stat value B
      ];

      ws['!rows'] = [
        { hpt: 30 }, // row 1 title
        { hpt: 30 },
        { hpt: 22 }, // team headers
        { hpt: 18 }, // col headers
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Cover');
    })();

    // ── SCRUMS SHEET ───────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:N20';

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 9);

      // Headers
      writeCell(ws, enc(2,1), `${game.team_a} Scrums`, hStyle(true,12));
      addMerge(ws, 2, 1, 2, 5);
      writeCell(ws, enc(2,7), `${game.team_b} Scrums`, hStyle(true,12));
      addMerge(ws, 2, 7, 2, 11);

      writeCell(ws, enc(3,1), 'Scrum Result',     hStyle(true,10));
      addMerge(ws, 3, 1, 3, 3);
      writeCell(ws, enc(3,4), game.team_a,         hStyle(true,10));
      writeCell(ws, enc(3,7), 'Scrum Result',     hStyle(true,10));
      addMerge(ws, 3, 7, 3, 9);
      writeCell(ws, enc(3,10), game.team_b,        hStyle(true,10));

      const scrumRows = [
        ['Scrum Won Outright',  sA.scrumOutcomes.won_outright,  sB.scrumOutcomes.won_outright],
        ['Scrum Won Penalty',   sA.scrumOutcomes.won_penalty,   sB.scrumOutcomes.won_penalty],
        ['Scrum Won Free Kick', sA.scrumOutcomes.won_free_kick, sB.scrumOutcomes.won_free_kick],
        ['Scrum Lost Outright', sA.scrumOutcomes.lost_outright, sB.scrumOutcomes.lost_outright],
        ['Scrum Lost Penalty',  sA.scrumOutcomes.lost_penalty,  sB.scrumOutcomes.lost_penalty],
        ['Scrum Lost Free Kick',sA.scrumOutcomes.lost_free_kick,sB.scrumOutcomes.lost_free_kick],
        [''],
        ['Scrums Won',          sA.scrumWon,    sB.scrumWon],
        ['Scrums Lost',         sA.scrumLost,   sB.scrumLost],
        ['% Scrum Success',     (sA.scrumPct*100).toFixed(1)+'%', (sB.scrumPct*100).toFixed(1)+'%'],
      ];

      scrumRows.forEach((row, i) => {
        const r = 4 + i;
        const [label, valA, valB] = row;
        const bold = i >= 8;
        writeCell(ws, enc(r,1), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 1, r, 3);
        if (valA !== undefined) writeCell(ws, enc(r,4), valA, dStyle(bold,10,'center'));
        writeCell(ws, enc(r,7), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 7, r, 9);
        if (valB !== undefined) writeCell(ws, enc(r,10), valB, dStyle(bold,10,'center'));
      });

      ws['!cols'] = [
        {wch:2},{wch:6},{wch:14},{wch:6},{wch:10},{wch:4},{wch:4},
        {wch:6},{wch:14},{wch:6},{wch:10}
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Scrums');
    })();

    // ── LINEOUTS SHEET ─────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:L25';

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 10);

      writeCell(ws, enc(2,1), 'Lineout Result',  hStyle(true,10));
      addMerge(ws, 2, 1, 2, 2);
      writeCell(ws, enc(2,3), game.team_a,        hStyle(true,10));
      writeCell(ws, enc(2,5), 'Lineout Result',  hStyle(true,10));
      addMerge(ws, 2, 5, 2, 6);
      writeCell(ws, enc(2,7), game.team_b,        hStyle(true,10));

      const loRows = [
        ['Lineout Won Outright',  sA.loOutcomes.won_outright,  sB.loOutcomes.won_outright],
        ['Lineout Won Penalty',   sA.loOutcomes.won_penalty,   sB.loOutcomes.won_penalty],
        ['Lineout Won Overthrow', sA.loOutcomes.won_overthrow, sB.loOutcomes.won_overthrow],
        ['Lineout Lost Outright', sA.loOutcomes.lost_outright, sB.loOutcomes.lost_outright],
        ['Lineout Lost Error',    sA.loOutcomes.lost_error,    sB.loOutcomes.lost_error],
        ['Lineout Lost Overthrow',sA.loOutcomes.lost_overthrow,sB.loOutcomes.lost_overthrow],
        [''],
        ['Lineouts Won',          sA.loWon,  sB.loWon],
        ['Lineouts Lost',         sA.loLost, sB.loLost],
        ['% Lineout Success',     (sA.loPct*100).toFixed(1)+'%', (sB.loPct*100).toFixed(1)+'%'],
      ];

      loRows.forEach((row, i) => {
        const r = 3 + i;
        const [label, valA, valB] = row;
        const bold = i >= 8;
        writeCell(ws, enc(r,1), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 1, r, 2);
        if (valA !== undefined) writeCell(ws, enc(r,3), valA, dStyle(bold,10,'center'));
        writeCell(ws, enc(r,5), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 5, r, 6);
        if (valB !== undefined) writeCell(ws, enc(r,7), valB, dStyle(bold,10,'center'));
      });

      ws['!cols'] = [{wch:2},{wch:6},{wch:18},{wch:10},{wch:4},{wch:6},{wch:18},{wch:10}];
      XLSX.utils.book_append_sheet(wb, ws, 'Lineout Results');
    })();

    // ── TURNOVERS SHEET ────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:J20';

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 8);

      writeCell(ws, enc(2,1), `${game.team_a} Turnovers`, hStyle(true,12));
      addMerge(ws, 2, 1, 2, 4);
      writeCell(ws, enc(2,6), `${game.team_b} Turnovers`, hStyle(true,12));
      addMerge(ws, 2, 6, 2, 9);

      writeCell(ws, enc(3,1), game.team_a,  hStyle(true,10));
      addMerge(ws, 3, 1, 3, 2);
      writeCell(ws, enc(3,3), 'Turnovers',  hStyle(true,10));
      addMerge(ws, 3, 3, 3, 4);
      writeCell(ws, enc(3,6), game.team_b,  hStyle(true,10));
      addMerge(ws, 3, 6, 3, 7);
      writeCell(ws, enc(3,8), 'Turnovers',  hStyle(true,10));
      addMerge(ws, 3, 8, 3, 9);

      const toRows = [
        ['Turnovers Won',    sA.toWon,                       sB.toWon,                       true],
        ['Breakdown Steal',  sA.toTypes.breakdown_steal,     sB.toTypes.breakdown_steal,      false],
        ['Interception',     sA.toTypes.interception,        sB.toTypes.interception,         false],
        ['Loose Ball',       sA.toTypes.loose_ball,          sB.toTypes.loose_ball,           false],
        ['Lineout Steal',    sA.toTypes.lineout_steal,       sB.toTypes.lineout_steal,        false],
        ['Scrum Steal',      sA.toTypes.scrum_steal,         sB.toTypes.scrum_steal,          false],
        ['Stripped',         sA.toTypes.stripped,            sB.toTypes.stripped,             false],
        ['Opposition Error', sA.toTypes.opp_error,           sB.toTypes.opp_error,            false],
        [''],
        ['Turnovers Conceded', sA.toConc,                   sB.toConc,                       true],
      ];

      toRows.forEach((row, i) => {
        const r = 4 + i;
        const [label, valA, valB, bold] = row;
        writeCell(ws, enc(r,1), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 1, r, 2);
        if (valA !== undefined) writeCell(ws, enc(r,3), valA, dStyle(bold,10,'center'));
        addMerge(ws, r, 3, r, 4);
        writeCell(ws, enc(r,6), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 6, r, 7);
        if (valB !== undefined) writeCell(ws, enc(r,8), valB, dStyle(bold,10,'center'));
        addMerge(ws, r, 8, r, 9);
      });

      ws['!cols'] = [{wch:2},{wch:5},{wch:16},{wch:5},{wch:10},{wch:4},{wch:5},{wch:16},{wch:5},{wch:10}];
      XLSX.utils.book_append_sheet(wb, ws, 'Turnovers');
    })();

    // ── PENALTIES SHEET ────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:J25';

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 8);

      writeCell(ws, enc(2,1), `${game.team_a} Penalties`, hStyle(true,12));
      addMerge(ws, 2, 1, 2, 4);
      writeCell(ws, enc(2,6), `${game.team_b} Penalties`, hStyle(true,12));
      addMerge(ws, 2, 6, 2, 9);

      writeCell(ws, enc(3,1), game.team_a,   hStyle(true,10));
      addMerge(ws, 3, 1, 3, 2);
      writeCell(ws, enc(3,3), 'Penalties',   hStyle(true,10));
      addMerge(ws, 3, 3, 3, 4);
      writeCell(ws, enc(3,6), game.team_b,   hStyle(true,10));
      addMerge(ws, 3, 6, 3, 7);
      writeCell(ws, enc(3,8), 'Penalties',   hStyle(true,10));
      addMerge(ws, 3, 8, 3, 9);

      const penRows = [
        ['Penalties Conceded', sA.penConc,            sB.penConc,            true],
        ['Yellow Cards',       sA.yellowCards,         sB.yellowCards,        false],
        [''],
        ['Option taken from Penalty', '', '', true],
        ['Kick to Touch',      sA.penOptions.kick_to_touch, sB.penOptions.kick_to_touch, false],
        ['Kick at Goal',       sA.penOptions.kick_at_goal,  sB.penOptions.kick_at_goal,  false],
        ['Scrum',              sA.penOptions.scrum,         sB.penOptions.scrum,          false],
        ['Quick Tap',          sA.penOptions.quick_tap,     sB.penOptions.quick_tap,      false],
        ['Kick in Play',       sA.penOptions.kick_in_play,  sB.penOptions.kick_in_play,   false],
      ];

      penRows.forEach((row, i) => {
        const r = 4 + i;
        const [label, valA, valB, bold] = row;
        const isHeader = bold && valA === '';
        const style = isHeader ? hStyle(true,10) : dStyle(bold,10,'left');
        writeCell(ws, enc(r,1), label, style);
        addMerge(ws, r, 1, r, 2);
        if (!isHeader && valA !== undefined) {
          writeCell(ws, enc(r,3), valA, dStyle(bold,10,'center'));
          addMerge(ws, r, 3, r, 4);
        }
        writeCell(ws, enc(r,6), label, style);
        addMerge(ws, r, 6, r, 7);
        if (!isHeader && valB !== undefined) {
          writeCell(ws, enc(r,8), valB, dStyle(bold,10,'center'));
          addMerge(ws, r, 8, r, 9);
        }
      });

      ws['!cols'] = [{wch:2},{wch:5},{wch:18},{wch:5},{wch:10},{wch:4},{wch:5},{wch:18},{wch:5},{wch:10}];
      XLSX.utils.book_append_sheet(wb, ws, 'Penalties Conceded');
    })();

    // ── TRIES SHEET ────────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:J18';

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 8);

      writeCell(ws, enc(2,1), `${game.team_a} Tries`, hStyle(true,12));
      addMerge(ws, 2, 1, 2, 4);
      writeCell(ws, enc(2,6), `${game.team_b} Tries`, hStyle(true,12));
      addMerge(ws, 2, 6, 2, 9);

      writeCell(ws, enc(3,1), 'Phase of Play', hStyle(true,10));
      addMerge(ws, 3, 1, 3, 2);
      writeCell(ws, enc(3,3), game.team_a,     hStyle(true,10));
      addMerge(ws, 3, 3, 3, 4);
      writeCell(ws, enc(3,6), 'Phase of Play', hStyle(true,10));
      addMerge(ws, 3, 6, 3, 7);
      writeCell(ws, enc(3,8), game.team_b,     hStyle(true,10));
      addMerge(ws, 3, 8, 3, 9);

      const tryRows = [
        ['Tries Scored',   sA.tries,              sB.tries,              true],
        ['1st Phase',      sA.tryPhases.first,    sB.tryPhases.first,    false],
        ['2-3 Phases',     sA.tryPhases.two3,     sB.tryPhases.two3,     false],
        ['4-6 Phases',     sA.tryPhases.four6,    sB.tryPhases.four6,    false],
        ['7+ Phases',      sA.tryPhases.seven,    sB.tryPhases.seven,    false],
      ];

      tryRows.forEach((row, i) => {
        const r = 4 + i;
        const [label, valA, valB, bold] = row;
        writeCell(ws, enc(r,1), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 1, r, 2);
        writeCell(ws, enc(r,3), valA, dStyle(bold,10,'center'));
        addMerge(ws, r, 3, r, 4);
        writeCell(ws, enc(r,6), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 6, r, 7);
        writeCell(ws, enc(r,8), valB, dStyle(bold,10,'center'));
        addMerge(ws, r, 8, r, 9);
      });

      ws['!cols'] = [{wch:2},{wch:5},{wch:16},{wch:5},{wch:10},{wch:4},{wch:5},{wch:16},{wch:5},{wch:10}];
      XLSX.utils.book_append_sheet(wb, ws, 'Tries Scored');
    })();

    // ── KICKS SHEET ────────────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = 'A1:J18';

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 8);

      writeCell(ws, enc(2,1), `${game.team_a} Kicks`, hStyle(true,12));
      addMerge(ws, 2, 1, 2, 4);
      writeCell(ws, enc(2,6), `${game.team_b} Kicks`, hStyle(true,12));
      addMerge(ws, 2, 6, 2, 9);

      writeCell(ws, enc(3,1), 'Kick Type',  hStyle(true,10));
      addMerge(ws, 3, 1, 3, 2);
      writeCell(ws, enc(3,3), game.team_a,  hStyle(true,10));
      addMerge(ws, 3, 3, 3, 4);
      writeCell(ws, enc(3,6), 'Kick Type',  hStyle(true,10));
      addMerge(ws, 3, 6, 3, 7);
      writeCell(ws, enc(3,8), game.team_b,  hStyle(true,10));
      addMerge(ws, 3, 8, 3, 9);

      const kickRows = [
        ['Total Kicks in Play', sA.kicksInPlay,              sB.kicksInPlay,              true],
        ['Contestable',         sA.kickTypes.contestable,    sB.kickTypes.contestable,    false],
        ['Uncontestable',       sA.kickTypes.uncontestable,  sB.kickTypes.uncontestable,  false],
        ['Box Kick',            sA.kickTypes.box_kick,       sB.kickTypes.box_kick,       false],
        ['Grubber',             sA.kickTypes.grubber,        sB.kickTypes.grubber,        false],
        ['To Touch',            sA.kickTypes.to_touch,       sB.kickTypes.to_touch,       false],
        ['Restart',             sA.kickTypes.restart,        sB.kickTypes.restart,        false],
      ];

      kickRows.forEach((row, i) => {
        const r = 4 + i;
        const [label, valA, valB, bold] = row;
        writeCell(ws, enc(r,1), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 1, r, 2);
        writeCell(ws, enc(r,3), valA, dStyle(bold,10,'center'));
        addMerge(ws, r, 3, r, 4);
        writeCell(ws, enc(r,6), label, dStyle(bold,10,'left'));
        addMerge(ws, r, 6, r, 7);
        writeCell(ws, enc(r,8), valB, dStyle(bold,10,'center'));
        addMerge(ws, r, 8, r, 9);
      });

      ws['!cols'] = [{wch:2},{wch:5},{wch:16},{wch:5},{wch:10},{wch:4},{wch:5},{wch:16},{wch:5},{wch:10}];
      XLSX.utils.book_append_sheet(wb, ws, 'Kicks');
    })();

    // ── PLAYER STATS SHEET ─────────────────────────────────────────────
    (() => {
      const ws = {};
      ws['!ref'] = `A1:P${pStats.length + 4}`;

      writeCell(ws, enc(0,0), matchTitle, titleStyle());
      addMerge(ws, 0, 0, 1, 14);

      const headers = [
        'Team','#','Player',
        'Carries','Gainline Made','Gainline %',
        'Passes',
        'Tackles Made','Dominant','Missed','Tackle %',
        'TOs Won','Pens Conceded','Tries','Lineout Throws'
      ];

      headers.forEach((h, c) => {
        writeCell(ws, enc(2, c), h, hStyle(true, 10));
      });

      // Group by team
      const sortedStats = [
        ...pStats.filter(p => p.team === game.team_a),
        ...pStats.filter(p => p.team === game.team_b),
      ].sort((a,b) => (a.number||99)-(b.number||99));

      sortedStats.forEach((p, i) => {
        const r = 3 + i;
        const totalTackles = p.tackles_made + p.tackles_dominant + p.tackles_missed;
        const tacklePct    = totalTackles ? ((p.tackles_made + p.tackles_dominant) / totalTackles * 100).toFixed(1) + '%' : '0%';
        const gainlinePct  = p.carries ? (p.gainline_made / p.carries * 100).toFixed(1) + '%' : '0%';
        const isHomeTeam   = p.team === game.team_a;
        const rowBg        = isHomeTeam ? '00EBF1DE' : '00DBEAFE';

        const rowStyle = {
          font:      { size: 10, name: 'Calibri' },
          fill:      { patternType: 'solid', fgColor: { rgb: rowBg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top:    { style: 'thin', color: { rgb: '00CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: '00CCCCCC' } },
            left:   { style: 'thin', color: { rgb: '00CCCCCC' } },
            right:  { style: 'thin', color: { rgb: '00CCCCCC' } },
          }
        };

        const nameStyle = { ...rowStyle, alignment: { horizontal: 'left', vertical: 'center' } };

        const vals = [
          p.team, p.number || '', p.name,
          p.carries, p.gainline_made, gainlinePct,
          p.passes,
          p.tackles_made, p.tackles_dominant, p.tackles_missed, tacklePct,
          p.turnovers_won, p.penalties_conceded, p.tries, p.lineout_throws
        ];

        vals.forEach((v, c) => {
          writeCell(ws, enc(r, c), v, c === 2 ? nameStyle : rowStyle);
        });
      });

      ws['!cols'] = [
        {wch:14},{wch:4},{wch:22},{wch:8},{wch:12},{wch:10},
        {wch:8},{wch:12},{wch:10},{wch:8},{wch:10},
        {wch:10},{wch:14},{wch:6},{wch:14}
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Player Stats');
    })();

    // ── EVENTS SHEET ───────────────────────────────────────────────────
    (() => {
      const ws = {};
      const headers = ['Time','Half','Team','Event','Outcome','Sub Type','Player','Player 2','Zone','Phase'];
      ws['!ref'] = `A1:J${events.length + 2}`;

      headers.forEach((h, c) => writeCell(ws, enc(0, c), h, hStyle(true, 10)));

      events.forEach((e, i) => {
        const r = 1 + i;
        const vals = [
          e.match_time || '', e.half || '', e.team,
          e.event_type, e.outcome || '', e.sub_type || '',
          e.player_name || '', e.player_name_2 || '',
          e.field_zone || '', e.phase || ''
        ];
        vals.forEach((v, c) => writeCell(ws, enc(r, c), v, dStyle(false, 10, c < 2 ? 'center' : 'left')));
      });

      ws['!cols'] = [
        {wch:8},{wch:6},{wch:16},{wch:16},{wch:16},
        {wch:16},{wch:20},{wch:20},{wch:12},{wch:8}
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Events');
    })();

    // ── Send file ──────────────────────────────────────────────────────
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

  function timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
  }

  function getLastEventTime(events) {
    const last = events[events.length - 1];
    return last ? last.match_time : '00:00';
  }

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

      // Possession — time-weighted based on possession_start events
      const possEvents = events.filter(e => e.event_type === 'possession_start');
      let teamPossSeconds = 0;
      let totalSeconds    = 0;

      for (let i = 0; i < possEvents.length; i++) {
        const current = possEvents[i];
        const next    = possEvents[i + 1];
        const startSecs = timeToSeconds(current.match_time);
        const endSecs   = next ? timeToSeconds(next.match_time) : timeToSeconds(getLastEventTime(events));

        const duration = Math.max(0, endSecs - startSecs);
        totalSeconds  += duration;
        if (current.team === team) teamPossSeconds += duration;
      }

      // Territory — same approach with territory events
      const terrEvents = events.filter(e => e.event_type === 'territory');
      let teamTerrSeconds = 0;
      let totalTerrSeconds = 0;

      for (let i = 0; i < terrEvents.length; i++) {
        const current = terrEvents[i];
        const next    = terrEvents[i + 1];
        const startSecs = timeToSeconds(current.match_time);
        const endSecs   = next ? timeToSeconds(next.match_time) : timeToSeconds(getLastEventTime(events));

        const duration    = Math.max(0, endSecs - startSecs);
        totalTerrSeconds += duration;
        if (current.team === team) teamTerrSeconds += duration;
      }

      // Kicks in play (excludes penalty goals and kicks to touch at lineout)
      const kicksInPlay = kicks.filter(e =>
        e.sub_type === 'in_play' ||
        e.sub_type === 'contestable' ||
        e.sub_type === 'uncontestable'
      ).length;

      return {
        possession: totalSeconds    ? Math.round(teamPossSeconds / totalSeconds * 100)    : 0,
        territory:  totalTerrSeconds ? Math.round(teamTerrSeconds / totalTerrSeconds * 100) : 0,
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