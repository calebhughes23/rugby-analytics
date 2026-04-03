const Database = require("better-sqlite3");
const db = new Database('database.db');

db.pragma('journal_mode = WAL');

//create tables if dont exist yet
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    round       TEXT,
    date        TEXT,
    team_a      TEXT NOT NULL,
    team_b      TEXT NOT NULL,
    score_a     INTEGER DEFAULT 0,
    score_b     INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS team_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         INTEGER NOT NULL,
    team            TEXT NOT NULL,
    is_home         INTEGER DEFAULT 1,
    possession      REAL DEFAULT 0,
    territory       REAL DEFAULT 0,
    time_22         REAL DEFAULT 0,
    attacks         INTEGER DEFAULT 0,
    entries_22      INTEGER DEFAULT 0,
    gainline        REAL DEFAULT 0,
    kicks_in_play   INTEGER DEFAULT 0,
    fast_ball       REAL DEFAULT 0,
    scrum_won       INTEGER DEFAULT 0,
    scrum_total     INTEGER DEFAULT 0,
    lo_won          INTEGER DEFAULT 0,
    lo_total        INTEGER DEFAULT 0,
    to_won          INTEGER DEFAULT 0,
    to_conceded     INTEGER DEFAULT 0,
    breakdowns      INTEGER DEFAULT 0,
    pen_conceded    INTEGER DEFAULT 0,
    tries           INTEGER DEFAULT 0,
    conversions     TEXT DEFAULT '',
    pen_kicked      TEXT DEFAULT '',
    yellow_cards    INTEGER DEFAULT 0,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS players (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id     INTEGER NOT NULL,
    team        TEXT NOT NULL,
    name        TEXT NOT NULL,
    number      INTEGER,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id         INTEGER NOT NULL,
    match_time      TEXT,
    half            INTEGER DEFAULT 1,
    team            TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    player_id       INTEGER,
    player_id_2     INTEGER,
    field_zone      TEXT,
    outcome         TEXT,
    phase           INTEGER,
    sub_type        TEXT,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (player_id_2) REFERENCES players(id)
  );
`);

//Queries

const insertGame = db.prepare(`
    INSERT INTO games (round, date, team_a, team_b, score_a, score_b)
    VALUES(@round, @date, @team_a, @team_b, @score_a, @score_b)
`);

const insertStats = db.prepare(`
    INSERT INTO team_stats (
        game_id, team, is_home,
        possession, territory, time_22, attacks, entries_22,
        gainline, kicks_in_play, fast_ball,
        scrum_won, scrum_total, lo_won, lo_total,
        to_won, to_conceded, breakdowns, pen_conceded,
        tries, conversions, pen_kicked, yellow_cards
    ) VALUES (
        @game_id, @team, @is_home,
        @possession, @territory, @time_22, @attacks, @entries_22,
        @gainline, @kicks_in_play, @fast_ball,
        @scrum_won, @scrum_total, @lo_won, @lo_total,
        @to_won, @to_conceded, @breakdowns, @pen_conceded,
        @tries, @conversions, @pen_kicked, @yellow_cards
    )
`);

const saveGame = db.transaction((game) => {
  const info = insertGame.run({
    round:   game.round   || null,
    date:    game.date    || null,
    team_a:  game.teamA,
    team_b:  game.teamB,
    score_a: game.scoreA  || 0,
    score_b: game.scoreB  || 0,
  });

  const gameId = info.lastInsertRowid;
  console.log('Inserted game id:', gameId);

  insertStats.run({ game_id: gameId, team: game.teamA, is_home: 1, ...flattenStats(game.a) });
  insertStats.run({ game_id: gameId, team: game.teamB, is_home: 0, ...flattenStats(game.b) });

  return gameId;
});

function flattenStats(s) {
    return {
        possession:    s.possession    || 0,
        territory:     s.territory     || 0,
        time_22:       s.time22        || 0,
        attacks:       s.attacks       || 0,
        entries_22:    s.entries22     || 0,
        gainline:      s.gainline      || 0,
        kicks_in_play: s.kicksInPlay   || 0,
        fast_ball:     s.fastBall      || 0,
        scrum_won:     s.scrumWon      || 0,
        scrum_total:   s.scrumTotal    || 0,
        lo_won:        s.loWon         || 0,
        lo_total:      s.loTotal       || 0,
        to_won:        s.toWon         || 0,
        to_conceded:   s.toConc        || 0,
        breakdowns:    s.breakdowns    || 0,
        pen_conceded:  s.penConc       || 0,
        tries:         s.tries         || 0,
        conversions:   s.conversions   || '',
        pen_kicked:    s.penKicked     || '',
        yellow_cards:  s.yellowCards   || 0,
    };
}

const getAllGames = db.prepare(`
    SELECT 
        g.*,
        sa.possession   as a_possession,  sb.possession   as b_possession,
        sa.territory    as a_territory,   sb.territory    as b_territory,
        sa.time_22      as a_time22,      sb.time_22      as b_time22,
        sa.attacks      as a_attacks,     sb.attacks      as b_attacks,
        sa.entries_22   as a_entries22,   sb.entries_22   as b_entries22,
        sa.gainline     as a_gainline,    sb.gainline     as b_gainline,
        sa.kicks_in_play as a_kicksInPlay, sb.kicks_in_play as b_kicksInPlay,
        sa.fast_ball    as a_fastBall,    sb.fast_ball    as b_fastBall,
        sa.scrum_won    as a_scrumWon,    sb.scrum_won    as b_scrumWon,
        sa.scrum_total  as a_scrumTotal,  sb.scrum_total  as b_scrumTotal,
        sa.lo_won       as a_loWon,       sb.lo_won       as b_loWon,
        sa.lo_total     as a_loTotal,     sb.lo_total     as b_loTotal,
        sa.to_won       as a_toWon,       sb.to_won       as b_toWon,
        sa.to_conceded  as a_toConc,      sb.to_conceded  as b_toConc,
        sa.breakdowns   as a_breakdowns,  sb.breakdowns   as b_breakdowns,
        sa.pen_conceded as a_penConc,     sb.pen_conceded as b_penConc,
        sa.tries        as a_tries,       sb.tries        as b_tries,
        sa.conversions  as a_conversions, sb.conversions  as b_conversions,
        sa.pen_kicked   as a_penKicked,   sb.pen_kicked   as b_penKicked,
        sa.yellow_cards as a_yellowCards, sb.yellow_cards as b_yellowCards
    FROM games g
    JOIN team_stats sa ON sa.game_id = g.id AND sa.is_home = 1
    JOIN team_stats sb ON sb.game_id = g.id AND sb.is_home = 0
    ORDER BY g.round ASC, g.date ASC
`);

const getGameById = db.prepare(`
    SELECT * FROM games WHERE id = ?
`);

const deleteGame = db.prepare(`
    DELETE FROM games WHERE id = ?
`);

const getTeams = db.prepare(`
    SELECT DISTINCT team FROM team_stats ORDER by team ASC    
`);

const getStatsByTeam = db.prepare(`
    SELECT ts.*, g.round, g.date, g.score_a, g.score_b, g.team_a, g.team_b
    FROM team_stats ts
    JOIN games g ON g.id = ts.game_id
    WHERE ts.team = ?
    ORDER BY g.round ASC, g.date ASC
`);

// ── Player queries ─────────────────────────────────────────────────────

const insertPlayer = db.prepare(`
  INSERT INTO players (game_id, team, name, number)
  VALUES (@game_id, @team, @name, @number)
`);

const getPlayersByGame = db.prepare(`
  SELECT * FROM players WHERE game_id = ? ORDER BY team, number ASC
`);

// ── Event queries ──────────────────────────────────────────────────────

const insertEvent = db.prepare(`
  INSERT INTO events (
    game_id, match_time, half, team, event_type,
    player_id, player_id_2, field_zone, outcome, phase, sub_type
  ) VALUES (
    @game_id, @match_time, @half, @team, @event_type,
    @player_id, @player_id_2, @field_zone, @outcome, @phase, @sub_type
  )
`);

const getEventsByGame = db.prepare(`
  SELECT 
    e.*,
    p1.name as player_name,
    p1.number as player_number,
    p2.name as player_name_2,
    p2.number as player_number_2
  FROM events e
  LEFT JOIN players p1 ON p1.id = e.player_id
  LEFT JOIN players p2 ON p2.id = e.player_id_2
  WHERE e.game_id = ?
  ORDER BY e.id ASC
`);

const deleteEvent = db.prepare(`
  DELETE FROM events WHERE id = ?
`);

const getPlayerStats = db.prepare(`
  SELECT
    p.id,
    p.name,
    p.number,
    p.team,
    COUNT(CASE WHEN e.event_type = 'carry' THEN 1 END)                                    as carries,
    COUNT(CASE WHEN e.event_type = 'carry' AND e.outcome = 'gainline_made' THEN 1 END)    as gainline_made,
    COUNT(CASE WHEN e.event_type = 'pass' THEN 1 END)                                     as passes,
    COUNT(CASE WHEN e.event_type = 'tackle' AND e.outcome = 'made' THEN 1 END)            as tackles_made,
    COUNT(CASE WHEN e.event_type = 'tackle' AND e.outcome = 'dominant' THEN 1 END)        as tackles_dominant,
    COUNT(CASE WHEN e.event_type = 'tackle' AND e.outcome = 'missed' THEN 1 END)          as tackles_missed,
    COUNT(CASE WHEN e.event_type = 'try' THEN 1 END)                                      as tries,
    COUNT(CASE WHEN e.event_type = 'turnover' THEN 1 END)                                 as turnovers_won,
    COUNT(CASE WHEN e.event_type = 'penalty' THEN 1 END)                                  as penalties_conceded,
    COUNT(CASE WHEN e.event_type = 'lineout' THEN 1 END)                                  as lineout_throws
  FROM players p
  LEFT JOIN events e ON e.player_id = p.id
  WHERE p.game_id = ?
  GROUP BY p.id
  ORDER BY p.team, p.number ASC
`);

// Expose db instance for direct queries in server.js
const updateTeamStats = db.transaction((gameId, teamName, isHome, stats) => {
  db.prepare('DELETE FROM team_stats WHERE game_id = ? AND team = ?').run(gameId, teamName);
  insertStats.run({
    game_id:  gameId,
    team:     teamName,
    is_home:  isHome,
    ...stats
  });
});

module.exports = {
  saveGame,
  getAllGames,
  getGameById,
  deleteGame,
  getTeams,
  getStatsByTeam,
  insertPlayer,
  getPlayersByGame,
  insertEvent,
  getEventsByGame,
  deleteEvent,
  getPlayerStats,
  updateTeamStats,
};