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

    try {
        const browser = await puppeteer.launch({
            headless: false,
            executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });

        console.log("🚀 Secure Connection Established.");
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

    } catch (error) {
        console.error(sanitizeError(error));
    }
}

// ✅ Restriction Lists
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

        [...privateLog.matchAll(/Drew \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Drew"));
        [...publicLog.matchAll(/Banished \"(.+?)\"/g)].forEach(match => addCardToDeck(match[1], "Banished"));
        [...publicLog.matchAll(/Sent(?: Set)?\s*"([^"]+)"(?: from .*?)?\s+to GY/g)]
            .forEach(match => addCardToDeck(match[1], "Sent to GY"));
    });

    mergeGameDecks(gameDecks);
}

// ✅ Merge Decks Across Games
function mergeGameDecks(gameDecks) {
    const finalDecks = {};

    gameDecks.forEach(gameDeck => {
        Object.keys(gameDeck).forEach(username => {
            if (!finalDecks[username]) finalDecks[username] = {};

            Object.entries(gameDeck[username]).forEach(([cardName, count]) => {
                let maxCount = Math.max(finalDecks[username][cardName] || 0, count);

                if (limitToOne.has(cardName)) {
                    maxCount = 1;
                } else if (limitToTwo.has(cardName)) {
                    maxCount = Math.min(2, maxCount);
                } else {
                    maxCount = Math.min(3, maxCount);
                }

                finalDecks[username][cardName] = maxCount;
            });
        });
    });

    Object.keys(finalDecks).forEach(username => {
        const filePath = `${username}-final-deck.ydk`;
        let content = `#created by ...\n#main\n`;

        const sortedCards = Object.entries(finalDecks[username])
            .sort((a, b) => a[1] - b[1]);

        sortedCards.forEach(([cardName, count]) => {
            let serial = cardSerialMapping[cardName] || "UNKNOWN";
            for (let i = 0; i < count; i++) {
                content += `${serial}\n`;
            }
        });

        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`✅ Saved ${filePath}`);
    });
}

function sanitizeError(error) {
    return error.stack.replace(/([A-Z]:\\|\/)?[\w-]+(\\|\/)[\w-]+(\\|\/)?/g, "[🃏]");
}

askForReplayURL();
