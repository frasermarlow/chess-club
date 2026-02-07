// Chess Club Ranking System — Firebase Edition

const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const DEFAULT_LEAGUES = [
    { name: "Lord of the Rings", players: ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"] },
    { name: "League B", players: ["Player 6", "Player 7", "Player 8", "Player 9", "Player 10"] },
    { name: "League C", players: ["Player 11", "Player 12", "Player 13", "Player 14", "Player 15"] },
    { name: "League D", players: ["Player 16", "Player 17", "Player 18", "Player 19", "Player 20"] }
];

// --- App State ---

let leagues = [];   // Array of { id, name, players }
let matches = [];   // Array of { id, leagueId, player1, player2, winner, date }
let isAdmin = false;
let currentUser = null;

// --- Auth ---

const loginBtn = document.getElementById("login-btn");

loginBtn.addEventListener("click", () => {
    if (currentUser) {
        auth.signOut();
    } else {
        auth.signInWithPopup(googleProvider);
    }
});

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        loginBtn.textContent = "Sign out";
        // Check if user is admin
        try {
            const adminDoc = await db.collection("admins").doc(user.email).get();
            isAdmin = adminDoc.exists;
        } catch (e) {
            // If read fails (e.g. not authenticated yet), not admin
            isAdmin = false;
        }
    } else {
        loginBtn.textContent = "Sign in";
        isAdmin = false;
    }
    updateAdminUI();
    renderCurrentView();
});

function updateAdminUI() {
    document.querySelectorAll(".admin-only").forEach(el => {
        el.classList.toggle("hidden", !isAdmin);
    });

    // If user was on an admin-only view but lost admin status, go back to standings
    const activeView = document.querySelector(".nav-btn.active");
    if (activeView && activeView.classList.contains("admin-only") && !isAdmin) {
        switchView("standings");
    }
}

// --- Navigation ---

function switchView(viewName) {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (btn) btn.classList.add("active");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(viewName + "-view").classList.add("active");
    renderCurrentView();
}

function renderCurrentView() {
    const activeBtn = document.querySelector(".nav-btn.active");
    if (!activeBtn) return;
    const view = activeBtn.dataset.view;
    if (view === "standings") renderStandings();
    if (view === "record") initRecordForm();
    if (view === "history") renderHistory();
    if (view === "settings") renderSettings();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        switchView(btn.dataset.view);
    });
});

// --- Firestore Real-time Listeners ---

function leagueIdFromIndex(idx) {
    return "league-" + idx;
}

async function seedDefaultLeagues() {
    const batch = db.batch();
    DEFAULT_LEAGUES.forEach((league, i) => {
        const ref = db.collection("leagues").doc(leagueIdFromIndex(i));
        batch.set(ref, { name: league.name, players: league.players });
    });
    await batch.commit();
}

// Listen to leagues collection
db.collection("leagues").orderBy(firebase.firestore.FieldPath.documentId())
    .onSnapshot(async (snapshot) => {
        if (snapshot.empty) {
            // Seed default data on first load
            await seedDefaultLeagues();
            return; // onSnapshot will fire again after seed
        }
        leagues = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderCurrentView();
    });

// Listen to matches collection
db.collection("matches").orderBy("date", "desc")
    .onSnapshot((snapshot) => {
        matches = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        renderCurrentView();
    });

// --- Standings ---

function getLeagueMatches(leagueId) {
    return matches.filter(m => m.leagueId === leagueId);
}

function computeStandings(league) {
    const leagueMatches = getLeagueMatches(league.id);

    const stats = league.players.map((name, idx) => ({
        index: idx,
        name,
        played: 0,
        wins: 0,
        losses: 0,
        points: 0
    }));

    leagueMatches.forEach(match => {
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

    leagues.forEach(league => {
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

    leagueSelect.innerHTML = leagues.map((l, i) =>
        `<option value="${i}">${escapeHtml(l.name)}</option>`
    ).join("");

    function updatePlayers() {
        const league = leagues[leagueSelect.value];
        if (!league) return;

        const players = league.players;
        player1Select.innerHTML = players.map((p, i) =>
            `<option value="${i}">${escapeHtml(p)}</option>`
        ).join("");

        updatePlayer2();
    }

    function updatePlayer2() {
        const league = leagues[leagueSelect.value];
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
        const league = leagues[leagueSelect.value];
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

document.getElementById("submit-result").addEventListener("click", async () => {
    const leagueIdx = parseInt(document.getElementById("league-select").value);
    const p1 = parseInt(document.getElementById("player1-select").value);
    const p2 = parseInt(document.getElementById("player2-select").value);
    const winnerVal = document.getElementById("winner-select").value;
    const message = document.getElementById("result-message");

    if (isNaN(leagueIdx) || isNaN(p1) || isNaN(p2) || winnerVal === "") return;

    const league = leagues[leagueIdx];

    try {
        await db.collection("matches").add({
            leagueId: league.id,
            player1: p1,
            player2: p2,
            winner: winnerVal === "draw" ? "draw" : parseInt(winnerVal),
            date: firebase.firestore.FieldValue.serverTimestamp()
        });

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

        document.getElementById("winner-select").value = "";
        document.getElementById("submit-result").disabled = true;

        setTimeout(() => message.classList.add("hidden"), 3000);
    } catch (e) {
        message.textContent = "Error recording result. Are you signed in as an admin?";
        message.className = "message error";
        setTimeout(() => message.classList.add("hidden"), 3000);
    }
});

// --- Match History ---

function renderHistory() {
    const filterSelect = document.getElementById("history-league-select");
    const historyList = document.getElementById("history-list");

    filterSelect.innerHTML = `<option value="all">All Leagues</option>` +
        leagues.map((l, i) =>
            `<option value="${l.id}">${escapeHtml(l.name)}</option>`
        ).join("");

    function render() {
        const filter = filterSelect.value;
        let filtered = matches;

        if (filter !== "all") {
            filtered = matches.filter(m => m.leagueId === filter);
        }

        // Build league lookup
        const leagueLookup = {};
        leagues.forEach(l => { leagueLookup[l.id] = l; });

        if (filtered.length === 0) {
            historyList.innerHTML = '<div class="no-matches">No matches recorded yet.</div>';
            return;
        }

        historyList.innerHTML = filtered.map(m => {
            const league = leagueLookup[m.leagueId];
            if (!league) return "";

            const p1Name = league.players[m.player1];
            const p2Name = league.players[m.player2];
            const date = m.date ? (m.date.toDate ? m.date.toDate() : new Date(m.date)).toLocaleDateString() : "";
            let result;
            if (m.winner === "draw") {
                result = `${escapeHtml(p1Name)} <span style="color:var(--text-dim)">drew with</span> ${escapeHtml(p2Name)}`;
            } else {
                const winner = league.players[m.winner];
                const loser = winner === p1Name ? p2Name : p1Name;
                result = `<span class="history-winner">${escapeHtml(winner)}</span> <span style="color:var(--text-dim)">defeated</span> ${escapeHtml(loser)}`;
            }

            const deleteBtn = isAdmin
                ? `<button class="history-delete" data-match-id="${m.id}" title="Delete">&#10005;</button>`
                : "";

            return `
                <div class="history-item">
                    <span class="history-league">${escapeHtml(league.name)}</span>
                    <span class="history-match">${result}</span>
                    <span class="history-date">${date}</span>
                    ${deleteBtn}
                </div>`;
        }).join("");

        // Attach delete handlers
        historyList.querySelectorAll(".history-delete").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (confirm("Delete this match result?")) {
                    try {
                        await db.collection("matches").doc(btn.dataset.matchId).delete();
                    } catch (e) {
                        alert("Error deleting match. Are you signed in as an admin?");
                    }
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

    container.innerHTML = leagues.map((league, li) => {
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

document.getElementById("save-settings").addEventListener("click", async () => {
    const message = document.getElementById("settings-message");

    try {
        const batch = db.batch();

        document.querySelectorAll(".league-name-input").forEach(input => {
            const li = parseInt(input.dataset.league);
            const league = leagues[li];
            const newName = input.value.trim() || league.name;
            const newPlayers = [...league.players];

            document.querySelectorAll(`.player-input[data-league="${li}"]`).forEach(pInput => {
                const pi = parseInt(pInput.dataset.player);
                newPlayers[pi] = pInput.value.trim() || league.players[pi];
            });

            batch.update(db.collection("leagues").doc(league.id), {
                name: newName,
                players: newPlayers
            });
        });

        await batch.commit();

        message.textContent = "Settings saved successfully!";
        message.className = "message success";
        setTimeout(() => message.classList.add("hidden"), 3000);
    } catch (e) {
        message.textContent = "Error saving settings. Are you signed in as an admin?";
        message.className = "message error";
        setTimeout(() => message.classList.add("hidden"), 3000);
    }
});

document.getElementById("reset-data").addEventListener("click", async () => {
    if (!confirm("This will delete ALL match history and reset player names. Are you sure?")) return;

    const message = document.getElementById("settings-message");

    try {
        // Delete all matches
        const matchSnap = await db.collection("matches").get();
        const batch1 = db.batch();
        matchSnap.docs.forEach(doc => batch1.delete(doc.ref));
        await batch1.commit();

        // Reset leagues to defaults
        const batch2 = db.batch();
        DEFAULT_LEAGUES.forEach((league, i) => {
            const ref = db.collection("leagues").doc(leagueIdFromIndex(i));
            batch2.set(ref, { name: league.name, players: league.players });
        });
        await batch2.commit();

        message.textContent = "All data has been reset.";
        message.className = "message success";
        setTimeout(() => message.classList.add("hidden"), 3000);
    } catch (e) {
        message.textContent = "Error resetting data. Are you signed in as an admin?";
        message.className = "message error";
        setTimeout(() => message.classList.add("hidden"), 3000);
    }
});

// --- Utilities ---

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
