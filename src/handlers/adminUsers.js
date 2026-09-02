import {
  getUsers,
  getProjects
} from "../database.js";

import {
  isAdmin
} from "./admin.js";

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
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  });
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

function getUsername(user) {
  return user?.username
    ? `@${user.username}`
    : "No username";
}

function getUserProjects(
  projects,
  userId
) {
  return projects.filter(
    (project) =>
      String(project.userId) ===
      String(userId)
  );
}

function usersKeyboard() {
  return {
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
          text: "🟢 Active Users",
          callback_data:
            "admin:users:active"
        },
        {
          text: "📁 Top Users",
          callback_data:
            "admin:users:top"
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
}

export function registerAdminUsersHandler(
  bot
) {
  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      if (
        !data.startsWith(
          "admin:user:"
        )
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
          // Ignore Telegram errors.
        }

        return;
      }

      try {
        await bot.answerCallbackQuery(
          query.id
        );

        if (
          data ===
          "admin:user:list"
        ) {
          await showUsers(
            bot,
            chatId
          );

          return;
        }

        if (
          data ===
          "admin:user:active"
        ) {
          await showActiveUsers(
            bot,
            chatId
          );

          return;
        }

        if (
          data ===
          "admin:user:top"
        ) {
          await showTopUsers(
            bot,
            chatId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:user:view:"
          )
        ) {
          const targetUserId =
            data.replace(
              "admin:user:view:",
              ""
            );

          await showUserDetails(
            bot,
            chatId,
            targetUserId
          );
        }
      } catch (error) {
        console.error(
          "❌ Admin users error:",
          error
        );

        try {
          await bot.sendMessage(
            chatId,
            "❌ Unable to process user management request."
          );
        } catch {
          // Ignore Telegram errors.
        }
      }
    }
  );

  console.log(
    "👥 Admin user manager registered."
  );
}

async function showUsers(
  bot,
  chatId
) {
  const [
    users,
    projects
  ] = await Promise.all([
    getUsers(),
    getProjects()
  ]);

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

  const lines = [
    "👥 <b>USER MANAGEMENT</b>",
    "",
    `👤 Total Users: <b>${users.length}</b>`,
    `📁 Total Projects: <b>${projects.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  if (!sortedUsers.length) {
    lines.push(
      "",
      "📭 <b>No users registered yet.</b>"
    );
  } else {
    sortedUsers
      .slice(0, 20)
      .forEach(
        (user, index) => {
          const userProjects =
            getUserProjects(
              projects,
              user.id
            );

          const activeProjects =
            userProjects.filter(
              (project) =>
                project.status ===
                "active"
            ).length;

          lines.push(
            "",
            `${index + 1}. <b>${escapeHtml(
              getUserName(user)
            )}</b>`,
            `   🔗 ${escapeHtml(
              getUsername(user)
            )}`,
            `   🆔 <code>${escapeHtml(
              user.id
            )}</code>`,
            `   📁 Projects: <b>${userProjects.length}</b>`,
            `   🟢 Active: <b>${activeProjects}</b>`
          );
        }
      );

    if (sortedUsers.length > 20) {
      lines.push(
        "",
        `ℹ️ Showing latest <b>20</b> of <b>${sortedUsers.length}</b> users.`
      );
    }
  }

  const keyboard = [];

  sortedUsers
    .slice(0, 20)
    .forEach((user) => {
      keyboard.push([
        {
          text:
            `👤 ${truncate(
              getUserName(user),
              26
            )}`,
          callback_data:
            `admin:user:view:${user.id}`
        }
      ]);
    });

  keyboard.push(
    ...usersKeyboard().inline_keyboard
  );

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          keyboard
      },
      disable_web_page_preview:
        true
    }
  );
}

async function showActiveUsers(
  bot,
  chatId
) {
  const [
    users,
    projects
  ] = await Promise.all([
    getUsers(),
    getProjects()
  ]);

  const activeUsers =
    users.filter((user) => {
      const userProjects =
        getUserProjects(
          projects,
          user.id
        );

      return userProjects.some(
        (project) =>
          project.status ===
          "active"
      );
    });

  const lines = [
    "🟢 <b>ACTIVE USERS</b>",
    "",
    `👥 Users with active websites: <b>${activeUsers.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  if (!activeUsers.length) {
    lines.push(
      "",
      "📭 No users currently have an active website."
    );
  }

  const keyboard = [];

  activeUsers
    .slice(0, 20)
    .forEach((user, index) => {
      const count =
        getUserProjects(
          projects,
          user.id
        ).filter(
          (project) =>
            project.status ===
            "active"
        ).length;

      lines.push(
        "",
        `${index + 1}. <b>${escapeHtml(
          getUserName(user)
        )}</b>`,
        `   🔗 ${escapeHtml(
          getUsername(user)
        )}`,
        `   🟢 Active websites: <b>${count}</b>`
      );

      keyboard.push([
        {
          text:
            `👤 ${truncate(
              getUserName(user),
              26
            )}`,
          callback_data:
            `admin:user:view:${user.id}`
        }
      ]);
    });

  keyboard.push(
    [
      {
        text: "🔙 Dashboard",
        callback_data:
          "admin:dashboard"
      }
    ],
    [
      {
        text: "👥 All Users",
        callback_data:
          "admin:user:list"
      }
    ]
  );

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          keyboard
      }
    }
  );
}

async function showTopUsers(
  bot,
  chatId
) {
  const [
    users,
    projects
  ] = await Promise.all([
    getUsers(),
    getProjects()
  ]);

  const ranked =
    users
      .map((user) => {
        const userProjects =
          getUserProjects(
            projects,
            user.id
          );

        const active =
          userProjects.filter(
            (project) =>
              project.status ===
              "active"
          ).length;

        return {
          user,
          total:
            userProjects.length,
          active
        };
      })
      .sort(
        (a, b) =>
          b.active - a.active ||
          b.total - a.total
      );

  const lines = [
    "🏆 <b>TOP HOSTING USERS</b>",
    "",
    "Ranked by active hosted websites.",
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  const keyboard = [];

  ranked
    .slice(0, 10)
    .forEach(
      (item, index) => {
        const medal =
          index === 0
            ? "🥇"
            : index === 1
              ? "🥈"
              : index === 2
                ? "🥉"
                : `${index + 1}.`;

        lines.push(
          "",
          `${medal} <b>${escapeHtml(
            getUserName(
              item.user
            )
          )}</b>`,
          `   🟢 Active: <b>${item.active}</b>`,
          `   📁 Total: <b>${item.total}</b>`
        );

        keyboard.push([
          {
            text:
              `👤 ${truncate(
                getUserName(
                  item.user
                ),
                26
              )}`,
            callback_data:
              `admin:user:view:${item.user.id}`
          }
        ]);
      }
    );

  if (!ranked.length) {
    lines.push(
      "",
      "📭 No user data available."
    );
  }

  keyboard.push(
    [
      {
        text: "👥 All Users",
        callback_data:
          "admin:user:list"
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
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          keyboard
      }
    }
  );
}

async function showUserDetails(
  bot,
  chatId,
  targetUserId
) {
  const [
    users,
    projects
  ] = await Promise.all([
    getUsers(),
    getProjects()
  ]);

  const user =
    users.find(
      (item) =>
        String(item.id) ===
        String(targetUserId)
    );

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ <b>User not found.</b>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔙 Users",
                callback_data:
                  "admin:user:list"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  const userProjects =
    getUserProjects(
      projects,
      user.id
    );

  const active =
    userProjects.filter(
      (project) =>
        project.status ===
        "active"
    ).length;

  const deploying =
    userProjects.filter(
      (project) =>
        project.status ===
        "deploying"
    ).length;

  const failed =
    userProjects.filter(
      (project) =>
        project.status ===
        "failed"
    ).length;

  const deleted =
    userProjects.filter(
      (project) =>
        project.status ===
        "deleted"
    ).length;

  const text = [
    "👤 <b>USER DETAILS</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `👤 <b>Name:</b> ${escapeHtml(
      getUserName(user)
    )}`,
    `🔗 <b>Username:</b> ${escapeHtml(
      getUsername(user)
    )}`,
    `🆔 <b>Telegram ID:</b> <code>${escapeHtml(
      user.id
    )}</code>`,
    "",
    "📁 <b>HOSTING ACTIVITY</b>",
    "",
    `📊 Total Projects: <b>${userProjects.length}</b>`,
    `🟢 Active: <b>${active}</b>`,
    `🚀 Deploying: <b>${deploying}</b>`,
    `🔴 Failed: <b>${failed}</b>`,
    `🗑️ Deleted: <b>${deleted}</b>`,
    "",
    `📅 <b>Joined:</b> ${formatDate(
      user.createdAt
    )}`,
    `🔄 <b>Last Activity:</b> ${formatDate(
      user.updatedAt
    )}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  const keyboard = [
    [
      {
        text: "📁 View Projects",
        callback_data:
          `admin:user:projects:${user.id}`
      }
    ],
    [
      {
        text: "🔙 Users",
        callback_data:
          "admin:user:list"
      },
      {
        text: "🛡️ Dashboard",
        callback_data:
          "admin:dashboard"
      }
    ]
  ];

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

function truncate(
  value,
  maxLength
) {
  const text =
    String(value || "");

  if (
    text.length <= maxLength
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      maxLength - 1
    ) + "…"
  );
}

export default {
  registerAdminUsersHandler
};
