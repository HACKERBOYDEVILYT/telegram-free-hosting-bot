import fs from "fs/promises";
import path from "path";
import config from "./config.js";

const DATA_DIR = path.join(config.storageDir, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");

async function ensureDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, "[]", "utf8");
  }

  try {
    await fs.access(PROJECTS_FILE);
  } catch {
    await fs.writeFile(PROJECTS_FILE, "[]", "utf8");
  }
}

async function readJson(file) {
  await ensureDatabase();

  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeJson(file, data) {
  await ensureDatabase();

  const tempFile = `${file}.tmp`;

  await fs.writeFile(
    tempFile,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  await fs.rename(tempFile, file);
}

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────

export async function getUsers() {
  return readJson(USERS_FILE);
}

export async function getUser(userId) {
  const users = await getUsers();

  return users.find(
    (user) => String(user.id) === String(userId)
  ) || null;
}

export async function createOrUpdateUser(telegramUser) {
  const users = await getUsers();

  const userId = String(telegramUser.id);
  const now = new Date().toISOString();

  const index = users.findIndex(
    (user) => String(user.id) === userId
  );

  const userData = {
    id: userId,
    username: telegramUser.username || null,
    firstName: telegramUser.first_name || "",
    lastName: telegramUser.last_name || "",
    languageCode: telegramUser.language_code || null,
    updatedAt: now
  };

  if (index === -1) {
    users.push({
      ...userData,
      createdAt: now,
      status: "active",
      projects: 0,
      storageUsed: 0
    });
  } else {
    users[index] = {
      ...users[index],
      ...userData
    };
  }

  await writeJson(USERS_FILE, users);

  return users.find(
    (user) => String(user.id) === userId
  );
}

// ─────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────

export async function getProjects() {
  return readJson(PROJECTS_FILE);
}

export async function getUserProjects(userId) {
  const projects = await getProjects();

  return projects.filter(
    (project) => String(project.userId) === String(userId)
  );
}

export async function getProject(projectId) {
  const projects = await getProjects();

  return projects.find(
    (project) => String(project.id) === String(projectId)
  ) || null;
}

export async function createProject(project) {
  const projects = await getProjects();

  const now = new Date().toISOString();

  const newProject = {
    id: project.id,
    userId: String(project.userId),
    name: project.name,
    slug: project.slug,
    status: project.status || "pending",
    size: Number(project.size || 0),
    files: Number(project.files || 0),
    url: project.url || null,
    createdAt: now,
    updatedAt: now
  };

  projects.push(newProject);

  await writeJson(PROJECTS_FILE, projects);

  return newProject;
}

export async function updateProject(projectId, updates) {
  const projects = await getProjects();

  const index = projects.findIndex(
    (project) => String(project.id) === String(projectId)
  );

  if (index === -1) {
    return null;
  }

  projects[index] = {
    ...projects[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await writeJson(PROJECTS_FILE, projects);

  return projects[index];
}

export async function deleteProject(projectId) {
  const projects = await getProjects();

  const project = projects.find(
    (item) => String(item.id) === String(projectId)
  );

  if (!project) {
    return false;
  }

  const filtered = projects.filter(
    (item) => String(item.id) !== String(projectId)
  );

  await writeJson(PROJECTS_FILE, filtered);

  return true;
}

// ─────────────────────────────────────────────
// STATISTICS
// ─────────────────────────────────────────────

export async function getStatistics() {
  const users = await getUsers();
  const projects = await getProjects();

  const totalStorage = projects.reduce(
    (total, project) => total + Number(project.size || 0),
    0
  );

  const activeProjects = projects.filter(
    (project) => project.status === "active"
  ).length;

  return {
    totalUsers: users.length,
    totalProjects: projects.length,
    activeProjects,
    totalStorage
  };
}

// ─────────────────────────────────────────────
// INITIALIZE
// ─────────────────────────────────────────────

await ensureDatabase();

console.log("🗄️ Database initialized.");
