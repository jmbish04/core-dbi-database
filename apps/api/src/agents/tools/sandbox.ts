import { getSandbox } from "@cloudflare/sandbox";
import { BaseTool, z } from "./base";

export class ContainerInitializeTool extends BaseTool<
  { name?: string },
  string
> {
  name = "container_initialize";
  description =
    "(Re)start a container. Containers are intended to be ephemeral and don't save any state. Containers are only guaranteed to last ~10m.";
  schema = z.object({
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { name?: string }) {
    const name = args.name || "default";
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    // "Warming up" the container
    await sandbox.exec("echo 'Container Initialized'");
    return `Container '${name}' initialized and ready.`;
  }
}

export class ContainerPingTool extends BaseTool<{ name?: string }, string> {
  name = "container_ping";
  description = "Ping a container for connectivity";
  schema = z.object({
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { name?: string }) {
    const name = args.name || "default";
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    try {
      const res = await sandbox.exec("echo 'pong'");
      return res.exitCode === 0 ? "pong" : "ping failed";
    } catch (e) {
      return `Ping failed: ${String(e)}`;
    }
  }
}

export class ContainerExecTool extends BaseTool<
  { command: string; name?: string },
  string
> {
  name = "container_exec";
  description = "Run a command in the shell";
  schema = z.object({
    command: z.string().describe("The command to execute"),
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { command: string; name?: string }) {
    const { command, name = "default" } = args;
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    const result = await sandbox.exec(command);
    return `Exit Code: ${result.exitCode}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`;
  }
}

export class ContainerFileWriteTool extends BaseTool<
  { path: string; content: string; name?: string },
  string
> {
  name = "container_file_write";
  description = "Write to a file";
  schema = z.object({
    path: z.string().describe("File path to write to"),
    content: z.string().describe("Content to write"),
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { path: string; content: string; name?: string }) {
    const { path, content, name = "default" } = args;
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    // Using a safe heredoc approach for simple content
    const cmd = `cat <<EOF > ${path}
${content}
EOF`;
    const result = await sandbox.exec(cmd);
    if (result.exitCode !== 0) {
      return `Failed to write file: ${result.stderr}`;
    }
    return `Successfully wrote to ${path}`;
  }
}

export class ContainerFileReadTool extends BaseTool<
  { path: string; name?: string },
  string
> {
  name = "container_file_read";
  description = "Read the contents of a single file or directory";
  schema = z.object({
    path: z.string().describe("Path to read"),
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { path: string; name?: string }) {
    const { path, name = "default" } = args;
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    const result = await sandbox.exec(`cat ${path}`);
    if (result.exitCode !== 0) {
      // Try listing if it's a directory
      const lsResult = await sandbox.exec(`ls -la ${path}`);
      if (lsResult.exitCode === 0) {
        return `Directory Listing for ${path}:\n${lsResult.stdout}`;
      }
      return `Failed to read ${path}: ${result.stderr}`;
    }
    return result.stdout;
  }
}

export class ContainerFilesListTool extends BaseTool<
  { path?: string; name?: string },
  string
> {
  name = "container_files_list";
  description = "List all files in the work directory or specified path";
  schema = z.object({
    path: z.string().optional().default(".").describe("Path to list"),
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { path?: string; name?: string }) {
    const { path = ".", name = "default" } = args;
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    const result = await sandbox.exec(`ls -la ${path}`);
    if (result.exitCode !== 0) {
      return `Failed to list files: ${result.stderr}`;
    }
    return result.stdout;
  }
}

export class ContainerFileDeleteTool extends BaseTool<
  { path: string; name?: string },
  string
> {
  name = "container_file_delete";
  description = "Delete a single file or directory";
  schema = z.object({
    path: z.string().describe("Path to delete"),
    name: z
      .string()
      .optional()
      .default("default")
      .describe("Name of the container/session"),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: { path: string; name?: string }) {
    const { path, name = "default" } = args;
    const sandbox = getSandbox(this.env.SANDBOX as any, name);
    const result = await sandbox.exec(`rm -rf ${path}`);
    if (result.exitCode !== 0) {
      return `Failed to delete ${path}: ${result.stderr}`;
    }
    return `Successfully deleted ${path}`;
  }
}

export async function mountR2ForSandbox(env: Env, sandboxName: string) {
  const sandbox = getSandbox(env.SANDBOX, sandboxName);

  // Mount R2 bucket to /r2 inside the container
  // Mount R2 bucket to /r2 inside the container
  // @ts-ignore - mountBucket not yet typed in @cloudflare/sandbox or requires update
  /*
  await sandbox.mountBucket(env.SANDBOX_BUCKET_NAME, "/r2", {
    endpoint: env.R2_ENDPOINT_URL,
    provider: "r2",
    // optional tuning knobs passed to s3fs-fuse
    s3fsOptions: {
      use_cache: "/tmp/r2cache",
      // add others as needed (be conservative; each option affects behavior)
    },
  });
  */

  return sandbox;
}

export class RunPythonScriptTool extends BaseTool {
  name = "run_python_script";
  description =
    "Execute a Python script from the container's /workspace/scripts directory.";

  schema = z.object({
    scriptPath: z
      .string()
      .describe(
        "Relative path to the script inside /workspace/scripts (e.g., 'permit/addenda.py').",
      ),
    args: z
      .array(z.string())
      .optional()
      .default([])
      .describe("List of command-line arguments to pass to the script."),
    sandboxId: z
      .string()
      .optional()
      .describe(
        "Optional ID for the sandbox session. Defaults to 'shared-agent-toolbox'.",
      ),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: {
    scriptPath: string;
    args: string[];
    sandboxId?: string;
  }) {
    const {
      scriptPath,
      args: scriptArgs,
      sandboxId = "shared-agent-toolbox",
    } = args;
    const sb = getSandbox(this.env.SANDBOX, sandboxId);

    // Sanitize path to ensure it's within /workspace/scripts
    const safePath = scriptPath.replace(/^\/+/, "").replace(/\.\./g, "");
    const fullPath = `/workspace/scripts/${safePath}`;

    const cmd = ["python", fullPath, ...scriptArgs];

    this.traceTool &&
      (await this.traceTool("debug", `Executing command: ${cmd}`, {
        actionType: "TOOL_CALL",
      }));

    const result = await sb.exec(["python", fullPath, ...scriptArgs].join(" "));

    // Return structured output including exit code
    if (result.exitCode !== 0) {
      throw new Error(
        `Script failed (Exit ${result.exitCode}):\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`,
      );
    }

    return result.stdout;
  }
}

export class RunNotebookTool extends BaseTool {
  name = "run_notebook";
  description =
    "Execute a Jupyter notebook using nbconvert and return the output.";

  schema = z.object({
    notebookPath: z
      .string()
      .describe(
        "Relative path to the notebook inside /workspace/notebooks (e.g., 'analysis/data.ipynb').",
      ),
    parameters: z
      .record(z.any())
      .optional()
      .describe(
        "Optional dictionary of parameters to inject (papotermill style) - NOT YET IMPLEMENTED, runs as-is.",
      ),
    sandboxId: z
      .string()
      .optional()
      .describe(
        "Optional ID for the sandbox session. Defaults to 'shared-agent-toolbox'.",
      ),
  });

  constructor(private env: Env) {
    super();
  }

  public async execute(args: {
    notebookPath: string;
    parameters?: Record<string, any>;
    sandboxId?: string;
  }) {
    const { notebookPath, sandboxId = "shared-agent-toolbox" } = args;
    const sb = getSandbox(this.env.SANDBOX, sandboxId);

    // Sanitize path
    const safePath = notebookPath.replace(/^\/+/, "").replace(/\.\./g, "");
    const fullPath = `/workspace/notebooks/${safePath}`;

    // Execute using nbconvert to run in place or to stdout
    // We'll use --to stdout --execute to run and capture text output
    // Note: Capturing complex notebook output in text is lossy, but good for logs.

    const cmd = "jupyter";
    const cmdArgs = [
      "nbconvert",
      "--to",
      "markdown",
      "--execute",
      "--stdout",
      fullPath,
    ];

    const result = await sb.exec([cmd, ...cmdArgs].join(" "));

    if (result.exitCode !== 0) {
      throw new Error(
        `Notebook execution failed (Exit ${result.exitCode}):\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`,
      );
    }

    return result.stdout;
  }
}
