Of course\! Here are the updated prompts for the r2data, api, and app applications, incorporating your repository's structure and the colby CLI ecosystem.

### **1\. Prompt for apps/r2data (The Data Lake)**

This prompt instructs the agent to create the apps/r2data application within the jmbish04/core-dbi-database monorepo.  
**Copy/Paste into Agent for apps/r2data:**

Markdown

\# Role  
Act as a Senior Backend Engineer and Cloudflare Architect.

\# Context  
You are working within the \`jmbish04/core-dbi-database\` Turborepo monorepo.  
Existing apps: \`apps/api\` (Hono/D1/Better Auth), \`apps/app\` (React/Astro Frontend).  
The user utilizes a custom \`colby\` CLI ecosystem for service management.  
\*\*Goal:\*\* Create a NEW application \`apps/r2data\` to serve as a Data Lakehouse for San Francisco DBI data.

\# Objective  
Scaffold and implement \`apps/r2data\`, a Cloudflare Worker that ingests data from SFGov SODA APIs, flattens it, and streams it into an R2 Data Catalog (Apache Iceberg) via Cloudflare Pipelines.

\# Requirements

\#\# 1\. Scaffold \`apps/r2data\`  
\- Create a new directory: \`apps/r2data\`.  
\- Initialize a Cloudflare Worker using Hono (reference \`apps/api\` for structure, but keep independent).  
\- \*\*Dependencies:\*\* \`hono\`, \`@cloudflare/workers-types\`, \`zod\`.  
\- \*\*Wrangler Config (\`wrangler.jsonc\`):\*\*  
    \- Name: \`dbi-r2-data-service\`  
    \- R2 Bucket Binding: \`SF\_DBI\_LAKE\`  
    \- Pipeline Binding: \`PERMITS\_PIPELINE\`  
    \- Service Binding: Allow \`apps/api\` to call this worker.

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
        \- \*Integration Point:\* Implement a placeholder \`normalizeContractor(name)\` function. In the future, this will call \`apps/api\` or a shared library.  
    \- \*\*Pipeline Push:\*\*  
        \- Send the flattened, normalized JSON array to the \`PERMITS\_PIPELINE\` binding.

\#\# 4\. Setup Script (\`setup.sh\`)  
\- Create a script to automate resource creation using \`wrangler\`.  
    \- \`npx wrangler r2 bucket create SF\_DBI\_LAKE\`  
    \- \`npx wrangler r2 bucket catalog enable SF\_DBI\_LAKE\`  
    \- \`npx wrangler pipelines create ...\` (include schema reference)

\# Constraints  
\- Use TypeScript.  
\- Follow the repo's ESLint/Prettier rules (see \`.editorconfig\` and \`eslint.config.ts\`).  
\- Ensure compatibility with \`colby\` CLI (e.g., standard \`package.json\` scripts: \`dev\`, \`build\`, \`deploy\`).

\# Output  
\- \`apps/r2data/package.json\`  
\- \`apps/r2data/wrangler.jsonc\`  
\- \`apps/r2data/src/index.ts\`  
\- \`apps/r2data/schemas/permits\_flat.json\`  
\- \`apps/r2data/setup.sh\`

### ---

**2\. Prompt for apps/api (The API Layer)**

This prompt instructs the agent to enhance the *existing* apps/api application.  
**Copy/Paste into Agent for apps/api:**

Markdown

\# Role  
Act as a Senior Backend Engineer.

\# Context  
You are working in the existing \`apps/api\` directory of the \`jmbish04/core-dbi-database\` repo.  
This is a Hono \+ D1 \+ Better Auth application.

\# Objective  
Enhance \`apps/api\` to serve as the "Interactive Search" layer for SF DBI data. It needs to expose endpoints for searching permits, handle AI normalization requests, and query the R2 Data Lake for analytics.

\# Implementation Tasks

\#\# 1\. D1 Schema Update (\`db/schema\`)  
\- Create a new schema file: \`db/schema/permits.ts\`.  
\- Define a table \`search\_cache\` (or \`recent\_permits\`) for fast retrieval.  
    \- Fields: \`permit\_number\` (PK), \`contractor\_name\`, \`normalized\_contractor\_id\`, \`address\`, \`issue\_date\`, \`blob\_data\` (JSON).  
    \- Ensure compatibility with Drizzle ORM (\`drizzle-orm/sqlite-core\`).  
\- Generate migrations (\`npm run db:generate\`).

\#\# 2\. New Router: \`routers/dbi.ts\`  
\- Create a new tRPC router for DBI operations.  
\- \*\*Endpoint: \`searchPermits\`\*\*  
    \- Input: Query string (e.g., "Plumbing Turner Mission").  
    \- Logic:  
        1\. (Optional) Call AI helper to parse intent.  
        2\. Check D1 \`search\_cache\`.  
        3\. If miss, fetch from SODA API, normalize, cache in D1, and return.  
\- \*\*Endpoint: \`normalizeEntity\`\*\*  
    \- Input: Raw string.  
    \- Logic: Uses Cloudflare Workers AI (@cf/meta/llama-3-8b-instruct) to return a canonical ID.  
\- \*\*Endpoint: \`getAnalytics\`\*\*  
    \- Input: SQL Query string (or structured filters).  
    \- Logic: Execute SQL against the \*\*R2 Data Catalog\*\* (using the R2 SQL API/Binding).  
    \- \*Constraint:\* Ensure queries do NOT use JOINs.

\#\# 3\. R2 SQL Integration (\`wrangler.jsonc\`)  
\- Update \`apps/api/wrangler.jsonc\`:  
    \- Add binding to the R2 Bucket/Catalog (\`SF\_DBI\_LAKE\`).  
    \- Add permission/binding to execute R2 SQL queries.

\#\# 4\. Register Router  
\- Update \`apps/api/src/index.ts\` (or main router file) to include the \`dbi\` router.

\# Constraints  
\- Follow existing patterns in \`lib/db.ts\` and \`lib/trpc.ts\`.  
\- Ensure new endpoints are protected by Auth middleware where appropriate.  
\- Adhere to project linting rules.

\# Output  
\- \`db/schema/permits.ts\`  
\- \`apps/api/src/routers/dbi.ts\`  
\- Updated \`apps/api/wrangler.jsonc\`  
\- Updated \`apps/api/src/index.ts\`

### ---

**3\. Prompt for apps/app (The Frontend)**

This prompt instructs the agent to build the UI within the existing apps/app React application.  
**Copy/Paste into Agent for apps/app:**

Markdown

\# Role  
Act as a Senior Frontend Engineer.

\# Context  
You are working in the existing \`apps/app\` directory of the \`jmbish04/core-dbi-database\` repo.  
This is a React application using Shadcn UI, served via Astro/Vite.

\# Objective  
Build the "SF DBI Intelligence Platform" Dashboard. This UI allows users to search permits interactively and view analytics from the Data Lake.

\# Implementation Tasks

\#\# 1\. New Page: \`routes/(app)/dbi/search.tsx\`  
\- \*\*Layout:\*\* Use the existing \`BaseLayout\` or \`DashboardLayout\`.  
\- \*\*UI Components (Shadcn):\*\*  
    \- \`Input\` for the natural language search bar.  
    \- \`Card\` to display Permit details.  
    \- \`Table\` to list results.  
    \- \`Badge\` for Status/Permit Type.  
\- \*\*Logic:\*\*  
    \- Connect to the \`dbi.searchPermits\` tRPC endpoint (from \`apps/api\`).  
    \- Display results in a responsive grid or table.  
    \- Show a "Confidence Score" for AI-normalized contractor names (if available).

\#\# 2\. New Page: \`routes/(app)/dbi/analytics.tsx\`  
\- \*\*Objective:\*\* Visualize R2 Data Lake trends.  
\- \*\*UI Components:\*\*  
    \- Use a charting library (e.g., Recharts or Chart.js) to show "Cost vs. Time" or "Permits per Neighborhood".  
    \- \`Textarea\` for "Natural Language SQL Builder" (user asks "Show me top contractors", AI generates SQL).  
\- \*\*Logic:\*\*  
    \- Connect to \`dbi.getAnalytics\` tRPC endpoint.  
    \- Handle loading states (R2 SQL queries may take a few seconds).

\#\# 3\. Navigation Update  
\- Update \`components/layout/sidebar-nav.tsx\` to include a new "DBI Intelligence" section with links to Search and Analytics.

\# Constraints  
\- Use existing Tailwind CSS styling (\`tailwind.config.css\`).  
\- Use existing tRPC client hooks (\`lib/trpc.ts\`).  
\- Ensure mobile responsiveness.  
\- Follow \`apps/app/components.json\` for Shadcn component usage.

\# Output  
\- \`apps/app/routes/(app)/dbi/search.tsx\`  
\- \`apps/app/routes/(app)/dbi/analytics.tsx\`  
\- Updated \`apps/app/components/layout/sidebar-nav.tsx\`  
