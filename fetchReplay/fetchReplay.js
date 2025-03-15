const puppeteer = require('puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

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

        const betId = extractBetId(url);
        if (!betId) {
            console.error("❌ Could not extract Bet ID from URL.");
            askForReplayURL();
            return;
        }

        await fetchReplay(url, betId);
        askForReplayURL();
    });
}

function extractBetId(url) {
    const match = url.match(/id=([\d-]+)/);
    return match ? match[1] : null;
}

async function fetchReplay(url, betId) {
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
        while (!requestComplete && attempts < 15) {
            console.log(`⏳ Waiting for data... (Attempt ${attempts + 1}/15)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
        }

        await browser.close();

        if (replayData && replayData.length > 0) {
            console.log("\n🎮 --- Parsed Replay Data ---");
            parseReplayData(replayData, betId);
        } else {
            console.log("⚠️ No valid replay data found. Try again.");
        }

    } catch (error) {
        console.error("❌ ERROR:", error);
    }
}

const limitToOne = new Set([
    "Black Luster Soldier - Envoy of the Beginning", "Breaker the Magical Warrior", "Cyber Jar",
    "Dark Magician of Chaos", "D.D. Warrior Lady", "Exodia the Forbidden One", "Exiled Force",
    "Injection Fairy Lily", "Jinzo", "Left Arm of the Forbidden One", "Left Leg of the Forbidden One",
    "Morphing Jar", "Protector of the Sanctuary", "Reflect Bounder", "Right Arm of the Forbidden One",
    "Right Leg of the Forbidden One", "Sacred Phoenix of Nephthys", "Sangan", "Sinister Serpent",
    "Tribe-Infecting Virus", "Twin-Headed Behemoth", "Card Destruction", "Delinquent Duo", "Graceful Charity",
    "Heavy Storm", "Lightning Vortex", "Mage Power", "Mystical Space Typhoon", "Pot of Greed",
    "Premature Burial", "Snatch Steal", "Swords of Revealing Light", "United We Stand", "Call of the Haunted",
    "Ceasefire", "Deck Devastation Virus", "Magic Cylinder", "Mirror Force", "Reckless Greed",
    "Ring of Destruction", "Torrential Tribute"
]);

const limitToTwo = new Set([
    "Abyss Soldier", "Dark Scorpion - Chick the Yellow", "Manticore of Darkness", "Marauding Captain",
    "Night Assailant", "Vampire Lord", "Creature Swap", "Emergency Provisions", "Level Limit - Area B",
    "Nobleman of Crossout", "Reinforcement of the Army", "Upstart Goblin", "Good Goblin Housekeeping",
    "Gravity Bind", "Last Turn"
]);

function parseReplayData(plays, betId) {
    const folderPath = path.join(__dirname, betId);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
    }

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

        if (username === "Duelingbook") return;

        const publicLog = play.log.public_log || "";
        const privateLog = play.log.private_log || "";

        if (!gameDecks[currentGame]) gameDecks[currentGame] = {};
        if (!gameDecks[currentGame][username]) gameDecks[currentGame][username] = {};

        function addCardToDeck(cardName, action) {
            gameDecks[currentGame][username][cardName] = (gameDecks[currentGame][username][cardName] || 0) + 1;
        }

        [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Drew"));
        [...publicLog.matchAll(/Banished \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Banished"));
        [...publicLog.matchAll(/Sent(?: Set)?\s*"([^"]+)"(?: from .*?)?\s+to GY/g)]
            .forEach(match => addCardToDeck(match[1], "Sent to GY"));
    });

    saveGameDecks(gameDecks, folderPath);
    mergeGameDecks(gameDecks, folderPath);
}

function saveGameDecks(gameDecks, folderPath) {
    gameDecks.forEach((gameDeck, gameIndex) => {
        Object.keys(gameDeck).forEach(username => {
            const filePath = path.join(folderPath, `${username}-game${gameIndex + 1}-deck.txt`);
            let content = "";

            const sortedCards = Object.entries(gameDeck[username])
                .sort((a, b) => a[1] - b[1]);

            sortedCards.forEach(([cardName, count]) => {
                content += `${cardName} x${count}\n`;
            });

            fs.writeFileSync(filePath, content, "utf-8");
            console.log(`✅ Saved ${filePath}`);
        });
    });
}

function mergeGameDecks(gameDecks, folderPath) {
    const finalDecks = {};

    gameDecks.forEach(gameDeck => {
        Object.keys(gameDeck).forEach(username => {
            if (!finalDecks[username]) finalDecks[username] = {};

            Object.entries(gameDeck[username]).forEach(([cardName, count]) => {
                let maxCount = Math.max(finalDecks[username][cardName] || 0, count);

                if (limitToOne.has(cardName)) maxCount = 1;
                else if (limitToTwo.has(cardName)) maxCount = Math.min(2, maxCount);
                else maxCount = Math.min(3, maxCount);

                finalDecks[username][cardName] = maxCount;
            });
        });
    });

    Object.keys(finalDecks).forEach(username => {
        const filePath = path.join(folderPath, `${username}-final-deck.txt`);
        let content = Object.entries(finalDecks[username])
            .sort((a, b) => a[1] - b[1])
            .map(([cardName, count]) => `${cardName} x${count}`)
            .join("\n");

        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`✅ Saved ${filePath}`);
    });
}

askForReplayURL();
