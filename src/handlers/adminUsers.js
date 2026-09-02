import {
  getUsers,
  getProjects,
  blockUser,
  unblockUser
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
  if (!value) return "Not available";

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

function truncate(
  value,
  maxLength
) {
  const text = String(value || "");

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.slice(0, maxLength - 1) +
    "…"
  );
}

export function registerAdminUsersHandler(bot) {
  bot.on(
    "callback_query",
    async (query) => {
      const data = query.data || "";

      if (
        !data.startsWith("admin:user:")
      ) {
        return;
      }

      const chatId =
        query.message?.chat?.id;

      if (!chatId) return;

      const adminId =
        String(query.from.id);

      if (!isAdmin(adminId)) {
        try {
          await bot.answerCallbackQuery(
            query.id,
            {
              text:
                "⛔ Admin access required.",
              show_alert: true
            }
          );
        } catch {}

        return;
      }

      try {
        await bot.answerCallbackQuery(
          query.id
        );

        if (
          data === "admin:user:list"
        ) {
          await showUsers(bot, chatId);
          return;
        }

        if (
          data === "admin:user:active"
        ) {
          await showActiveUsers(
            bot,
            chatId
          );
          return;
        }

        if (
          data === "admin:user:top"
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

          return;
        }

        if (
          data.startsWith(
            "admin:user:block:"
          )
        ) {
          const targetUserId =
            data.replace(
              "admin:user:block:",
              ""
            );

          await showBlockConfirmation(
            bot,
            chatId,
            targetUserId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:user:block-confirm:"
          )
        ) {
          const targetUserId =
            data.replace(
              "admin:user:block-confirm:",
              ""
            );

          await confirmBlockUser(
            bot,
            chatId,
            targetUserId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:user:unblock:"
          )
        ) {
          const targetUserId =
            data.replace(
              "admin:user:unblock:",
              ""
            );

          await showUnblockConfirmation(
            bot,
            chatId,
            targetUserId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:user:unblock-confirm:"
          )
        ) {
          const targetUserId =
            data.replace(
              "admin:user:unblock-confirm:",
              ""
            );

          await confirmUnblockUser(
            bot,
            chatId,
            targetUserId
          );
        }
      } catch (error) {
        console.error(
          "❌ Admin user error:",
          error
        );

        try {
          await bot.sendMessage(
            chatId,
            "❌ Unable to process user management request."
          );
        } catch {}
      }
    }
  );

  console.log(
    "👥 Admin user manager registered."
  );
}

/* =========================
   USER LIST
========================= */

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

  const blockedCount =
    users.filter(
      (user) =>
        user.isBlocked === true ||
        user.status === "blocked"
    ).length;

  const lines = [
    "👥 <b>USER MANAGEMENT</b>",
    "",
    `👤 Total Users: <b>${users.length}</b>`,
    `🟢 Active Users: <b>${users.length - blockedCount}</b>`,
    `🚫 Blocked Users: <b>${blockedCount}</b>`,
    `📁 Total Projects: <b>${projects.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  if (!sortedUsers.length) {
    lines.push(
      "",
      "📭 <b>No users registered yet.</b>"
    );
  }

  const keyboard = [];

  sortedUsers
    .slice(0, 20)
    .forEach((user) => {
      const blocked =
        user.isBlocked === true ||
        user.status === "blocked";

      keyboard.push([
        {
          text:
            `${blocked ? "🚫" : "👤"} ${truncate(
              getUserName(user),
              28
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

/* =========================
   ACTIVE USERS
========================= */

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
    users.filter(
      (user) =>
        user.isBlocked !== true &&
        user.status !== "blocked"
    );

  const lines = [
    "🟢 <b>ACTIVE USERS</b>",
    "",
    `👥 Active Users: <b>${activeUsers.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  const keyboard = [];

  activeUsers
    .slice(0, 20)
    .forEach((user, index) => {
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
        `   📁 Projects: <b>${userProjects.length}</b>`,
        `   🟢 Active: <b>${activeProjects}</b>`
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

/* =========================
   TOP USERS
========================= */

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
      .filter(
        (item) =>
          !item.user.isBlocked &&
          item.user.status !==
            "blocked"
      )
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

/* =========================
   USER DETAILS
========================= */

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

  const blocked =
    user.isBlocked === true ||
    user.status === "blocked";

  const statusText = blocked
    ? "🚫 BLOCKED"
    : "🟢 ACTIVE";

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
    `📌 <b>Status:</b> ${statusText}`,
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
    blocked
      ? `🚫 <b>Blocked:</b> ${formatDate(
          user.blockedAt
        )}`
      : "",
    blocked &&
    user.blockedReason
      ? `📝 <b>Reason:</b> ${escapeHtml(
          user.blockedReason
        )}`
      : "",
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard = [
    [
      {
        text: "📁 View Projects",
        callback_data:
          `admin:user:projects:${user.id}`
      }
    ]
  ];

  if (blocked) {
    keyboard.push([
      {
        text: "✅ Unblock User",
        callback_data:
          `admin:user:unblock:${user.id}`
      }
    ]);
  } else {
    keyboard.push([
      {
        text: "🚫 Block User",
        callback_data:
          `admin:user:block:${user.id}`
      }
    ]);
  }

  keyboard.push(
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

/* =========================
   BLOCK CONFIRMATION
========================= */

async function showBlockConfirmation(
  bot,
  chatId,
  targetUserId
) {
  const user =
    await findUser(targetUserId);

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ User not found."
    );

    return;
  }

  const text = [
    "🚫 <b>BLOCK USER</b>",
    "",
    `👤 User: <b>${escapeHtml(
      getUserName(user)
    )}</b>`,
    `🆔 ID: <code>${escapeHtml(
      user.id
    )}</code>`,
    "",
    "Blocking this user will prevent them from using hosting features.",
    "",
    "⚠️ Are you sure?"
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
              text:
                "🚫 Yes, Block User",
              callback_data:
                `admin:user:block-confirm:${user.id}`
            }
          ],
          [
            {
              text:
                "❌ Cancel",
              callback_data:
                `admin:user:view:${user.id}`
            }
          ]
        ]
      }
    }
  );
}

async function confirmBlockUser(
  bot,
  chatId,
  targetUserId
) {
  const user =
    await findUser(targetUserId);

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ User not found."
    );

    return;
  }

  /*
   * Default reason for now.
   * A future version can ask the
   * admin for a custom reason.
   */
  const updated =
    await blockUser(
      targetUserId,
      "Blocked by administrator"
    );

  if (!updated) {
    await bot.sendMessage(
      chatId,
      "❌ Failed to block user."
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    [
      "🚫 <b>USER BLOCKED</b>",
      "",
      `👤 ${escapeHtml(
        getUserName(updated)
      )}`,
      `🆔 <code>${escapeHtml(
        updated.id
      )}</code>`,
      "",
      "The user is now restricted from hosting."
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                "👤 View User",
              callback_data:
                `admin:user:view:${updated.id}`
            }
          ],
          [
            {
              text:
                "👥 Users",
              callback_data:
                "admin:user:list"
            }
          ]
        ]
      }
    }
  );
}

/* =========================
   UNBLOCK CONFIRMATION
========================= */

async function showUnblockConfirmation(
  bot,
  chatId,
  targetUserId
) {
  const user =
    await findUser(targetUserId);

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ User not found."
    );

    return;
  }

  const text = [
    "✅ <b>UNBLOCK USER</b>",
    "",
    `👤 User: <b>${escapeHtml(
      getUserName(user)
    )}</b>`,
    `🆔 ID: <code>${escapeHtml(
      user.id
    )}</code>`,
    "",
    "This user will regain access to hosting features.",
    "",
    "Are you sure?"
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
              text:
                "✅ Yes, Unblock",
              callback_data:
                `admin:user:unblock-confirm:${user.id}`
            }
          ],
          [
            {
              text:
                "❌ Cancel",
              callback_data:
                `admin:user:view:${user.id}`
            }
          ]
        ]
      }
    }
  );
}

async function confirmUnblockUser(
  bot,
  chatId,
  targetUserId
) {
  const user =
    await findUser(targetUserId);

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ User not found."
    );

    return;
  }

  const updated =
    await unblockUser(
      targetUserId
    );

  if (!updated) {
    await bot.sendMessage(
      chatId,
      "❌ Failed to unblock user."
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    [
      "✅ <b>USER UNBLOCKED</b>",
      "",
      `👤 ${escapeHtml(
        getUserName(updated)
      )}`,
      `🆔 <code>${escapeHtml(
        updated.id
      )}</code>`,
      "",
      "The user can now use hosting features again."
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                "👤 View User",
              callback_data:
                `admin:user:view:${updated.id}`
            }
          ],
          [
            {
              text:
                "👥 Users",
              callback_data:
                "admin:user:list"
            }
          ]
        ]
      }
    }
  );
}

/* =========================
   HELPERS
========================= */

async function findUser(userId) {
  const users =
    await getUsers();

  return (
    users.find(
      (user) =>
        String(user.id) ===
        String(userId)
    ) || null
  );
}

export default {
  registerAdminUsersHandler
};
