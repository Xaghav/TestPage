// docs/app.js

async function searchGuild() {
    const guildName = document.getElementById('guild-input').value.trim();
    const cacheUrl = './data/summary.json';

    if (!guildName) return;

    try {
        // 1. Fetch guild profile (array of objectives)
        const profileRaw = await fetchGuildProfile(guildName);
        const profileMap = normalizeProfile(profileRaw);

        // 2. Load leaderboard (cache → live)
        let leaderboardRaw;
        try {
            const cacheResponse = await fetch(cacheUrl);
            if (!cacheResponse.ok) throw new Error("summary.json missing");
            const cachedData = await cacheResponse.json();
            leaderboardRaw = cachedData.weekly; // should be { topScoreClans, topTimeClans }
        } catch (err) {
            console.warn("summary.json missing — fetching live top 10 instead");
            leaderboardRaw = await fetchTop10Live(); // returns { topScoreClans, topTimeClans }
        }

        const leaderboardMap = normalizeLeaderboard(leaderboardRaw);
        const merged = mergeProfileAndLeaderboard(profileMap, leaderboardMap);

        displayGuildInfo(guildName, merged);

    } catch (err) {
        console.error("Search failed:", err);
        document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
    }
}

// ---------------- API CALLS ----------------

async function fetchGuildProfile(guildName) {
    const apiUrl = `https://query.idleclans.com/api/ClanCup/standings/${guildName}?gameMode=Default`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Guild not found");
    return await res.json(); // array of { objective, score | bestTime, rank }
}

async function fetchTop10Live() {
    const apiUrl = "https://query.idleclans.com/api/ClanCup/top-clans/current?gameMode=Default";
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Failed to fetch leaderboard");
    const json = await res.json();
    return json; // { topScoreClans, topTimeClans }
}

// ---------------- NORMALIZERS ----------------

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

    // Score-based objectives
    (apiResponse.topScoreClans || []).forEach(entry => {
        map[entry.objective] = entry.standings.map(s => ({
            clanName: s.clanName,
            score: s.score,
            bestTime: null
        }));
    });

    // Time-based objectives
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

// ---------------- RANK / PROGRESS LOGIC ----------------

function getRankInfo(skill) {
    const { type, yourScore, yourBestTime, yourRank, top10 } = skill;

    // If no data or no top10, bail
    if (!top10 || top10.length < 10) {
        return {
            rank: yourRank ?? "N/A",
            neededText: "Not enough data",
            progress: 0
        };
    }

    // In top 10
    if (yourRank && yourRank <= 10) {
        const index = yourRank - 1;

        if (index === 0) {
            return { rank: yourRank, neededText: "You are Rank #1", progress: 100 };
        }

        const above = top10[index - 1];

        if (type === "score") {
            const diff = above.score - yourScore;
            const base = top10[9].score; // rough scale
            const progress = Math.min(100, Math.max(0, (yourScore / above.score) * 100));
            return {
                rank: yourRank,
                neededText: `${diff} more points to reach Rank ${yourRank - 1}`,
                progress
            };
        }

        if (type === "speed") {
            const diff = yourBestTime - above.bestTime;
            const worst = top10[9].bestTime;
            const progress = Math.min(100, Math.max(0, ((worst - yourBestTime) / (worst - above.bestTime)) * 100));
            return {
                rank: yourRank,
                neededText: `${diff} ms faster to reach Rank ${yourRank - 1}`,
                progress
            };
        }
    }

    // Not in top 10
    const tenth = top10[9];

    if (type === "score") {
        const diff = tenth.score - (yourScore ?? 0);
        const progress = Math.min(100, Math.max(0, (yourScore / tenth.score) * 100));
        return {
            rank: "Not in Top 10",
            neededText: `${diff} more points to enter Top 10`,
            progress
        };
    }

    if (type === "speed" && yourBestTime != null) {
        const diff = yourBestTime - tenth.bestTime;
        const worst = tenth.bestTime;
        const best = top10[0].bestTime;
        const progress = Math.min(100, Math.max(0, ((worst - yourBestTime) / (worst - best)) * 100));
        return {
            rank: "Not in Top 10",
            neededText: `${diff} ms faster to enter Top 10`,
            progress
        };
    }

    return {
        rank: yourRank ?? "N/A",
        neededText: "No performance recorded",
        progress: 0
    };
}

// ---------------- DISPLAY ----------------

function displayGuildInfo(guildName, merged) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<h2>${guildName} — Skill Breakdown</h2>`;

    const scoreSkills = [];
    const speedSkills = [];

    Object.entries(merged).forEach(([objective, skill]) => {
        if (skill.type === "speed") speedSkills.push([objective, skill]);
        else scoreSkills.push([objective, skill]);
    });

    if (scoreSkills.length) {
        resultsDiv.innerHTML += `<h3 class="section-title score-title">Score-based Objectives</h3>`;
        resultsDiv.innerHTML += `<div class="cards-grid score-grid"></div>`;
        const scoreGrid = resultsDiv.querySelector('.score-grid');

        scoreSkills.forEach(([objective, skill]) => {
            const cardHtml = renderSkillCard(guildName, objective, skill);
            scoreGrid.innerHTML += cardHtml;
        });
    }

    if (speedSkills.length) {
        resultsDiv.innerHTML += `<h3 class="section-title speed-title">Speed-based Objectives</h3>`;
        resultsDiv.innerHTML += `<div class="cards-grid speed-grid"></div>`;
        const speedGrid = resultsDiv.querySelector('.speed-grid');

        speedSkills.forEach(([objective, skill]) => {
            const cardHtml = renderSkillCard(guildName, objective, skill);
            speedGrid.innerHTML += cardHtml;
        });
    }
}

function renderSkillCard(guildName, objective, skill) {
    const info = getRankInfo(skill);

    const label = skill.type === "score" ? "Score" : "Time (ms)";
    const yourValue = skill.type === "score"
        ? (skill.yourScore ?? "—")
        : (skill.yourBestTime != null ? skill.yourBestTime : "—");

    const progress = isNaN(info.progress) ? 0 : info.progress;

    return `
        <div class="skill-card ${skill.type === "speed" ? "speed-card" : "score-card"}">
            <h4>${objective}</h4>
            <div class="meta">
                <div><span class="label">Your ${label}:</span> <span>${yourValue}</span></div>
                <div><span class="label">Your Rank:</span> <span>${info.rank}</span></div>
                <div><span class="label">Needed:</span> <span>${info.neededText}</span></div>
            </div>

            <div class="progress-wrapper">
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${progress}%;"></div>
                </div>
                <span class="progress-text">${Math.round(progress)}% toward next milestone</span>
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
