const puppeteer = require('puppeteer-core');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = require('puppeteer-extra');
const readline = require('readline');

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
            askForReplayURL(); // Ask again if invalid
            return;
        }

        await fetchReplay(url);
        askForReplayURL(); // Ask again after completion
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
                    
                    // ✅ Ensure only valid plays are stored
                    if (json.plays && json.plays.length > 0) {
                        const validPlays = json.plays.filter(play => play.player1_choice && play.player2_choice);

                        if (validPlays.length > 0) {
                            replayData = validPlays;
                            requestComplete = true;
                            console.log("✅ Replay data successfully retrieved.");
                        }
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
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between retries
            attempts++;
        }

        await browser.close();

        if (replayData && replayData.length > 0) {
            console.log("\n🎮 --- Parsed Replay Data ---");
            replayData.forEach(play => {
                console.log(`🟢 Player 1 Choice: ${play.player1_choice}`);
                console.log(`🔴 Player 2 Choice: ${play.player2_choice}`);
                console.log('-------------------');
            });
        } else {
            console.log("⚠️ No valid replay data found. Try again.");
        }

    } catch (error) {
        console.error("❌ ERROR:", error);
    }
}

// Start the loop to ask for replay URLs
askForReplayURL();
