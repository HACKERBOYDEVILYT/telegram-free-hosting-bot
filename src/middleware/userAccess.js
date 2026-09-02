import {
  getUser,
  isUserBlocked
} from "../database.js";

export async function checkUserAccess(
  userId
) {
  const user = await getUser(userId);

  /*
   * User database-এ না থাকলে
   * তাকে automatically block করছি না.
   * /start-এর মাধ্যমে registration হবে.
   */
  if (!user) {
    return {
      allowed: true,
      user: null,
      reason: null
    };
  }

  const blocked =
    await isUserBlocked(userId);

  if (blocked) {
    return {
      allowed: false,
      user,
      reason:
        user.blockedReason ||
        "Your account has been restricted by an administrator."
    };
  }

  return {
    allowed: true,
    user,
    reason: null
  };
}

export async function requireUserAccess(
  bot,
  msg
) {
  const userId =
    String(msg.from?.id || "");

  if (!userId) {
    return false;
  }

  const access =
    await checkUserAccess(userId);

  if (access.allowed) {
    return true;
  }

  try {
    await bot.sendMessage(
      msg.chat.id,
      [
        "🚫 <b>ACCOUNT RESTRICTED</b>",
        "",
        "Your account is currently blocked from using this hosting service.",
        "",
        `📝 <b>Reason:</b> ${escapeHtml(
          access.reason
        )}`,
        "",
        "If you believe this is a mistake, please contact the administrator."
      ].join("\n"),
      {
        parse_mode: "HTML"
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to send restriction message:",
      error
    );
  }

  return false;
}

export async function requireCallbackAccess(
  bot,
  query
) {
  const userId =
    String(query.from?.id || "");

  if (!userId) {
    return false;
  }

  const access =
    await checkUserAccess(userId);

  if (access.allowed) {
    return true;
  }

  try {
    await bot.answerCallbackQuery(
      query.id,
      {
        text:
          "🚫 Your account is restricted.",
        show_alert: true
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to answer restricted callback:",
      error
    );
  }

  return false;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default {
  checkUserAccess,
  requireUserAccess,
  requireCallbackAccess
};
