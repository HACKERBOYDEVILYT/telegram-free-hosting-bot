import "dotenv/config";

const config = {
  botToken: process.env.BOT_TOKEN,

  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),

  maxFileSizeMB: Number(process.env.MAX_FILE_SIZE_MB || 50),

  storageDir: "storage",
  uploadsDir: "storage/uploads",
  sitesDir: "storage/sites"
};

if (!config.botToken) {
  console.error("❌ BOT_TOKEN is missing!");
  console.error("Please add BOT_TOKEN to your environment variables.");
  process.exit(1);
}

export default config;
