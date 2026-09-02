import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(
  __dirname,
  "../storage/data"
);

const USERS_FILE = path.join(
  DATA_DIR,
  "users.json"
);

const PROJECTS_FILE = path.join(
  DATA_DIR,
  "projects.json"
);

async function ensureDatabase() {
  await fs.mkdir(DATA_DIR, {
    recursive: true
  });

  try {
    await fs.access(USERS_FILE);
  } catch {
    await writeJson(
      USERS_FILE,
      []
    );
  }

  try {
    await fs.access(PROJECTS_FILE);
  } catch {
    await writeJson(
      PROJECTS_FILE,
      []
    );
  }
}

async function readJson(
  filePath,
  fallback = []
) {
  try {
    const content =
      await fs.readFile(
        filePath,
        "utf8"
      );

    if (!content.trim()) {
      return fallback;
    }

    return JSON.parse(content);
  } catch (error) {
    if (
      error.code ===
      "ENOENT"
    ) {
      return fallback;
    }

    console.error(
      `❌ Failed to read ${filePath}:`,
      error
    );

    return fallback;
  }
}

async function writeJson(
  filePath,
  data
) {
  const tempPath =
    `${filePath}.tmp`;

  await fs.writeFile(
    tempPath,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  await fs.rename(
    tempPath,
    filePath
  );
}

/* =========================
   USERS
========================= */

export async function getUsers() {
  await ensureDatabase();

  return readJson(
    USERS_FILE,
    []
  );
}

export async function getUser(
  userId
) {
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

export async function createOrUpdateUser(
  telegramUser
) {
  await ensureDatabase();

  const users =
    await getUsers();

  const userId =
    String(telegramUser.id);

  const index =
    users.findIndex(
      (user) =>
        String(user.id) ===
        userId
    );

  const now =
    new Date().toISOString();

  if (index === -1) {
    const newUser = {
      id: userId,

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
        ),

      /*
       * Restriction system.
       */
      status: "active",

      isBlocked: false,

      blockedAt: null,

      blockedReason: "",

      createdAt: now,

      updatedAt: now
    };

    users.push(newUser);

    await writeJson(
      USERS_FILE,
      users
    );

    return newUser;
  }

  const existing =
    users[index];

  /*
   * IMPORTANT:
   * Never reset blocked status
   * when the user sends /start.
   */
  const updatedUser = {
    ...existing,

    username:
      telegramUser.username ||
      existing.username ||
      "",

    firstName:
      telegramUser.first_name ??
      existing.firstName ??
      "",

    lastName:
      telegramUser.last_name ??
      existing.lastName ??
      "",

    languageCode:
      telegramUser.language_code ??
      existing.languageCode ??
      "",

    isBot:
      telegramUser.is_bot ??
      existing.isBot ??
      false,

    /*
     * Keep existing restriction state.
     */
    status:
      existing.status ||
      (
        existing.isBlocked
          ? "blocked"
          : "active"
      ),

    isBlocked:
      Boolean(
        existing.isBlocked
      ),

    blockedAt:
      existing.blockedAt ||
      null,

    blockedReason:
      existing.blockedReason ||
      "",

    createdAt:
      existing.createdAt ||
      now,

    updatedAt: now
  };

  users[index] =
    updatedUser;

  await writeJson(
    USERS_FILE,
    users
  );

  return updatedUser;
}

/* =========================
   USER RESTRICTION
========================= */

export async function blockUser(
  userId,
  reason = ""
) {
  await ensureDatabase();

  const users =
    await getUsers();

  const index =
    users.findIndex(
      (user) =>
        String(user.id) ===
        String(userId)
    );

  if (index === -1) {
    return null;
  }

  const now =
    new Date().toISOString();

  users[index] = {
    ...users[index],

    status: "blocked",

    isBlocked: true,

    blockedAt: now,

    blockedReason:
      String(reason || "")
        .trim(),

    updatedAt: now
  };

  await writeJson(
    USERS_FILE,
    users
  );

  return users[index];
}

export async function unblockUser(
  userId
) {
  await ensureDatabase();

  const users =
    await getUsers();

  const index =
    users.findIndex(
      (user) =>
        String(user.id) ===
        String(userId)
    );

  if (index === -1) {
    return null;
  }

  users[index] = {
    ...users[index],

    status: "active",

    isBlocked: false,

    blockedAt: null,

    blockedReason: "",

    updatedAt:
      new Date().toISOString()
  };

  await writeJson(
    USERS_FILE,
    users
  );

  return users[index];
}

export async function isUserBlocked(
  userId
) {
  const user =
    await getUser(userId);

  if (!user) {
    return false;
  }

  return (
    user.isBlocked === true ||
    user.status ===
      "blocked"
  );
}

export async function getBlockedUsers() {
  const users =
    await getUsers();

  return users.filter(
    (user) =>
      user.isBlocked === true ||
      user.status ===
        "blocked"
  );
}

export async function getActiveUsers() {
  const users =
    await getUsers();

  return users.filter(
    (user) =>
      user.isBlocked !== true &&
      user.status !==
        "blocked"
  );
}

/* =========================
   PROJECTS
========================= */

export async function getProjects() {
  await ensureDatabase();

  return readJson(
    PROJECTS_FILE,
    []
  );
}

export async function getUserProjects(
  userId
) {
  const projects =
    await getProjects();

  return projects.filter(
    (project) =>
      String(project.userId) ===
      String(userId) &&
      project.status !==
        "deleted"
  );
}

export async function getProject(
  projectId
) {
  const projects =
    await getProjects();

  return (
    projects.find(
      (project) =>
        String(project.id) ===
        String(projectId)
    ) || null
  );
}

export async function createProject(
  projectData
) {
  await ensureDatabase();

  const projects =
    await getProjects();

  const now =
    new Date().toISOString();

  const project = {
    ...projectData,

    createdAt:
      projectData.createdAt ||
      now,

    updatedAt:
      projectData.updatedAt ||
      now
  };

  projects.push(project);

  await writeJson(
    PROJECTS_FILE,
    projects
  );

  return project;
}

export async function updateProject(
  projectId,
  updates
) {
  await ensureDatabase();

  const projects =
    await getProjects();

  const index =
    projects.findIndex(
      (project) =>
        String(project.id) ===
        String(projectId)
    );

  if (index === -1) {
    return null;
  }

  projects[index] = {
    ...projects[index],

    ...updates,

    updatedAt:
      new Date().toISOString()
  };

  await writeJson(
    PROJECTS_FILE,
    projects
  );

  return projects[index];
}

export async function deleteProject(
  projectId
) {
  return updateProject(
    projectId,
    {
      status: "deleted"
    }
  );
}

/* =========================
   STATISTICS
========================= */

export async function getStatistics() {
  const [
    users,
    projects
  ] = await Promise.all([
    getUsers(),
    getProjects()
  ]);

  return {
    users:
      users.length,

    projects:
      projects.length,

    active:
      projects.filter(
        (project) =>
          project.status ===
          "active"
      ).length,

    deploying:
      projects.filter(
        (project) =>
          project.status ===
          "deploying"
      ).length,

    pending:
      projects.filter(
        (project) =>
          project.status ===
          "pending"
      ).length,

    failed:
      projects.filter(
        (project) =>
          project.status ===
          "failed"
      ).length,

    suspended:
      projects.filter(
        (project) =>
          project.status ===
          "suspended"
      ).length,

    deleted:
      projects.filter(
        (project) =>
          project.status ===
          "deleted"
      ).length,

    blockedUsers:
      users.filter(
        (user) =>
          user.isBlocked ===
            true ||
          user.status ===
            "blocked"
      ).length
  };
}

/* =========================
   DATABASE INIT
========================= */

await ensureDatabase();

console.log(
  "💾 Database initialized."
);
