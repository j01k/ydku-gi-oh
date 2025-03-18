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
    let cardSerialMapping = {}; // Store card name → serial number mappings

    // Process each play in order
    plays.forEach(play => {
        if (!play.log) return;

        // Store card serial numbers if present **before processing logs**
        if (play.card && play.card.name && play.card.serial_number) {
            cardSerialMapping[play.card.name] = play.card.serial_number;
        }

        // Handle high-level logs (initial draws and game start)
        if (Array.isArray(play.log)) {
            play.log.forEach(logEntry => {
                if (!logEntry.private_log || !logEntry.username) return;

                const username = logEntry.username;
                const privateLog = logEntry.private_log;

                // Detect new game start
                if (privateLog.includes("Chose to go first")) {
                    currentGame++;
                    gameDecks[currentGame] = {};
                    console.log(`\n🎮 Processing Game ${currentGame + 1}...`);
                }

                // Track initial draws
                [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => {
                    const cardName = match[1];
                    addCardToDeck(gameDecks, currentGame, username, cardName, "Initial draw from deck", cardSerialMapping, plays);
                });
            });
        }

        // Ensure a game index exists before proceeding
        if (currentGame === -1) return;

        // Handle in-game logs
        if (play.log.private_log && play.log.username) {
            const username = play.log.username;
            const privateLog = play.log.private_log;
            if (username !== "Duelingbook") {
                [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => {
                    addCardToDeck(gameDecks, currentGame, username, match[1], "Drew from deck", cardSerialMapping, plays);
                });
                [...privateLog.matchAll(/Added \"(.+?)\" from Deck to hand/g)].forEach(match => {
                    addCardToDeck(gameDecks, currentGame, username, match[1], "Added from deck to hand", cardSerialMapping, plays);
                });
            }
        }

        if (play.log.public_log && play.log.username) {
            const username = play.log.username;
            const publicLog = play.log.public_log;
            
            [...publicLog.matchAll(/Milled \"(.+?)\" from top of deck/g)].forEach(match => {
                addCardToDeck(gameDecks, currentGame, username, match[1], "Milled from deck", cardSerialMapping, plays);
            });
            [...publicLog.matchAll(/Special Summoned \"(.+?)\" from Deck/g)].forEach(match => {
                addCardToDeck(gameDecks, currentGame, username, match[1], "Special Summoned from deck", cardSerialMapping, plays);
            });
            [...publicLog.matchAll(/Banished \"(.+?)\" from Deck/g)].forEach(match => {
                addCardToDeck(gameDecks, currentGame, username, match[1], "Banished from deck", cardSerialMapping, plays);
            });
            [...publicLog.matchAll(/Sent(?: Set)?\s*\"([^\"]+)\" from Deck to GY/g)].forEach(match => {
                addCardToDeck(gameDecks, currentGame, username, match[1], "Sent to GY from deck", cardSerialMapping, plays);
            });
        }
    });

    mergeGameDecks(gameDecks, cardSerialMapping);
}

// ✅ Search entire JSON for a missing serial number
function findCardSerial(plays, cardName) {
    // 1️⃣ First, check `plays` for serial number
    for (const play of plays) {
        if (play.card && play.card.name === cardName && play.card.serial_number) {
            return play.card.serial_number;
        }
    }

    // 2️⃣ If not found, search the full JSON response (cards dataset in `plays`)
    for (const play of plays) {
        if (Array.isArray(play.cards)) {
            for (const card of play.cards) {
                if (card.name === cardName && card.serial_number) {
                    return card.serial_number;
                }
            }
        }
    }

    // ❌ Not found, return "UNKNOWN"
    return "UNKNOWN";
}

// ✅ Modify `addCardToDeck` to use the improved lookup
function addCardToDeck(gameDecks, game, player, cardName, action, cardSerialMapping, plays) {
    if (game < 0) return; // Prevents accessing invalid game index
    if (!gameDecks[game]) gameDecks[game] = {}; // ✅ Ensure initialization
    if (!gameDecks[game][player]) gameDecks[game][player] = {};

    // 🔍 Search for serial dynamically
    if (!cardSerialMapping[cardName] || cardSerialMapping[cardName] === "UNKNOWN") {
        cardSerialMapping[cardName] = findCardSerial(plays, cardName);
    }
    const serial = cardSerialMapping[cardName];

    if (!gameDecks[game][player][cardName]) {
        gameDecks[game][player][cardName] = { count: 0, serial };
    }

    gameDecks[game][player][cardName].count += 1;
    console.log(`📌 ${action}: ${cardName} (${serial}) → ${player}`);
}


function mergeGameDecks(gameDecks, cardSerialMapping) {
    const finalDecks = {};

    // ✅ Collect highest occurrence of each card across all games
    gameDecks.forEach(gameDeck => {
        Object.keys(gameDeck).forEach(username => {
            if (!finalDecks[username]) finalDecks[username] = {};

            Object.entries(gameDeck[username]).forEach(([cardName, data]) => {
                const { count, serial } = data;
                
                // ✅ Store the highest occurrence of each card per player
                if (!finalDecks[username][serial] || finalDecks[username][serial] < count) {
                    finalDecks[username][serial] = count;
                }
            });
        });
    });

    // ✅ Write each player's deck with the highest occurrence of each card
    Object.keys(finalDecks).forEach(username => {
        const filePath = `${username}-final-deck.ydk`;
        let content = `#created by ...\n#main\n`;

        // Write each card's serial the maximum number of times it appeared
        Object.entries(finalDecks[username]).forEach(([serial, maxCount]) => {
            for (let i = 0; i < maxCount; i++) {
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