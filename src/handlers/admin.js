import config from "../config.js";
import {
  getStatistics,
  getUsers,
  getProjects
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

function adminKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📊 Statistics",
            callback_data: "admin:stats"
          },
          {
            text: "👥 Users",
            callback_data: "admin:users"
          }
        ],
        [
          {
            text: "🌐 Projects",
            callback_data: "admin:projects"
          },
          {
            text: "☁️ Cloudflare",
            callback_data: "admin:cloudflare"
          }
        ],
        [
          {
            text: "🔄 Refresh",
            callback_data: "admin:dashboard"
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
  };
}

export function registerAdminHandler(bot) {
  bot.onText(
    /^\/admin$/i,
    async (message) => {
      try {
        const userId =
          String(message.from.id);

        if (!isAdmin(userId)) {
          await bot.sendMessage(
            message.chat.id,
            "⛔ <b>Access Denied</b>\n\nYou are not authorized to access the admin panel.",
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

        await bot.sendMessage(
          message.chat.id,
          "❌ Unable to open admin panel."
        );
      }
    }
  );

  bot.on(
    "callback_query",
    async (query) => {
      const data = query.data || "";

      if (!data.startsWith("admin:")) {
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
              text: "⛔ Admin access required.",
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

          case "admin:projects":
            await sendProjects(
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
    "🛡️ Admin handler registered."
  );
}

async function sendAdminDashboard(
  bot,
  chatId
) {
  const statistics =
    await getStatistics();

  const users =
    Number(statistics?.totalUsers || 0);

  const projects =
    Number(
      statistics?.totalProjects || 0
    );

  const activeProjects =
    Number(
      statistics?.activeProjects || 0
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
    "📊 <b>Overview</b>",
    "",
    `👥 Total Users: <b>${users}</b>`,
    `📁 Total Projects: <b>${projects}</b>`,
    `🟢 Active Projects: <b>${activeProjects}</b>`,
    `🔴 Failed Projects: <b>${failedProjects}</b>`,
    "",
    "☁️ Hosting: <b>Cloudflare Pages</b>",
    "🤖 Bot Status: <b>Online</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "Select an option below:"
  ].join("\n");

  await bot.sendMessage(
    chatId,
    text,
    {
      parse_mode: "HTML",
      ...adminKeyboard()
    }
  );
}

async function sendStatistics(
  bot,
  chatId
) {
  const statistics =
    await getStatistics();

  const users =
    Number(statistics?.totalUsers || 0);

  const projects =
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

  const failed =
    Number(
      statistics?.failedProjects || 0
    );

  const pending =
    Number(
      statistics?.pendingProjects || 0
    );

  const deleted =
    Number(
      statistics?.deletedProjects || 0
    );

  const text = [
    "📊 <b>BOT STATISTICS</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "👥 <b>Users</b>",
    `Total Users: <b>${users}</b>`,
    "",
    "📁 <b>Projects</b>",
    `Total: <b>${projects}</b>`,
    `🟢 Active: <b>${active}</b>`,
    `🚀 Deploying: <b>${deploying}</b>`,
    `⏳ Pending: <b>${pending}</b>`,
    `🔴 Failed: <b>${failed}</b>`,
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
              callback_data: "admin:stats"
            }
          ],
          [
            {
              text: "🔙 Dashboard",
              callback_data: "admin:dashboard"
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
      .slice(0, 15);

  if (!sortedUsers.length) {
    await bot.sendMessage(
      chatId,
      "👥 <b>Users</b>\n\nNo users registered yet.",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔙 Dashboard",
                callback_data: "admin:dashboard"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  const lines = [
    "👥 <b>RECENT USERS</b>",
    "",
    `Total registered: <b>${users.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  sortedUsers.forEach(
    (user, index) => {
      const name =
        [
          user.firstName,
          user.lastName
        ]
          .filter(Boolean)
          .join(" ") ||
        "Unknown";

      const username =
        user.username
          ? `@${user.username}`
          : "No username";

      lines.push(
        `${index + 1}. <b>${escapeHtml(name)}</b>`,
        `   👤 ${escapeHtml(username)}`,
        `   🆔 <code>${escapeHtml(user.id)}</code>`,
        ""
      );
    }
  );

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
              callback_data: "admin:users"
            }
          ],
          [
            {
              text: "🔙 Dashboard",
              callback_data: "admin:dashboard"
            }
          ]
        ]
      }
    }
  );
}

async function sendProjects(
  bot,
  chatId
) {
  const projects =
    await getProjects();

  const active =
    projects.filter(
      (project) =>
        project.status === "active"
    ).length;

  const deploying =
    projects.filter(
      (project) =>
        project.status === "deploying"
    ).length;

  const failed =
    projects.filter(
      (project) =>
        project.status === "failed"
    ).length;

  const text = [
    "🌐 <b>HOSTING PROJECTS</b>",
    "",
    `📁 Total: <b>${projects.length}</b>`,
    `🟢 Active: <b>${active}</b>`,
    `🚀 Deploying: <b>${deploying}</b>`,
    `🔴 Failed: <b>${failed}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "Project management controls will be expanded here."
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
              callback_data: "admin:projects"
            }
          ],
          [
            {
              text: "🔙 Dashboard",
              callback_data: "admin:dashboard"
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
  const message =
    await bot.sendMessage(
      chatId,
      "☁️ <b>Cloudflare</b>\n\n⏳ Checking connection...",
      {
        parse_mode: "HTML"
      }
    );

  const result =
    await testCloudflareConnection();

  const status =
    result.success
      ? "🟢 <b>Connected</b>"
      : "🔴 <b>Connection Failed</b>";

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
    )
  ].join("\n");

  try {
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
        }
      }
    );
  } catch {
    await bot.sendMessage(
      chatId,
      text,
      {
        parse_mode: "HTML"
      }
    );
  }
}

export {
  isAdmin
};

export default {
  registerAdminHandler,
  isAdmin
};
