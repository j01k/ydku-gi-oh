const puppeteer = require('puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');
const readline = require('readline');
const fs = require('fs');

puppeteerExtra.use(StealthPlugin());

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

        let attempts = 0;
        while (!requestComplete && attempts < 5) {
            console.log(`⏳ Waiting for data... (Attempt ${attempts + 1}/5)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
        }

        await browser.close();

        if (replayData && replayData.length > 0) {
            console.log("\n🎮 --- Parsed Replay Data ---");
            parseReplayData(replayData);
        } else {
            console.log("⚠️ No valid replay data found. Try again.");
        }

    } catch (error) {
        console.error("❌ ERROR:", error);
    }
}

function parseReplayData(plays) {
    let gameDecks = [];
    let currentGame = -1;

    plays.forEach(play => {
        if (Array.isArray(play.log)) {
            currentGame++;
            gameDecks[currentGame] = {};
            console.log(`\n🎮 Processing Game ${currentGame + 1}...`);
        }

        if (!play.log || !play.log.username) return;
        const username = play.log.username;

        if (username === "Duelingbook") return; // Ignore system logs

        const publicLog = play.log.public_log || "";
        const privateLog = play.log.private_log || "";

        if (!gameDecks[currentGame]) gameDecks[currentGame] = {};
        if (!gameDecks[currentGame][username]) gameDecks[currentGame][username] = {};

        function addCardToDeck(cardName, action) {
            gameDecks[currentGame][username][cardName] = (gameDecks[currentGame][username][cardName] || 0) + 1;
            
            // ✅ Debugging Output: Print each occurrence
            console.log(`📌 ${action}: ${cardName} → ${username}`);
        }

        // 🔹 Match "Drew" actions from PRIVATE LOG
        [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Drew"));

        // 🔹 Match "Banished" actions from PUBLIC LOG
        [...publicLog.matchAll(/Banished \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Banished"));

        // 🔹 Match "Sent to Graveyard" actions from PUBLIC LOG
        [...publicLog.matchAll(/Sent(?: Set)?\s*"([^"]+)"(?: from .*?)?\s+to GY/g)]
            .forEach(match => addCardToDeck(match[1], "Sent to GY"));
    });

    gameDecks.forEach((gameDeck, gameIndex) => {
        Object.keys(gameDeck).forEach(username => {
            const filePath = `${username}-game${gameIndex + 1}-deck.txt`;
            let content = "";

            // ✅ Sort each individual game deck by lowest to highest count
            const sortedCards = Object.entries(gameDeck[username])
                .sort((a, b) => a[1] - b[1]);

            sortedCards.forEach(([cardName, count]) => {
                content += `${cardName} x${count}\n`;
            });

            fs.writeFileSync(filePath, content, "utf-8");
            console.log(`✅ Saved ${filePath}`);
        });
    });

    mergeGameDecks(gameDecks);
}

function mergeGameDecks(gameDecks) {
    const finalDecks = {};

    gameDecks.forEach(gameDeck => {
        Object.keys(gameDeck).forEach(username => {
            if (!finalDecks[username]) finalDecks[username] = {};

            Object.entries(gameDeck[username]).forEach(([cardName, count]) => {
                // Keep the highest count seen across games, capped at 3
                finalDecks[username][cardName] = Math.min(3, Math.max(finalDecks[username][cardName] || 0, count));
            });
        });
    });

    Object.keys(finalDecks).forEach(username => {
        const filePath = `${username}-final-deck.txt`;
        let content = "";

        // ✅ Sort final deck by smallest to greatest count
        const sortedCards = Object.entries(finalDecks[username])
            .sort((a, b) => a[1] - b[1]);

        sortedCards.forEach(([cardName, count]) => {
            content += `${cardName} x${count}\n`;
        });

        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`✅ Saved ${filePath}`);
    });
}

askForReplayURL();
