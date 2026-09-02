import TelegramBot from "node-telegram-bot-api";

import config from "./config.js";

import {
  createOrUpdateUser,
  getUserProjects
} from "./database.js";

import {
  requireUserAccess,
  checkUserAccess
} from "./middleware/userAccess.js";

import {
  registerUploadHandler
} from "./handlers/upload.js";

import {
  registerProjectHandlers
} from "./handlers/projects.js";

import {
  registerAdminHandler,
  isAdmin
} from "./handlers/admin.js";

import {
  registerAdminProjectsHandler
} from "./handlers/adminProjects.js";

import {
  registerAdminUsersHandler
} from "./handlers/adminUsers.js";

import {
  registerBroadcastHandler
} from "./handlers/broadcast.js";


/* ============================================================
   BOT INITIALIZATION
   ============================================================ */

const bot = new TelegramBot(config.botToken, {
  polling: true
});

console.log("🤖 Telegram Hosting Bot started.");


/* ============================================================
   USER REGISTRATION
   ============================================================ */

async function registerTelegramUser(user) {
  if (!user || !user.id) {
    return null;
  }

  return createOrUpdateUser({
    id: String(user.id),
    username: user.username || "",
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    languageCode: user.language_code || "",
    isBot: Boolean(user.is_bot)
  });
}


/* ============================================================
   MAIN MENU KEYBOARD
   ============================================================ */

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Host Website",
          callback_data: "host_website"
        },
        {
          text: "📁 My Projects",
          callback_data: "projects:list"
        }
      ],
      [
        {
          text: "👤 My Profile",
          callback_data: "my_profile"
        },
        {
          text: "📊 Usage",
          callback_data: "usage"
        }
      ],
      [
        {
          text: "❓ Help",
          callback_data: "help"
        }
      ]
    ]
  };
}


/* ============================================================
   /START COMMAND
   ============================================================ */

bot.on("message", async (message) => {
  try {
    if (message.text !== "/start") {
      return;
    }

    const user = message.from;

    if (!user || !user.id) {
      return;
    }

    await registerTelegramUser(user);

    if (!isAdmin(user.id)) {
      const access = await checkUserAccess(user.id);

      if (!access.allowed) {
        await requireUserAccess(bot, message);
        return;
      }
    }

    const firstName = escapeHtml(
      user.first_name || "there"
    );

    const welcomeMessage =
      "👋 <b>Welcome " +
      firstName +
      "!</b>\n\n" +
      "🌐 <b>Free Website Hosting</b>\n\n" +
      "Upload your website ZIP and deploy it automatically.\n\n" +
      "✨ <b>Features</b>\n" +
      "• Instant website deployment\n" +
      "• Cloudflare Pages hosting\n" +
      "• Unique live URL\n" +
      "• Project management\n" +
      "• Free hosting\n\n" +
      "👇 Choose an option below:";

    await bot.sendMessage(
      message.chat.id,
      welcomeMessage,
      {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard()
      }
    );
  } catch (error) {
    console.error("❌ /start error:", error);
  }
});


/* ============================================================
   MAIN CALLBACK ROUTER
   ============================================================ */

bot.on("callback_query", async (query) => {
  const data = query.data || "";
  const userId = String(query.from?.id || "");
  const chatId = query.message?.chat?.id;

  if (!userId) {
    return;
  }

  /*
   * Admin callbacks are handled by admin handlers.
   */
  if (data.startsWith("admin:")) {
    return;
  }

  /*
   * Project callbacks are handled by project handler.
   */
  if (
    data.startsWith("projects:") ||
    data.startsWith("project:")
  ) {
    return;
  }

  /*
   * Check restricted users.
   */
  if (!isAdmin(userId)) {
    const access = await checkUserAccess(userId);

    if (!access.allowed) {
      try {
        await bot.answerCallbackQuery(query.id, {
          text: "🚫 Your account is restricted.",
          show_alert: true
        });
      } catch (error) {
        console.error(
          "❌ Restricted callback error:",
          error
        );
      }

      return;
    }
  }

  if (!chatId) {
    return;
  }

  try {
    await bot.answerCallbackQuery(query.id);

    switch (data) {
      case "main_menu":
        await sendMainMenu(chatId);
        break;

      case "host_website":
        await sendHostWebsiteMessage(chatId);
        break;

      case "my_profile":
        await sendProfile(chatId, userId);
        break;

      case "usage":
        await sendUsage(chatId, userId);
        break;

      case "help":
        await sendHelp(chatId);
        break;

      default:
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
    } catch (sendError) {
      console.error(
        "❌ Failed to send callback error:",
        sendError
      );
    }
  }
});


/* ============================================================
   MAIN MENU MESSAGE
   ============================================================ */

async function sendMainMenu(chatId) {
  await bot.sendMessage(
    chatId,
    [
      "🏠 <b>Main Menu</b>",
      "",
      "Choose what you want to do:"
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    }
  );
}


/* ============================================================
   HOST WEBSITE
   ============================================================ */

async function sendHostWebsiteMessage(chatId) {
  await bot.sendMessage(
    chatId,
    [
      "🚀 <b>Host Your Website</b>",
      "",
      "📦 Send your website as a <b>ZIP file</b>.",
      "",
      "Your ZIP should contain:",
      "• <code>index.html</code>",
      "• CSS files",
      "• JavaScript files",
      "• Images/assets",
      "• Other supported static files",
      "",
      "📏 Maximum ZIP size: <b>" +
        escapeHtml(config.maxFileSizeMB) +
        " MB</b>",
      "",
      "☁️ Your website will be deployed to Cloudflare Pages automatically.",
      "",
      "📤 <b>Send your ZIP now.</b>"
    ].join("\n"),
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
              text: "🏠 Main Menu",
              callback_data: "main_menu"
            }
          ]
        ]
      }
    }
  );
}


/* ============================================================
   PROFILE
   ============================================================ */

async function sendProfile(chatId, userId) {
  const user = await createOrUpdateUser({
    id: String(userId)
  });

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ Unable to load your profile."
    );

    return;
  }

  const username = user.username
    ? "@" + escapeHtml(user.username)
    : "Not set";

  const name = [
    user.firstName,
    user.lastName
  ]
    .filter(Boolean)
    .join(" ") || "Not set";

  const status =
    user.isBlocked === true ||
    user.status === "blocked"
      ? "🚫 Blocked"
      : "🟢 Active";

  await bot.sendMessage(
    chatId,
    [
      "👤 <b>My Profile</b>",
      "",
      "🆔 <b>User ID:</b> <code>" +
        escapeHtml(user.id) +
        "</code>",
      "👤 <b>Name:</b> " +
        escapeHtml(name),
      "🔗 <b>Username:</b> " +
        username,
      "🌐 <b>Language:</b> " +
        escapeHtml(
          user.languageCode || "Unknown"
        ),
      "📅 <b>Joined:</b> " +
        formatDate(user.createdAt),
      "📌 <b>Status:</b> " +
        status,
      "",
      "🏠 <b>Manage your hosting from the main menu.</b>"
    ].join("\n"),
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
              text: "🏠 Main Menu",
              callback_data: "main_menu"
            }
          ]
        ]
      }
    }
  );
}


/* ============================================================
   USAGE
   ============================================================ */

async function sendUsage(chatId, userId) {
  const projects = await getUserProjects(userId);

  const active = projects.filter(
    (project) =>
      project.status === "active"
  ).length;

  const deploying = projects.filter(
    (project) =>
      project.status === "deploying"
  ).length;

  const failed = projects.filter(
    (project) =>
      project.status === "failed"
  ).length;

  const maxProjects = 10;

  await bot.sendMessage(
    chatId,
    [
      "📊 <b>Hosting Usage</b>",
      "",
      "📁 <b>Total Projects:</b> " +
        projects.length +
        "/" +
        maxProjects,
      "🟢 <b>Active:</b> " +
        active,
      "⏳ <b>Deploying:</b> " +
        deploying,
      "❌ <b>Failed:</b> " +
        failed,
      "",
      "💾 <b>ZIP Limit:</b> " +
        escapeHtml(config.maxFileSizeMB) +
        " MB",
      "",
      "☁️ <b>Hosting Provider:</b> Cloudflare Pages"
    ].join("\n"),
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
              text: "🏠 Main Menu",
              callback_data: "main_menu"
            }
          ]
        ]
      }
    }
  );
}


/* ============================================================
   HELP
   ============================================================ */

async function sendHelp(chatId) {
  await bot.sendMessage(
    chatId,
    [
      "❓ <b>How To Use</b>",
      "",
      "1️⃣ Press <b>🚀 Host Website</b>.",
      "",
      "2️⃣ Create a ZIP file containing your website.",
      "",
      "3️⃣ Make sure the ZIP contains <code>index.html</code>.",
      "",
      "4️⃣ Send the ZIP to this bot.",
      "",
      "5️⃣ The bot will validate your files.",
      "",
      "6️⃣ Your website will be deployed automatically.",
      "",
      "7️⃣ You'll receive your live website URL.",
      "",
      "━━━━━━━━━━━━━━━━━━",
      "",
      "📦 <b>Supported:</b>",
      "HTML • CSS • JS • Images • Fonts • Static assets",
      "",
      "📏 <b>Maximum ZIP:</b> " +
        escapeHtml(config.maxFileSizeMB) +
        " MB",
      "",
      "⚠️ Only static websites are currently supported.",
      "",
      "🏠 Use the button below to return."
    ].join("\n"),
    {
      parse_mode: "HTML",
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
              text: "🏠 Main Menu",
              callback_data: "main_menu"
            }
          ]
        ]
      }
    }
  );
}


/* ============================================================
   USER ACCESS GUARD
   ============================================================ */

bot.on("message", async (message) => {
  try {
    if (!message.from?.id) {
      return;
    }

    /*
     * Commands are handled separately.
     */
    if (
      message.text &&
      message.text.startsWith("/")
    ) {
      return;
    }

    /*
     * Upload handler handles documents.
     */
    if (message.document) {
      return;
    }

    /*
     * Admins bypass user restriction.
     */
    if (isAdmin(message.from.id)) {
      return;
    }

    const access = await checkUserAccess(
      message.from.id
    );

    if (!access.allowed) {
      await requireUserAccess(
        bot,
        message
      );
    }
  } catch (error) {
    console.error(
      "❌ User access guard error:",
      error
    );
  }
});


/* ============================================================
   REGISTER ALL HANDLERS
   ============================================================ */

registerUploadHandler(bot);

registerProjectHandlers(bot);

registerAdminHandler(bot);

registerAdminProjectsHandler(bot);

registerAdminUsersHandler(bot);

registerBroadcastHandler(bot);

console.log(
  "✅ All bot handlers registered."
);


/* ============================================================
   TELEGRAM ERRORS
   ============================================================ */

bot.on("polling_error", (error) => {
  console.error(
    "❌ Telegram polling error:",
    error.message
  );
});

bot.on("webhook_error", (error) => {
  console.error(
    "❌ Telegram webhook error:",
    error.message
  );
});


/* ============================================================
   PROCESS ERRORS
   ============================================================ */

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "❌ Unhandled promise rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "❌ Uncaught exception:",
      error
    );
  }
);


/* ============================================================
   GRACEFUL SHUTDOWN
   ============================================================ */

async function shutdown(signal) {
  console.log(
    "\n🛑 " +
      signal +
      " received. Shutting down bot..."
  );

  try {
    await bot.stopPolling();

    console.log(
      "✅ Telegram polling stopped."
    );
  } catch (error) {
    console.error(
      "❌ Failed to stop polling:",
      error
    );
  }

  process.exit(0);
}

process.once(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.once(
  "SIGTERM",
  () => shutdown("SIGTERM")
);


/* ============================================================
   HELPERS
   ============================================================ */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatDate(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}
```
