import config from "../config.js";
import {
  getUsers
} from "../database.js";

function isAdmin(userId) {
  return config.adminIds.includes(
    String(userId)
  );
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

export function registerBroadcastHandler(
  bot
) {
  const pendingBroadcasts =
    new Map();

  /*
   * /broadcast
   */
  bot.on(
    "message",
    async (msg) => {
      if (!msg.text) {
        return;
      }

      if (msg.text !== "/broadcast") {
        return;
      }

      const adminId =
        String(msg.from.id);

      if (!isAdmin(adminId)) {
        await bot.sendMessage(
          msg.chat.id,
          "⛔ <b>Access Denied</b>",
          {
            parse_mode: "HTML"
          }
        );

        return;
      }

      pendingBroadcasts.set(
        adminId,
        {
          status: "waiting"
        }
      );

      await bot.sendMessage(
        msg.chat.id,
        [
          "📢 <b>BROADCAST SYSTEM</b>",
          "",
          "Send the message you want to broadcast.",
          "",
          "Supported:",
          "• Text",
          "• Photo",
          "• Video",
          "• Document",
          "• Audio",
          "• Sticker",
          "",
          "⚠️ The message will be sent to all registered users.",
          "",
          "Send /cancel to cancel."
        ].join("\n"),
        {
          parse_mode: "HTML"
        }
      );
    }
  );

  /*
   * /cancel
   */
  bot.on(
    "message",
    async (msg) => {
      if (!msg.text) {
        return;
      }

      if (msg.text !== "/cancel") {
        return;
      }

      const adminId =
        String(msg.from.id);

      if (!isAdmin(adminId)) {
        return;
      }

      if (
        !pendingBroadcasts.has(
          adminId
        )
      ) {
        return;
      }

      pendingBroadcasts.delete(
        adminId
      );

      await bot.sendMessage(
        msg.chat.id,
        "❌ Broadcast cancelled."
      );
    }
  );

  /*
   * Receive broadcast content.
   */
  bot.on(
    "message",
    async (msg) => {
      const adminId =
        String(msg.from.id);

      if (!isAdmin(adminId)) {
        return;
      }

      const pending =
        pendingBroadcasts.get(
          adminId
        );

      if (!pending) {
        return;
      }

      if (
        msg.text ===
        "/broadcast" ||
        msg.text ===
        "/cancel"
      ) {
        return;
      }

      /*
       * Ignore commands while waiting.
       */
      if (
        msg.text?.startsWith("/")
      ) {
        return;
      }

      pendingBroadcasts.delete(
        adminId
      );

      try {
        const users =
          await getUsers();

        const validUsers =
          users.filter(
            (user) =>
              user?.id &&
              String(user.id) !==
                adminId
          );

        if (!validUsers.length) {
          await bot.sendMessage(
            msg.chat.id,
            "📭 No registered users found."
          );

          return;
        }

        const confirmation =
          await bot.sendMessage(
            msg.chat.id,
            [
              "📢 <b>Broadcast Ready</b>",
              "",
              `👥 Recipients: <b>${validUsers.length}</b>`,
              "",
              "Do you want to send this broadcast?",
              "",
              "⚠️ This action cannot be undone."
            ].join("\n"),
            {
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text:
                        "🚀 Send Broadcast",
                      callback_data:
                        "admin:broadcast:confirm"
                    }
                  ],
                  [
                    {
                      text:
                        "❌ Cancel",
                      callback_data:
                        "admin:broadcast:cancel"
                    }
                  ]
                ]
              }
            }
          );

        pendingBroadcasts.set(
          adminId,
          {
            status: "confirmation",
            messageId:
              msg.message_id,
            chatId:
              msg.chat.id,
            confirmationMessageId:
              confirmation.message_id,
            userCount:
              validUsers.length
          }
        );

        /*
         * Keep the original message
         * temporarily for callback use.
         */
        pendingBroadcasts.set(
          `${adminId}:message`,
          msg
        );
      } catch (error) {
        console.error(
          "Broadcast preparation error:",
          error
        );

        await bot.sendMessage(
          msg.chat.id,
          "❌ Failed to prepare broadcast."
        );
      }
    }
  );

  /*
   * Broadcast confirmation callbacks.
   */
  bot.on(
    "callback_query",
    async (query) => {
      const data =
        query.data || "";

      if (
        !data.startsWith(
          "admin:broadcast:"
        )
      ) {
        return;
      }

      const adminId =
        String(query.from.id);

      if (!isAdmin(adminId)) {
        await bot.answerCallbackQuery(
          query.id,
          {
            text:
              "⛔ Admin access required.",
            show_alert: true
          }
        );

        return;
      }

      try {
        await bot.answerCallbackQuery(
          query.id
        );

        const pending =
          pendingBroadcasts.get(
            adminId
          );

        if (!pending) {
          await bot.sendMessage(
            query.message.chat.id,
            "⚠️ Broadcast session expired. Please use /broadcast again."
          );

          return;
        }

        if (
          data ===
          "admin:broadcast:cancel"
        ) {
          pendingBroadcasts.delete(
            adminId
          );

          pendingBroadcasts.delete(
            `${adminId}:message`
          );

          await bot.editMessageText(
            "❌ <b>Broadcast Cancelled</b>",
            {
              chat_id:
                query.message.chat.id,
              message_id:
                query.message.message_id,
              parse_mode: "HTML"
            }
          );

          return;
        }

        if (
          data ===
          "admin:broadcast:confirm"
        ) {
          const originalMessage =
            pendingBroadcasts.get(
              `${adminId}:message`
            );

          if (!originalMessage) {
            pendingBroadcasts.delete(
              adminId
            );

            await bot.sendMessage(
              query.message.chat.id,
              "❌ Broadcast message expired. Please create a new broadcast."
            );

            return;
          }

          pendingBroadcasts.delete(
            adminId
          );

          pendingBroadcasts.delete(
            `${adminId}:message`
          );

          await startBroadcast(
            bot,
            query.message.chat.id,
            originalMessage
          );
        }
      } catch (error) {
        console.error(
          "Broadcast callback error:",
          error
        );

        try {
          await bot.sendMessage(
            query.message.chat.id,
            "❌ Broadcast failed."
          );
        } catch {
          // Ignore Telegram errors.
        }
      }
    }
  );

  console.log(
    "📢 Broadcast handler registered."
  );
}

async function startBroadcast(
  bot,
  adminChatId,
  sourceMessage
) {
  const users =
    await getUsers();

  const recipients =
    users.filter(
      (user) =>
        user?.id &&
        String(user.id) !==
          String(adminChatId)
    );

  const progressMessage =
    await bot.sendMessage(
      adminChatId,
      [
        "📢 <b>BROADCAST STARTED</b>",
        "",
        `👥 Recipients: <b>${recipients.length}</b>`,
        "",
        "⏳ Sending..."
      ].join("\n"),
      {
        parse_mode: "HTML"
      }
    );

  let success = 0;
  let failed = 0;

  const failedUsers = [];

  for (
    let i = 0;
    i < recipients.length;
    i++
  ) {
    const user =
      recipients[i];

    try {
      await copyMessage(
        bot,
        sourceMessage,
        user.id
      );

      success++;
    } catch (error) {
      failed++;

      failedUsers.push({
        userId:
          user.id,
        error:
          error.message
      });

      console.error(
        `Broadcast failed for ${user.id}:`,
        error.message
      );
    }

    /*
     * Telegram-friendly delay.
     */
    await sleep(120);
  }

  const successRate =
    recipients.length > 0
      ? Math.round(
          (success /
            recipients.length) *
            100
        )
      : 0;

  const resultText = [
    "📢 <b>BROADCAST COMPLETED</b>",
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `👥 Total: <b>${recipients.length}</b>`,
    `✅ Sent: <b>${success}</b>`,
    `❌ Failed: <b>${failed}</b>`,
    `📈 Success Rate: <b>${successRate}%</b>`,
    "",
    "━━━━━━━━━━━━━━━━━━━━"
  ].join("\n");

  await bot.editMessageText(
    resultText,
    {
      chat_id:
        adminChatId,
      message_id:
        progressMessage.message_id,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text:
                "📢 New Broadcast",
              callback_data:
                "admin:broadcast"
            }
          ],
          [
            {
              text:
                "🛡️ Admin Dashboard",
              callback_data:
                "admin:dashboard"
            }
          ]
        ]
      }
    }
  );

  if (failedUsers.length) {
    console.log(
      `⚠️ Broadcast failed for ${failedUsers.length} users.`
    );
  }
}

async function copyMessage(
  bot,
  sourceMessage,
  targetChatId
) {
  /*
   * copyMessage keeps the original
   * content without downloading files.
   */
  return bot.copyMessage(
    targetChatId,
    sourceMessage.chat.id,
    sourceMessage.message_id
  );
}

export default {
  registerBroadcastHandler
};
