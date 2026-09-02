import {
  getUsers,
  isUserBlocked
} from "../database.js";

import {
  isAdmin
} from "./admin.js";

/*
 * ============================================================
 * BROADCAST SYSTEM
 * ============================================================
 */

const pendingBroadcasts =
  new Map();

const BROADCAST_DELAY_MS = 120;

/*
 * ============================================================
 * REGISTER
 * ============================================================
 */

export function registerBroadcastHandler(
  bot
) {
  /*
   * ----------------------------------------------------------
   * /broadcast
   * ----------------------------------------------------------
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

        if (
          message.text !==
          "/broadcast"
        ) {
          return;
        }

        const adminId =
          String(
            message.from.id
          );

        if (
          !isAdmin(adminId)
        ) {
          await bot.sendMessage(
            message.chat.id,
            "⛔ <b>Access Denied</b>",
            {
              parse_mode: "HTML"
            }
          );

          return;
        }

        await openBroadcastComposer(
          bot,
          message.chat.id,
          adminId
        );
      } catch (error) {
        console.error(
          "❌ /broadcast error:",
          error
        );
      }
    }
  );

  /*
   * ----------------------------------------------------------
   * Broadcast content capture
   * ----------------------------------------------------------
   *
   * Any message sent while an admin is in broadcast mode
   * becomes the broadcast message.
   */

  bot.on(
    "message",
    async (message) => {
      try {
        const adminId =
          String(
            message.from?.id || ""
          );

        if (
          !adminId ||
          !isAdmin(adminId)
        ) {
          return;
        }

        /*
         * Commands are handled separately.
         */
        if (
          message.text?.startsWith(
            "/"
          )
        ) {
          return;
        }

        const pending =
          pendingBroadcasts.get(
            adminId
          );

        if (!pending) {
          return;
        }

        /*
         * Ignore empty/unsupported Telegram updates.
         */
        if (
          !hasBroadcastContent(
            message
          )
        ) {
          return;
        }

        /*
         * Store only Telegram message reference.
         * copyMessage() will copy it directly from Telegram.
         */
        pendingBroadcasts.set(
          adminId,
          {
            ...pending,
            sourceChatId:
              message.chat.id,
            sourceMessageId:
              message.message_id,
            sourceType:
              getMessageType(
                message
              )
          }
        );

        await sendBroadcastPreview(
          bot,
          message.chat.id,
          adminId,
          message
        );
      } catch (error) {
        console.error(
          "❌ Broadcast capture error:",
          error
        );
      }
    }
  );

  /*
   * ----------------------------------------------------------
   * /cancel
   * ----------------------------------------------------------
   */

  bot.on(
    "message",
    async (message) => {
      try {
        if (
          message.text !==
          "/cancel"
        ) {
          return;
        }

        const adminId =
          String(
            message.from?.id || ""
          );

        if (
          !isAdmin(adminId)
        ) {
          return;
        }

        if (
          pendingBroadcasts.has(
            adminId
          )
        ) {
          pendingBroadcasts.delete(
            adminId
          );

          await bot.sendMessage(
            message.chat.id,
            "❌ <b>Broadcast cancelled.</b>",
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
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
      } catch (error) {
        console.error(
          "❌ /cancel error:",
          error
        );
      }
    }
  );

  /*
   * ----------------------------------------------------------
   * Broadcast callbacks
   * ----------------------------------------------------------
   */

  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      if (
        data !==
          "admin:broadcast" &&
        data !==
          "admin:broadcast:confirm" &&
        data !==
          "admin:broadcast:cancel"
      ) {
        return;
      }

      const adminId =
        String(
          query.from?.id || ""
        );

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
         * OPEN BROADCAST
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:broadcast"
        ) {
          await openBroadcastComposer(
            bot,
            chatId,
            adminId
          );

          return;
        }

        /*
         * ----------------------------------------------------
         * CANCEL BROADCAST
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:broadcast:cancel"
        ) {
          pendingBroadcasts.delete(
            adminId
          );

          await bot.sendMessage(
            chatId,
            "❌ <b>Broadcast cancelled.</b>",
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
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

          return;
        }

        /*
         * ----------------------------------------------------
         * CONFIRM BROADCAST
         * ----------------------------------------------------
         */

        if (
          data ===
          "admin:broadcast:confirm"
        ) {
          await executeBroadcast(
            bot,
            chatId,
            adminId
          );

          return;
        }
      } catch (error) {
        console.error(
          "❌ Broadcast callback error:",
          error
        );

        await bot.sendMessage(
          chatId,
          "❌ Something went wrong while processing the broadcast."
        );
      }
    }
  );

  console.log(
    "📢 Broadcast handler registered."
  );
}

/*
 * ============================================================
 * OPEN COMPOSER
 * ============================================================
 */

async function openBroadcastComposer(
  bot,
  chatId,
  adminId
) {
  pendingBroadcasts.set(
    adminId,
    {
      sourceChatId: null,
      sourceMessageId: null,
      sourceType: null,
      createdAt:
        Date.now()
    }
  );

  await bot.sendMessage(
    chatId,
    [
      "📢 <b>Broadcast Message</b>",
      "",
      "Send the message you want to broadcast to all users.",
      "",
      "✅ Supported:",
      "• Text",
      "• Photo",
      "• Video",
      "• Document",
      "• Audio",
      "• Animation",
      "• Sticker",
      "• Voice",
      "",
      "🔒 Blocked users will be skipped.",
      "",
      "❌ Send <code>/cancel</code> to cancel."
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "❌ Cancel",
              callback_data:
                "admin:broadcast:cancel"
            }
          ]
        ]
      }
    }
  );
}

/*
 * ============================================================
 * PREVIEW
 * ============================================================
 */

async function sendBroadcastPreview(
  bot,
  chatId,
  adminId,
  message
) {
  const users =
    await getUsers();

  const activeUsers =
    users.filter(
      (user) =>
        !user.isBlocked &&
        user.status !==
          "blocked" &&
        !user.isBot
    );

  /*
   * Remove stale/invalid users from the count.
   */
  const recipientCount =
    activeUsers.length;

  await bot.sendMessage(
    chatId,
    [
      "📢 <b>Broadcast Preview</b>",
      "",
      `👥 <b>Recipients:</b> ${recipientCount}`,
      `📦 <b>Type:</b> ${getMessageType(
        message
      )}`,
      "",
      "The message above will be copied to all eligible users.",
      "",
      "⚠️ Blocked users will not receive it.",
      "",
      "Do you want to send this broadcast?"
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🚀 Send Broadcast",
              callback_data:
                "admin:broadcast:confirm"
            }
          ],
          [
            {
              text: "❌ Cancel",
              callback_data:
                "admin:broadcast:cancel"
            }
          ]
        ]
      }
    }
  );

  /*
   * Send a copy of the message back to admin
   * when possible, so the preview is visually clear.
   *
   * Text messages already appear naturally above.
   */
}

/*
 * ============================================================
 * EXECUTE BROADCAST
 * ============================================================
 */

async function executeBroadcast(
  bot,
  adminChatId,
  adminId
) {
  const pending =
    pendingBroadcasts.get(
      adminId
    );

  if (
    !pending?.sourceChatId ||
    !pending?.sourceMessageId
  ) {
    await bot.sendMessage(
      adminChatId,
      "❌ No broadcast message found.\n\nPlease start `/broadcast` again.",
      {
        parse_mode: "HTML"
      }
    );

    pendingBroadcasts.delete(
      adminId
    );

    return;
  }

  /*
   * Remove pending state immediately.
   * This prevents accidental duplicate sends
   * if the callback is pressed more than once.
   */
  pendingBroadcasts.delete(
    adminId
  );

  const users =
    await getUsers();

  /*
   * ----------------------------------------------------------
   * Eligible recipients
   * ----------------------------------------------------------
   */

  const recipients =
    users.filter(
      (user) =>
        String(user.id) !==
          String(
            adminId
          ) &&
        !user.isBot &&
        user.isBlocked !== true &&
        user.status !==
          "blocked"
    );

  const total =
    recipients.length;

  await bot.sendMessage(
    adminChatId,
    [
      "🚀 <b>Broadcast Started</b>",
      "",
      `👥 Recipients: <b>${total}</b>`,
      "",
      "⏳ Sending messages..."
    ].join("\n"),
    {
      parse_mode: "HTML"
    }
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  /*
   * ----------------------------------------------------------
   * Send one by one
   * ----------------------------------------------------------
   */

  for (
    const user of recipients
  ) {
    try {
      /*
       * Re-check block status immediately before sending.
       * This handles a user being blocked while the
       * broadcast is already running.
       */
      const blocked =
        await isUserBlocked(
          user.id
        );

      if (blocked) {
        skipped++;

        continue;
      }

      await bot.copyMessage(
        user.id,
        pending.sourceChatId,
        pending.sourceMessageId
      );

      sent++;

      /*
       * Small delay to reduce Telegram API pressure.
       */
      await sleep(
        BROADCAST_DELAY_MS
      );
    } catch (error) {
      failed++;

      console.error(
        `❌ Broadcast failed for user ${user.id}:`,
        error.message
      );

      /*
       * Continue with remaining users.
       */
      await sleep(
        BROADCAST_DELAY_MS
      );
    }
  }

  const successRate =
    total > 0
      ? (
          (sent / total) *
          100
        ).toFixed(1)
      : "0.0";

  await bot.sendMessage(
    adminChatId,
    [
      "✅ <b>Broadcast Completed</b>",
      "",
      `👥 <b>Total:</b> ${total}`,
      `✅ <b>Sent:</b> ${sent}`,
      `❌ <b>Failed:</b> ${failed}`,
      `🚫 <b>Skipped:</b> ${skipped}`,
      "",
      `📈 <b>Success Rate:</b> ${successRate}%`
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📢 New Broadcast",
              callback_data:
                "admin:broadcast"
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
 * MESSAGE TYPE
 * ============================================================
 */

function getMessageType(
  message
) {
  if (
    message.text
  ) {
    return "Text";
  }

  if (
    message.photo
  ) {
    return "Photo";
  }

  if (
    message.video
  ) {
    return "Video";
  }

  if (
    message.document
  ) {
    return "Document";
  }

  if (
    message.audio
  ) {
    return "Audio";
  }

  if (
    message.animation
  ) {
    return "Animation";
  }

  if (
    message.voice
  ) {
    return "Voice";
  }

  if (
    message.video_note
  ) {
    return "Video Note";
  }

  if (
    message.sticker
  ) {
    return "Sticker";
  }

  if (
    message.contact
  ) {
    return "Contact";
  }

  if (
    message.location
  ) {
    return "Location";
  }

  if (
    message.poll
  ) {
    return "Poll";
  }

  return "Message";
}

/*
 * ============================================================
 * CONTENT CHECK
 * ============================================================
 */

function hasBroadcastContent(
  message
) {
  return Boolean(
    message.text ||
      message.photo ||
      message.video ||
      message.document ||
      message.audio ||
      message.animation ||
      message.voice ||
      message.video_note ||
      message.sticker ||
      message.contact ||
      message.location ||
      message.poll
  );
}

/*
 * ============================================================
 * SLEEP
 * ============================================================
 */

function sleep(
  milliseconds
) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}

/*
 * ============================================================
 * CALLBACK HELPER
 * ============================================================
 */

async function safeAnswer(
  bot,
  queryId,
  text = "",
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
