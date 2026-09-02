```js
import TelegramBot from "node-telegram-bot-api";

import config from "./config.js";

import {
  createOrUpdateUser
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
  registerAdminHandler
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

/*
 * ============================================================
 * BOT INITIALIZATION
 * ============================================================
 */

const bot =
  new TelegramBot(
    config.botToken,
    {
      polling: true
    }
  );

console.log(
  "🤖 Telegram Hosting Bot started."
);

/*
 * ============================================================
 * USER REGISTRATION
 * ============================================================
 */

async function registerTelegramUser(
  user
) {
  if (!user?.id) {
    return null;
  }

  return createOrUpdateUser({
    id: String(
      user.id
    ),

    username:
      user.username ||
      "",

    firstName:
      user.first_name ||
      "",

    lastName:
      user.last_name ||
      "",

    languageCode:
      user.language_code ||
      "",

    isBot:
      Boolean(
        user.is_bot
      )
  });
}

/*
 * ============================================================
 * ADMIN CHECK
 * ============================================================
 */

function isAdmin(
  userId
) {
  return config.adminIds.includes(
    String(userId)
  );
}

/*
 * ============================================================
 * MAIN MENU
 * ============================================================
 */

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: "🚀 Host Website",
          callback_data:
            "host_website"
        },
        {
          text: "📁 My Projects",
          callback_data:
            "projects:list"
        }
      ],
      [
        {
          text: "👤 My Profile",
          callback_data:
            "my_profile"
        },
        {
          text: "📊 Usage",
          callback_data:
            "usage"
        }
      ],
      [
        {
          text: "❓ Help",
          callback_data:
            "help"
        }
      ]
    ]
  };
}

/*
 * ============================================================
 * /START
 * ============================================================
 */

bot.on(
  "message",
  async (message) => {
    try {
      if (
        message.text !==
        "/start"
      ) {
        return;
      }

      const user =
        message.from;

      if (!user?.id) {
        return;
      }

      /*
       * Always register/update the user first.
       */
      await registerTelegramUser(
        user
      );

      /*
       * Admins must always be able
       * to access the admin system.
       */
      if (
        !isAdmin(user.id)
      ) {
        const access =
          await checkUserAccess(
            user.id
          );

        if (!access.allowed) {
          await requireUserAccess(
            bot,
            message
          );

          return;
        }
      }

      const firstName =
        escapeHtml(
          user.first_name ||
            "there"
        );

      await bot.sendMessage(
        message.chat.id,
        [
          `👋 <b>Welcome ${firstName}!</b>`,
          "",
          "🌐 <b>Free Website Hosting</b>",
          "",
          "Upload your website ZIP and deploy it automatically.",
          "",
          "✨ <b>Features</b>",
          "• Instant website deployment",
          "• Cloudflare Pages hosting",
          "• Unique live URL",
          "• Project management",
          "• Free hosting",
          "",
          "👇 Choose an option below:"
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_markup:
            mainMenuKeyboard()
        }
      );
    } catch (error) {
      console.error(
        "❌ /start error:",
        error
      );
    }
  }
);

/*
 * ============================================================
 * MAIN CALLBACK ROUTER
 * ============================================================
 */

bot.on(
  "callback_query",
  async (query) => {
    const data =
      query.data || "";

    const userId =
      String(
        query.from?.id || ""
      );

    const chatId =
      query.message?.chat?.id;

    if (!userId) {
      return;
    }

    /*
     * --------------------------------------------------------
     * ADMIN CALLBACKS
     * --------------------------------------------------------
     *
     * Admin handlers have their own callback listeners.
     * Do not process them here.
     */
    if (
      data.startsWith(
        "admin:"
      )
    ) {
      return;
    }

    /*
     * --------------------------------------------------------
     * PROJECT CALLBACKS
     * --------------------------------------------------------
     *
     * projects.js handles these.
     */
    if (
      data.startsWith(
        "projects:"
      ) ||
      data.startsWith(
        "project:"
      )
    ) {
      return;
    }

    /*
     * --------------------------------------------------------
     * USER ACCESS CHECK
     * --------------------------------------------------------
     *
     * Admins bypass normal user restrictions.
     */
    if (
      !isAdmin(userId)
    ) {
      const access =
        await checkUserAccess(
          userId
        );

      if (!access.allowed) {
        try {
          await bot.answerCallbackQuery(
            query.id,
            {
              text:
                "🚫 Your account is restricted.",
              show_alert: true
            }
          );
        } catch {
          // Ignore callback response errors.
        }

        return;
      }
    }

    if (!chatId) {
      return;
    }

    try {
      await bot.answerCallbackQuery(
        query.id
      );

      switch (data) {
        /*
         * ----------------------------------------------------
         * MAIN MENU
         * ----------------------------------------------------
         */

        case "main_menu":
          await sendMainMenu(
            chatId
          );
          break;

        /*
         * ----------------------------------------------------
         * HOST WEBSITE
         * ----------------------------------------------------
         */

        case "host_website":
          await sendHostWebsiteMessage(
            chatId
          );
          break;

        /*
         * ----------------------------------------------------
         * PROFILE
         * ----------------------------------------------------
         */

        case "my_profile":
          await sendProfile(
            chatId,
            userId
          );
          break;

        /*
         * ----------------------------------------------------
         * USAGE
         * ----------------------------------------------------
         */

        case "usage":
          await sendUsage(
            chatId,
            userId
          );
          break;

        /*
         * ----------------------------------------------------
         * HELP
         * ----------------------------------------------------
         */

        case "help":
          await sendHelp(
            chatId
          );
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
      } catch {
        // Ignore Telegram errors.
      }
    }
  }
);

/*
 * ============================================================
 * MAIN MENU
 * ============================================================
 */

async function sendMainMenu(
  chatId
) {
  await bot.sendMessage(
    chatId,
    [
      "🏠 <b>Main Menu</b>",
      "",
      "Choose what you want to do:"
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup:
        mainMenuKeyboard()
    }
  );
}

/*
 * ============================================================
 * HOST WEBSITE
 * ============================================================
 */

async function sendHostWebsiteMessage(
  chatId
) {
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
      `📏 Maximum ZIP size: <b>${config.maxFileSizeMB} MB</b>`,
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
              callback_data:
                "projects:list"
            }
          ],
          [
            {
              text: "🏠 Main Menu",
              callback_data:
                "main_menu"
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * USER PROFILE
 * ============================================================
 */

async function sendProfile(
  chatId,
  userId
) {
  const user =
    await createOrUpdateUser({
      id: String(
        userId
      )
    });

  const username =
    user.username
      ? `@${escapeHtml(
          user.username
        )}`
      : "Not set";

  const name =
    [
      user.firstName,
      user.lastName
    ]
      .filter(Boolean)
      .join(" ") ||
    "Not set";

  const status =
    user.isBlocked === true ||
    user.status ===
      "blocked"
      ? "🚫 Blocked"
      : "🟢 Active";

  await bot.sendMessage(
    chatId,
    [
      "👤 <b>My Profile</b>",
      "",
      `🆔 <b>User ID:</b> <code>${escapeHtml(
        user.id
      )}</code>`,
      `👤 <b>Name:</b> ${escapeHtml(
        name
      )}`,
      `🔗 <b>Username:</b> ${username}`,
      `🌐 <b>Language:</b> ${escapeHtml(
        user.languageCode ||
          "Unknown"
      )}`,
      `📅 <b>Joined:</b> ${formatDate(
        user.createdAt
      )}`,
      `📌 <b>Status:</b> ${status}`,
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
              callback_data:
                "projects:list"
            }
          ],
          [
            {
              text: "🏠 Main Menu",
              callback_data:
                "main_menu"
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * USAGE
 * ============================================================
 */

async function sendUsage(
  chatId,
  userId
) {
  /*
   * Project statistics are intentionally
   * calculated here without importing another
   * handler.
   */
  const {
    getUserProjects
  } = await import(
    "./database.js"
  );

  const projects =
    await getUserProjects(
      userId
    );

  const active =
    projects.filter(
      (project) =>
        project.status ===
        "active"
    ).length;

  const deploying =
    projects.filter(
      (project) =>
        project.status ===
        "deploying"
    ).length;

  const failed =
    projects.filter(
      (project) =>
        project.status ===
        "failed"
    ).length;

  const maxProjects = 10;

  await bot.sendMessage(
    chatId,
    [
      "📊 <b>Hosting Usage</b>",
      "",
      `📁 <b>Total Projects:</b> ${projects.length}/${maxProjects}`,
      `🟢 <b>Active:</b> ${active}`,
      `⏳ <b>Deploying:</b> ${deploying}`,
      `❌ <b>Failed:</b> ${failed}`,
      "",
      `💾 <b>ZIP Limit:</b> ${config.maxFileSizeMB} MB`,
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
              callback_data:
                "projects:list"
            }
          ],
          [
            {
              text: "🏠 Main Menu",
              callback_data:
                "main_menu"
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * HELP
 * ============================================================
 */

async function sendHelp(
  chatId
) {
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
      `📏 <b>Maximum ZIP:</b> ${config.maxFileSizeMB} MB`,
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
              callback_data:
                "host_website"
            }
          ],
          [
            {
              text: "🏠 Main Menu",
              callback_data:
                "main_menu"
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * MESSAGE ACCESS GUARD
 * ============================================================
 *
 * This catches normal user messages that are not:
 * - /start
 * - admin commands
 * - handled by upload handler
 * - handled by other modules
 *
 * It gives blocked users a clear restriction message.
 */

bot.on(
  "message",
  async (message) => {
    try {
      if (
        !message.from?.id
      ) {
        return;
      }

      /*
       * Do not interfere with commands
       * handled by other modules.
       */
      if (
        message.text?.startsWith(
          "/"
        )
      ) {
        return;
      }

      /*
       * Document uploads are handled
       * by upload.js, where the access
       * check happens before deployment.
       */
      if (
        message.document
      ) {
        return;
      }

      /*
       * Admins are never blocked
       * by normal user access guard.
       */
      if (
        isAdmin(
          message.from.id
        )
      ) {
        return;
      }

      const access =
        await checkUserAccess(
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
  }
);

/*
 * ============================================================
 * REGISTER HANDLERS
 * ============================================================
 */

registerUploadHandler(
  bot
);

registerProjectHandlers(
  bot
);

registerAdminHandler(
  bot
);

registerAdminProjectsHandler(
  bot
);

registerAdminUsersHandler(
  bot
);

registerBroadcastHandler(
  bot
);

/*
 * ============================================================
 * TELEGRAM ERROR HANDLERS
 * ============================================================
 */

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
  "webhook_error",
  (error) => {
    console.error(
      "❌ Telegram webhook error:",
      error.message
    );
  }
);

/*
 * ============================================================
 * PROCESS ERROR HANDLERS
 * ============================================================
 */

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

/*
 * ============================================================
 * GRACEFUL SHUTDOWN
 * ============================================================
 */

async function shutdown(
  signal
) {
  console.log(
    `\n🛑 ${signal} received. Shutting down bot...`
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
  () =>
    shutdown("SIGINT")
);

process.once(
  "SIGTERM",
  () =>
    shutdown("SIGTERM")
);

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function formatDate(
  value
) {
  if (!value) {
    return "Unknown";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
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

console.log(
  "✅ All bot handlers registered."
);
```
