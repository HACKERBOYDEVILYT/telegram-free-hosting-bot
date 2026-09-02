import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const CLOUDFLARE_API =
  "https://api.cloudflare.com/client/v4";

function getCloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID is missing from environment variables."
    );
  }

  if (!apiToken) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN is missing from environment variables."
    );
  }

  return {
    accountId,
    apiToken
  };
}

/**
 * Create a safe Cloudflare Pages project name.
 *
 * Cloudflare project names should be lowercase and URL-friendly.
 */
export function createCloudflareProjectName(name, projectId = "") {
  const base = String(name || "site")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  const suffix = String(projectId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(-8);

  let result = base || "site";

  if (suffix) {
    result = `${result}-${suffix}`;
  }

  return result.slice(0, 63);
}

/**
 * Make a Cloudflare API request.
 */
async function cloudflareRequest(endpoint, options = {}) {
  const { accountId, apiToken } = getCloudflareConfig();

  const response = await fetch(
    `${CLOUDFLARE_API}/accounts/${accountId}${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Cloudflare returned an invalid response (${response.status}).`
    );
  }

  if (!response.ok || data.success === false) {
    const message =
      data?.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(", ") ||
      `Cloudflare API request failed (${response.status}).`;

    throw new Error(message);
  }

  return data;
}

/**
 * Check whether a Pages project already exists.
 */
export async function getCloudflareProject(projectName) {
  try {
    const data = await cloudflareRequest(
      `/pages/projects/${encodeURIComponent(projectName)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return data.result || null;
  } catch (error) {
    if (
      error.message.includes("404") ||
      error.message.toLowerCase().includes("not found")
    ) {
      return null;
    }

    return null;
  }
}

/**
 * Create a new Cloudflare Pages project.
 */
export async function createCloudflareProject(projectName) {
  if (!projectName) {
    throw new Error("Cloudflare project name is required.");
  }

  const existing = await getCloudflareProject(projectName);

  if (existing) {
    return existing;
  }

  const data = await cloudflareRequest("/pages/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      production_branch: "main"
    })
  });

  return data.result;
}

/**
 * Ensure that a Cloudflare Pages project exists.
 */
export async function ensureCloudflareProject(projectName) {
  const project = await createCloudflareProject(projectName);

  if (!project) {
    throw new Error(
      `Unable to create Cloudflare Pages project: ${projectName}`
    );
  }

  return project;
}

/**
 * Deploy a static website directory to Cloudflare Pages.
 *
 * Wrangler is used for the actual asset upload because Cloudflare's
 * official Direct Upload workflow supports:
 *
 * npx wrangler pages deploy <directory>
 */
export async function deployToCloudflare({
  sitePath,
  projectName,
  branch = "main"
}) {
  if (!sitePath) {
    throw new Error("sitePath is required.");
  }

  if (!projectName) {
    throw new Error("projectName is required.");
  }

  const absoluteSitePath = path.resolve(sitePath);

  try {
    const stat = await fs.stat(absoluteSitePath);

    if (!stat.isDirectory()) {
      throw new Error(
        `Deployment path is not a directory: ${absoluteSitePath}`
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Deployment directory does not exist: ${absoluteSitePath}`
      );
    }

    throw error;
  }

  const { accountId, apiToken } = getCloudflareConfig();

  await ensureCloudflareProject(projectName);

  console.log(
    `☁️ Deploying "${projectName}" to Cloudflare Pages...`
  );

  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync(
      "npx",
      [
        "wrangler",
        "pages",
        "deploy",
        absoluteSitePath,
        `--project-name=${projectName}`,
        `--branch=${branch}`,
        "--commit-dirty=true"
      ],
      {
        env: {
          ...process.env,

          CLOUDFLARE_ACCOUNT_ID: accountId,
          CLOUDFLARE_API_TOKEN: apiToken,

          // Prevent Wrangler from trying to open an interactive login.
          CI: "true"
        },

        maxBuffer: 20 * 1024 * 1024
      }
    );

    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (error) {
    stdout = error.stdout || "";
    stderr = error.stderr || "";

    const combinedOutput =
      `${stdout}\n${stderr}\n${error.message || ""}`.trim();

    throw new Error(
      `Cloudflare deployment failed.\n\n${combinedOutput}`
    );
  }

  const deploymentUrl = extractDeploymentUrl(
    `${stdout}\n${stderr}`,
    projectName
  );

  if (!deploymentUrl) {
    throw new Error(
      "Cloudflare deployment completed, but the deployment URL could not be detected."
    );
  }

  console.log(`✅ Deployment successful: ${deploymentUrl}`);

  return {
    success: true,
    projectName,
    branch,
    url: deploymentUrl,
    output: stdout
  };
}

/**
 * Extract a pages.dev URL from Wrangler output.
 */
function extractDeploymentUrl(output, projectName) {
  if (!output) {
    return `https://${projectName}.pages.dev`;
  }

  const urls = output.match(
    /https:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.pages\.dev[^\s"'<>)]*/g
  );

  if (urls?.length) {
    return urls[urls.length - 1].replace(/[),.;]+$/, "");
  }

  // Production URL fallback.
  return `https://${projectName}.pages.dev`;
}

/**
 * Test Cloudflare credentials.
 */
export async function testCloudflareConnection() {
  try {
    const { accountId, apiToken } = getCloudflareConfig();

    const response = await fetch(
      `${CLOUDFLARE_API}/accounts/${accountId}/pages/projects?per_page=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiToken}`
        }
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        message: "Cloudflare returned an invalid response."
      };
    }

    if (!response.ok || data.success === false) {
      const message =
        data?.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join(", ") ||
        `Cloudflare API returned HTTP ${response.status}.`;

      return {
        success: false,
        message
      };
    }

    return {
      success: true,
      message: "Cloudflare connection successful."
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Delete a Cloudflare Pages project.
 */
export async function deleteCloudflareProject(projectName) {
  if (!projectName) {
    throw new Error("projectName is required.");
  }

  const data = await cloudflareRequest(
    `/pages/projects/${encodeURIComponent(projectName)}`,
    {
      method: "DELETE"
    }
  );

  return {
    success: data.success !== false,
    result: data.result || null
  };
}

export default {
  createCloudflareProjectName,
  getCloudflareProject,
  createCloudflareProject,
  ensureCloudflareProject,
  deployToCloudflare,
  testCloudflareConnection,
  deleteCloudflareProject
};
