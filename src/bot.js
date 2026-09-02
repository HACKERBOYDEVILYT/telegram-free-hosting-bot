import TelegramBot from "node-telegram-bot-api";
import config from "./config.js";

const bot = new TelegramBot(config.botToken, {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// ─────────────────────────────────────────────
// BOT INFO
// ─────────────────────────────────────────────

let botInfo = null;

async function initializeBot() {
  try {
    botInfo = await bot.getMe();

    console.log("────────────────────────────────────");
    console.log("🚀 Telegram Free Hosting Bot");
    console.log("────────────────────────────────────");
    console.log(`🤖 Bot: @${botInfo.username}`);
    console.log(`🆔 ID: ${botInfo.id}`);
    console.log("🟢 Status: Online");
    console.log("────────────────────────────────────");
  } catch (error) {
    console.error("❌ Failed to initialize bot:", error.message);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────
// MAIN MENU
// ─────────────────────────────────────────────

function getMainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚀 Host Website",
            callback_data: "host_website"
          }
        ],
        [
          {
            text: "📁 My Projects",
            callback_data: "my_projects"
          },
          {
            text: "👤 My Profile",
            callback_data: "profile"
          }
        ],
        [
          {
            text: "📊 Usage",
            callback_data: "usage"
          },
          {
            text: "❓ Help",
            callback_data: "help"
          }
        ]
      ]
    }
  };
}

// ─────────────────────────────────────────────
// /START
// ─────────────────────────────────────────────

bot.onText(/^\/start(?:\s+(.+))?$/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from?.first_name || "there";

  const welcomeMessage = `
╭──────────────────────────╮
│   🚀 FREE WEB HOSTING    │
╰──────────────────────────╯

Hello, <b>${escapeHtml(firstName)}</b>! 👋

Welcome to your <b>Free Hosting Bot</b>.

You will be able to:

🌐 Host your website
📦 Upload ZIP projects
📁 Manage projects
🔄 Update & redeploy
📊 Check your usage
⚡ Get a hosting URL

<b>100% Telegram-based management.</b>

Choose an option below 👇
`;

  try {
    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: "HTML",
      ...getMainMenu()
    });
  } catch (error) {
    console.error("❌ /start error:", error.message);
  }
});

// ─────────────────────────────────────────────
// HOST WEBSITE
// ─────────────────────────────────────────────

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  try {
    await bot.answerCallbackQuery(query.id);

    switch (data) {
      case "host_website":
        await showHostingInstructions(chatId);
        break;

      case "my_projects":
        await showProjects(chatId);
        break;

      case "profile":
        await showProfile(chatId, query.from);
        break;

      case "usage":
        await showUsage(chatId);
        break;

      case "help":
        await showHelp(chatId);
        break;

      case "main_menu":
        await bot.sendMessage(
          chatId,
          "🏠 <b>Main Menu</b>\n\nChoose an option:",
          {
            parse_mode: "HTML",
            ...getMainMenu()
          }
        );
        break;

      default:
        await bot.sendMessage(
          chatId,
          "⚠️ This option is not available yet."
        );
    }
  } catch (error) {
    console.error("❌ Callback error:", error.message);

    try {
      await bot.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again."
      );
    } catch {
      // Ignore secondary Telegram errors.
    }
  }
});

// ─────────────────────────────────────────────
// HOSTING INSTRUCTIONS
// ─────────────────────────────────────────────

async function showHostingInstructions(chatId) {
  const message = `
🚀 <b>Host Your Website</b>

To create a website, send me a <b>ZIP file</b> containing your project.

Example:

📦 my-website.zip
 ├── index.html
 ├── style.css
 ├── script.js
 └── assets/

<b>Requirements:</b>

✅ ZIP format
✅ Must contain index.html
✅ HTML/CSS/JS supported
✅ Maximum file size: ${config.maxFileSizeMB} MB

After uploading, I will validate your project and prepare it for deployment.

📤 <b>Send your ZIP file now.</b>
`;

  await bot.sendMessage(chatId, message, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🏠 Main Menu",
            callback_data: "main_menu"
          }
        ]
      ]
    }
  });
}

// ─────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────

async function showProjects(chatId) {
  await bot.sendMessage(
    chatId,
    `
📁 <b>My Projects</b>

You don't have any hosted projects yet.

Create your first website using:

🚀 <b>Host Website</b>
`,
    {
      parse_mode: "HTML",
      ...getMainMenu()
    }
  );
}

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────

async function showProfile(chatId, user) {
  const username = user.username
    ? `@${escapeHtml(user.username)}`
    : "Not set";

  const firstName = escapeHtml(user.first_name || "Unknown");

  const message = `
👤 <b>Your Profile</b>

━━━━━━━━━━━━━━━━━━

🧑 Name: <b>${firstName}</b>
🔹 Username: <b>${username}</b>
🆔 Telegram ID: <code>${user.id}</code>

━━━━━━━━━━━━━━━━━━

📁 Projects: <b>0</b>
🌐 Websites: <b>0</b>
💾 Storage: <b>0 MB</b>
`;

  await bot.sendMessage(chatId, message, {
    parse_mode: "HTML",
    ...getMainMenu()
  });
}

// ─────────────────────────────────────────────
// USAGE
// ─────────────────────────────────────────────

async function showUsage(chatId) {
  const message = `
📊 <b>Hosting Usage</b>

━━━━━━━━━━━━━━━━━━

📁 Projects: <b>0</b>
💾 Storage Used: <b>0 MB</b>
📦 Storage Limit: <b>100 MB</b>

🌐 Active Websites: <b>0</b>

━━━━━━━━━━━━━━━━━━

🟢 Account Status: <b>ACTIVE</b>
`;

  await bot.sendMessage(chatId, message, {
    parse_mode: "HTML",
    ...getMainMenu()
  });
}

// ─────────────────────────────────────────────
// HELP
// ─────────────────────────────────────────────

async function showHelp(chatId) {
  const message = `
❓ <b>Hosting Bot Help</b>

<b>How to host:</b>

1️⃣ Press <b>🚀 Host Website</b>
2️⃣ Prepare your website
3️⃣ Put <code>index.html</code> in the project
4️⃣ Create a ZIP file
5️⃣ Send the ZIP here
6️⃣ Bot validates your project
7️⃣ Your website gets deployed 🌐

<b>Supported:</b>

• HTML
• CSS
• JavaScript
• Images
• Fonts
• Static assets

⚠️ Server-side applications will require a different deployment system.

Need help? Use the main menu.
`;

  await bot.sendMessage(chatId, message, {
    parse_mode: "HTML",
    ...getMainMenu()
  });
}

// ─────────────────────────────────────────────
// UNKNOWN COMMAND
// ─────────────────────────────────────────────

bot.on("message", async (msg) => {
  if (!msg.text) return;

  if (msg.text.startsWith("/")) {
    const knownCommands = ["/start"];

    const command = msg.text.split(" ")[0].toLowerCase();

    if (!knownCommands.includes(command)) {
      await bot.sendMessage(
        msg.chat.id,
        "⚠️ Unknown command.\n\nUse /start to open the main menu."
      );
    }
  }
});

// ─────────────────────────────────────────────
// TELEGRAM ERRORS
// ─────────────────────────────────────────────

bot.on("polling_error", (error) => {
  console.error("⚠️ Telegram polling error:", error.message);
});

bot.on("error", (error) => {
  console.error("⚠️ Telegram bot error:", error.message);
});

// ─────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down...`);

  try {
    await bot.stopPolling();
    console.log("✅ Bot stopped safely.");
  } catch (error) {
    console.error("❌ Shutdown error:", error.message);
  }

  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// ─────────────────────────────────────────────
// HTML ESCAPE
// ─────────────────────────────────────────────

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─────────────────────────────────────────────
// START BOT
// ─────────────────────────────────────────────

initializeBot();
