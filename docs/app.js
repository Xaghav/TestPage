// docs/app.js

async function searchGuild() {
    const guildName = document.getElementById('guild-input').value.trim();
    const cacheUrl = './data/summary.json';

    try {
        // 1. Fetch live clan profile from IdleClans API
        const profileResponse = await fetch(`https://query.idleclans.com/api/Clan/logs/clan/${guildName}`);
        
        if (!profileResponse.ok) {
            throw new Error("Clan not found or API error");
        }

        const profile = await profileResponse.json();

        // 2. Fetch cached weekly rankings
        const cacheResponse = await fetch(cacheUrl);
        const cachedData = await cacheResponse.json();

        displayGuildInfo(profile, cachedData.weekly);

    } catch (err) {
        console.error("Search failed:", err);
        document.getElementById('results').innerHTML = `<p>Error: ${err.message}</p>`;
    }
}

function displayGuildInfo(profile, weeklyData) {
    const resultsDiv = document.getElementById('results');
    const guildName = profile.clanName;

    resultsDiv.innerHTML = `<h3>${guildName} Stats</h3>`;

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
