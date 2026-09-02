```js
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

import {
  removeProjectStorage
} from "../services/fileManager.js";

/*
 * ============================================================
 * ADMIN PROJECT MANAGEMENT
 * ============================================================
 */

export function registerAdminProjectsHandler(
  bot
) {
  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      /*
       * Only handle admin project callbacks.
       */
      if (
        !data.startsWith(
          "admin:projects"
        ) &&
        !data.startsWith(
          "admin:project:"
        )
      ) {
        return;
      }

      const adminId =
        String(
          query.from?.id || ""
        );

      /*
       * Security check
       */
      if (
        !isAdmin(adminId)
      ) {
        await safeAnswer(
          bot,
          query.id,
          "⛔ Access denied.",
          true
        );

        return;
      }

      const chatId =
        query.message?.chat?.id;

      if (!chatId) {
        return;
      }

      try {
        await safeAnswer(
          bot,
          query.id
        );

        /*
         * ----------------------------------------------------
         * ALL PROJECTS
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:projects"
        ) {
          await sendProjectsList(
            bot,
            chatId,
            "all"
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * ACTIVE PROJECTS
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:projects:active"
        ) {
          await sendProjectsList(
            bot,
            chatId,
            "active"
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * FAILED PROJECTS
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:projects:failed"
        ) {
          await sendProjectsList(
            bot,
            chatId,
            "failed"
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * DEPLOYING PROJECTS
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:projects:deploying"
        ) {
          await sendProjectsList(
            bot,
            chatId,
            "deploying"
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * DELETED PROJECTS
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:projects:deleted"
        ) {
          await sendProjectsList(
            bot,
            chatId,
            "deleted"
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * USER PROJECTS
         * ----------------------------------------------------
         *
         * admin:user:projects:<userId>
         */

        if (
          data.startsWith(
            "admin:user:projects:"
          )
        ) {
          const userId =
            data.slice(
              "admin:user:projects:"
                .length
            );

          await sendUserProjects(
            bot,
            chatId,
            userId
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * PROJECT VIEW
         * ----------------------------------------------------
         */

        if (
          data.startsWith(
            "admin:project:view:"
          )
        ) {
          const projectId =
            data.slice(
              "admin:project:view:"
                .length
            );

          await sendProjectDetails(
            bot,
            chatId,
            projectId
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * PROJECT DELETE
         * ----------------------------------------------------
         */

        if (
          data.startsWith(
            "admin:project:delete-confirm:"
          )
        ) {
          const projectId =
            data.slice(
              "admin:project:delete-confirm:"
                .length
            );

          await deleteProject(
            bot,
            chatId,
            projectId
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * DELETE CONFIRMATION SCREEN
         * ----------------------------------------------------
         */

        if (
          data.startsWith(
            "admin:project:delete:"
          )
        ) {
          const projectId =
            data.slice(
              "admin:project:delete:"
                .length
            );

          await sendDeleteConfirmation(
            bot,
            chatId,
            projectId
          );

          return;
        }
      } catch (error) {
        console.error(
          "❌ Admin project callback error:",
          error
        );

        await bot.sendMessage(
          chatId,
          "❌ Something went wrong while processing the project request."
        );
      }
    }
  );

  console.log(
    "🗂️ Admin project handler registered."
  );
}

/*
 * ============================================================
 * PROJECT LIST
 * ============================================================
 */

async function sendProjectsList(
  bot,
  chatId,
  filter = "all"
) {
  const projects =
    await getProjects();

  const users =
    await getUsers();

  const userMap =
    new Map(
      users.map(
        (user) => [
          String(user.id),
          user
        ]
      )
    );

  let filtered =
    projects;

  if (
    filter !== "all"
  ) {
    filtered =
      projects.filter(
        (project) =>
          project.status ===
          filter
      );
  }

  /*
   * Newest projects first.
   */
  filtered =
    [...filtered].sort(
      (a, b) =>
        new Date(
          b.createdAt || 0
        ).getTime() -
        new Date(
          a.createdAt || 0
        ).getTime()
    );

  const total =
    filtered.length;

  /*
   * Telegram-friendly limit.
   */
  const visible =
    filtered.slice(
      0,
      20
    );

  const filterTitle =
    getFilterTitle(
      filter
    );

  const lines = [
    `🗂️ <b>${filterTitle}</b>`,
    "",
    `📊 <b>Total:</b> ${total}`
  ];

  if (
    total > 20
  ) {
    lines.push(
      "ℹ️ Showing latest 20 projects."
    );
  }

  lines.push(
    ""
  );

  if (
    visible.length === 0
  ) {
    lines.push(
      "📭 No projects found."
    );
  }

  const buttons = [];

  for (
    const project of visible
  ) {
    const owner =
      userMap.get(
        String(
          project.userId
        )
      );

    const ownerName =
      getUserDisplayName(
        owner,
        project.userId
      );

    const status =
      getStatusEmoji(
        project.status
      );

    const name =
      truncate(
        project.name ||
          "Untitled Project",
        32
      );

    lines.push(
      `${status} <b>${escapeHtml(
        name
      )}</b>`,
      `   👤 ${escapeHtml(
        ownerName
      )}`,
      `   🆔 <code>${escapeHtml(
        project.id
      )}</code>`,
      ""
    );

    buttons.push([
      {
        text:
          `${status} ${name}`,
        callback_data:
          `admin:project:view:${project.id}`
      }
    ]);
  }

  buttons.push([
    {
      text: "🟢 Active",
      callback_data:
        "admin:projects:active"
    },
    {
      text: "⏳ Deploying",
      callback_data:
        "admin:projects:deploying"
    }
  ]);

  buttons.push([
    {
      text: "❌ Failed",
      callback_data:
        "admin:projects:failed"
    },
    {
      text: "🗑️ Deleted",
      callback_data:
        "admin:projects:deleted"
    }
  ]);

  buttons.push([
    {
      text: "📋 All Projects",
      callback_data:
        "admin:projects"
    }
  ]);

  buttons.push([
    {
      text: "⬅️ Admin Dashboard",
      callback_data:
        "admin:dashboard"
    }
  ]);

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          buttons
      }
    }
  );
}

/*
 * ============================================================
 * USER PROJECTS
 * ============================================================
 */

async function sendUserProjects(
  bot,
  chatId,
  userId
) {
  const [
    projects,
    users
  ] = await Promise.all([
    getProjects(),
    getUsers()
  ]);

  const user =
    users.find(
      (item) =>
        String(item.id) ===
        String(userId)
    );

  if (!user) {
    await bot.sendMessage(
      chatId,
      "❌ User not found.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Users",
                callback_data:
                  "admin:users"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  const userProjects =
    projects
      .filter(
        (project) =>
          String(
            project.userId
          ) ===
          String(userId)
      )
      .sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ).getTime() -
          new Date(
            a.createdAt || 0
          ).getTime()
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

  const lines = [
    "📁 <b>User Projects</b>",
    "",
    `👤 <b>User:</b> ${escapeHtml(
      getUserDisplayName(
        user,
        userId
      )
    )}`,
    `🆔 <code>${escapeHtml(
      userId
    )}</code>`,
    "",
    `📊 <b>Total:</b> ${userProjects.length}`,
    `🟢 <b>Active:</b> ${active}`,
    `⏳ <b>Deploying:</b> ${deploying}`,
    `❌ <b>Failed:</b> ${failed}`,
    `🗑️ <b>Deleted:</b> ${deleted}`,
    ""
  ];

  const buttons = [];

  const visible =
    userProjects.slice(
      0,
      20
    );

  if (
    visible.length === 0
  ) {
    lines.push(
      "📭 This user has no projects."
    );
  }

  for (
    const project of visible
  ) {
    const status =
      getStatusEmoji(
        project.status
      );

    const name =
      truncate(
        project.name ||
          "Untitled Project",
        32
      );

    lines.push(
      `${status} <b>${escapeHtml(
        name
      )}</b>`,
      `   🆔 <code>${escapeHtml(
        project.id
      )}</code>`,
      `   📌 ${escapeHtml(
        project.status ||
          "unknown"
      )}`,
      ""
    );

    buttons.push([
      {
        text:
          `${status} ${name}`,
        callback_data:
          `admin:project:view:${project.id}`
      }
    ]);
  }

  buttons.push([
    {
      text: "👤 User Details",
      callback_data:
        `admin:user:view:${userId}`
    }
  ]);

  buttons.push([
    {
      text: "⬅️ Users",
      callback_data:
        "admin:users"
    }
  ]);

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          buttons
      }
    }
  );
}

/*
 * ============================================================
 * PROJECT DETAILS
 * ============================================================
 */

async function sendProjectDetails(
  bot,
  chatId,
  projectId
) {
  const [
    project,
    users
  ] = await Promise.all([
    getProject(
      projectId
    ),
    getUsers()
  ]);

  if (!project) {
    await bot.sendMessage(
      chatId,
      "❌ Project not found.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Projects",
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

  const owner =
    users.find(
      (user) =>
        String(
          user.id
        ) ===
        String(
          project.userId
        )
    );

  const status =
    project.status ||
    "unknown";

  const statusEmoji =
    getStatusEmoji(
      status
    );

  const fileCount =
    project.fileCount ??
    project.files ??
    0;

  const size =
    formatBytes(
      project.size ||
        project.totalSize ||
        0
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

  const provider =
    project.provider ||
    "Not deployed";

  const providerProject =
    project.providerProject ||
    "Not assigned";

  const liveUrl =
    project.url ||
    project.deploymentUrl ||
    "";

  const lines = [
    "📦 <b>Project Details</b>",
    "",
    `📛 <b>Name:</b> ${escapeHtml(
      project.name ||
        "Untitled"
    )}`,
    `🆔 <b>Project ID:</b> <code>${escapeHtml(
      project.id
    )}</code>`,
    "",
    `${statusEmoji} <b>Status:</b> ${escapeHtml(
      status
    )}`,
    `☁️ <b>Provider:</b> ${escapeHtml(
      provider
    )}`,
    `🔗 <b>Provider Project:</b> <code>${escapeHtml(
      providerProject
    )}</code>`,
    "",
    `👤 <b>Owner:</b> ${escapeHtml(
      getUserDisplayName(
        owner,
        project.userId
      )
    )}`,
    `🆔 <b>User ID:</b> <code>${escapeHtml(
      project.userId
    )}</code>`,
    "",
    `📄 <b>Files:</b> ${fileCount}`,
    `💾 <b>Size:</b> ${size}`,
    "",
    `🌐 <b>Live URL:</b> ${
      liveUrl
        ? escapeHtml(
            liveUrl
          )
        : "Not available"
    }`,
    "",
    `📅 <b>Created:</b> ${createdAt}`,
    `🔄 <b>Updated:</b> ${updatedAt}`,
    `🚀 <b>Deployed:</b> ${deployedAt}`
  ];

  const buttons = [];

  if (
    liveUrl &&
    status === "active"
  ) {
    buttons.push([
      {
        text: "🌐 Open Website",
        url: liveUrl
      }
    ]);
  }

  buttons.push([
    {
      text: "🗑️ Delete Project",
      callback_data:
        `admin:project:delete:${project.id}`
    }
  ]);

  buttons.push([
    {
      text: "👤 View Owner",
      callback_data:
        `admin:user:view:${project.userId}`
    }
  ]);

  buttons.push([
    {
      text: "📁 Owner Projects",
      callback_data:
        `admin:user:projects:${project.userId}`
    }
  ]);

  buttons.push([
    {
      text: "⬅️ Projects",
      callback_data:
        "admin:projects"
    }
  ]);

  await bot.sendMessage(
    chatId,
    lines.join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard:
          buttons
      }
    }
  );
}

/*
 * ============================================================
 * DELETE CONFIRMATION
 * ============================================================
 */

async function sendDeleteConfirmation(
  bot,
  chatId,
  projectId
) {
  const project =
    await getProject(
      projectId
    );

  if (!project) {
    await bot.sendMessage(
      chatId,
      "❌ Project not found."
    );

    return;
  }

  await bot.sendMessage(
    chatId,
    [
      "⚠️ <b>Delete Project?</b>",
      "",
      `📛 <b>Name:</b> ${escapeHtml(
        project.name ||
          "Untitled"
      )}`,
      `🆔 <code>${escapeHtml(
        project.id
      )}</code>`,
      "",
      "This will:",
      "• Remove the Cloudflare Pages deployment when possible",
      "• Mark the project as deleted",
      "• Remove local project storage",
      "• Remove its live URL from the database",
      "",
      "⚠️ <b>This action cannot be undone from the admin panel.</b>"
    ].join("\n"),
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
              text: "↩️ Cancel",
              callback_data:
                `admin:project:view:${project.id}`
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * DELETE PROJECT
 * ============================================================
 */

async function deleteProject(
  bot,
  chatId,
  projectId
) {
  const project =
    await getProject(
      projectId
    );

  if (!project) {
    await bot.sendMessage(
      chatId,
      "❌ Project not found."
    );

    return;
  }

  /*
   * Prevent duplicate deletion.
   */
  if (
    project.status ===
    "deleted"
  ) {
    await bot.sendMessage(
      chatId,
      "ℹ️ This project is already deleted.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⬅️ Projects",
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

  let cloudflareResult =
    "not-required";

  /*
   * ----------------------------------------------------------
   * Delete Cloudflare Pages project
   * ----------------------------------------------------------
   */

  if (
    project.providerProject
  ) {
    try {
      const result =
        await deleteCloudflareProject(
          project.providerProject
        );

      cloudflareResult =
        result === false
          ? "failed"
          : "deleted";
    } catch (error) {
      console.error(
        "❌ Cloudflare project deletion failed:",
        error
      );

      cloudflareResult =
        "failed";
    }
  }

  /*
   * ----------------------------------------------------------
   * Remove local storage
   * ----------------------------------------------------------
   */

  let storageResult =
    "not-found";

  try {
    const removed =
      await removeProjectStorage(
        project.id
      );

    storageResult =
      removed
        ? "deleted"
        : "not-found";
  } catch (error) {
    console.error(
      "❌ Local project storage cleanup failed:",
      error
    );

    storageResult =
      "failed";
  }

  /*
   * ----------------------------------------------------------
   * Update database
   * ----------------------------------------------------------
   */

  const updated =
    await updateProject(
      project.id,
      {
        status:
          "deleted",

        url: "",

        deploymentUrl: "",

        deploymentStatus:
          cloudflareResult ===
          "failed"
            ? "cloudflare-delete-failed"
            : "deleted",

        deletedAt:
          new Date().toISOString(),

        localStorageStatus:
          storageResult
      }
    );

  if (!updated) {
    await bot.sendMessage(
      chatId,
      "❌ Project could not be updated in the database."
    );

    return;
  }

  /*
   * ----------------------------------------------------------
   * Result
   * ----------------------------------------------------------
   */

  const cloudflareText =
    cloudflareResult ===
    "deleted"
      ? "✅ Cloudflare deployment removed"
      : cloudflareResult ===
        "failed"
      ? "⚠️ Cloudflare removal failed"
      : "ℹ️ No Cloudflare deployment";

  const storageText =
    storageResult ===
    "deleted"
      ? "✅ Local files removed"
      : storageResult ===
        "failed"
      ? "⚠️ Local file cleanup failed"
      : "ℹ️ No local files found";

  await bot.sendMessage(
    chatId,
    [
      "🗑️ <b>Project Deleted</b>",
      "",
      `📛 <b>Project:</b> ${escapeHtml(
        project.name ||
          "Untitled"
      )}`,
      `🆔 <code>${escapeHtml(
        project.id
      )}</code>`,
      "",
      cloudflareText,
      storageText,
      "✅ Database status updated",
      "",
      "The project has been removed from active hosting."
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🗂️ All Projects",
              callback_data:
                "admin:projects"
            }
          ],
          [
            {
              text: "🟢 Active Projects",
              callback_data:
                "admin:projects:active"
            }
          ],
          [
            {
              text: "⬅️ Admin Dashboard",
              callback_data:
                "admin:dashboard"
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function getFilterTitle(
  filter
) {
  switch (filter) {
    case "active":
      return "Active Projects";

    case "failed":
      return "Failed Projects";

    case "deploying":
      return "Deploying Projects";

    case "deleted":
      return "Deleted Projects";

    default:
      return "All Projects";
  }
}

function getStatusEmoji(
  status
) {
  switch (
    String(
      status || ""
    ).toLowerCase()
  ) {
    case "active":
      return "🟢";

    case "deploying":
      return "⏳";

    case "pending":
      return "🟡";

    case "failed":
      return "❌";

    case "suspended":
      return "⛔";

    case "deleted":
      return "🗑️";

    default:
      return "⚪";
  }
}

function getUserDisplayName(
  user,
  fallbackId
) {
  if (!user) {
    return `User ${fallbackId}`;
  }

  const fullName =
    [
      user.firstName,
      user.lastName
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (
    fullName
  ) {
    return fullName;
  }

  if (
    user.username
  ) {
    return `@${user.username}`;
  }

  return `User ${user.id}`;
}

function truncate(
  value,
  maxLength
) {
  const text =
    String(
      value || ""
    );

  if (
    text.length <=
    maxLength
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
    return "N/A";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "N/A";
  }

  return date.toLocaleString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function formatBytes(
  bytes
) {
  const value =
    Number(bytes);

  if (
    !Number.isFinite(
      value
    ) ||
    value <= 0
  ) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB"
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
    Math.pow(
      1024,
      index
    )
  ).toFixed(
    index === 0 ? 0 : 2
  )} ${units[index]}`;
}

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

async function safeAnswer(
  bot,
  queryId,
  text,
  showAlert = false
) {
  try {
    await bot.answerCallbackQuery(
      queryId,
      {
        text,
        show_alert:
          showAlert
      }
    );
  } catch {
    // Callback may already have been answered.
  }
}
```
