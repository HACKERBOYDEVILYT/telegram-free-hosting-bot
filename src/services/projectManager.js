import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

import config from "../config.js";
import {
  getProject,
  getUserProjects,
  createProject,
  updateProject,
  deleteProject
} from "../database.js";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const MAX_PROJECTS_PER_USER = 10;

const ALLOWED_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".txt",
  ".xml",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".webm"
]);

// ─────────────────────────────────────────────
// CREATE ID
// ─────────────────────────────────────────────

function generateProjectId() {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────
// CREATE SLUG
// ─────────────────────────────────────────────

export function createSlug(name) {
  const base = String(name || "website")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  const random = crypto.randomBytes(3).toString("hex");

  return `${base || "website"}-${random}`;
}

// ─────────────────────────────────────────────
// SANITIZE PROJECT NAME
// ─────────────────────────────────────────────

export function sanitizeProjectName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 50);
}

// ─────────────────────────────────────────────
// VALIDATE PROJECT NAME
// ─────────────────────────────────────────────

export function validateProjectName(name) {
  const cleanName = sanitizeProjectName(name);

  if (!cleanName) {
    return {
      valid: false,
      error: "Project name is required."
    };
  }

  if (cleanName.length < 2) {
    return {
      valid: false,
      error: "Project name must contain at least 2 characters."
    };
  }

  if (cleanName.length > 50) {
    return {
      valid: false,
      error: "Project name cannot exceed 50 characters."
    };
  }

  return {
    valid: true,
    name: cleanName
  };
}

// ─────────────────────────────────────────────
// USER PROJECT LIMIT
// ─────────────────────────────────────────────

export async function canCreateProject(userId) {
  const projects = await getUserProjects(userId);

  return {
    allowed: projects.length < MAX_PROJECTS_PER_USER,
    current: projects.length,
    limit: MAX_PROJECTS_PER_USER
  };
}

// ─────────────────────────────────────────────
// FILE EXTENSION VALIDATION
// ─────────────────────────────────────────────

export function isAllowedFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  return ALLOWED_EXTENSIONS.has(extension);
}

// ─────────────────────────────────────────────
// PROJECT FILE VALIDATION
// ─────────────────────────────────────────────

export async function validateProjectDirectory(directory) {
  const result = {
    valid: false,
    files: [],
    totalSize: 0,
    hasIndex: false,
    errors: []
  };

  async function scan(currentDirectory) {
    const entries = await fs.readdir(currentDirectory, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const fullPath = path.join(
        currentDirectory,
        entry.name
      );

      if (entry.isDirectory()) {
        await scan(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path
        .relative(directory, fullPath)
        .replace(/\\/g, "/");

      // Prevent hidden/system files from becoming part of a hosted site.
      if (
        entry.name.startsWith(".") ||
        relativePath.includes("/.")
      ) {
        continue;
      }

      if (!isAllowedFile(relativePath)) {
        result.errors.push(
          `Unsupported file type: ${relativePath}`
        );

        continue;
      }

      const stats = await fs.stat(fullPath);

      result.files.push({
        path: relativePath,
        size: stats.size
      });

      result.totalSize += stats.size;

      if (relativePath.toLowerCase() === "index.html") {
        result.hasIndex = true;
      }
    }
  }

  try {
    await scan(directory);
  } catch (error) {
    result.errors.push(
      `Unable to scan project: ${error.message}`
    );

    return result;
  }

  if (!result.hasIndex) {
    result.errors.push(
      "index.html is required in the project."
    );
  }

  const maxBytes =
    config.maxFileSizeMB * 1024 * 1024;

  if (result.totalSize > maxBytes) {
    result.errors.push(
      `Project exceeds the ${config.maxFileSizeMB} MB storage limit.`
    );
  }

  result.valid = result.errors.length === 0;

  return result;
}

// ─────────────────────────────────────────────
// CREATE PROJECT
// ─────────────────────────────────────────────

export async function registerProject({
  userId,
  name,
  size = 0,
  files = 0,
  url = null
}) {
  const validation = validateProjectName(name);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const permission = await canCreateProject(userId);

  if (!permission.allowed) {
    throw new Error(
      `Project limit reached. Maximum ${permission.limit} projects allowed.`
    );
  }

  const project = await createProject({
    id: generateProjectId(),
    userId,
    name: validation.name,
    slug: createSlug(validation.name),
    status: "pending",
    size,
    files,
    url
  });

  return project;
}

// ─────────────────────────────────────────────
// GET USER PROJECTS
// ─────────────────────────────────────────────

export async function listProjects(userId) {
  return getUserProjects(userId);
}

// ─────────────────────────────────────────────
// GET PROJECT
// ─────────────────────────────────────────────

export async function findProject(projectId, userId = null) {
  const project = await getProject(projectId);

  if (!project) {
    return null;
  }

  if (
    userId !== null &&
    String(project.userId) !== String(userId)
  ) {
    return null;
  }

  return project;
}

// ─────────────────────────────────────────────
// UPDATE STATUS
// ─────────────────────────────────────────────

export async function setProjectStatus(
  projectId,
  status,
  userId = null
) {
  const project = await findProject(
    projectId,
    userId
  );

  if (!project) {
    return null;
  }

  const allowedStatuses = [
    "pending",
    "deploying",
    "active",
    "failed",
    "suspended",
    "deleted"
  ];

  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid project status.");
  }

  return updateProject(projectId, {
    status
  });
}

// ─────────────────────────────────────────────
// UPDATE DEPLOYMENT DATA
// ─────────────────────────────────────────────

export async function updateDeployment(
  projectId,
  deploymentData,
  userId = null
) {
  const project = await findProject(
    projectId,
    userId
  );

  if (!project) {
    return null;
  }

  return updateProject(projectId, {
    status: deploymentData.status || project.status,
    url: deploymentData.url ?? project.url,
    size: Number(
      deploymentData.size ?? project.size
    ),
    files: Number(
      deploymentData.files ?? project.files
    )
  });
}

// ─────────────────────────────────────────────
// DELETE PROJECT
// ─────────────────────────────────────────────

export async function removeProject(
  projectId,
  userId = null
) {
  const project = await findProject(
    projectId,
    userId
  );

  if (!project) {
    return false;
  }

  return deleteProject(projectId);
}

// ─────────────────────────────────────────────
// FORMAT BYTES
// ─────────────────────────────────────────────

export function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (value === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB"
  ];

  const index = Math.min(
    Math.floor(
      Math.log(value) / Math.log(1024)
    ),
    units.length - 1
  );

  const size =
    value / Math.pow(1024, index);

  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

// ─────────────────────────────────────────────
// EXPORT CONFIG
// ─────────────────────────────────────────────

export const PROJECT_LIMITS = {
  maxProjects: MAX_PROJECTS_PER_USER,
  maxSizeMB: config.maxFileSizeMB,
  allowedExtensions: [...ALLOWED_EXTENSIONS]
};
