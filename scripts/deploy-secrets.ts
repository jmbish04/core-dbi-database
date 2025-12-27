import { exec } from "child_process";
import { existsSync } from "fs";
import { readdir, readFile, unlink, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

async function main() {
  const rootDir = resolve(__dirname, "..");
  const appsDir = join(rootDir, "apps");
  const devVarsPath = join(rootDir, ".dev.vars");

  console.log("📝 Reading .dev.vars from:", devVarsPath);

  if (!existsSync(devVarsPath)) {
    console.error("❌ .dev.vars file not found in root.");
    process.exit(1);
  }

  const devVarsContent = await readFile(devVarsPath, "utf-8");
  const secrets: Record<string, string> = {};

  for (const line of devVarsContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse KEY=VALUE
    // Matches KEY="VALUE", KEY='VALUE', or KEY=VALUE
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      secrets[key] = value;
    }
  }

  const secretCount = Object.keys(secrets).length;
  console.log(`🔑 Found ${secretCount} secrets to deploy.`);

  if (secretCount === 0) {
    console.log("⚠️ No secrets found to deploy.");
    return;
  }

  const folders = await readdir(appsDir, { withFileTypes: true });

  for (const dirent of folders) {
    if (!dirent.isDirectory()) continue;
    const appPath = join(appsDir, dirent.name);

    // Check for wrangler config
    const hasToml = existsSync(join(appPath, "wrangler.toml"));
    const hasJsonc = existsSync(join(appPath, "wrangler.jsonc"));

    if (hasToml || hasJsonc) {
      console.log(`\n🚀 Deploying secrets to app: ${dirent.name}...`);
      const tempJsonPath = join(appPath, "temp_secrets.json");

      try {
        // Write secrets as JSON for wrangler
        await writeFile(tempJsonPath, JSON.stringify(secrets, null, 2));

        // Execute wrangler secret bulk
        // Using 'bun run' to ensure we use local project dep if available, or npx fallback logic if handled by shell
        // Since package.json has "wrangler", 'bun wrangler' works.
        const { stdout, stderr } = await execAsync(
          `bun wrangler secret bulk temp_secrets.json`,
          { cwd: appPath },
        );

        if (stdout) console.log(stdout.trim());
        if (stderr) console.error(stderr.trim());

        console.log(`✅ Success: ${dirent.name}`);
      } catch (e: any) {
        console.error(`❌ Failed to deploy to ${dirent.name}:`);
        console.error(e.message);
      } finally {
        // Cleanup
        if (existsSync(tempJsonPath)) {
          await unlink(tempJsonPath);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
