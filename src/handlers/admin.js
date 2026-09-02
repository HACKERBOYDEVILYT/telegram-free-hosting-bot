import config from "../config.js";

import {
  getStatistics,
  getUsers
} from "../database.js";

import {
  testCloudflareConnection
} from "../services/deployer.js";

function isAdmin(userId) {
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

function dashboardKeyboard() {
  return {
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
          text: "🌐 Projects",
          callback_data:
            "admin:projects"
        },
        {
          text: "☁️ Cloudflare",
          callback_data:
            "admin:cloudflare"
        }
      ],
      [
        {
          text: "🔄 Refresh",
          callback_data:
            "admin:dashboard"
        }
      ],
      [
        {
          text: "🔙 Main Menu",
          callback_data:
            "main_menu"
        }
      ]
    ]
  };
}

export function registerAdminHandler(
  bot
) {
  /*
   * /admin command
   */
  bot.onText(
    /^\/admin$/i,
    async (message) => {
      try {
        const userId =
          String(message.from.id);

        if (!isAdmin(userId)) {
          await bot.sendMessage(
            message.chat.id,
            [
              "⛔ <b>ACCESS DENIED</b>",
              "",
              "You are not authorized to access the admin panel."
            ].join("\n"),
            {
              parse_mode: "HTML"
            }
          );

          return;
        }

        await sendAdminDashboard(
          bot,
          message.chat.id
        );
      } catch (error) {
        console.error(
          "❌ Admin command error:",
          error
        );

        try {
          await bot.sendMessage(
            message.chat.id,
            "❌ Unable to open admin panel."
          );
        } catch {
          // Ignore Telegram errors.
        }
      }
    }
  );

  /*
   * Only handle the core admin
   * callbacks here.
   *
   * Project-specific callbacks are
   * handled by adminProjects.js.
   */
  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      const coreCallbacks = [
        "admin:dashboard",
        "admin:stats",
        "admin:users",
        "admin:cloudflare"
      ];

      if (
        !coreCallbacks.includes(data)
      ) {
        return;
      }

      const chatId =
        query.message?.chat?.id;

      const userId =
        String(query.from.id);

      if (!chatId) {
        return;
      }

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
          // Ignore callback errors.
        }

        return;
      }

      try {
        await bot.answerCallbackQuery(
          query.id
        );

        switch (data) {
          case "admin:dashboard":
            await sendAdminDashboard(
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
            "❌ Admin panel request failed."
          );
        } catch {
          // Ignore Telegram errors.
        }
      }
    }
  );

  console.log(
    "🛡️ Admin core handler registered."
  );
}

async function sendAdminDashboard(
  bot,
  chatId
) {
  const statistics =
    await getStatistics();

  const totalUsers =
    Number(
      statistics?.totalUsers || 0
    );

  const totalProjects =
    Number(
      statistics?.totalProjects || 0
    );

  const activeProjects =
    Number(
      statistics?.activeProjects || 0
    );

  const deployingProjects =
    Number(
      statistics?.deployingProjects || 0
    );

  const failedProjects =
    Number(
      statistics?.failedProjects || 0
    );

  const text = [
    "🛡️ <b>ADMIN CONTROL CENTER</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "📊 <b>PLATFORM OVERVIEW</b>",
    "",
    `👥 Users: <b>${totalUsers}</b>`,
    `📁 Projects: <b>${totalProjects}</b>`,
    `🟢 Active: <b>${activeProjects}</b>`,
    `🚀 Deploying: <b>${deployingProjects}</b>`,
    `🔴 Failed: <b>${failedProjects}</b>`,
    "",
    "☁️ Hosting: <b>Cloudflare Pages</b>",
    "🤖 Bot: <b>Online</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "🔐 <b>Administrator Mode</b>",
    "",
    "Manage users, hosted projects, statistics and hosting infrastructure from this panel."
  ].join("\n");

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      ...dashboardKeyboard()
    }
  );
}

async function sendStatistics(
  bot,
  chatId
) {
  const statistics =
    await getStatistics();

  const totalUsers =
    Number(
      statistics?.totalUsers || 0
    );

  const totalProjects =
    Number(
      statistics?.totalProjects || 0
    );

  const active =
    Number(
      statistics?.activeProjects || 0
    );

  const deploying =
    Number(
      statistics?.deployingProjects || 0
    );

  const pending =
    Number(
      statistics?.pendingProjects || 0
    );

  const failed =
    Number(
      statistics?.failedProjects || 0
    );

  const suspended =
    Number(
      statistics?.suspendedProjects || 0
    );

  const deleted =
    Number(
      statistics?.deletedProjects || 0
    );

  const text = [
    "📊 <b>PLATFORM STATISTICS</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "👥 <b>USERS</b>",
    "",
    `Total Users: <b>${totalUsers}</b>`,
    "",
    "📁 <b>PROJECTS</b>",
    "",
    `Total: <b>${totalProjects}</b>`,
    `🟢 Active: <b>${active}</b>`,
    `🚀 Deploying: <b>${deploying}</b>`,
    `⏳ Pending: <b>${pending}</b>`,
    `🔴 Failed: <b>${failed}</b>`,
    `🟠 Suspended: <b>${suspended}</b>`,
    `🗑️ Deleted: <b>${deleted}</b>`,
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
              text: "🔄 Refresh",
              callback_data:
                "admin:stats"
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
    [...users]
      .sort(
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
      )
      .slice(0, 20);

  const lines = [
    "👥 <b>USER MANAGEMENT</b>",
    "",
    `👤 Registered Users: <b>${users.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  if (!sortedUsers.length) {
    lines.push(
      "",
      "📭 No registered users yet."
    );
  } else {
    sortedUsers.forEach(
      (user, index) => {
        const name =
          [
            user.firstName,
            user.lastName
          ]
            .filter(Boolean)
            .join(" ") ||
          "Unknown User";

        const username =
          user.username
            ? `@${user.username}`
            : "No username";

        lines.push(
          "",
          `${index + 1}. <b>${escapeHtml(name)}</b>`,
          `   🔗 ${escapeHtml(username)}`,
          `   🆔 <code>${escapeHtml(user.id)}</code>`
        );
      }
    );
  }

  if (users.length > 20) {
    lines.push(
      "",
      `ℹ️ Showing latest <b>20</b> users.`
    );
  }

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔄 Refresh",
              callback_data:
                "admin:users"
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

async function sendCloudflareStatus(
  bot,
  chatId
) {
  const loading =
    await bot.sendMessage(
      chatId,
      [
        "☁️ <b>CLOUDFLARE</b>",
        "",
        "⏳ Testing connection...",
        "",
        "Please wait."
      ].join("\n"),
      {
        parse_mode: "HTML"
      }
    );

  const result =
    await testCloudflareConnection();

  const status =
    result.success
      ? "🟢 <b>CONNECTED</b>"
      : "🔴 <b>CONNECTION FAILED</b>";

  const text = [
    "☁️ <b>CLOUDFLARE STATUS</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `Status: ${status}`,
    "",
    escapeHtml(
      result.message ||
        "No additional information."
    ),
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "🔄 Test Again",
          callback_data:
            "admin:cloudflare"
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
  };

  try {
    await bot.editMessageText(
      text,
      {
        chat_id: chatId,
        message_id:
          loading.message_id,
        parse_mode: "HTML",
        reply_markup:
          keyboard
      }
    );
  } catch {
    try {
      await bot.sendMessage(
        chatId,
        text,
        {
          parse_mode: "HTML",
          reply_markup:
            keyboard
        }
      );
    } catch {
      // Ignore Telegram errors.
    }
  }
}

export {
  isAdmin
};

export default {
  registerAdminHandler,
  isAdmin
};
