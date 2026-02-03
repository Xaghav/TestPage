let CURRENT_GUILD = null;
let CURRENT_MERGED = null;

// ------------------------------
// ENTRY: SEARCH GUILD
// ------------------------------

async function searchGuild() {
    const guildName = document.getElementById('guild-input').value.trim();
    const cacheUrl = './data/summary.json';

    if (!guildName) return;

    try {
        const profileRaw = await fetchGuildProfile(guildName);
        const profileMap = normalizeProfile(profileRaw);

        let leaderboardRaw;
        try {
            const cacheResponse = await fetch(cacheUrl);
            if (!cacheResponse.ok) throw new Error("summary.json missing");
            const cachedData = await cacheResponse.json();
            leaderboardRaw = cachedData.weekly;
        } catch (err) {
            leaderboardRaw = await fetchTop10Live();
        }

        const leaderboardMap = normalizeLeaderboard(leaderboardRaw);
        const merged = mergeProfileAndLeaderboard(profileMap, leaderboardMap);

        // ⭐ Store global state
        CURRENT_GUILD = guildName;
        CURRENT_MERGED = merged;

        renderDashboard(guildName, merged);

    } catch (err) {
        document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
    }
}



// ------------------------------
// API CALLS
// ------------------------------
async function fetchGuildProfile(guildName) {
    const apiUrl = `https://query.idleclans.com/api/ClanCup/standings/${guildName}?gameMode=Default`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Guild not found");
    return await res.json();
}

async function fetchTop10Live() {
    const apiUrl = "https://query.idleclans.com/api/ClanCup/top-clans/current?gameMode=Default";
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Failed to fetch leaderboard");
    return await res.json();
}

// ------------------------------
// NORMALIZERS
// ------------------------------
function normalizeProfile(profileArray) {
    const map = {};
    profileArray.forEach(entry => {
        const isSpeed = entry.bestTime !== undefined && entry.bestTime !== null;
        map[entry.objective] = {
            type: isSpeed ? "speed" : "score",
            score: isSpeed ? null : entry.score,
            bestTime: isSpeed ? entry.bestTime.time : null,
            rank: entry.rank
        };
    });
    return map;
}

function normalizeLeaderboard(apiResponse) {
    const map = {};

    (apiResponse.topScoreClans || []).forEach(entry => {
        map[entry.objective] = entry.standings.map(s => ({
            clanName: s.clanName,
            score: s.score,
            bestTime: null
        }));
    });

    (apiResponse.topTimeClans || []).forEach(entry => {
        map[entry.objective] = entry.standings.map(s => ({
            clanName: s.clanName,
            score: null,
            bestTime: s.bestTime.time
        }));
    });

    return map;
}

function mergeProfileAndLeaderboard(profileMap, leaderboardMap) {
    const merged = {};
    Object.keys(leaderboardMap).forEach(objective => {
        const profile = profileMap[objective] || {};
        merged[objective] = {
            type: profile.type || (leaderboardMap[objective][0]?.bestTime ? "speed" : "score"),
            yourScore: profile.score ?? null,
            yourBestTime: profile.bestTime ?? null,
            yourRank: profile.rank ?? null,
            top10: leaderboardMap[objective]
        };
    });
    return merged;
}

// ------------------------------
// RANK / PROGRESS LOGIC
// ------------------------------
function getRankInfo(skill) {
    const { type, yourScore, yourBestTime, yourRank, top10 } = skill;

    if (!top10 || top10.length < 10) {
        return { rank: yourRank ?? "N/A", neededText: "Not enough data", progress: 0 };
    }

    // Common references
    const topOne = type === "speed" ? top10[0].bestTime : top10[0].score;
    const topTen = type === "speed" ? top10[9].bestTime : top10[9].score;

    // ------------------------------
    // CASE 1 — You are in the Top 10
    // ------------------------------
    if (yourRank && yourRank <= 10) {
        const index = yourRank - 1;

        // Rank 1 → perfect
        if (index === 0) {
            return { rank: yourRank, neededText: "You are Rank #1", progress: 100 };
        }

        const above = top10[index - 1];

        // SCORE LOGIC
        if (type === "score") {
            const diff = above.score - yourScore;
            const progress = Math.min(100, (yourScore / topOne) * 100);
            return { rank: yourRank, neededText: `${diff} more points`, progress };
        }

        // SPEED LOGIC
        if (type === "speed") {
            const diff = yourBestTime - above.bestTime;

            // Clamp your time between topOne and topTen
            const clamped = Math.min(Math.max(yourBestTime, topOne), topTen);

            const progress = ((topTen - clamped) / (topTen - topOne)) * 100;

            return {
                rank: yourRank,
                neededText: `${diff} ms slower`,
                progress: Math.round(progress)
            };
        }
    }

    // ------------------------------
    // CASE 2 — You are NOT in the Top 10
    // ------------------------------

    // SCORE LOGIC
    if (type === "score") {
        const diff = topTen - (yourScore ?? 0);
        const progress = Math.min(100, ((yourScore ?? 0) / topTen) * 100);
        return { rank: "Not in Top 10", neededText: `${diff} more points`, progress };
    }

    // SPEED LOGIC
    if (type === "speed" && yourBestTime != null) {
        const diff = yourBestTime - topTen;

        // Clamp your time between topOne and topTen
        const clamped = Math.min(Math.max(yourBestTime, topOne), topTen);

        const progress = ((topTen - clamped) / (topTen - topOne)) * 100;

        return {
            rank: "Not in Top 10",
            neededText: `${diff} ms slower`,
            progress: Math.round(progress)
        };
    }

    // ------------------------------
    // CASE 3 — No performance recorded
    // ------------------------------
    return { rank: yourRank ?? "Not in Top 10", neededText: "No performance recorded", progress: 0 };
}


// ------------------------------
// SORTING + FILTERING
// ------------------------------
function sortSkills(skills, merged, sortBy) {
    return skills.sort(([aName], [bName]) => {
        const a = merged[aName];
        const b = merged[bName];

        switch (sortBy) {
            case "rank":
                return (a.yourRank ?? 9999) - (b.yourRank ?? 9999);

            case "score": {
                const aVal = a.type === "score" ? a.yourScore ?? 0 : -(a.yourBestTime ?? 9999999);
                const bVal = b.type === "score" ? b.yourScore ?? 0 : -(b.yourBestTime ?? 9999999);
                return bVal - aVal;
            }

            case "progress":
                return getRankInfo(b).progress - getRankInfo(a).progress;

            default:
                return aName.localeCompare(bName);
        }
    });
}

function filterSkills(skills, merged, filterBy) {
    return skills.filter(([_, skill]) => {
        if (filterBy === "top10") return skill.yourRank && skill.yourRank <= 10;
        if (filterBy === "score") return skill.type === "score";
        if (filterBy === "speed") return skill.type === "speed";
        return true;
    });
}

// ------------------------------
// MODAL HELPERS
// ------------------------------
function openModal(html) {
    const overlay = document.getElementById("modal-overlay");
    const content = document.getElementById("modal-content");
    if (!overlay || !content) return;
    content.innerHTML = html;
    overlay.classList.remove("hidden");
}

function closeModal() {
    const overlay = document.getElementById("modal-overlay");
    if (!overlay) return;
    overlay.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("modal-close");
    const overlay = document.getElementById("modal-overlay");

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) {
        overlay.addEventListener("click", e => {
            if (e.target.id === "modal-overlay") closeModal();
        });
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") closeModal();
    });
});

// ------------------------------
// GLOBAL COLLAPSE / EXPAND LOGIC
// ------------------------------
let allCollapsed = false;

function applyGlobalCollapseState() {
    document.querySelectorAll(".skill-card").forEach(card => {
        card.classList.toggle("collapsed-card", allCollapsed);

        const btn = card.querySelector(".collapse-btn");
        if (btn) btn.textContent = allCollapsed ? "Expand" : "Collapse";
    });

    const globalBtn = document.getElementById("toggle-all");
    if (globalBtn) globalBtn.textContent = allCollapsed ? "Expand All" : "Collapse All";
}

function updateGlobalButtonState() {
    const cards = [...document.querySelectorAll(".skill-card")];
    const collapsedCount = cards.filter(c => c.classList.contains("collapsed-card")).length;

    if (collapsedCount === cards.length) {
        allCollapsed = true;
    } else if (collapsedCount === 0) {
        allCollapsed = false;
    }

    const globalBtn = document.getElementById("toggle-all");
    if (globalBtn) globalBtn.textContent = allCollapsed ? "Expand All" : "Collapse All";
}

// ------------------------------
// RENDER DASHBOARD 
// ------------------------------
function renderDashboard(guildName, merged) {
    const resultsDiv = document.getElementById('results');

    // Save previous UI state
    const prevSort = document.getElementById("sort-select")?.value || "objective";
    const prevFilter = document.getElementById("filter-select")?.value || "all";
    const prevSearch = document.getElementById("overview-search")?.value || "";

    // Clear container safely
    resultsDiv.innerHTML = "";

    // Render controls
    resultsDiv.insertAdjacentHTML("afterbegin", `
        <h2>${guildName} — Skill Overview</h2>

        <div class="controls">
            <label>Sort:</label>
            <select id="sort-select">
                <option value="objective">Objective (A–Z)</option>
                <option value="rank">Rank (Best → Worst)</option>
                <option value="score">Score / Time</option>
                <option value="progress">Progress</option>
            </select>

            <label>Filter:</label>
            <select id="filter-select">
                <option value="all">All Skills</option>
                <option value="top10">Top 10 Only</option>
                <option value="score">Score Skills</option>
                <option value="speed">Speed Skills</option>
            </select>

            <input id="overview-search" type="text" placeholder="Search skills...">
        </div>
    `);

    // Restore previous values
    document.getElementById("sort-select").value = prevSort;
    document.getElementById("filter-select").value = prevFilter;
    document.getElementById("overview-search").value = prevSearch;

    // Insert overview table
    const tableHTML = renderOverviewTable(guildName, merged);
    resultsDiv.insertAdjacentHTML("beforeend", tableHTML);

    // ⭐ Add row → modal click listeners (NEW)
    document.querySelectorAll(".overview-row").forEach(row => {
        row.addEventListener("click", () => {
            const obj = row.dataset.objective;
            const skill = merged[obj];
            const info = getRankInfo(skill);

            const label = skill.type === "score" ? "Score" : "Time (ms)";
            const yourValue = skill.type === "score" ? skill.yourScore : skill.yourBestTime;
            const keys = "<>< [][";

            const modalHTML = `
                <h2>${obj}</h2>
                <p><strong>Your ${label}:</strong> ${yourValue ?? "—"}</p>
                <p><strong>Your Rank:</strong> ${info.rank}</p>
                <p><strong>Needed:</strong> ${info.neededText}</p>
                ${obj?.endsWith("Kills") 
                    ? `<p><strong>{}{:</strong> ${keys}</p>` 
                    : ""
                }
                
                <div class="progress-wrapper">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${info.progress}%;"></div>
                    </div>
                    <span class="progress-text">${Math.round(info.progress)}% progress</span>
                </div>

                <h3>Top 10</h3>
                <table class="leaderboard">
                    <tr><th>Rank</th><th>Clan</th><th>${label}</th></tr>
                    ${skill.top10.map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${c.clanName}</td>
                            <td>${skill.type === "score" ? c.score : c.bestTime}</td>
                        </tr>
                    `).join("")}
                </table>
            `;

            openModal(modalHTML);
        });
    });

    // Attach listeners
    document.getElementById("sort-select").addEventListener("change", () => {
        renderDashboard(CURRENT_GUILD, CURRENT_MERGED);
    });

    document.getElementById("filter-select").addEventListener("change", () => {
        renderDashboard(CURRENT_GUILD, CURRENT_MERGED);
    });

    document.getElementById("overview-search").addEventListener("input", () => {
        renderDashboard(CURRENT_GUILD, CURRENT_MERGED);
    });

    // Detailed breakdown
    resultsDiv.insertAdjacentHTML("beforeend", `
        <h2>Detailed Breakdown</h2>
        <button id="toggle-all" class="global-collapse-btn">Collapse All</button>
    `);

    renderDetailedSections(guildName, merged);

    // Collapse all button
    document.getElementById("toggle-all").addEventListener("click", () => {
        allCollapsed = !allCollapsed;
        applyGlobalCollapseState();
    });

    applyGlobalCollapseState();
}


// ------------------------------
// OVERVIEW TABLE
// ------------------------------
function renderOverviewTable(guildName, merged) {
    const sortBy = document.getElementById("sort-select")?.value || "objective";
    const filterBy = document.getElementById("filter-select")?.value || "all";
    const searchTerm = document.getElementById("overview-search")?.value.toLowerCase() || "";

    let skills = Object.entries(merged);
    skills = filterSkills(skills, merged, filterBy);
    skills = sortSkills(skills, merged, sortBy);
    skills = skills.filter(([name]) => name.toLowerCase().includes(searchTerm));

    let html = `
        <table class="overview-table">
            <tr>
                <th>Objective</th>
                <th>Your Rank</th>
                <th>Your Score / Time</th>
                <th>Top 10 Threshold</th>
                <th>Status</th>
            </tr>
    `;

    skills.forEach(([objective, skill]) => {
        const info = getRankInfo(skill);
        const labelVal = skill.type === "score" ? skill.yourScore : skill.yourBestTime;
        const tenth = skill.top10[9];
        const threshold = skill.type === "score" ? tenth.score : tenth.bestTime;

        const isTop = info.rank !== "Not in Top 10";
        const status = isTop ? `Top ${info.rank}` : "Below Top 10";
        const statusClass = isTop ? "status-top" : "status-below";
        const rowClass = isTop ? "status-row-top" : "status-row-below";

        html += `
            <tr class="overview-row" data-objective="${objective}">
                <td>${objective}</td>
                <td>${info.rank}</td>
                <td>${labelVal ?? "—"}</td>
                <td>${threshold}</td>
                <td class="${statusClass}">${status}</td>
            </tr>
        `;
    });

    html += `</table>`;
    return html;
}


// ------------------------------
// DETAILED SECTIONS
// ------------------------------
function renderDetailedSections(guildName, merged) {
    const resultsDiv = document.getElementById('results');

    const scoreSkills = Object.entries(merged).filter(([_, s]) => s.type === "score");
    const speedSkills = Object.entries(merged).filter(([_, s]) => s.type === "speed");

    // SCORE SECTION
    resultsDiv.insertAdjacentHTML("beforeend", `
        <h3 class="section-title score-title">Score-based</h3>
        <div class="cards-grid score-grid"></div>
    `);

    const scoreGrid = resultsDiv.querySelector('.score-grid');

    scoreSkills.forEach(([objective, skill]) => {
        scoreGrid.insertAdjacentHTML("beforeend", renderSkillCard(guildName, objective, skill));
    });

    // SPEED SECTION
    resultsDiv.insertAdjacentHTML("beforeend", `
        <h3 class="section-title speed-title">Speed-based</h3>
        <div class="cards-grid speed-grid"></div>
    `);

    const speedGrid = resultsDiv.querySelector('.speed-grid');

    speedSkills.forEach(([objective, skill]) => {
        speedGrid.insertAdjacentHTML("beforeend", renderSkillCard(guildName, objective, skill));
    });

    // Collapse buttons
    document.querySelectorAll(".skill-card .collapse-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const card = btn.closest(".skill-card");
            const collapsed = card.classList.toggle("collapsed-card");
            btn.textContent = collapsed ? "Expand" : "Collapse";
            updateGlobalButtonState();
        });
    });
}


// ------------------------------
// SKILL CARD RENDER
// ------------------------------
function renderSkillCard(guildName, objective, skill) {
    const info = getRankInfo(skill);
    const label = skill.type === "score" ? "Score" : "Time (ms)";
    const yourValue = skill.type === "score" ? skill.yourScore : skill.yourBestTime;

    return `
        <div class="skill-card ${skill.type === "speed" ? "speed-card" : "score-card"}">
            <div class="card-header-row">
                <h4>${objective}</h4>
                <button class="collapse-btn">Collapse</button>
            </div>

            <div class="meta">
                <div><span class="label">Your ${label}:</span> <span>${yourValue ?? "—"}</span></div>
                <div><span class="label">Your Rank:</span> <span>${info.rank}</span></div>
                <div><span class="label">Needed:</span> <span>${info.neededText}</span></div>
            </div>

            <div class="progress-wrapper">
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${info.progress}%;"></div>
                </div>
                <span class="progress-text">${Math.round(info.progress)}% progress</span>
            </div>

            <h5>Top 10</h5>
            <table class="leaderboard">
                <tr><th>Rank</th><th>Clan</th><th>${label}</th></tr>
                ${skill.top10.map((c, i) => `
                    <tr class="${c.clanName === guildName ? 'your-guild' : ''}">
                        <td>${i + 1}</td>
                        <td>${c.clanName}</td>
                        <td>${skill.type === "score" ? c.score : c.bestTime}</td>
                    </tr>
                `).join("")}
            </table>
        </div>
    `;
}
