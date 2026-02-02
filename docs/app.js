// docs/app.js

async function searchGuild() {
    const guildName = document.getElementById('guild-input').value.trim();
    const cacheUrl = './data/summary.json';

    try {
        // 1. Fetch guild profile
        const profile = await fetchGuildProfile(guildName);

        // 2. Try loading weekly rankings from local file
        let weeklyData;
        try {
            const cacheResponse = await fetch(cacheUrl);
            if (!cacheResponse.ok) throw new Error("summary.json missing");
            const cachedData = await cacheResponse.json();
            weeklyData = cachedData.weekly;
        } catch (err) {
            console.warn("summary.json missing — fetching live top 10 instead");

            // Fallback: fetch top 10 for Default/Woodcutting
            weeklyData = await fetchTop10Fallback();
        }

        // 3. Display results
        displayGuildInfo(guildName, profile, weeklyData);

    } catch (err) {
        console.error("Search failed:", err);
        document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
    }
}

async function fetchGuildProfile(guildName) {
    const apiUrl = `https://query.idleclans.com/api/ClanCup/standings/${guildName}?gameMode=Default`; //`https://query.idleclans.com/api/Clan/logs/clan/${guildName}`;
    // const proxied = `https://thingproxy.freeboard.io/fetch/${apiUrl}`; //previous proxy corsproxy.io stoped working

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Guild not found");

    return await res.json();
}

async function fetchTop10Fallback() {
    const apiUrl = "https://query.idleclans.com/api/ClanCup/top-clans/current?gameMode=Default";//"https://query.idleclans.com/api/ClanCup/leaderboard/Default/Woodcutting";
    // const proxied = `https://thingproxy.freeboard.io/fetch/${apiUrl}`;

    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("Failed to fetch fallback leaderboard");

    const data = await res.json();

    // API returns: { skillName: [ { clanName, score }, ... ] }
    return {
        data // array of top 10 clans
    };
}

function getRankInfo(skillName, top10, yourScore, yourRank) {
    // Case 1: You are in top 10
    if (yourRank) {
        const index = yourRank - 1;

        // Rank 1 → no one above you
        if (index === 0) {
            return {
                rank: yourRank,
                needed: 0,
                neededText: "You are Rank #1"
            };
        }

        const nextScore = top10[index - 1].score;
        return {
            rank: yourRank,
            needed: nextScore - yourScore,
            neededText: `${nextScore - yourScore} to reach Rank ${yourRank - 1}`
        };
    }

    // Case 2: Not in top 10
    const tenthScore = top10[9].score;
    const needed = tenthScore - yourScore;

    return {
        rank: "Not in Top 10",
        needed,
        neededText: `${needed} to enter Top 10`
    };
}

// ---------------------------------------------------------
// DISPLAY RESULTS
// ---------------------------------------------------------
function displayGuildInfo(guildName, profile, weeklyData) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<h2>${guildName} — Skill Breakdown</h2>`;

    Object.keys(weeklyData).forEach(skillName => {
        const top10 = weeklyData[skillName];
        const yourScore = profile.skills[skillName] ?? 0;
        const yourRank = profile.rankings[skillName];

        const info = getRankInfo(skillName, top10, yourScore, yourRank);

        resultsDiv.innerHTML += `
            <div class="skill-card">
                <h3>${skillName}</h3>
                <table>
                    <tr><td>Your Score:</td><td>${yourScore}</td></tr>
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

