import TelegramBot from "node-telegram-bot-api";

import config from "./config.js";
import {
  createOrUpdateUser
} from "./database.js";

import { registerUploadHandler } from "./handlers/upload.js";
import { registerProjectHandlers } from "./handlers/projects.js";

const bot = new TelegramBot(
  config.botToken,
  {
    polling: true
  }
);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mainMenu() {
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
            callback_data: "projects:list"
          },
          {
            text: "👤 My Profile",
            callback_data: "my_profile"
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

async function sendWelcome(chatId, user) {
  const firstName =
    escapeHtml(
      user?.first_name || "there"
    );

  const text = [
    `👋 <b>Welcome, ${firstName}!</b>`,
    "",
    "🚀 <b>Telegram Free Hosting</b>",
    "",
    "Host your static website directly from Telegram.",
    "",
    "✨ <b>Features</b>",
    "• ZIP website upload",
    "• Automatic deployment",
    "• Cloudflare Pages hosting",
    "• Unique live URL",
    "• Project management",
    "• Fast deployment",
    "",
    "📦 Upload your website ZIP and we'll handle the rest."
  ].join("\n");

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      ...mainMenu()
    }
  );
}

async function showHostInstructions(chatId) {
  const text = [
    "🚀 <b>Host Your Website</b>",
    "",
    "Upload your website as a <b>.ZIP</b> file.",
    "",
    "📦 <b>ZIP requirements:</b>",
    "• Must contain <code>index.html</code>",
    "• HTML / CSS / JS supported",
    "• Images and common assets supported",
    "• Keep the package within the allowed size",
    "",
    "☁️ After upload, your website will be automatically deployed.",
    "",
    "🌐 You'll receive a live <b>.pages.dev</b> URL when deployment finishes.",
    "",
    "⬆️ <b>Now send your ZIP file.</b>"
  ].join("\n");

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📁 My Projects",
              callback_data: "projects:list"
            }
          ],
          [
            {
              text: "🔙 Main Menu",
              callback_data: "main_menu"
            }
          ]
        ]
      }
    }
  );
}

async function showProfile(chatId, user) {
  const text = [
    "👤 <b>My Profile</b>",
    "",
    `🆔 <b>Telegram ID:</b> <code>${escapeHtml(user.id)}</code>`,
    `👤 <b>Name:</b> ${escapeHtml(
      [user.first_name, user.last_name]
        .filter(Boolean)
        .join(" ") || "Not set"
    )}`,
    `🔗 <b>Username:</b> ${
      user.username
        ? `@${escapeHtml(user.username)}`
        : "Not set"
    }`
  ].join("\n");

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      ...mainMenu()
    }
  );
}

async function showUsage(chatId) {
  await bot.sendMessage(
    chatId,
    [
      "📊 <b>Usage</b>",
      "",
      "🚀 Free hosting usage is tracked per project.",
      "",
      "📁 Maximum projects: <b>10</b>",
      `📦 Maximum package size: <b>${config.maxFileSizeMB} MB</b>`,
      "",
      "More detailed storage and bandwidth statistics will be added to the dashboard."
    ].join("\n"),
    {
      parse_mode: "HTML",
      ...mainMenu()
    }
  );
}

async function showHelp(chatId) {
  await bot.sendMessage(
    chatId,
    [
      "❓ <b>Help Center</b>",
      "",
      "🚀 <b>How to host?</b>",
      "1. Tap <b>Host Website</b>",
      "2. Upload your website ZIP",
      "3. Wait for deployment",
      "4. Open your live URL",
      "",
      "📦 Your ZIP should contain:",
      "<code>index.html</code>",
      "",
      "📁 <b>My Projects</b>",
      "Manage your hosted websites from Telegram.",
      "",
      "⚠️ Only static websites are supported."
    ].join("\n"),
    {
      parse_mode: "HTML",
      ...mainMenu()
    }
  );
}

bot.onText(/^\/start(?:\s+.*)?$/i, async (message) => {
  try {
    const user = message.from;

    await createOrUpdateUser({
      id: String(user.id),
      username: user.username || "",
      firstName: user.first_name || "",
      lastName: user.last_name || ""
    });

    await sendWelcome(
      message.chat.id,
      user
    );
  } catch (error) {
    console.error(
      "❌ /start error:",
      error
    );

    await bot.sendMessage(
      message.chat.id,
      "❌ Something went wrong. Please try again."
    );
  }
});

bot.on(
  "callback_query",
  async (query) => {
    const chatId =
      query.message?.chat?.id;

    const user = query.from;
    const data = query.data;

    if (!chatId || !data) {
      return;
    }

    try {
      await bot.answerCallbackQuery(
        query.id
      );

      await createOrUpdateUser({
        id: String(user.id),
        username: user.username || "",
        firstName: user.first_name || "",
        lastName: user.last_name || ""
      });

      switch (data) {
        case "main_menu":
          await sendWelcome(
            chatId,
            user
          );
          break;

        case "host_website":
          await showHostInstructions(
            chatId
          );
          break;

        case "my_profile":
          await showProfile(
            chatId,
            user
          );
          break;

        case "usage":
          await showUsage(
            chatId
          );
          break;

        case "help":
          await showHelp(
            chatId
          );
          break;

        default:
          // Project callbacks are handled
          // by projects.js.
          break;
      }
    } catch (error) {
      console.error(
        "❌ Callback error:",
        error
      );

      try {
        await bot.sendMessage(
          chatId,
          "❌ Something went wrong. Please try again."
        );
      } catch {
        // Ignore Telegram errors.
      }
    }
  }
);

bot.on(
  "polling_error",
  (error) => {
    console.error(
      "❌ Telegram polling error:",
      error.message
    );
  }
);

bot.on(
  "error",
  (error) => {
    console.error(
      "❌ Telegram bot error:",
      error.message
    );
  }
);

process.on(
  "SIGINT",
  () => {
    console.log(
      "\n🛑 Stopping Telegram bot..."
    );

    bot.stopPolling();

    process.exit(0);
  }
);

process.on(
  "SIGTERM",
  () => {
    console.log(
      "\n🛑 Stopping Telegram bot..."
    );

    bot.stopPolling();

    process.exit(0);
  }
);

registerUploadHandler(bot);
registerProjectHandlers(bot);

async function initializeBot() {
  try {
    const botInfo =
      await bot.getMe();

    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );

    console.log(
      "🤖 Telegram Hosting Bot"
    );

    console.log(
      `👤 @${botInfo.username}`
    );

    console.log(
      `🆔 ${botInfo.id}`
    );

    console.log(
      "☁️ Cloudflare Pages deployment enabled"
    );

    console.log(
      "📦 Upload handler enabled"
    );

    console.log(
      "📁 Project manager enabled"
    );

    console.log(
      "🚀 Bot is running..."
    );

    console.log(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );
  } catch (error) {
    console.error(
      "❌ Failed to initialize bot:",
      error
    );

    process.exit(1);
  }
}

initializeBot();
