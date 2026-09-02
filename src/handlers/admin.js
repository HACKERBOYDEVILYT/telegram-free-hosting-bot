import config from "../config.js";

import {
  getStatistics,
  getUsers
} from "../database.js";

import {
  testCloudflareConnection
} from "../services/deployer.js";

export function isAdmin(userId) {
  return config.adminIds.includes(
    String(userId)
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getUserName(user) {
  return (
    [
      user?.firstName,
      user?.lastName
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Unknown User"
  );
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  });
}

export function registerAdminHandler(bot) {
  bot.on(
    "message",
    async (msg) => {
      if (!msg.text) {
        return;
      }

      if (msg.text !== "/admin") {
        return;
      }

      const userId =
        String(msg.from.id);

      if (!isAdmin(userId)) {
        await bot.sendMessage(
          msg.chat.id,
          "⛔ <b>Access Denied</b>\n\nYou don't have permission to access the admin panel.",
          {
            parse_mode: "HTML"
          }
        );

        return;
      }

      await sendDashboard(
        bot,
        msg.chat.id
      );
    }
  );

  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      /*
       * User Management callbacks
       * are handled by adminUsers.js.
       */
      if (
        data.startsWith(
          "admin:user:"
        )
      ) {
        return;
      }

      /*
       * Project Management callbacks
       * are handled by adminProjects.js.
       */
      if (
        data.startsWith(
          "admin:project:"
        ) ||
        data.startsWith(
          "admin:projects"
        )
      ) {
        return;
      }

      if (
        !data.startsWith("admin:")
      ) {
        return;
      }

      const userId =
        String(query.from.id);

      if (!isAdmin(userId)) {
        try {
          await bot.answerCallbackQuery(
            query.id,
            {
              text:
                "⛔ Admin access required.",
              show_alert: true
            }
          );
        } catch {
          // Ignore Telegram errors.
        }

        return;
      }

      const chatId =
        query.message?.chat?.id;

      if (!chatId) {
        return;
      }

      try {
        await bot.answerCallbackQuery(
          query.id
        );

        switch (data) {
          case "admin:dashboard":
            await sendDashboard(
              bot,
              chatId
            );
            break;

          case "admin:stats":
            await sendStatistics(
              bot,
              chatId
            );
            break;

          case "admin:users":
            await sendUsers(
              bot,
              chatId
            );
            break;

          case "admin:cloudflare":
            await sendCloudflareStatus(
              bot,
              chatId
            );
            break;

          default:
            break;
        }
      } catch (error) {
        console.error(
          "❌ Admin callback error:",
          error
        );

        try {
          await bot.sendMessage(
            chatId,
            "❌ Something went wrong while processing the admin request."
          );
        } catch {
          // Ignore Telegram errors.
        }
      }
    }
  );

  console.log(
    "🛡️ Admin handler registered."
  );
}

async function sendDashboard(
  bot,
  chatId
) {
  const stats =
    await getStatistics();

  const text = [
    "🛡️ <b>METRO HOSTING ADMIN</b>",
    "",
    "Welcome to your hosting control center.",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "📊 <b>OVERVIEW</b>",
    "",
    `👥 Users: <b>${stats.users}</b>`,
    `📁 Projects: <b>${stats.projects}</b>`,
    `🟢 Active: <b>${stats.active}</b>`,
    `🚀 Deploying: <b>${stats.deploying}</b>`,
    `🔴 Failed: <b>${stats.failed}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "📊 Statistics",
          callback_data:
            "admin:stats"
        },
        {
          text: "👥 Users",
          callback_data:
            "admin:users"
        }
      ],
      [
        {
          text: "📁 Projects",
          callback_data:
            "admin:projects"
        }
      ],
      [
        {
          text: "☁️ Cloudflare",
          callback_data:
            "admin:cloudflare"
        }
      ],
      [
        {
          text: "📢 Broadcast",
          callback_data:
            "admin:broadcast"
        }
      ]
    ]
  };

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
      disable_web_page_preview:
        true
    }
  );
}

async function sendStatistics(
  bot,
  chatId
) {
  const stats =
    await getStatistics();

  const successRate =
    stats.projects > 0
      ? Math.round(
          (stats.active /
            stats.projects) *
            100
        )
      : 0;

  const text = [
    "📊 <b>HOSTING STATISTICS</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "👥 <b>USERS</b>",
    "",
    `👤 Total Users: <b>${stats.users}</b>`,
    "",
    "📁 <b>PROJECTS</b>",
    "",
    `📦 Total: <b>${stats.projects}</b>`,
    `🟢 Active: <b>${stats.active}</b>`,
    `🚀 Deploying: <b>${stats.deploying}</b>`,
    `🔴 Failed: <b>${stats.failed}</b>`,
    `🗑️ Deleted: <b>${stats.deleted}</b>`,
    "",
    `📈 Success Rate: <b>${successRate}%</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
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
              text: "👥 Users",
              callback_data:
                "admin:users"
            },
            {
              text: "📁 Projects",
              callback_data:
                "admin:projects"
            }
          ],
          [
            {
              text: "🔙 Dashboard",
              callback_data:
                "admin:dashboard"
            }
          ]
        ]
      }
    }
  );
}

async function sendUsers(
  bot,
  chatId
) {
  const users =
    await getUsers();

  const sortedUsers =
    [...users].sort(
      (a, b) =>
        new Date(
          b.updatedAt ||
            b.createdAt ||
            0
        ) -
        new Date(
          a.updatedAt ||
            a.createdAt ||
            0
        )
    );

  const text = [
    "👥 <b>USER MANAGEMENT</b>",
    "",
    `👤 Total Users: <b>${users.length}</b>`,
    "",
    "Select a user to view details.",
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  const keyboard = [];

  sortedUsers
    .slice(0, 20)
    .forEach((user) => {
      const username =
        user.username
          ? `@${user.username}`
          : "No username";

      keyboard.push([
        {
          text:
            `👤 ${getUserName(user).slice(
              0,
              22
            )} — ${username.slice(
              0,
              18
            )}`,
          callback_data:
            `admin:user:view:${user.id}`
        }
      ]);
    });

  keyboard.push(
    [
      {
        text: "🔄 Refresh",
        callback_data:
          "admin:users"
      }
    ],
    [
      {
        text: "🟢 Active Users",
        callback_data:
          "admin:user:active"
      },
      {
        text: "🏆 Top Users",
        callback_data:
          "admin:user:top"
      }
    ],
    [
      {
        text: "🔙 Dashboard",
        callback_data:
          "admin:dashboard"
      }
    ]
  );

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          keyboard
      }
    }
  );
}

async function sendCloudflareStatus(
  bot,
  chatId
) {
  const message =
    await bot.sendMessage(
      chatId,
      "☁️ <b>Cloudflare</b>\n\n⏳ Checking connection...",
      {
        parse_mode: "HTML"
      }
    );

  try {
    const result =
      await testCloudflareConnection();

    const text = [
      "☁️ <b>CLOUDFLARE STATUS</b>",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "🟢 <b>Connection: ONLINE</b>",
      "",
      `👤 Account: <code>${escapeHtml(
        result.accountId ||
          config.adminIds.join(",")
      )}</code>`,
      "",
      "🚀 Pages deployment service is ready.",
      "",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n");

    await bot.editMessageText(
      text,
      {
        chat_id: chatId,
        message_id:
          message.message_id,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔄 Test Again",
                callback_data:
                  "admin:cloudflare"
              }
            ],
            [
              {
                text:
                  "🔙 Dashboard",
                callback_data:
                  "admin:dashboard"
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error(
      "Cloudflare status error:",
      error
    );

    const text = [
      "☁️ <b>CLOUDFLARE STATUS</b>",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "🔴 <b>Connection: OFFLINE</b>",
      "",
      `❌ ${escapeHtml(
        error.message ||
          "Unable to connect to Cloudflare."
      )}`,
      "",
      "Check:",
      "• CLOUDFLARE_ACCOUNT_ID",
      "• CLOUDFLARE_API_TOKEN",
      "• API token permissions",
      "",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n");

    await bot.editMessageText(
      text,
      {
        chat_id: chatId,
        message_id:
          message.message_id,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔄 Try Again",
                callback_data:
                  "admin:cloudflare"
              }
            ],
            [
              {
                text:
                  "🔙 Dashboard",
                callback_data:
                  "admin:dashboard"
              }
            ]
          ]
        }
      }
    );
  }
}

export default {
  registerAdminHandler,
  isAdmin
};
