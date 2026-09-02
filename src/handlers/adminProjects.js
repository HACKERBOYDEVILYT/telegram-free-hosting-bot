import {
  getProjects,
  getUsers,
  getProject,
  updateProject
} from "../database.js";

import {
  isAdmin
} from "./admin.js";

import {
  deleteCloudflareProject
} from "../services/deployer.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusInfo(status) {
  switch (status) {
    case "active":
      return {
        emoji: "🟢",
        label: "ACTIVE"
      };

    case "deploying":
      return {
        emoji: "🚀",
        label: "DEPLOYING"
      };

    case "pending":
      return {
        emoji: "⏳",
        label: "PENDING"
      };

    case "failed":
      return {
        emoji: "🔴",
        label: "FAILED"
      };

    case "suspended":
      return {
        emoji: "🟠",
        label: "SUSPENDED"
      };

    case "deleted":
      return {
        emoji: "🗑️",
        label: "DELETED"
      };

    default:
      return {
        emoji: "⚪",
        label: String(
          status || "UNKNOWN"
        ).toUpperCase()
      };
  }
}

function adminProjectsMenu() {
  return {
    inline_keyboard: [
      [
        {
          text: "📁 All Projects",
          callback_data:
            "admin:projects"
        }
      ],
      [
        {
          text: "🟢 Active",
          callback_data:
            "admin:projects:active"
        },
        {
          text: "🔴 Failed",
          callback_data:
            "admin:projects:failed"
        }
      ],
      [
        {
          text: "🚀 Deploying",
          callback_data:
            "admin:projects:deploying"
        },
        {
          text: "🗑️ Deleted",
          callback_data:
            "admin:projects:deleted"
        }
      ],
      [
        {
          text: "🔄 Refresh",
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
  };
}

export function registerAdminProjectsHandler(
  bot
) {
  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      if (
        !data.startsWith(
          "admin:projects"
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
          "admin:projects"
        ) {
          await showProjects(
            bot,
            chatId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:projects:active"
          )
        ) {
          await showProjects(
            bot,
            chatId,
            "active"
          );

          return;
        }

        if (
          data.startsWith(
            "admin:projects:failed"
          )
        ) {
          await showProjects(
            bot,
            chatId,
            "failed"
          );

          return;
        }

        if (
          data.startsWith(
            "admin:projects:deploying"
          )
        ) {
          await showProjects(
            bot,
            chatId,
            "deploying"
          );

          return;
        }

        if (
          data.startsWith(
            "admin:projects:deleted"
          )
        ) {
          await showProjects(
            bot,
            chatId,
            "deleted"
          );

          return;
        }

        if (
          data.startsWith(
            "admin:project:view:"
          )
        ) {
          const projectId =
            data.replace(
              "admin:project:view:",
              ""
            );

          await showProjectDetails(
            bot,
            chatId,
            projectId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:project:delete:"
          )
        ) {
          const projectId =
            data.replace(
              "admin:project:delete:",
              ""
            );

          await confirmProjectDelete(
            bot,
            chatId,
            projectId
          );

          return;
        }

        if (
          data.startsWith(
            "admin:project:delete-confirm:"
          )
        ) {
          const projectId =
            data.replace(
              "admin:project:delete-confirm:",
              ""
            );

          await deleteAdminProject(
            bot,
            chatId,
            projectId
          );
        }
      } catch (error) {
        console.error(
          "❌ Admin project error:",
          error
        );

        try {
          await bot.sendMessage(
            chatId,
            "❌ Unable to process project management request."
          );
        } catch {
          // Ignore Telegram errors.
        }
      }
    }
  );

  console.log(
    "🛠️ Admin project manager registered."
  );
}

async function showProjects(
  bot,
  chatId,
  statusFilter = null
) {
  const [
    projects,
    users
  ] = await Promise.all([
    getProjects(),
    getUsers()
  ]);

  let filtered =
    [...projects];

  if (statusFilter) {
    filtered =
      filtered.filter(
        (project) =>
          project.status ===
          statusFilter
      );
  }

  filtered.sort(
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

  const userMap =
    new Map(
      users.map(
        (user) => [
          String(user.id),
          user
        ]
      )
    );

  const title =
    statusFilter
      ? `${statusInfo(statusFilter).emoji} ${statusFilter.toUpperCase()} PROJECTS`
      : "🌐 ALL HOSTING PROJECTS";

  const lines = [
    `<b>${title}</b>`,
    "",
    `📁 Showing: <b>${filtered.length}</b>`,
    `👥 Total Users: <b>${users.length}</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  if (!filtered.length) {
    lines.push(
      "",
      "📭 <b>No projects found.</b>",
      "",
      "Try another filter."
    );
  } else {
    const visibleProjects =
      filtered.slice(0, 20);

    visibleProjects.forEach(
      (project, index) => {
        const status =
          statusInfo(
            project.status
          );

        const owner =
          userMap.get(
            String(
              project.userId
            )
          );

        const ownerName =
          [
            owner?.firstName,
            owner?.lastName
          ]
            .filter(Boolean)
            .join(" ") ||
          owner?.username ||
          "Unknown user";

        lines.push(
          "",
          `${index + 1}. ${status.emoji} <b>${escapeHtml(project.name || "Untitled")}</b>`,
          `   🆔 <code>${escapeHtml(project.id)}</code>`,
          `   👤 ${escapeHtml(ownerName)}`,
          `   📌 ${status.label}`,
          project.url
            ? `   🌐 ${escapeHtml(project.url)}`
            : "   🌐 No URL"
        );
      }
    );

    if (filtered.length > 20) {
      lines.push(
        "",
        `ℹ️ Showing first <b>20</b> of <b>${filtered.length}</b> projects.`
      );
    }
  }

  const keyboard =
    buildProjectButtons(
      filtered.slice(0, 20)
    );

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          ...keyboard,
          ...adminProjectsMenu()
            .inline_keyboard
        ]
      },
      disable_web_page_preview: true
    }
  );
}

function buildProjectButtons(
  projects
) {
  const buttons = [];

  for (
    let index = 0;
    index < projects.length;
    index++
  ) {
    const project =
      projects[index];

    buttons.push([
      {
        text:
          `${statusInfo(project.status).emoji} ${truncate(
            project.name ||
              "Untitled",
            28
          )}`,
        callback_data:
          `admin:project:view:${project.id}`
      }
    ]);
  }

  return buttons;
}

async function showProjectDetails(
  bot,
  chatId,
  projectId
) {
  const project =
    await getProject(
      String(projectId)
    );

  if (!project) {
    await bot.sendMessage(
      chatId,
      "❌ <b>Project not found.</b>",
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔙 Projects",
                callback_data:
                  "admin:projects"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  const status =
    statusInfo(
      project.status
    );

  const createdAt =
    formatDate(
      project.createdAt
    );

  const updatedAt =
    formatDate(
      project.updatedAt
    );

  const deployedAt =
    formatDate(
      project.deployedAt
    );

  const totalSize =
    formatBytes(
      project.totalSize
    );

  const text = [
    "🌐 <b>PROJECT DETAILS</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `📁 <b>Name:</b> ${escapeHtml(project.name)}`,
    `🆔 <b>Project ID:</b> <code>${escapeHtml(project.id)}</code>`,
    `👤 <b>User ID:</b> <code>${escapeHtml(project.userId)}</code>`,
    "",
    `${status.emoji} <b>Status:</b> ${status.label}`,
    "",
    `☁️ <b>Provider:</b> ${escapeHtml(project.provider || "Not deployed")}`,
    `📦 <b>Files:</b> ${Number(project.fileCount || 0)}`,
    `💾 <b>Size:</b> ${totalSize}`,
    "",
    `🌐 <b>Live URL:</b> ${
      project.url
        ? escapeHtml(project.url)
        : "Not available"
    }`,
    "",
    `📅 <b>Created:</b> ${createdAt}`,
    `🔄 <b>Updated:</b> ${updatedAt}`,
    `🚀 <b>Deployed:</b> ${deployedAt}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  const keyboard = [];

  if (project.url) {
    keyboard.push([
      {
        text: "🌐 Open Website",
        url: project.url
      }
    ]);
  }

  keyboard.push([
    {
      text: "🗑️ Delete Project",
      callback_data:
        `admin:project:delete:${project.id}`
    }
  ]);

  keyboard.push([
    {
      text: "🔙 Projects",
      callback_data:
        "admin:projects"
    },
    {
      text: "🛡️ Dashboard",
      callback_data:
        "admin:dashboard"
    }
  ]);

  await bot.sendMessage(
    chatId,
    text.join("\n"),
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

async function confirmProjectDelete(
  bot,
  chatId,
  projectId
) {
  const project =
    await getProject(
      String(projectId)
    );

  if (!project) {
    await bot.sendMessage(
      chatId,
      "❌ Project not found."
    );

    return;
  }

  const text = [
    "⚠️ <b>DELETE PROJECT?</b>",
    "",
    `📁 <b>${escapeHtml(project.name || "Untitled")}</b>`,
    "",
    `🆔 <code>${escapeHtml(project.id)}</code>`,
    "",
    "This action will:",
    "• Remove the project from hosting",
    "• Remove its Cloudflare Pages project when available",
    "• Mark the project as deleted",
    "",
    "⚠️ <b>This action cannot be undone from the bot.</b>",
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
              text: "❌ Yes, Delete",
              callback_data:
                `admin:project:delete-confirm:${project.id}`
            }
          ],
          [
            {
              text: "🔙 Cancel",
              callback_data:
                `admin:project:view:${project.id}`
            }
          ]
        ]
      }
    }
  );
}

async function deleteAdminProject(
  bot,
  chatId,
  projectId
) {
  const project =
    await getProject(
      String(projectId)
    );

  if (!project) {
    await bot.sendMessage(
      chatId,
      "❌ Project not found."
    );

    return;
  }

  const processing =
    await bot.sendMessage(
      chatId,
      "🗑️ <b>Deleting project...</b>\n\nPlease wait.",
      {
        parse_mode: "HTML"
      }
    );

  let cloudflareDeleted =
    false;

  let cloudflareError =
    null;

  try {
    if (
      project.providerProject
    ) {
      try {
        await deleteCloudflareProject(
          project.providerProject
        );

        cloudflareDeleted =
          true;
      } catch (error) {
        cloudflareError =
          error.message;

        console.error(
          "Cloudflare project deletion failed:",
          error
        );
      }
    }

    await updateProject(
      String(project.id),
      {
        status: "deleted",
        url: null,
        deploymentUrl: null,
        deploymentStatus:
          cloudflareDeleted
            ? "deleted"
            : "cloudflare-delete-failed",
        updatedAt:
          new Date().toISOString(),
        deletedAt:
          new Date().toISOString()
      }
    );

    const resultText = [
      "✅ <b>PROJECT DELETED</b>",
      "",
      `📁 <b>Project:</b> ${escapeHtml(project.name)}`,
      `🆔 <code>${escapeHtml(project.id)}</code>`,
      "",
      cloudflareDeleted
        ? "☁️ Cloudflare project: <b>Deleted</b>"
        : project.providerProject
          ? "☁️ Cloudflare project: <b>Could not be deleted</b>"
          : "☁️ Cloudflare project: <b>Not configured</b>",
      "",
      cloudflareError
        ? `⚠️ ${escapeHtml(cloudflareError)}`
        : "",
      "🗑️ Database status: <b>Deleted</b>"
    ]
      .filter(Boolean)
      .join("\n");

    await bot.editMessageText(
      resultText,
      {
        chat_id: chatId,
        message_id:
          processing.message_id,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🌐 Projects",
                callback_data:
                  "admin:projects"
              }
            ],
            [
              {
                text: "🛡️ Dashboard",
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
      "❌ Admin project deletion failed:",
      error
    );

    await bot.editMessageText(
      "❌ <b>Project deletion failed.</b>\n\n" +
        escapeHtml(
          error.message ||
            "Unknown error"
        ),
      {
        chat_id: chatId,
        message_id:
          processing.message_id,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔙 Project",
                callback_data:
                  `admin:project:view:${project.id}`
              }
            ]
          ]
        }
      }
    );
  }
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

function formatDate(
  value
) {
  if (!value) {
    return "Not available";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Not available";
  }

  return date.toLocaleString(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC"
    }
  );
}

function formatBytes(
  bytes
) {
  const value =
    Number(bytes) || 0;

  if (value <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  const index =
    Math.min(
      Math.floor(
        Math.log(value) /
          Math.log(1024)
      ),
      units.length - 1
    );

  return `${(
    value /
    Math.pow(1024, index)
  ).toFixed(
    index === 0 ? 0 : 2
  )} ${units[index]}`;
}

export default {
  registerAdminProjectsHandler
};
