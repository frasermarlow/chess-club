// Chess Club Ranking System

const DEFAULT_DATA = {
    leagues: [
        {
            name: "Lord of the Rings",
            players: ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"],
            matches: []
        },
        {
            name: "League B",
            players: ["Player 6", "Player 7", "Player 8", "Player 9", "Player 10"],
            matches: []
        },
        {
            name: "League C",
            players: ["Player 11", "Player 12", "Player 13", "Player 14", "Player 15"],
            matches: []
        },
        {
            name: "League D",
            players: ["Player 16", "Player 17", "Player 18", "Player 19", "Player 20"],
            matches: []
        }
    ]
};

// --- Data Layer ---

function loadData() {
    const stored = localStorage.getItem("chessClubData");
    if (stored) {
        return JSON.parse(stored);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
    localStorage.setItem("chessClubData", JSON.stringify(data));
}

let appData = loadData();

// --- Navigation ---

document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const view = btn.dataset.view;
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
        document.getElementById(view + "-view").classList.add("active");

        if (view === "standings") renderStandings();
        if (view === "record") initRecordForm();
        if (view === "history") renderHistory();
        if (view === "settings") renderSettings();
    });
});

// --- Standings ---

function computeStandings(league) {
    const stats = league.players.map((name, idx) => ({
        index: idx,
        name,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0
    }));

    league.matches.forEach(match => {
        const p1 = stats[match.player1];
        const p2 = stats[match.player2];
        if (!p1 || !p2) return;

        p1.played++;
        p2.played++;

        if (match.winner === match.player1) {
            p1.wins++;
            p1.points += 1;
            p2.losses++;
        } else if (match.winner === match.player2) {
            p2.wins++;
            p2.points += 1;
            p1.losses++;
        }
    });

    stats.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        const aWinRate = a.played ? a.wins / a.played : 0;
        const bWinRate = b.played ? b.wins / b.played : 0;
        return bWinRate - aWinRate;
    });

    return stats;
}

function renderStandings() {
    const grid = document.getElementById("leagues-grid");
    grid.innerHTML = "";

    appData.leagues.forEach(league => {
        const standings = computeStandings(league);
        const card = document.createElement("div");
        card.className = "card league-card";

        let rows = standings.map((p, i) => {
            const rank = i + 1;
            let rankClass = rank <= 3 ? ` rank-${rank}` : "";
            return `
                <tr>
                    <td><span class="rank${rankClass}">${rank}</span></td>
                    <td class="player-name">${escapeHtml(p.name)}</td>
                    <td>${p.played}</td>
                    <td class="stat-win">${p.wins}</td>
                    <td class="stat-loss">${p.losses}</td>
                    <td><strong>${p.points}</strong></td>
                </tr>`;
        }).join("");

        card.innerHTML = `
            <h2>${escapeHtml(league.name)}</h2>
            <table class="standings-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>P</th>
                        <th>W</th>
                        <th>L</th>
                        <th>Pts</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;

        grid.appendChild(card);
    });
}

// --- Record Result ---

function initRecordForm() {
    const leagueSelect = document.getElementById("league-select");
    const player1Select = document.getElementById("player1-select");
    const player2Select = document.getElementById("player2-select");
    const winnerSelect = document.getElementById("winner-select");
    const submitBtn = document.getElementById("submit-result");
    const message = document.getElementById("result-message");

    message.classList.add("hidden");

    // Populate league dropdown
    leagueSelect.innerHTML = appData.leagues.map((l, i) =>
        `<option value="${i}">${escapeHtml(l.name)}</option>`
    ).join("");

    function updatePlayers() {
        const league = appData.leagues[leagueSelect.value];
        if (!league) return;

        const players = league.players;
        player1Select.innerHTML = players.map((p, i) =>
            `<option value="${i}">${escapeHtml(p)}</option>`
        ).join("");

        updatePlayer2();
    }

    function updatePlayer2() {
        const league = appData.leagues[leagueSelect.value];
        if (!league) return;

        const p1Val = parseInt(player1Select.value);
        player2Select.innerHTML = league.players
            .map((p, i) => ({ name: p, index: i }))
            .filter(p => p.index !== p1Val)
            .map(p => `<option value="${p.index}">${escapeHtml(p.name)}</option>`)
            .join("");

        updateWinner();
    }

    function updateWinner() {
        const league = appData.leagues[leagueSelect.value];
        if (!league) return;

        const p1 = parseInt(player1Select.value);
        const p2 = parseInt(player2Select.value);

        winnerSelect.innerHTML = `
            <option value="">-- Select result --</option>
            <option value="${p1}">${escapeHtml(league.players[p1])} wins</option>
            <option value="${p2}">${escapeHtml(league.players[p2])} wins</option>
            <option value="draw">Draw</option>
        `;

        validateForm();
    }

    function validateForm() {
        const p1 = player1Select.value;
        const p2 = player2Select.value;
        const winner = winnerSelect.value;
        submitBtn.disabled = !(p1 !== "" && p2 !== "" && winner !== "" && p1 !== p2);
    }

    leagueSelect.onchange = updatePlayers;
    player1Select.onchange = updatePlayer2;
    player2Select.onchange = updateWinner;
    winnerSelect.onchange = validateForm;

    updatePlayers();
}

document.getElementById("submit-result").addEventListener("click", () => {
    const leagueIdx = parseInt(document.getElementById("league-select").value);
    const p1 = parseInt(document.getElementById("player1-select").value);
    const p2 = parseInt(document.getElementById("player2-select").value);
    const winnerVal = document.getElementById("winner-select").value;
    const message = document.getElementById("result-message");

    if (isNaN(leagueIdx) || isNaN(p1) || isNaN(p2) || winnerVal === "") return;

    const league = appData.leagues[leagueIdx];
    const match = {
        player1: p1,
        player2: p2,
        winner: winnerVal === "draw" ? "draw" : parseInt(winnerVal),
        date: new Date().toISOString()
    };

    league.matches.push(match);
    saveData(appData);

    const p1Name = league.players[p1];
    const p2Name = league.players[p2];
    let resultText;
    if (winnerVal === "draw") {
        resultText = `${p1Name} drew with ${p2Name}`;
    } else {
        const winnerName = league.players[parseInt(winnerVal)];
        resultText = `${winnerName} defeated ${winnerName === p1Name ? p2Name : p1Name}`;
    }

    message.textContent = `Recorded: ${resultText}`;
    message.className = "message success";

    // Reset winner selection
    document.getElementById("winner-select").value = "";
    document.getElementById("submit-result").disabled = true;

    setTimeout(() => message.classList.add("hidden"), 3000);
});

// --- Match History ---

function renderHistory() {
    const filterSelect = document.getElementById("history-league-select");
    const historyList = document.getElementById("history-list");

    // Populate filter
    filterSelect.innerHTML = `<option value="all">All Leagues</option>` +
        appData.leagues.map((l, i) =>
            `<option value="${i}">${escapeHtml(l.name)}</option>`
        ).join("");

    function render() {
        const filter = filterSelect.value;
        let allMatches = [];

        appData.leagues.forEach((league, leagueIdx) => {
            if (filter !== "all" && parseInt(filter) !== leagueIdx) return;

            league.matches.forEach((match, matchIdx) => {
                allMatches.push({
                    leagueIdx,
                    matchIdx,
                    leagueName: league.name,
                    match,
                    players: league.players
                });
            });
        });

        // Sort newest first
        allMatches.sort((a, b) => new Date(b.match.date) - new Date(a.match.date));

        if (allMatches.length === 0) {
            historyList.innerHTML = '<div class="no-matches">No matches recorded yet.</div>';
            return;
        }

        historyList.innerHTML = allMatches.map(m => {
            const p1Name = m.players[m.match.player1];
            const p2Name = m.players[m.match.player2];
            const date = new Date(m.match.date).toLocaleDateString();
            let result;
            if (m.match.winner === "draw") {
                result = `${escapeHtml(p1Name)} <span style="color:var(--text-dim)">drew with</span> ${escapeHtml(p2Name)}`;
            } else {
                const winner = m.players[m.match.winner];
                const loser = winner === p1Name ? p2Name : p1Name;
                result = `<span class="history-winner">${escapeHtml(winner)}</span> <span style="color:var(--text-dim)">defeated</span> ${escapeHtml(loser)}`;
            }
            return `
                <div class="history-item">
                    <span class="history-league">${escapeHtml(m.leagueName)}</span>
                    <span class="history-match">${result}</span>
                    <span class="history-date">${date}</span>
                    <button class="history-delete" data-league="${m.leagueIdx}" data-match="${m.matchIdx}" title="Delete">&#10005;</button>
                </div>`;
        }).join("");

        // Attach delete handlers
        historyList.querySelectorAll(".history-delete").forEach(btn => {
            btn.addEventListener("click", () => {
                const li = parseInt(btn.dataset.league);
                const mi = parseInt(btn.dataset.match);
                if (confirm("Delete this match result?")) {
                    appData.leagues[li].matches.splice(mi, 1);
                    saveData(appData);
                    render();
                }
            });
        });
    }

    filterSelect.onchange = render;
    render();
}

// --- Settings ---

function renderSettings() {
    const container = document.getElementById("settings-leagues");
    const message = document.getElementById("settings-message");
    message.classList.add("hidden");

    container.innerHTML = appData.leagues.map((league, li) => {
        const playerInputs = league.players.map((p, pi) =>
            `<div class="form-group">
                <label>Player ${pi + 1}</label>
                <input type="text" class="player-input" data-league="${li}" data-player="${pi}" value="${escapeHtml(p)}">
            </div>`
        ).join("");

        return `
            <div class="settings-league">
                <div class="form-group">
                    <label>League Name</label>
                    <input type="text" class="league-name-input" data-league="${li}" value="${escapeHtml(league.name)}">
                </div>
                ${playerInputs}
            </div>`;
    }).join("");
}

document.getElementById("save-settings").addEventListener("click", () => {
    const message = document.getElementById("settings-message");

    document.querySelectorAll(".league-name-input").forEach(input => {
        const li = parseInt(input.dataset.league);
        appData.leagues[li].name = input.value.trim() || appData.leagues[li].name;
    });

    document.querySelectorAll(".player-input").forEach(input => {
        const li = parseInt(input.dataset.league);
        const pi = parseInt(input.dataset.player);
        appData.leagues[li].players[pi] = input.value.trim() || appData.leagues[li].players[pi];
    });

    saveData(appData);

    message.textContent = "Settings saved successfully!";
    message.className = "message success";
    setTimeout(() => message.classList.add("hidden"), 3000);
});

document.getElementById("reset-data").addEventListener("click", () => {
    if (confirm("This will delete ALL match history and reset player names. Are you sure?")) {
        appData = JSON.parse(JSON.stringify(DEFAULT_DATA));
        saveData(appData);
        renderSettings();
        const message = document.getElementById("settings-message");
        message.textContent = "All data has been reset.";
        message.className = "message success";
        setTimeout(() => message.classList.add("hidden"), 3000);
    }
});

// --- Utilities ---

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// --- Init ---

renderStandings();
