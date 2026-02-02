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
    const apiUrl = `https://query.idleclans.com/api/Clan/logs/clan/${guildName}`;
    const proxied = `https://thingproxy.freeboard.io/fetch/${apiUrl}`;

    const res = await fetch(proxied);
    if (!res.ok) throw new Error("Guild not found");

    return await res.json();
}

async function fetchTop10Fallback() {
    const url = "https://query.idleclans.com/api/ClanCup/leaderboard/Default/Woodcutting";
    const proxied = `https://thingproxy.freeboard.io/fetch/${apiUrl}`;

    const res = await fetch(proxied);
    if (!res.ok) throw new Error("Failed to fetch fallback leaderboard");

    const data = await res.json();

    // Convert API format → your expected format
    return {
        "Woodcutting": data // array of top 10 clans
    };
}

function displayGuildInfo(guildName, profile, weeklyData) {
    const resultsDiv = document.getElementById('results');

    resultsDiv.innerHTML = `<h3>${profile} Stats</h3>`;

    Object.keys(weeklyData).forEach(eventName => {
        const top10 = weeklyData[eventName];
        const guildInEvent = top10.find(c => c.clanName === guildName);
        const thirdPlace = top10[2];

        let statusText = "Not in Top 10";

        if (guildInEvent) {
            const rank = top10.indexOf(guildInEvent) + 1;
            statusText = `Rank: ${rank}`;

            if (rank > 3) {
                const diff = thirdPlace.score - guildInEvent.score;
                statusText += ` (${diff} behind 3rd place)`;
            }
        }

        resultsDiv.innerHTML += `<div><strong>${eventName}:</strong> ${statusText}</div>`;
    });
}
