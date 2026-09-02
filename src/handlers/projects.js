import {
  getUserProjects,
  getProject,
  updateProject
} from "../database.js";

import {
  removeProject
} from "../services/projectManager.js";

import {
  requireCallbackAccess
} from "../middleware/userAccess.js";

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
    return "N/A";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatStatus(status) {
  const value = String(status || "unknown").toLowerCase();

  const statuses = {
    pending: "⏳ Pending",
    deploying: "🚀 Deploying",
    active: "🟢 Active",
    failed: "❌ Failed",
    suspended: "⛔ Suspended",
    deleted: "🗑️ Deleted"
  };

  return statuses[value] || `ℹ️ ${escapeHtml(status || "Unknown")}`;
}

function getProjectUrl(project) {
  return (
    project?.url ||
    project?.deploymentUrl ||
    project?.liveUrl ||
    ""
  );
}

function getProjectName(project) {
  return (
    project?.name ||
    project?.projectName ||
    project?.slug ||
    "Untitled Project"
  );
}

function getProjectSlug(project) {
  return project?.slug || project?.id || "unknown";
}

function buildProjectList(projects) {
  if (!projects.length) {
    return [
      "📁 <b>MY PROJECTS</b>",
      "",
      "You don't have any hosted websites yet.",
      "",
      "Use <b>Host Website</b> to upload your first website."
    ].join("\n");
  }

  const lines = [
    "📁 <b>MY PROJECTS</b>",
    "",
    `🌐 <b>Total Projects:</b> ${projects.length}`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ];

  projects.slice(0, 20).forEach((project, index) => {
    const name = escapeHtml(getProjectName(project));
    const status = formatStatus(project.status);

    lines.push(
      `${index + 1}. <b>${name}</b>`,
      `   ${status}`,
      ""
    );
  });

  if (projects.length > 20) {
    lines.push(
      `Showing latest 20 of ${projects.length} projects.`
    );
  }

  return lines.join("\n");
}

function buildProjectKeyboard(projects) {
  const keyboard = [];

  projects.slice(0, 20).forEach((project) => {
    const name = getProjectName(project);

    keyboard.push([
      {
        text: `🌐 ${name}`.slice(0, 64),
        callback_data: `projects:view:${project.id}`
      }
    ]);
  });

  keyboard.push([
    {
      text: "🔄 Refresh",
      callback_data: "projects:list"
    },
    {
      text: "🏠 Menu",
      callback_data: "projects:menu"
    }
  ]);

  return {
    inline_keyboard: keyboard
  };
}

async function showProjects(bot, query) {
  const userId = String(query.from.id);

  const projects = await getUserProjects(userId);

  await bot.answerCallbackQuery(query.id);

  await bot.editMessageText(
    buildProjectList(projects),
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      reply_markup: buildProjectKeyboard(projects)
    }
  );
}

async function showProjectDetails(bot, query, projectId) {
  const userId = String(query.from.id);

  const project = await getProject(projectId);

  if (!project) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Project not found.",
      show_alert: true
    });

    return;
  }

  if (String(project.userId) !== userId) {
    await bot.answerCallbackQuery(query.id, {
      text: "🚫 You don't have access to this project.",
      show_alert: true
    });

    return;
  }

  const name = escapeHtml(getProjectName(project));
  const slug = escapeHtml(getProjectSlug(project));
  const status = formatStatus(project.status);
  const url = getProjectUrl(project);

  const lines = [
    `🌐 <b>${name}</b>`,
    "",
    `🆔 <b>Project ID:</b> <code>${escapeHtml(project.id)}</code>`,
    `🔗 <b>Slug:</b> <code>${slug}</code>`,
    `📊 <b>Status:</b> ${status}`,
    "",
    `📅 <b>Created:</b> ${formatDate(project.createdAt)}`,
    `🔄 <b>Updated:</b> ${formatDate(project.updatedAt)}`
  ];

  if (project.deploymentStatus) {
    lines.push(
      `🚀 <b>Deployment:</b> ${escapeHtml(
        project.deploymentStatus
      )}`
    );
  }

  if (project.provider) {
    lines.push(
      `☁️ <b>Provider:</b> ${escapeHtml(project.provider)}`
    );
  }

  if (url) {
    lines.push(
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      `🌍 <b>Website:</b>\n${escapeHtml(url)}`
    );
  }

  const buttons = [];

  if (url && project.status === "active") {
    buttons.push([
      {
        text: "🌍 Open Website",
        url
      }
    ]);
  }

  buttons.push([
    {
      text: "🗑️ Delete Project",
      callback_data: `projects:delete:${project.id}`
    }
  ]);

  buttons.push([
    {
      text: "🔙 My Projects",
      callback_data: "projects:list"
    },
    {
      text: "🏠 Menu",
      callback_data: "projects:menu"
    }
  ]);

  await bot.answerCallbackQuery(query.id);

  await bot.editMessageText(
    lines.join("\n"),
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );
}

async function confirmDeleteProject(bot, query, projectId) {
  const userId = String(query.from.id);

  const project = await getProject(projectId);

  if (!project) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Project not found.",
      show_alert: true
    });

    return;
  }

  if (String(project.userId) !== userId) {
    await bot.answerCallbackQuery(query.id, {
      text: "🚫 You don't own this project.",
      show_alert: true
    });

    return;
  }

  const name = escapeHtml(getProjectName(project));

  await bot.answerCallbackQuery(query.id);

  await bot.editMessageText(
    [
      "⚠️ <b>DELETE PROJECT</b>",
      "",
      `You are about to delete:`,
      "",
      `🌐 <b>${name}</b>`,
      "",
      "This will remove the project from your project list.",
      "",
      "⚠️ <b>This action cannot be undone from the user panel.</b>",
      "",
      "Are you sure?"
    ].join("\n"),
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🗑️ Yes, Delete",
              callback_data: `projects:delete-confirm:${project.id}`
            }
          ],
          [
            {
              text: "❌ Cancel",
              callback_data: `projects:view:${project.id}`
            }
          ]
        ]
      }
    }
  );
}

async function deleteUserProject(bot, query, projectId) {
  const userId = String(query.from.id);

  const project = await getProject(projectId);

  if (!project) {
    await bot.answerCallbackQuery(query.id, {
      text: "❌ Project not found.",
      show_alert: true
    });

    return;
  }

  if (String(project.userId) !== userId) {
    await bot.answerCallbackQuery(query.id, {
      text: "🚫 You don't own this project.",
      show_alert: true
    });

    return;
  }

  if (project.status === "deleted") {
    await bot.answerCallbackQuery(query.id, {
      text: "ℹ️ This project is already deleted.",
      show_alert: true
    });

    return;
  }

  try {
    await updateProject(project.id, {
      status: "deleted",
      deploymentStatus: "deleted",
      deletedAt: new Date().toISOString()
    });

    await bot.answerCallbackQuery(query.id, {
      text: "✅ Project deleted."
    });

    const projects = await getUserProjects(userId);

    await bot.editMessageText(
      buildProjectList(projects),
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: "HTML",
        reply_markup: buildProjectKeyboard(projects)
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to delete user project:",
      error
    );

    await bot.answerCallbackQuery(query.id, {
      text: "❌ Failed to delete project.",
      show_alert: true
    });
  }
}

async function showProjectMenu(bot, query) {
  await bot.answerCallbackQuery(query.id);

  await bot.editMessageText(
    [
      "🏠 <b>MAIN MENU</b>",
      "",
      "Choose an option below."
    ].join("\n"),
    {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚀 Host Website",
              callback_data: "host:start"
            }
          ],
          [
            {
              text: "📁 My Projects",
              callback_data: "projects:list"
            }
          ],
          [
            {
              text: "👤 My Profile",
              callback_data: "profile"
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
      }
    }
  );
}

export function registerProjectHandlers(bot) {
  if (!bot) {
    throw new Error(
      "registerProjectHandlers requires a Telegram bot instance."
    );
  }

  bot.on("callback_query", async (query) => {
    const data = String(query.data || "");

    if (
      !data.startsWith("projects:")
    ) {
      return;
    }

    try {
      const allowed = await requireCallbackAccess(
        bot,
        query
      );

      if (!allowed) {
        return;
      }

      if (data === "projects:list") {
        await showProjects(bot, query);
        return;
      }

      if (data === "projects:menu") {
        await showProjectMenu(bot, query);
        return;
      }

      if (data === "projects:back") {
        await showProjects(bot, query);
        return;
      }

      if (data.startsWith("projects:view:")) {
        const projectId = data.slice(
          "projects:view:".length
        );

        await showProjectDetails(
          bot,
          query,
          projectId
        );

        return;
      }

      if (data.startsWith("projects:delete-confirm:")) {
        const projectId = data.slice(
          "projects:delete-confirm:".length
        );

        await deleteUserProject(
          bot,
          query,
          projectId
        );

        return;
      }

      if (data.startsWith("projects:delete:")) {
        const projectId = data.slice(
          "projects:delete:".length
        );

        await confirmDeleteProject(
          bot,
          query,
          projectId
        );

        return;
      }

      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error(
        "❌ Project callback error:",
        error
      );

      try {
        await bot.answerCallbackQuery(query.id, {
          text: "❌ Something went wrong.",
          show_alert: true
        });
      } catch {
        // Ignore callback response errors.
      }
    }
  });

  console.log(
    "📁 Project handlers registered."
  );
}

export default {
  registerProjectHandlers
};
