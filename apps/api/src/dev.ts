import { parseArgs } from "node:util";
import { getPlatformProxy } from "wrangler";
import { createApp } from "./api";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    env: { type: "string" },
  },
});

console.log(`Starting dev server with env: ${args.env ?? "dev"}`);

const proxy = await getPlatformProxy<Env>({
  configPath: "../../wrangler.jsonc",
  environment: args.env ?? "dev",
  persist: true,
});

const app = createApp();

export default {
  port: 8787,
  fetch: (req: Request) => {
    // Merge proxy env with any local process.env overrides if needed
    // For now, proxy.env should suffice as it loads .dev.vars
    return app.fetch(req, proxy.env);
  },
};
