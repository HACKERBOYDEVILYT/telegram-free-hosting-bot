import crypto from "node:crypto";
import path from "node:path";

import config from "../config.js";
import {
  createProject,
  getProject,
  getUserProjects,
  updateProject,
  deleteProject
} from "../database.js";

export const PROJECT_LIMITS = {
  maxProjectsPerUser: 10,

  maxProjectNameLength: 50,

  statuses: [
    "pending",
    "deploying",
    "active",
    "failed",
    "suspended",
    "deleted"
  ],

  allowedExtensions: [
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
  ]
};

/**
 * Generate a URL-safe slug.
 */
export function createSlug(value) {
  return String(value || "website")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 45);
}

/**
 * Sanitize project name.
 */
export function sanitizeProjectName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .slice(0, PROJECT_LIMITS.maxProjectNameLength);
}

/**
 * Validate project name.
 */
export function validateProjectName(name) {
  const cleanName = sanitizeProjectName(name);

  if (!cleanName) {
    return {
      valid: false,
      message: "Project name cannot be empty."
    };
  }

  if (cleanName.length < 2) {
    return {
      valid: false,
      message: "Project name must contain at least 2 characters."
    };
  }

  if (
    cleanName.length >
    PROJECT_LIMITS.maxProjectNameLength
  ) {
    return {
      valid: false,
      message:
        `Project name cannot exceed ${PROJECT_LIMITS.maxProjectNameLength} characters.`
    };
  }

  return {
    valid: true,
    name: cleanName
  };
}

/**
 * Check whether the user can create another project.
 */
export async function canCreateProject(userId) {
  const projects = await getUserProjects(String(userId));

  const activeProjects = projects.filter(
    (project) => project.status !== "deleted"
  );

  return {
    allowed:
      activeProjects.length <
      PROJECT_LIMITS.maxProjectsPerUser,

    current: activeProjects.length,

    limit: PROJECT_LIMITS.maxProjectsPerUser
  };
}

/**
 * Check allowed website file extension.
 */
export function isAllowedFile(fileName) {
  const extension = path
    .extname(String(fileName || ""))
    .toLowerCase();

  return PROJECT_LIMITS.allowedExtensions.includes(
    extension
  );
}

/**
 * Validate extracted project directory.
 */
export async function validateProjectDirectory(
  directory,
  options = {}
) {
  const {
    maxFiles = 500,
    maxSizeMB = Number(
      config.maxFileSizeMB || 50
    )
  } = options;

  const fs = await import("node:fs/promises");

  const maxSizeBytes =
    maxSizeMB * 1024 * 1024;

  let totalSize = 0;
  let totalFiles = 0;
  let hasIndex = false;

  async function walk(currentDir) {
    const entries = await fs.readdir(
      currentDir,
      {
        withFileTypes: true
      }
    );

    for (const entry of entries) {
      const fullPath = path.join(
        currentDir,
        entry.name
      );

      if (entry.isSymbolicLink()) {
        throw new Error(
          `Symbolic links are not allowed: ${entry.name}`
        );
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      totalFiles++;

      if (totalFiles > maxFiles) {
        throw new Error(
          `Project contains too many files. Maximum allowed: ${maxFiles}.`
        );
      }

      if (
        entry.name.toLowerCase() ===
        "index.html"
      ) {
        hasIndex = true;
      }

      if (!isAllowedFile(entry.name)) {
        throw new Error(
          `Unsupported file type: ${entry.name}`
        );
      }

      const stat = await fs.stat(fullPath);

      totalSize += stat.size;

      if (totalSize > maxSizeBytes) {
        throw new Error(
          `Project files exceed the ${maxSizeMB} MB storage limit.`
        );
      }
    }
  }

  await walk(directory);

  if (!hasIndex) {
    throw new Error(
      "index.html was not found in the website package."
    );
  }

  return {
    valid: true,
    totalFiles,
    totalSize,
    hasIndex
  };
}

/**
 * Create/register a new project.
 */
export async function registerProject({
  userId,
  name,
  description = ""
}) {
  const normalizedUserId = String(userId);

  const validation =
    validateProjectName(name);

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const permission =
    await canCreateProject(
      normalizedUserId
    );

  if (!permission.allowed) {
    throw new Error(
      `Project limit reached. You can host up to ${permission.limit} projects.`
    );
  }

  const projectName =
    validation.name;

  const slug =
    createSlug(projectName);

  const projectId =
    `p_${Date.now()}_${crypto
      .randomBytes(4)
      .toString("hex")}`;

  const project = {
    id: projectId,

    userId: normalizedUserId,

    name: projectName,

    slug,

    description:
      String(description || "").slice(
        0,
        300
      ),

    status: "pending",

    provider: null,

    providerProject: null,

    url: null,

    deploymentUrl: null,

    deploymentId: null,

    deploymentStatus: null,

    fileCount: 0,

    totalSize: 0,

    createdAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),

    deployedAt: null,

    lastDeploymentAt: null
  };

  return createProject(project);
}

/**
 * List user's projects.
 */
export async function listProjects(
  userId,
  options = {}
) {
  const {
    includeDeleted = false
  } = options;

  const projects =
    await getUserProjects(
      String(userId)
    );

  const filtered = includeDeleted
    ? projects
    : projects.filter(
        (project) =>
          project.status !== "deleted"
      );

  return filtered.sort(
    (a, b) =>
      new Date(
        b.updatedAt || b.createdAt
      ) -
      new Date(
        a.updatedAt || a.createdAt
      )
  );
}

/**
 * Find a project by ID.
 */
export async function findProject(
  projectId,
  userId = null
) {
  const project =
    await getProject(
      String(projectId)
    );

  if (!project) {
    return null;
  }

  if (
    userId !== null &&
    String(project.userId) !==
      String(userId)
  ) {
    return null;
  }

  return project;
}

/**
 * Change project status.
 */
export async function setProjectStatus(
  projectId,
  status
) {
  if (
    !PROJECT_LIMITS.statuses.includes(
      status
    )
  ) {
    throw new Error(
      `Invalid project status: ${status}`
    );
  }

  const project =
    await getProject(
      String(projectId)
    );

  if (!project) {
    throw new Error(
      "Project not found."
    );
  }

  const updates = {
    status,
    updatedAt:
      new Date().toISOString()
  };

  if (status === "active") {
    updates.deployedAt =
      project.deployedAt ||
      new Date().toISOString();

    updates.lastDeploymentAt =
      new Date().toISOString();
  }

  await updateProject(
    String(projectId),
    updates
  );

  return {
    ...project,
    ...updates
  };
}

/**
 * Save deployment information.
 */
export async function updateDeployment(
  projectId,
  deployment = {}
) {
  const project =
    await getProject(
      String(projectId)
    );

  if (!project) {
    throw new Error(
      "Project not found."
    );
  }

  const now =
    new Date().toISOString();

  const updates = {
    provider:
      deployment.provider ??
      project.provider,

    providerProject:
      deployment.providerProject ??
      project.providerProject,

    url:
      deployment.url ??
      project.url,

    deploymentUrl:
      deployment.deploymentUrl ??
      deployment.url ??
      project.deploymentUrl,

    deploymentId:
      deployment.deploymentId ??
      project.deploymentId,

    deploymentStatus:
      deployment.deploymentStatus ??
      project.deploymentStatus,

    status:
      deployment.status ??
      project.status,

    fileCount:
      Number.isFinite(
        Number(deployment.fileCount)
      )
        ? Number(deployment.fileCount)
        : project.fileCount || 0,

    totalSize:
      Number.isFinite(
        Number(deployment.totalSize)
      )
        ? Number(deployment.totalSize)
        : project.totalSize || 0,

    deployedAt:
      deployment.deployedAt ??
      project.deployedAt,

    lastDeploymentAt:
      deployment.lastDeploymentAt ??
      now,

    updatedAt: now
  };

  await updateProject(
    String(projectId),
    updates
  );

  return {
    ...project,
    ...updates
  };
}

/**
 * Soft-delete a project.
 */
export async function removeProject(
  projectId,
  userId = null
) {
  const project =
    await findProject(
      projectId,
      userId
    );

  if (!project) {
    throw new Error(
      "Project not found."
    );
  }

  await updateProject(
    String(projectId),
    {
      status: "deleted",
      updatedAt:
        new Date().toISOString(),
      deletedAt:
        new Date().toISOString()
    }
  );

  return {
    ...project,
    status: "deleted"
  };
}

/**
 * Permanently remove a project
 * from the database.
 */
export async function permanentlyDeleteProject(
  projectId,
  userId = null
) {
  const project =
    await findProject(
      projectId,
      userId
    );

  if (!project) {
    throw new Error(
      "Project not found."
    );
  }

  await deleteProject(
    String(projectId)
  );

  return project;
}

/**
 * Restore a soft-deleted project.
 */
export async function restoreProject(
  projectId,
  userId = null
) {
  const project =
    await findProject(
      projectId,
      userId
    );

  if (!project) {
    throw new Error(
      "Project not found."
    );
  }

  if (
    project.status !==
    "deleted"
  ) {
    return project;
  }

  const permission =
    await canCreateProject(
      project.userId
    );

  if (!permission.allowed) {
    throw new Error(
      "Project limit reached."
    );
  }

  const updates = {
    status: "pending",
    deletedAt: null,
    updatedAt:
      new Date().toISOString()
  };

  await updateProject(
    String(projectId),
    updates
  );

  return {
    ...project,
    ...updates
  };
}

/**
 * Format bytes.
 */
export function formatBytes(bytes) {
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

  const index = Math.min(
    Math.floor(
      Math.log(value) /
        Math.log(1024)
    ),
    units.length - 1
  );

  return `${(
    value /
    Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 2)} ${
    units[index]
  }`;
}

export default {
  PROJECT_LIMITS,
  createSlug,
  sanitizeProjectName,
  validateProjectName,
  canCreateProject,
  isAllowedFile,
  validateProjectDirectory,
  registerProject,
  listProjects,
  findProject,
  setProjectStatus,
  updateDeployment,
  removeProject,
  permanentlyDeleteProject,
  restoreProject,
  formatBytes
};
