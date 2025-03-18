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

let cardSerialMapping = {};

function askForReplayURL() {
    rl.question("\n🔹 Enter DuelingBook replay URL (or press ENTER to exit): ", async (url) => {
        if (!url) {
            console.log("\n👋 Exiting...");
            rl.close();
            process.exit(0);
        }

        if (!url.includes("duelingbook.com/replay?id=")) {
            console.error("⚠️ Invalid URL format detected.");
            askForReplayURL();
            return;
        }

        await fetchReplay(url);
        askForReplayURL();
    });
}

async function fetchReplay(url) {
    console.log(`\n🔍 Connecting to source...`);

    const browserPaths = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ];

    let browser;

    for (const path of browserPaths) {
        try {
            browser = await puppeteer.launch({
                headless: false,
                executablePath: path,
                args: ["--no-sandbox", "--disable-setuid-sandbox"]
            });
            console.log(`🚀 Using browser at: ${path}`);
            break;
        } catch (err) {
            console.warn(`⚠️ Could not launch browser at: ${path}`);
        }
    }

    if (!browser) {
        console.error("❌ No supported browser found. Please install Chrome, Brave, Firefox, or Edge.");
        process.exit(1);
    }

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
                        console.log("✅ Data Stream Successfully Retrieved.");
                    }
                } catch (err) {
                    console.error(sanitizeError(err));
                }
            }
        });

        console.log("🌐 Requesting Data...");
        await page.goto(url, { waitUntil: "networkidle2" });

        let attempts = 0;
        while (!requestComplete && attempts < 15) {
            console.log(`⏳ Processing Data... (Attempt ${attempts + 1}/15)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
        }

        await browser.close();

        if (replayData && replayData.length > 0) {
            console.log("\n🎮 --- Data Analysis in Progress ---");
            parseReplayData(replayData);
        } else {
            console.log("⚠️ Unexpected System Interruption.");
        }
    }

// ✅ Parse Replay Data
function parseReplayData(plays) {
    let gameDecks = [];
    let currentGame = -1;

    plays.forEach(play => {
        if (Array.isArray(play.log)) {
            currentGame++;
            gameDecks[currentGame] = {};
            console.log(`\n🎮 Processing Game ${currentGame + 1}...`);   
        }
        

        if (play.card && play.card.name && play.card.serial_number) {
            cardSerialMapping[play.card.name] = play.card.serial_number;
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
            console.log(`📌 ${action}: ${cardName} → ${username}`);
        }
        // Handle high-level logs (initial draws and game start)
        if (Array.isArray(play.log)) {
            play.log.forEach(logEntry => {
                if (!logEntry.private_log || !logEntry.username) return;
                const username = logEntry.username;
                const privateLog = logEntry.private_log;
                // Track initial draws
                [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Drew"));
            });
        }

        [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Drew"));
        [...privateLog.matchAll(/Added \"(.+?)\" from Deck to hand/g)].forEach(match => addCardToDeck(match[1], "Added to Hand from deck"));
        [...publicLog.matchAll(/Milled \"(.+?)\" from top of deck/g)].forEach(match => addCardToDeck(match[1], "Milled from deck"));
        [...publicLog.matchAll(/Special Summoned \"(.+?)\" from Deck/g)].forEach(match => addCardToDeck(match[1], "Special Summoned from deck"));
        [...publicLog.matchAll(/Banished \"(.+?)\" from Deck/g)].forEach(match => addCardToDeck(match[1], "Banished from deck"));
        [...publicLog.matchAll(/Sent(?: Set)?\s*"([^"]+)" from Deck to GY/g)]
            .forEach(match => addCardToDeck(match[1], "Sent to GY from deck"));

    });

    mergeGameDecks(gameDecks);
}

function mergeGameDecks(gameDecks) {
    const finalDecks = {};

    gameDecks.forEach(gameDeck => {
        Object.keys(gameDeck).forEach(username => {
            if (!finalDecks[username]) finalDecks[username] = {};
            Object.entries(gameDeck[username]).forEach(([cardName, count]) => {
                finalDecks[username][cardName] = Math.max(finalDecks[username][cardName] || 0, count);
            });
        });
    });

    Object.keys(finalDecks).forEach(username => {
        const filePath = `${username}-final-deck.ydk`;
        let content = `#created by ...\n#main\n`;

        Object.entries(finalDecks[username]).forEach(([cardName, count]) => {
            let serial = cardSerialMapping[cardName] || "UNKNOWN";
            for (let i = 0; i < count; i++) {
                content += `${serial}\n`;
            }
        });
        content += "#extra\n!side\n";
        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`✅ Saved ${filePath}`);
    });
}

function sanitizeError(error) {
    return error.stack.replace(/([A-Z]:\\|\/)?[\w-]+(\\|\/)[\w-]+(\\|\/)?/g, "[🃏]");
}

askForReplayURL();