I understand your request. You want to adjust the prompt for a coding agent to utilize the provided core-dbi-database repository as a foundation. Specifically, you want to:

1. **Introduce a new apps/r2data application:** This will house the R2 Data Catalog service (the "Data Lake" component).  
2. **Leverage apps/api:** This existing application in the repo will serve as the API layer (the "Interactive Search" component, using Workers \+ D1).  
3. **Leverage apps/app:** This existing application in the repo will be the Shadcn/React frontend.  
4. **Create 3 distinct prompts:** One for each application (apps/r2data, apps/api, apps/app) to instruct an agent on how to build them out using the repository's framework.

Here is the updated plan and the prompts.

### **Repo Structure Context**

The provided repo jmbish04/core-dbi-database is a Turborepo monorepo with the following relevant structure:

* **apps/api**: A Hono-based Cloudflare Worker. It already has D1, Auth (Better Auth), and tRPC set up.  
* **apps/app**: A React (likely Vite/Astro based on files) frontend using Shadcn UI.  
* **db**: Drizzle ORM schemas and migration scripts for D1.  
* **packages/core**: Shared business logic (currently minimal).

We will add **apps/r2data** (a Cloudflare Worker with Pipelines) to this structure.

### ---

**1\. Prompt for apps/r2data (The Data Lake)**

This prompt instructs the agent to create a new Cloudflare Worker application within the monorepo dedicated to data ingestion and R2 storage.  
**Copy/Paste into Agent for apps/r2data:**

Markdown

\# Role  
Act as a Senior Backend Engineer and Cloudflare Architect.

\# Context  
You are working within a Turborepo monorepo (\`core-dbi-database\`).  
Existing apps: \`apps/api\` (Hono/D1/Auth), \`apps/app\` (React Frontend).  
\*\*Goal:\*\* Create a NEW application \`apps/r2data\` to serve as a Data Lakehouse for San Francisco DBI data.

\# Objective  
Scaffold and implement \`apps/r2data\`, a Cloudflare Worker that ingests data from SFGov SODA APIs, flattens it, and streams it into an R2 Data Catalog (Apache Iceberg) via Cloudflare Pipelines.

\# Requirements

\#\# 1\. Scaffold \`apps/r2data\`  
\- Create a new directory: \`apps/r2data\`.  
\- Initialize a Cloudflare Worker using Hono (copy structure from \`apps/api\` where applicable, but keep it independent).  
\- \*\*Dependencies:\*\* \`hono\`, \`@cloudflare/workers-types\`, \`zod\`.  
\- \*\*Wrangler Config (\`wrangler.jsonc\`):\*\*  
    \- Name: \`dbi-r2-data-service\`  
    \- R2 Bucket Binding: \`SF\_DBI\_LAKE\`  
    \- Pipeline Binding: \`PERMITS\_PIPELINE\`  
    \- Service Binding: Allow \`apps/api\` to call this worker (if needed for analytics).

\#\# 2\. R2 & Pipelines Configuration  
\- Define the schema for the Iceberg table. Create a file \`schemas/permits\_flat.json\`.  
\- \*\*Schema Fields (Must be Flat):\*\*  
    \- \`permit\_number\` (string)  
    \- \`permit\_type\` (string)  
    \- \`cost\` (double)  
    \- \`status\` (string)  
    \- \`contractor\_name\_raw\` (string)  
    \- \`contractor\_normalized\` (string) \- \*Populated by AI\*  
    \- \`street\_name\` (string)  
    \- \`street\_number\` (string)  
    \- \`zip\_code\` (string)  
    \- \`issue\_date\` (timestamp)  
    \- \`ingested\_at\` (timestamp)

\#\# 3\. Ingestion Worker Logic (\`worker.ts\`)  
\- \*\*Scheduled Handler (Cron):\*\*  
    \- Runs daily (or specific cron schedule).  
    \- Fetches "yesterday's" permits from SODA API: \`https://data.sfgov.org/resource/i98e-djp9.json\`.  
    \- \*\*Normalization (Crucial):\*\*  
        \- Flatten nested JSON objects.  
        \- \*Integration Point:\* Ideally, this worker calls \`apps/api\` (via Service Binding) to access the shared AI logic for contractor normalization, OR implements a lightweight version locally if shared logic isn't ready. For now, implement a placeholder \`normalizeContractor(name)\` function.  
    \- \*\*Pipeline Push:\*\*  
        \- Send the flattened, normalized JSON array to the \`PERMITS\_PIPELINE\` binding.

\#\# 4\. Setup Script  
\- Create a \`setup.sh\` script to:  
    \- Create the R2 bucket (\`npx wrangler r2 bucket create ...\`).  
    \- Enable R2 Data Catalog.  
    \- Create the Pipeline (\`npx wrangler pipelines create ...\`).

\# Constraints  
\- Use TypeScript.  
\- Follow the repo's ESLint/Prettier rules.  
\- Do NOT add a database (D1) to this worker; it is purely for R2/Lakehouse operations.

\# Output  
\- \`apps/r2data/package.json\`  
\- \`apps/r2data/wrangler.jsonc\`  
\- \`apps/r2data/src/index.ts\` (Worker entry point)  
\- \`apps/r2data/schemas/permits\_flat.json\`

### ---

**2\. Prompt for apps/api (The API Layer)**

This prompt instructs the agent to modify the *existing* apps/api to handle user-facing search, D1 caching, and R2 SQL querying.  
**Copy/Paste into Agent for apps/api:**

Markdown

\# Role  
Act as a Senior Backend Engineer.

\# Context  
You are working in the existing \`apps/api\` directory of the \`core-dbi-database\` repo.  
This is a Hono \+ D1 \+ Better Auth application.

\# Objective  
Enhance \`apps/api\` to serve as the "Interactive Search" layer for SF DBI data. It needs to expose endpoints for searching permits, handle AI normalization requests, and query the R2 Data Lake for analytics.

\# Implementation Tasks

\#\# 1\. D1 Schema Update (\`db/schema\`)  
\- Add a new schema file: \`db/schema/permits.ts\`.  
\- Define a table \`search\_cache\` or \`recent\_permits\` for fast, hot storage.  
    \- Fields: \`permit\_number\` (PK), \`contractor\_name\`, \`normalized\_contractor\_id\`, \`address\`, \`issue\_date\`, \`blob\_data\` (JSON).  
\- Run \`npm run db:generate\` to create migrations.

\#\# 2\. New Router: \`routers/dbi.ts\`  
\- Create a tRPC router (or REST endpoints using Hono) for DBI operations.  
\- \*\*Endpoint: \`searchPermits\`\*\*  
    \- Input: Query string (e.g., "Plumbing Turner Mission").  
    \- Logic:  
        1\. Call internal AI helper (see below) to parse intent.  
        2\. Check D1 \`search\_cache\`.  
        3\. If miss, fetch from SODA API, normalize, cache in D1, and return.  
\- \*\*Endpoint: \`normalizeEntity\`\*\*  
    \- Input: Raw string.  
    \- Logic: Uses Cloudflare Workers AI (@cf/meta/llama-3-8b-instruct) to return a canonical ID.  
\- \*\*Endpoint: \`getAnalytics\`\*\*  
    \- Input: SQL Query string (or structured filters).  
    \- Logic: Execute SQL against the \*\*R2 Data Catalog\*\* (using the R2 SQL API/Binding). \*Note: Ensure queries do NOT use JOINs.\*

\#\# 3\. R2 SQL Integration  
\- Update \`apps/api/wrangler.jsonc\`:  
    \- Add binding to the R2 Bucket/Catalog created in \`apps/r2data\`.  
    \- Add permission to execute R2 SQL.

\#\# 4\. Shared Logic  
\- Ensure the AI normalization logic is reusable.

\# Constraints  
\- Use the existing \`lib/db.ts\` and \`lib/trpc.ts\` patterns.  
\- Ensure all new endpoints are protected by the existing Auth middleware where appropriate (or public if designed for open search).

\# Output  
\- \`db/schema/permits.ts\`  
\- \`apps/api/src/routers/dbi.ts\`  
\- Updated \`apps/api/wrangler.jsonc\`  
\- Updated \`apps/api/src/index.ts\` (to register the new router)

### ---

**3\. Prompt for apps/app (The Frontend)**

This prompt instructs the agent to build the UI within the existing React/Astro/Vite application.  
**Copy/Paste into Agent for apps/app:**

Markdown

\# Role  
Act as a Senior Frontend Engineer.

\# Context  
You are working in the existing \`apps/app\` directory. This is a React application using Shadcn UI, likely served via Astro or Vite.

\# Objective  
Build the "SF DBI Intelligence Platform" Dashboard. This UI will allow users to search permits interactively and view analytics from the Data Lake.

\# Implementation Tasks

\#\# 1\. New Page: \`routes/(app)/dbi/search.tsx\`  
\- \*\*Layout:\*\* Use the existing \`DashboardLayout\` or \`BaseLayout\`.  
\- \*\*UI Components (Shadcn):\*\*  
    \- \`Input\` for the natural language search bar.  
    \- \`Card\` to display Permit details.  
    \- \`Table\` to list results.  
    \- \`Badge\` for Status/Permit Type.  
\- \*\*Logic:\*\*  
    \- Connect to the \`dbi.searchPermits\` tRPC endpoint (from \`apps/api\`).  
    \- Display results in a responsive grid or table.  
    \- Show a "Confidence Score" for AI-normalized contractor names.

\#\# 2\. New Page: \`routes/(app)/dbi/analytics.tsx\`  
\- \*\*Objective:\*\* Visualize R2 Data Lake trends.  
\- \*\*UI Components:\*\*  
    \- Use a charting library (e.g., Recharts or Chart.js) to show "Cost vs. Time" or "Permits per Neighborhood".  
    \- \`Textarea\` for "Natural Language SQL Builder" (a feature where users ask "Show me top contractors" and AI generates the SQL).  
\- \*\*Logic:\*\*  
    \- Connect to \`dbi.getAnalytics\` tRPC endpoint.  
    \- Handle loading states (R2 SQL might take seconds).

\#\# 3\. Navigation  
\- Update \`components/layout/sidebar-nav.tsx\` to include the new "DBI Intelligence" section links.

\# Constraints  
\- Use existing Tailwind CSS styling.  
\- Use existing tRPC client hooks (\`lib/trpc.ts\`).  
\- Ensure mobile responsiveness.

\# Output  
\- \`apps/app/routes/(app)/dbi/search.tsx\`  
\- \`apps/app/routes/(app)/dbi/analytics.tsx\`  
\- Updated \`apps/app/components/layout/sidebar-nav.tsx\`  
