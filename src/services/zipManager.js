import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import {
  createProjectStorage,
  cleanDirectory,
  getUploadPath,
  getSitePath,
  calculateDirectorySize,
  countFiles,
  hasIndexFile
} from "./fileManager.js";

import config from "../config.js";

const execFileAsync = promisify(execFile);

const MAX_SIZE =
  config.maxFileSizeMB * 1024 * 1024;

// ─────────────────────────────────────────────
// ZIP NAME VALIDATION
// ─────────────────────────────────────────────

export function isZipFile(fileName) {
  return path
    .extname(fileName || "")
    .toLowerCase() === ".zip";
}

// ─────────────────────────────────────────────
// SAFE ZIP PATH CHECK
// ─────────────────────────────────────────────

function isSafeZipPath(filePath) {
  const normalized = String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (!normalized) {
    return false;
  }

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
// ZIP CONTENT INSPECTION
// ─────────────────────────────────────────────

async function inspectZip(zipPath) {
  try {
    const { stdout } = await execFileAsync(
      "unzip",
      ["-Z1", zipPath],
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );

    const entries = stdout
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    for (const entry of entries) {
      if (!isSafeZipPath(entry)) {
        throw new Error(
          `Unsafe ZIP entry detected: ${entry}`
        );
      }
    }

    return entries;
  } catch (error) {
    throw new Error(
      `Unable to inspect ZIP file: ${error.message}`
    );
  }
}

// ─────────────────────────────────────────────
// EXTRACT ZIP
// ─────────────────────────────────────────────

async function extractZip(zipPath, destination) {
  await fs.mkdir(destination, {
    recursive: true
  });

  try {
    await execFileAsync(
      "unzip",
      [
        "-q",
        "-o",
        zipPath,
        "-d",
        destination
      ],
      {
        maxBuffer: 10 * 1024 * 1024
      }
    );
  } catch (error) {
    throw new Error(
      `ZIP extraction failed: ${error.message}`
    );
  }
}

// ─────────────────────────────────────────────
// FIND WEBSITE ROOT
// ─────────────────────────────────────────────

async function findWebsiteRoot(directory) {
  const directIndex = path.join(
    directory,
    "index.html"
  );

  try {
    const stats =
      await fs.stat(directIndex);

    if (stats.isFile()) {
      return directory;
    }
  } catch {
    // Continue searching.
  }

  const entries = await fs.readdir(
    directory,
    {
      withFileTypes: true
    }
  );

  const directories = entries.filter(
    (entry) => entry.isDirectory()
  );

  if (directories.length === 1) {
    const nestedDirectory = path.join(
      directory,
      directories[0].name
    );

    const nestedIndex = path.join(
      nestedDirectory,
      "index.html"
    );

    try {
      const stats =
        await fs.stat(nestedIndex);

      if (stats.isFile()) {
        return nestedDirectory;
      }
    } catch {
      // No index in nested directory.
    }
  }

  return directory;
}

// ─────────────────────────────────────────────
// VALIDATE EXTRACTED PROJECT
// ─────────────────────────────────────────────

async function validateExtractedProject(
  directory
) {
  const size =
    await calculateDirectorySize(directory);

  if (size > MAX_SIZE) {
    throw new Error(
      `Extracted project exceeds ${config.maxFileSizeMB} MB.`
    );
  }

  const files =
    await countFiles(directory);

  if (files === 0) {
    throw new Error(
      "ZIP file does not contain any files."
    );
  }

  const hasIndex =
    await hasIndexFile(directory);

  if (!hasIndex) {
    throw new Error(
      "index.html was not found in the website root."
    );
  }

  return {
    size,
    files
  };
}

// ─────────────────────────────────────────────
// PROCESS PROJECT ZIP
// ─────────────────────────────────────────────

export async function processProjectZip(
  zipPath,
  projectId
) {
  if (!isZipFile(zipPath)) {
    throw new Error(
      "Only ZIP files are supported."
    );
  }

  try {
    const stats =
      await fs.stat(zipPath);

    if (stats.size > MAX_SIZE) {
      throw new Error(
        `ZIP file exceeds ${config.maxFileSizeMB} MB.`
      );
    }
  } catch (error) {
    if (
      error.message.includes("exceeds")
    ) {
      throw error;
    }

    throw new Error(
      "Unable to read uploaded ZIP file."
    );
  }

  const {
    uploadPath,
    sitePath
  } = await createProjectStorage(
    projectId
  );

  const extractPath = path.join(
    uploadPath,
    "extracted"
  );

  try {
    await cleanDirectory(extractPath);
    await cleanDirectory(sitePath);

    // Inspect before extraction.
    await inspectZip(zipPath);

    // Extract ZIP.
    await extractZip(
      zipPath,
      extractPath
    );

    // Detect whether the ZIP contains
    // a single wrapper folder.
    const websiteRoot =
      await findWebsiteRoot(
        extractPath
      );

    // Validate website.
    const info =
      await validateExtractedProject(
        websiteRoot
      );

    // Copy validated website into
    // the actual hosting directory.
    if (websiteRoot !== sitePath) {
      await fs.cp(
        websiteRoot,
        sitePath,
        {
          recursive: true,
          force: true
        }
      );
    }

    return {
      success: true,
      projectId,
      path: sitePath,
      size: info.size,
      files: info.files
    };
  } catch (error) {
    // Clean failed deployment data.
    await cleanDirectory(sitePath);

    throw error;
  }
}

// ─────────────────────────────────────────────
// SAVE TELEGRAM ZIP
// ─────────────────────────────────────────────

export async function saveTelegramZip(
  sourcePath,
  projectId
) {
  const uploadPath =
    getUploadPath(projectId);

  await fs.mkdir(uploadPath, {
    recursive: true
  });

  const destination =
    path.join(
      uploadPath,
      "project.zip"
    );

  await fs.copyFile(
    sourcePath,
    destination
  );

  return destination;
}

// ─────────────────────────────────────────────
// REMOVE ZIP
// ─────────────────────────────────────────────

export async function removeZip(
  projectId
) {
  const uploadPath =
    getUploadPath(projectId);

  const zipPath =
    path.join(
      uploadPath,
      "project.zip"
    );

  await fs.rm(zipPath, {
    force: true
  });
}

// ─────────────────────────────────────────────
// ZIP INFORMATION
// ─────────────────────────────────────────────

export async function getZipInfo(
  zipPath
) {
  try {
    const stats =
      await fs.stat(zipPath);

    return {
      exists: true,
      size: stats.size,
      sizeMB:
        stats.size /
        (1024 * 1024)
    };
  } catch {
    return {
      exists: false,
      size: 0,
      sizeMB: 0
    };
  }
}
