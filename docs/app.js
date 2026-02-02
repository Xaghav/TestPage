// docs/app.js

async function searchGuild() {
    const guildName = document.getElementById('guild-input').value;
    const cacheUrl = './data/summary.json';
    
    try {
        // 1. Fetch live profile from API (or cached if preferred)
        const profileResponse = await fetch(`https://query.idleclans.com{guildName}`);
        const profile = await profileResponse.json();

        // 2. Fetch cached weekly rankings for "Distance to Top 3"
        const cacheResponse = await fetch(cacheUrl);
        const cachedData = await cacheResponse.json();
        
        displayGuildInfo(profile, cachedData.weekly);
    } catch (err) {
        console.error("Search failed:", err);
    }
}

function displayGuildInfo(profile, weeklyData) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<h3>${profile.name} Stats</h3>`;

    // Calculate Distance from Top 3 for each event
    // weeklyData structure: { eventName: [ {clanName, score}, ... ] }
    Object.keys(weeklyData).forEach(eventName => {
        const top10 = weeklyData[eventName];
        const guildInEvent = top10.find(c => c.clanName === profile.name);
        const thirdPlace = top10[2]; // Index 2 is 3rd place

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
