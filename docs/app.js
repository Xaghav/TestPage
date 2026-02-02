// docs/app.js

async function searchGuild() {
    const guildName = document.getElementById('guild-input').value.trim();
    const cacheUrl = './data/summary.json';

    try {
        // 1. Fetch guild profile
        const profileRaw = await fetchGuildProfile(guildName);
        const profileMap = normalizeProfile(profileRaw);

        // 2. Load weekly leaderboard (local cache → fallback to live)
        let leaderboardRaw;
        try {
            const cacheResponse = await fetch(cacheUrl);
            if (!cacheResponse.ok) throw new Error("summary.json missing");
            const cachedData = await cacheResponse.json();
            leaderboardRaw = cachedData.weekly;
        } catch (err) {
            console.warn("summary.json missing — fetching live top 10 instead");
            leaderboardRaw = await fetchTop10Fallback();
        }

        // Normalize leaderboard
        const leaderboardMap = normalizeLeaderboard(leaderboardRaw.data);

        // Merge profile + leaderboard
        const merged = mergeProfileAndLeaderboard(profileMap, leaderboardMap);

        // 3. Display results
        displayGuildInfo(guildName, merged);

    } catch (err) {
        console.error("Search failed:", err);
        document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
    }
}


// ---------------------------------------------------------
// API CALLS
// ---------------------------------------------------------

async function fetchGuildProfile(guildName) {
    const apiUrl = `https://query.idleclans.com/api/ClanCup/standings/${guildName}?gameMode=Default`;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Guild not found");

    return await res.json();
}

async function fetchTop10Fallback() {
    const apiUrl = "https://query.idleclans.com/api/ClanCup/top-clans/current?gameMode=Default";

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Failed to fetch fallback leaderboard");

    const data = await res.json();

    return { data };
}


// ---------------------------------------------------------
// NORMALIZERS
// ---------------------------------------------------------

function normalizeLeaderboard(apiResponse) {
    const map = {};

    apiResponse.topScoreClans.forEach(entry => {
        map[entry.objective] = entry.standings;
    });

    apiResponse.topTimeClans.forEach(entry => {
        map[entry.objective] = entry.standings;
    });

    return map;
}

function normalizeProfile(profileArray) {
    const map = {};

    profileArray.forEach(entry => {
        map[entry.objective] = {
            score: entry.score ?? null,
            bestTime: entry.bestTime ?? null,
            rank: entry.rank
        };
    });

    return map;
}

function mergeProfileAndLeaderboard(profileMap, leaderboardMap) {
    const merged = {};

    Object.keys(leaderboardMap).forEach(objective => {
        const profile = profileMap[objective] || {};

        merged[objective] = {
            yourScore: profile.score ?? null,
            yourBestTime: profile.bestTime ?? null,
            yourRank: profile.rank ?? null,
            top10: leaderboardMap[objective]
        };
    });

    return merged;
}


// ---------------------------------------------------------
// RANK CALCULATION
// ---------------------------------------------------------

function getRankInfo(top10, yourScore, yourRank) {
    if (yourRank && yourRank <= 10) {
        const index = yourRank - 1;

        if (index === 0) {
            return { rank: yourRank, neededText: "You are Rank #1" };
        }

        const nextScore = top10[index - 1].score;
        return {
            rank: yourRank,
            neededText: `${nextScore - yourScore} to reach Rank ${yourRank - 1}`
        };
    }

    // Not in top 10
    const tenthScore = top10[9].score;
    return {
        rank: "Not in Top 10",
        neededText: `${tenthScore - yourScore} to enter Top 10`
    };
}


// ---------------------------------------------------------
// DISPLAY RESULTS
// ---------------------------------------------------------

function displayGuildInfo(guildName, merged) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<h2>${guildName} — Skill Breakdown</h2>`;

    Object.entries(merged).forEach(([objective, data]) => {
        const { yourScore, yourBestTime, yourRank, top10 } = data;

        const info = getRankInfo(top10, yourScore, yourRank);

        resultsDiv.innerHTML += `
            <div class="skill-card">
                <h3>${objective}</h3>
                <table>
                    <tr><td>Your Score:</td><td>${yourScore ?? "—"}</td></tr>
                    <tr><td>Your Rank:</td><td>${info.rank}</td></tr>
                    <tr><td>Needed:</td><td>${info.neededText}</td></tr>
                </table>

                <h4>Top 10</h4>
                <table class="leaderboard">
                    <tr><th>Rank</th><th>Clan</th><th>Score</th></tr>
                    ${top10.map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${c.clanName}</td>
                            <td>${c.score}</td>
                        </tr>
                    `).join("")}
                </table>
            </div>
        `;
    });
}
