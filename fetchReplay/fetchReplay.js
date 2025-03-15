const puppeteer = require('puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');
const readline = require('readline');
const fs = require('fs');

puppeteerExtra.use(StealthPlugin());

// Create input prompt
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askForReplayURL() {
    rl.question("\n🔹 Enter DuelingBook replay URL (or press ENTER to exit): ", async (url) => {
        if (!url) {
            console.log("\n👋 Exiting...");
            rl.close();
            process.exit(0);
        }

        if (!url.includes("duelingbook.com/replay?id=")) {
            console.error("❌ Invalid URL. Please enter a valid replay URL.");
            askForReplayURL();
            return;
        }

        await fetchReplay(url);
        askForReplayURL();
    });
}

// Function to fetch replay data
async function fetchReplay(url) {
    console.log(`\n🔍 Fetching replay data from: ${url}`);

    try {
        const browser = await puppeteer.launch({
            headless: false,
            executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        console.log("🚀 Puppeteer launched successfully.");
        const page = await browser.newPage();

        let replayData = null;
        let requestComplete = false;

        // Intercept network response and extract JSON
        page.on("response", async (response) => {
            const requestUrl = response.url();
            if (requestUrl.includes("/view-replay")) {
                try {
                    const json = await response.json();

                    if (json.plays && json.plays.length > 0) {
                        replayData = json.plays;
                        requestComplete = true;
                        console.log("✅ Replay data successfully retrieved.");
                    }
                } catch (err) {
                    console.error("❌ Failed to parse JSON:", err);
                }
            }
        });

        console.log("🌐 Navigating to page...");
        await page.goto(url, { waitUntil: "networkidle2" });

        // ⏳ Ensure we wait until the request completes
        let attempts = 0;
        while (!requestComplete && attempts < 5) {
            console.log(`⏳ Waiting for data... (Attempt ${attempts + 1}/5)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
        }

        await browser.close();

        if (replayData && replayData.length > 0) {
            console.log("\n🎮 --- Parsed Replay Data ---");

            // ✅ Print Rock-Paper-Scissors Results (Now With Correct Names)
            replayData.forEach(play => {
                if (play.play === "RPS") {
                    console.log(`🟢 ${play.player1} chose: ${play.player1_choice || "N/A"}`);
                    console.log(`🔴 ${play.player2} chose: ${play.player2_choice || "N/A"}`);
                    console.log(`🏆 Winner: ${play.winner || "N/A"}`);
                    console.log('-------------------');
                }
            });

            const filePath = `console.txt`;
            // Convert replayData to a string before writing to the file
            const replayDataString = typeof replayData === 'string' ? replayData : JSON.stringify(replayData, null, 2);

            fs.writeFileSync(filePath, replayDataString, "utf-8");
            parseReplayData(replayData);
        } else {
            console.log("⚠️ No valid replay data found. Try again.");
        }

    } catch (error) {
        console.error("❌ ERROR:", error);
    }
}

// ✅ Function to parse replay data and extract logs
function parseReplayData(plays) {
    const playerDecks = {};

    plays.forEach(play => {
        if (!play.log || !play.log.username) return;

        const username = play.log.username;

        // 🔥 Skip entries for "Duelingbook"
        if (username === "Duelingbook") return;

        const publicLog = play.log.public_log || "";
        const privateLog = play.log.private_log || "";

        if (!playerDecks[username]) playerDecks[username] = {};

        function addCardToDeck(logUsername, cardName) {
            if (logUsername === username) {
                playerDecks[username][cardName] = (playerDecks[username][cardName] || 0) + 1;
            }
        }

        // Match "Drew" actions from PRIVATE LOG
        const drewMatches = [...privateLog.matchAll(/Drew \"(.+?)\"/g)];
        drewMatches.forEach(match => addCardToDeck(username, match[1]));

        // Match "Banished" actions from PUBLIC LOG
        const banishedMatches = [...publicLog.matchAll(/Banished \"(.+?)\"/g)];
        banishedMatches.forEach(match => addCardToDeck(username, match[1]));

        // Match "Sent to Graveyard" actions from PUBLIC LOG
        const graveyardMatches = [...publicLog.matchAll(/Sent(?: Set)?\s*\"([^\"]+)\"(?: from .*?)?\s+to GY/g)];
        graveyardMatches.forEach(match => addCardToDeck(username, match[1]));
    });

    saveDeckFiles(playerDecks);
}

// ✅ Function to save combined deck logs into a single text file per player, sorted by count (ascending)
function saveDeckFiles(playerDecks) {
    Object.keys(playerDecks).forEach(username => {
        const filePath = `${username}-deck.txt`;
        
        // Sort cards by count (smallest to greatest)
        const sortedCards = Object.entries(playerDecks[username])
            .sort((a, b) => a[1] - b[1]); 

        // Format content for the text file
        let content = sortedCards.map(([cardName, count]) => `${cardName} x${count}`).join("\n");

        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`✅ Saved ${filePath}`);
    });
}

askForReplayURL();
