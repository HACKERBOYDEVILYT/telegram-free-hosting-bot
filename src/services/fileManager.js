import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import config from "../config.js";

const MAX_SIZE = config.maxFileSizeMB * 1024 * 1024;

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
// DIRECTORIES
// ─────────────────────────────────────────────

export async function ensureStorage() {
  await fs.mkdir(config.storageDir, {
    recursive: true
  });

  await fs.mkdir(config.uploadsDir, {
    recursive: true
  });

  await fs.mkdir(config.sitesDir, {
    recursive: true
  });
}

// ─────────────────────────────────────────────
// SAFE PROJECT ID
// ─────────────────────────────────────────────

function safeId(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

// ─────────────────────────────────────────────
// PROJECT PATHS
// ─────────────────────────────────────────────

export function getUploadPath(projectId) {
  return path.join(
    config.uploadsDir,
    safeId(projectId)
  );
}

export function getSitePath(projectId) {
  return path.join(
    config.sitesDir,
    safeId(projectId)
  );
}

// ─────────────────────────────────────────────
// FILE EXTENSION
// ─────────────────────────────────────────────

function isAllowedExtension(filePath) {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  return ALLOWED_EXTENSIONS.has(extension);
}

// ─────────────────────────────────────────────
// PATH SECURITY
// ─────────────────────────────────────────────

function isSafeRelativePath(filePath) {
  if (!filePath) {
    return false;
  }

  const normalized = filePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (
    normalized.includes("../") ||
    normalized.includes("/..") ||
    normalized === ".."
  ) {
    return false;
  }

  if (path.isAbsolute(filePath)) {
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────
// FILE NAME
// ─────────────────────────────────────────────

export function createSafeFileName(originalName) {
  const extension = path
    .extname(originalName)
    .toLowerCase();

  const randomName = crypto
    .randomBytes(12)
    .toString("hex");

  return `${randomName}${extension}`;
}

// ─────────────────────────────────────────────
// VALIDATE SINGLE FILE
// ─────────────────────────────────────────────

export function validateFile(filePath, size = 0) {
  if (!isSafeRelativePath(filePath)) {
    return {
      valid: false,
      error: "Unsafe file path."
    };
  }

  if (!isAllowedExtension(filePath)) {
    return {
      valid: false,
      error: `Unsupported file type: ${path.extname(filePath)}`
    };
  }

  if (size > MAX_SIZE) {
    return {
      valid: false,
      error: `File exceeds ${config.maxFileSizeMB} MB limit.`
    };
  }

  return {
    valid: true
  };
}

// ─────────────────────────────────────────────
// CALCULATE DIRECTORY SIZE
// ─────────────────────────────────────────────

export async function calculateDirectorySize(
  directory
) {
  let total = 0;

  async function scan(current) {
    const entries = await fs.readdir(current, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const fullPath = path.join(
        current,
        entry.name
      );

      if (entry.isDirectory()) {
        await scan(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = await fs.stat(fullPath);

      total += stats.size;

      if (total > MAX_SIZE) {
        throw new Error(
          `Project exceeds ${config.maxFileSizeMB} MB limit.`
        );
      }
    }
  }

  await scan(directory);

  return total;
}

// ─────────────────────────────────────────────
// COUNT FILES
// ─────────────────────────────────────────────

export async function countFiles(directory) {
  let count = 0;

  async function scan(current) {
    const entries = await fs.readdir(current, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const fullPath = path.join(
        current,
        entry.name
      );

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
  }

  await scan(directory);

  return count;
}

// ─────────────────────────────────────────────
// FIND INDEX.HTML
// ─────────────────────────────────────────────

export async function hasIndexFile(directory) {
  const indexPath = path.join(
    directory,
    "index.html"
  );

  try {
    const stats = await fs.stat(indexPath);

    return stats.isFile();
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// VALIDATE DIRECTORY
// ─────────────────────────────────────────────

export async function validateDirectory(
  directory
) {
  const result = {
    valid: false,
    files: 0,
    size: 0,
    hasIndex: false,
    errors: []
  };

  try {
    await fs.access(directory);
  } catch {
    result.errors.push(
      "Project directory does not exist."
    );

    return result;
  }

  try {
    result.hasIndex =
      await hasIndexFile(directory);

    if (!result.hasIndex) {
      result.errors.push(
        "index.html is required."
      );
    }

    result.size =
      await calculateDirectorySize(directory);

    result.files =
      await countFiles(directory);

    result.valid =
      result.errors.length === 0;

    return result;
  } catch (error) {
    result.errors.push(error.message);

    return result;
  }
}

// ─────────────────────────────────────────────
// CREATE PROJECT DIRECTORIES
// ─────────────────────────────────────────────

export async function createProjectStorage(
  projectId
) {
  await ensureStorage();

  const uploadPath =
    getUploadPath(projectId);

  const sitePath =
    getSitePath(projectId);

  await fs.mkdir(uploadPath, {
    recursive: true
  });

  await fs.mkdir(sitePath, {
    recursive: true
  });

  return {
    uploadPath,
    sitePath
  };
}

// ─────────────────────────────────────────────
// REMOVE PROJECT STORAGE
// ─────────────────────────────────────────────

export async function removeProjectStorage(
  projectId
) {
  const uploadPath =
    getUploadPath(projectId);

  const sitePath =
    getSitePath(projectId);

  await fs.rm(uploadPath, {
    recursive: true,
    force: true
  });

  await fs.rm(sitePath, {
    recursive: true,
    force: true
  });
}

// ─────────────────────────────────────────────
// COPY PROJECT
// ─────────────────────────────────────────────

export async function copyProjectFiles(
  source,
  destination
) {
  await fs.mkdir(destination, {
    recursive: true
  });

  await fs.cp(source, destination, {
    recursive: true,
    force: true
  });
}

// ─────────────────────────────────────────────
// CLEAN DIRECTORY
// ─────────────────────────────────────────────

export async function cleanDirectory(
  directory
) {
  await fs.rm(directory, {
    recursive: true,
    force: true
  });

  await fs.mkdir(directory, {
    recursive: true
  });
}

// ─────────────────────────────────────────────
// PROJECT STORAGE INFO
// ─────────────────────────────────────────────

export async function getStorageInfo(
  projectId
) {
  const sitePath =
    getSitePath(projectId);

  try {
    const stats =
      await fs.stat(sitePath);

    if (!stats.isDirectory()) {
      return {
        exists: false,
        size: 0,
        files: 0
      };
    }
  } catch {
    return {
      exists: false,
      size: 0,
      files: 0
    };
  }

  try {
    const size =
      await calculateDirectorySize(sitePath);

    const files =
      await countFiles(sitePath);

    return {
      exists: true,
      size,
      files
    };
  } catch {
    return {
      exists: true,
      size: 0,
      files: 0
    };
  }
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

  return `${(
    value / Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

// ─────────────────────────────────────────────
// STORAGE INITIALIZATION
// ─────────────────────────────────────────────

await ensureStorage();

console.log("📁 Storage system initialized.");
