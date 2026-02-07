// Chess Club Ranking System — Firebase Edition

const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

const DEFAULT_PLAYERS_PER_GROUP = 4;

const DEFAULT_LEAGUE_NAMES = ["Lord of the Rings", "League B", "League C", "League D"];

function buildDefaultLeagues(playersPerGroup) {
    const n = playersPerGroup || DEFAULT_PLAYERS_PER_GROUP;
    return DEFAULT_LEAGUE_NAMES.map((name, li) => {
        const players = [];
        for (let i = 0; i < n; i++) {
            players.push("Player " + (li * n + i + 1));
        }
        return { name, players };
    });
}

// --- App State ---

let leagues = [];   // Array of { id, name, players }
let matches = [];   // Array of { id, leagueId, player1, player2, winner, date }
let playersPerGroup = DEFAULT_PLAYERS_PER_GROUP;
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
    const adminBtnActive = document.getElementById("admin-btn").classList.contains("active");
    if (!isAdmin && (adminBtnActive || (activeView && activeView.classList.contains("admin-only")))) {
        switchView("standings");
    }
}

// --- Navigation ---

let currentView = "standings";

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("admin-btn").classList.remove("active");
    if (viewName === "admin") {
        document.getElementById("admin-btn").classList.add("active");
    } else {
        const btn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
        if (btn) btn.classList.add("active");
    }
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(viewName + "-view").classList.add("active");
    renderCurrentView();
}

function renderCurrentView() {
    if (currentView === "standings") renderStandings();
    if (currentView === "record") initRecordForm();
    if (currentView === "history") renderHistory();
    if (currentView === "admin") renderAdmin();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        switchView(btn.dataset.view);
    });
});

document.getElementById("admin-btn").addEventListener("click", () => {
    switchView("admin");
});

// --- Firestore Real-time Listeners ---

function leagueIdFromIndex(idx) {
    return "league-" + idx;
}

async function seedDefaultLeagues() {
    const defaults = buildDefaultLeagues(playersPerGroup);
    const batch = db.batch();
    defaults.forEach((league, i) => {
        const ref = db.collection("leagues").doc(leagueIdFromIndex(i));
        batch.set(ref, { name: league.name, players: league.players });
    });
    await batch.commit();
}

// Listen to settings
db.collection("settings").doc("general").onSnapshot((doc) => {
    if (doc.exists) {
        playersPerGroup = doc.data().playersPerGroup || DEFAULT_PLAYERS_PER_GROUP;
    } else {
        playersPerGroup = DEFAULT_PLAYERS_PER_GROUP;
    }
    renderCurrentView();
});

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
        draws: 0,
        losses: 0,
        forfeits: 0,
        points: 0
    }));

    leagueMatches.forEach(match => {
        const p1 = stats[match.player1];
        const p2 = stats[match.player2];
        if (!p1 || !p2) return;

        p1.played++;
        p2.played++;

        if (match.winner === "draw") {
            p1.draws++;
            p2.draws++;
            p1.points += 1;
            p2.points += 1;
        } else if (typeof match.winner === "string" && match.winner.startsWith("forfeit-")) {
            const forfeitIdx = parseInt(match.winner.split("-")[1]);
            const forfeiter = forfeitIdx === match.player1 ? p1 : p2;
            forfeiter.forfeits++;
            forfeiter.losses++;
            forfeiter.points -= 1;
        } else if (match.winner === match.player1) {
            p1.wins++;
            p1.points += 3;
            p2.losses++;
        } else if (match.winner === match.player2) {
            p2.wins++;
            p2.points += 3;
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
            let rankClass = rank <= 4 ? ` rank-${rank}` : "";
            return `
                <tr>
                    <td><span class="rank${rankClass}">${rank}</span></td>
                    <td class="player-name">${escapeHtml(p.name)}</td>
                    <td>${p.played}</td>
                    <td class="stat-win">${p.wins}</td>
                    <td class="stat-draw">${p.draws}</td>
                    <td class="stat-loss">${p.losses}</td>
                    <td class="stat-forfeit">${p.forfeits}</td>
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
                        <th>D</th>
                        <th>L</th>
                        <th>F</th>
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
            <option value="forfeit-${p1}">${escapeHtml(league.players[p1])} forfeits</option>
            <option value="forfeit-${p2}">${escapeHtml(league.players[p2])} forfeits</option>
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
        let winnerField;
        if (winnerVal === "draw" || winnerVal.startsWith("forfeit-")) {
            winnerField = winnerVal;
        } else {
            winnerField = parseInt(winnerVal);
        }

        await db.collection("matches").add({
            leagueId: league.id,
            player1: p1,
            player2: p2,
            winner: winnerField,
            date: firebase.firestore.FieldValue.serverTimestamp()
        });

        const p1Name = league.players[p1];
        const p2Name = league.players[p2];
        let resultText;
        if (winnerVal === "draw") {
            resultText = `${p1Name} drew with ${p2Name}`;
        } else if (winnerVal.startsWith("forfeit-")) {
            const forfeitName = league.players[parseInt(winnerVal.split("-")[1])];
            resultText = `${forfeitName} forfeited`;
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
            const date = m.date ? formatDate(m.date.toDate ? m.date.toDate() : new Date(m.date)) : "";
            let result;
            if (m.winner === "draw") {
                result = `${escapeHtml(p1Name)} <span style="color:var(--text-dim)">drew with</span> ${escapeHtml(p2Name)}`;
            } else if (typeof m.winner === "string" && m.winner.startsWith("forfeit-")) {
                const forfeitName = league.players[parseInt(m.winner.split("-")[1])];
                result = `<span style="color:var(--red)">${escapeHtml(forfeitName)}</span> <span style="color:var(--text-dim)">forfeited</span>`;
            } else {
                const winner = league.players[m.winner];
                const loser = winner === p1Name ? p2Name : p1Name;
                result = `<span class="history-winner">${escapeHtml(winner)}</span> <span style="color:var(--text-dim)">defeated</span> ${escapeHtml(loser)}`;
            }

            const dateObj = m.date ? (m.date.toDate ? m.date.toDate() : new Date(m.date)) : null;
            const isoDate = dateObj ? dateObj.toISOString().slice(0, 10) : "";

            const adminBtns = isAdmin
                ? `<input type="date" class="history-date-input hidden" data-match-id="${m.id}" value="${isoDate}">` +
                  `<button class="history-edit" data-match-id="${m.id}" title="Edit date">&#9998;</button>` +
                  `<button class="history-delete" data-match-id="${m.id}" title="Delete">&#10005;</button>`
                : "";

            return `
                <div class="history-item">
                    <span class="history-league">${escapeHtml(league.name)}</span>
                    <span class="history-match">${result}</span>
                    <span class="history-date" data-match-id="${m.id}">${date}</span>
                    ${adminBtns}
                </div>`;
        }).join("");

        // Attach edit-date handlers
        historyList.querySelectorAll(".history-edit").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.matchId;
                const input = historyList.querySelector(`.history-date-input[data-match-id="${id}"]`);
                const dateSpan = historyList.querySelector(`.history-date[data-match-id="${id}"]`);

                if (input.classList.contains("hidden")) {
                    // Show date picker
                    input.classList.remove("hidden");
                    dateSpan.classList.add("hidden");
                    btn.textContent = "\u2714";
                    btn.title = "Save date";
                } else {
                    // Save new date
                    const newDate = input.value;
                    if (newDate) {
                        const ts = firebase.firestore.Timestamp.fromDate(new Date(newDate + "T12:00:00"));
                        db.collection("matches").doc(id).update({ date: ts }).catch(() => {
                            alert("Error updating date. Are you signed in as an admin?");
                        });
                    }
                    input.classList.add("hidden");
                    dateSpan.classList.remove("hidden");
                    btn.textContent = "\u270E";
                    btn.title = "Edit date";
                }
            });
        });

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

// --- Admin ---

async function renderAdmin() {
    renderGeneralSettings();
    renderLeagueSettings();
    await renderAdminList();
}

function renderGeneralSettings() {
    const select = document.getElementById("players-per-group");
    select.innerHTML = "";
    for (let i = 2; i <= 10; i++) {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = i;
        if (i === playersPerGroup) opt.selected = true;
        select.appendChild(opt);
    }
}

document.getElementById("save-general").addEventListener("click", async () => {
    const message = document.getElementById("general-message");
    const newCount = parseInt(document.getElementById("players-per-group").value);

    try {
        await db.collection("settings").doc("general").set(
            { playersPerGroup: newCount },
            { merge: true }
        );

        // Adjust each league's player array to match the new count
        const batch = db.batch();
        leagues.forEach(league => {
            const current = league.players.slice();
            if (newCount > current.length) {
                // Add placeholder players
                for (let i = current.length; i < newCount; i++) {
                    current.push("Player " + (i + 1));
                }
            } else if (newCount < current.length) {
                current.length = newCount;
            }
            batch.update(db.collection("leagues").doc(league.id), { players: current });
        });
        await batch.commit();

        message.textContent = "General settings saved!";
        message.className = "message success";
        setTimeout(() => message.classList.add("hidden"), 3000);
    } catch (e) {
        message.textContent = "Error saving settings. Are you signed in as an admin?";
        message.className = "message error";
        setTimeout(() => message.classList.add("hidden"), 3000);
    }
});

function renderLeagueSettings() {
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

async function renderAdminList() {
    const container = document.getElementById("admin-list");
    try {
        const snapshot = await db.collection("admins").get();
        const emails = snapshot.docs.map(doc => doc.id);
        container.innerHTML = emails.map(email =>
            `<div class="admin-item">${escapeHtml(email)}</div>`
        ).join("");
    } catch (e) {
        container.innerHTML = '<div class="admin-item" style="color:var(--text-dim)">Unable to load admin list.</div>';
    }
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
        const defaults = buildDefaultLeagues(playersPerGroup);
        const batch2 = db.batch();
        defaults.forEach((league, i) => {
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

function formatDate(d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return dd + "/" + mm + "/" + yyyy;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
