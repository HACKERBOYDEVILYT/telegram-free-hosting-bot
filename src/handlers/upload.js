```js
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import config from "../config.js";

import {
  createOrUpdateUser
} from "../database.js";

import {
  requireUserAccess
} from "../middleware/userAccess.js";

import {
  registerProject,
  setProjectStatus,
  updateDeployment
} from "../services/projectManager.js";

import {
  processProjectZip
} from "../services/zipManager.js";

import {
  createCloudflareProjectName,
  deployToCloudflare
} from "../services/deployer.js";

export function registerUploadHandler(bot) {
  bot.on("document", async (message) => {
    try {
      await handleDocumentUpload(
        bot,
        message
      );
    } catch (error) {
      console.error(
        "❌ Upload handler error:",
        error
      );

      try {
        await bot.sendMessage(
          message.chat.id,
          "❌ Something went wrong while processing your upload.\n\nPlease try again later."
        );
      } catch {
        // Ignore Telegram response errors.
      }
    }
  });

  console.log(
    "📦 Upload handler registered."
  );
}

async function handleDocumentUpload(
  bot,
  message
) {
  const chatId =
    message.chat.id;

  const document =
    message.document;

  if (!document) {
    return;
  }

  const telegramUser =
    message.from;

  if (!telegramUser?.id) {
    return;
  }

  /*
   * ---------------------------------------------------------
   * 0. SECURITY ACCESS CHECK
   * ---------------------------------------------------------
   *
   * Blocked users are stopped before:
   * - downloading the ZIP
   * - creating a project
   * - extracting files
   * - deploying to Cloudflare
   *
   * Admins are allowed through the centralized middleware.
   */
  const hasAccess =
    await requireUserAccess(
      bot,
      message
    );

  if (!hasAccess) {
    return;
  }

  const originalName =
    document.file_name ||
    "website.zip";

  /*
   * ---------------------------------------------------------
   * 1. Validate ZIP
   * ---------------------------------------------------------
   */

  if (
    !originalName
      .toLowerCase()
      .endsWith(".zip")
  ) {
    await bot.sendMessage(
      chatId,
      "❌ Only <b>.zip</b> files are supported.\n\n" +
        "Please upload your website as a ZIP file containing <code>index.html</code>.",
      {
        parse_mode: "HTML"
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------------
   * 2. Validate Telegram file size
   * ---------------------------------------------------------
   */

  const maxBytes =
    Number(
      config.maxFileSizeMB || 50
    ) *
    1024 *
    1024;

  const telegramFileSize =
    Number(
      document.file_size || 0
    );

  if (
    telegramFileSize >
    maxBytes
  ) {
    await bot.sendMessage(
      chatId,
      `❌ File is too large.\n\n` +
        `Maximum allowed ZIP size: <b>${config.maxFileSizeMB} MB</b>\n` +
        `Your file: <b>${formatBytes(
          telegramFileSize
        )}</b>`,
      {
        parse_mode: "HTML"
      }
    );

    return;
  }

  /*
   * ---------------------------------------------------------
   * 3. Register/update user
   * ---------------------------------------------------------
   */

  await createOrUpdateUser({
    id: String(
      telegramUser.id
    ),

    username:
      telegramUser.username ||
      "",

    firstName:
      telegramUser.first_name ||
      "",

    lastName:
      telegramUser.last_name ||
      "",

    languageCode:
      telegramUser.language_code ||
      "",

    isBot:
      Boolean(
        telegramUser.is_bot
      )
  });

  /*
   * ---------------------------------------------------------
   * 4. Tell user upload started
   * ---------------------------------------------------------
   */

  const statusMessage =
    await bot.sendMessage(
      chatId,
      "⏳ <b>Upload received.</b>\n\n" +
        "🔍 Checking your website package...",
      {
        parse_mode: "HTML"
      }
    );

  const tempDir =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "telegram-hosting-"
      )
    );

  const tempZipPath =
    path.join(
      tempDir,
      sanitizeFileName(
        originalName
      )
    );

  let project = null;

  try {
    /*
     * -------------------------------------------------------
     * 5. Download ZIP from Telegram
     * -------------------------------------------------------
     */

    await editStatus(
      bot,
      chatId,
      statusMessage.message_id,
      "⏬ <b>Downloading your ZIP...</b>"
    );

    const fileInfo =
      await bot.getFile(
        document.file_id
      );

    if (
      !fileInfo?.file_path
    ) {
      throw new Error(
        "Telegram did not return a downloadable file path."
      );
    }

    const downloadUrl =
      `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.file_path}`;

    const response =
      await fetch(
        downloadUrl
      );

    if (!response.ok) {
      throw new Error(
        `Telegram file download failed with HTTP ${response.status}.`
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    /*
     * Extra server-side protection.
     * Telegram metadata should not be trusted blindly.
     */
    if (
      buffer.length >
      maxBytes
    ) {
      throw new Error(
        "Uploaded ZIP exceeds the configured maximum size."
      );
    }

    await fs.writeFile(
      tempZipPath,
      buffer
    );

    /*
     * -------------------------------------------------------
     * 6. Create project
     * -------------------------------------------------------
     */

    await editStatus(
      bot,
      chatId,
      statusMessage.message_id,
      "🛠️ <b>Creating your hosting project...</b>"
    );

    const requestedName =
      path
        .basename(
          originalName,
          path.extname(
            originalName
          )
        )
        .trim();

    project =
      await registerProject({
        userId:
          String(
            telegramUser.id
          ),

        name:
          requestedName ||
          "My Website"
      });

    await setProjectStatus(
      project.id,
      "deploying"
    );

    /*
     * -------------------------------------------------------
     * 7. Extract and validate ZIP
     * -------------------------------------------------------
     */

    await editStatus(
      bot,
      chatId,
      statusMessage.message_id,
      "📦 <b>Extracting and validating website...</b>\n\n" +
        "Checking files, security and index.html..."
    );

    const processed =
      await processProjectZip(
        tempZipPath,
        project.id
      );

    if (
      !processed?.sitePath
    ) {
      throw new Error(
        "Website extraction completed without a valid site path."
      );
    }

    /*
     * -------------------------------------------------------
     * 8. Generate Cloudflare Pages project name
     * -------------------------------------------------------
     */

    const cloudflareProjectName =
      createCloudflareProjectName(
        project.name,
        project.id
      );

    /*
     * -------------------------------------------------------
     * 9. Deploy to Cloudflare Pages
     * -------------------------------------------------------
     */

    await editStatus(
      bot,
      chatId,
      statusMessage.message_id,
      "☁️ <b>Deploying to Cloudflare Pages...</b>\n\n" +
        "🚀 Uploading your website..."
    );

    const deployment =
      await deployToCloudflare({
        sitePath:
          processed.sitePath,

        projectName:
          cloudflareProjectName,

        branch:
          "main"
      });

    if (
      !deployment?.url
    ) {
      throw new Error(
        "Cloudflare deployment completed without returning a website URL."
      );
    }

    /*
     * -------------------------------------------------------
     * 10. Save deployment information
     * -------------------------------------------------------
     */

    await updateDeployment(
      project.id,
      {
        provider:
          "cloudflare-pages",

        providerProject:
          cloudflareProjectName,

        url:
          deployment.url,

        deploymentUrl:
          deployment.url,

        status:
          "active",

        deployedAt:
          new Date().toISOString()
      }
    );

    await setProjectStatus(
      project.id,
      "active"
    );

    /*
     * -------------------------------------------------------
     * 11. Success
     * -------------------------------------------------------
     */

    await editStatus(
      bot,
      chatId,
      statusMessage.message_id,
      "✅ <b>Website deployed successfully!</b>"
    );

    await bot.sendMessage(
      chatId,
      [
        "🎉 <b>Your website is LIVE!</b>",
        "",
        `📁 <b>Project:</b> ${escapeHtml(
          project.name
        )}`,
        `🆔 <b>ID:</b> <code>${escapeHtml(
          project.id
        )}</code>`,
        "",
        "🌐 <b>Website URL:</b>",
        deployment.url,
        "",
        "☁️ <b>Provider:</b> Cloudflare Pages",
        "",
        "You can now open your website using the link above."
      ].join("\n"),
      {
        parse_mode: "HTML",
        disable_web_page_preview: false
      }
    );
  } catch (error) {
    console.error(
      `❌ Deployment failed for chat ${chatId}:`,
      error
    );

    /*
     * If project creation already happened,
     * mark it as failed.
     */
    if (project?.id) {
      try {
        await setProjectStatus(
          project.id,
          "failed"
        );
      } catch (statusError) {
        console.error(
          "Failed to update project status:",
          statusError
        );
      }
    }

    const friendlyMessage =
      getFriendlyErrorMessage(
        error
      );

    await editStatus(
      bot,
      chatId,
      statusMessage.message_id,
      "❌ <b>Deployment failed.</b>\n\n" +
        escapeHtml(
          friendlyMessage
        )
    );
  } finally {
    /*
     * -------------------------------------------------------
     * 12. Cleanup temporary files
     * -------------------------------------------------------
     */

    try {
      await fs.rm(
        tempDir,
        {
          recursive: true,
          force: true
        }
      );
    } catch (cleanupError) {
      console.error(
        "Temporary directory cleanup failed:",
        cleanupError
      );
    }
  }
}

/*
 * -----------------------------------------------------------
 * Telegram status message helper
 * -----------------------------------------------------------
 */

async function editStatus(
  bot,
  chatId,
  messageId,
  text
) {
  try {
    await bot.editMessageText(
      text,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML"
      }
    );
  } catch (error) {
    /*
     * Telegram throws when the new
     * message text is identical.
     */
    if (
      !String(
        error.message || ""
      )
        .toLowerCase()
        .includes(
          "message is not modified"
        )
    ) {
      console.error(
        "Status message update failed:",
        error.message
      );
    }
  }
}

/*
 * -----------------------------------------------------------
 * Safe temporary filename
 * -----------------------------------------------------------
 */

function sanitizeFileName(
  fileName
) {
  return String(
    fileName ||
      "website.zip"
  )
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )
    .slice(0, 180);
}

/*
 * -----------------------------------------------------------
 * Format bytes
 * -----------------------------------------------------------
 */

function formatBytes(
  bytes
) {
  if (
    !Number.isFinite(
      bytes
    ) ||
    bytes <= 0
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
        Math.log(bytes) /
          Math.log(1024)
      ),
      units.length - 1
    );

  const value =
    bytes /
    Math.pow(
      1024,
      index
    );

  return `${value.toFixed(
    index === 0 ? 0 : 2
  )} ${units[index]}`;
}

/*
 * -----------------------------------------------------------
 * Friendly deployment errors
 * -----------------------------------------------------------
 */

function getFriendlyErrorMessage(
  error
) {
  const message =
    String(
      error?.message ||
        "Unknown error"
    );

  const lower =
    message.toLowerCase();

  if (
    lower.includes(
      "index.html"
    )
  ) {
    return "Your ZIP must contain an index.html file.";
  }

  if (
    lower.includes(
      "path traversal"
    ) ||
    lower.includes(
      "unsafe"
    )
  ) {
    return "The ZIP contains unsafe file paths and was blocked for security.";
  }

  if (
    lower.includes(
      "too large"
    ) ||
    lower.includes(
      "25 mib"
    ) ||
    lower.includes(
      "25 mb"
    )
  ) {
    return "One of the website files is too large for Cloudflare Pages.";
  }

  if (
    lower.includes(
      "cloudflare_api_token"
    ) ||
    lower.includes(
      "cloudflare_account_id"
    )
  ) {
    return "Cloudflare configuration is incomplete. Please check the server environment variables.";
  }

  if (
    lower.includes(
      "authentication"
    ) ||
    lower.includes(
      "unauthorized"
    ) ||
    lower.includes(
      "api token"
    )
  ) {
    return "Cloudflare authentication failed. Check your API token and its Pages permissions.";
  }

  if (
    lower.includes(
      "project name"
    ) &&
    lower.includes(
      "cloudflare"
    )
  ) {
    return "The Cloudflare project name could not be created.";
  }

  if (
    lower.includes(
      "telegram file download"
    )
  ) {
    return "Telegram could not download the uploaded file. Please try uploading again.";
  }

  if (
    lower.includes(
      "project limit"
    )
  ) {
    return "You have reached the maximum number of hosted projects.";
  }

  if (
    lower.includes(
      "exceeds the configured maximum size"
    )
  ) {
    return "The uploaded ZIP is larger than the configured maximum size.";
  }

  return "The website could not be deployed. Please check your ZIP and try again.";
}

/*
 * -----------------------------------------------------------
 * Telegram HTML escaping
 * -----------------------------------------------------------
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
```
