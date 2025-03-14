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
    const drewCards = {};
    const banishedCards = {};
    const graveyardCards = {};

    plays.forEach(play => {
        if (!play.log || !play.log.username) return;

        const username = play.log.username;
        const publicLog = play.log.public_log || "";
        const privateLog = play.log.private_log || "";

        // Match "Drew" actions from PRIVATE LOG
        const drewMatches = [...privateLog.matchAll(/Drew \"(.+?)\"/g)];
        drewMatches.forEach(match => {
            if (!drewCards[username]) drewCards[username] = [];
            drewCards[username].push(match[1]);
        });

        // Match "Banished" actions from PUBLIC LOG
        const banishedMatches = [...publicLog.matchAll(/Banished \"(.+?)\"/g)];
        banishedMatches.forEach(match => {
            if (!banishedCards[username]) banishedCards[username] = [];
            banishedCards[username].push(match[1]);
        });

        // Match "Sent to Graveyard" actions from PUBLIC LOG
        const graveyardMatches = [...publicLog.matchAll(/Sent(?: Set)?\s*"([^"]+)"(?: from .*?)?\s+to GY/g)];
        graveyardMatches.forEach(match => {
            if (!graveyardCards[username]) graveyardCards[username] = [];
            graveyardCards[username].push(match[1]);
        });
    });

    saveToFile("drew", drewCards);
    saveToFile("banished", banishedCards);
    saveToFile("graveyard", graveyardCards);
}

// ✅ Function to save extracted logs into text files
function saveToFile(actionType, data) {
    Object.keys(data).forEach(username => {
        const filePath = `${actionType}-${username}.txt`;
        fs.writeFileSync(filePath, data[username].join("\n"), "utf-8");
        console.log(`✅ Saved ${filePath}`);
    });
}

askForReplayURL();
