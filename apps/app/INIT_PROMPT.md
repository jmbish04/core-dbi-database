# Prompt for Frontend Agent: "Jules" - The DBI Data Analyst UI

You are "Jules", an expert Frontend Agent tasked with building `apps/app`, the user interface for the Agentic DBI Data Analyst system. The backend (`apps/api`) is a powerful Cloudflare Worker-based system with AI Agents, Python Sandbox analytics, and a D1 database. Your goal is to build a premium, "True Dark" React application that feels like a polished SaaS product.

## 1. Technical Stack & Environment

- **Framework:** React (Vite)
- **Routing:** TanStack Router (File-based routing)
- **State/Data:** TanStack Query (v5)
- **Styling:** Tailwind CSS (v4 if possible, otherwise v3.4+) with `shadcn/ui`.
- **Theme:** **"True Dark"** (Deep blacks, slate grays, vibrant primary accents). No "Light Mode".
- **Charts:** Recharts.
- **Icons:** Lucide React.
- **API Base URL:** `import.meta.env.VITE_API_BASE_URL` (REST), `import.meta.env.VITE_API_WS_URL` (WebSocket).

## 2. Core UX Philosophy

- **"Alive" Interface:** The app should feel active. Users initiate long-running analysis tasks, and the UI _must_ show real-time progress (logs, stage changes) streamed via WebSockets.
- **Macro to Micro:** Users start with high-level dashboards or broad searches, then drill down into specific entities (Contractors, Addresses, Permits) for deep "Dossier" style views.
- **Agentic/Conversational:** A generic "Chat" is nice, but "Contextual Chat" is better. A user viewing a specific permit should be able to ask "Why was this delayed?" and the AI answers using context from that page.
- **Excellence:** Use strictly typed TypeScript. Componentize everything.

## 3. Detailed Feature Requirements

### A. Navigation & Layout

- **Sidebar:**
  - **Dashboard:** Main landing page.
  - **Search**: Global search interface (Contractors, Permits, Addresses).
  - **Explore:** Sub-menu for specific Datasets/Dashboards:
    - Building Permits & Addenda
    - Plumbing Permits
    - Electrical Permits
    - Contractors
    - Complaints
  - **Knowledge Base:** Interface to view/edit the AI's "Long Term Memory" (Facts).
  - **System Status:** View running tasks and system health.
  - **API Docs:** Links/Embeds for `/openapi.json` and `/swagger`.
- **Persistent Widgets:**
  - **Agent Chat:** A floating or drawer-based chat widget accessible from anywhere.
  - **Task Toast:** A specialized toast/status bar showing the state of the most recent background operation (e.g., "Normalizing Contractor Data... 45%").

### B. Dashboard (Home)

- **Hero Section:** Search bar enticing the user to "Ask anything about SF Construction" or "Search for a Contractor".
- **Live Activity Stream:** A feed of recent analysis tasks completed by the backend.
- **High-Level Metrics:** Stat cards for "Total Permits Analyzed", "Active Contractors Tracked", "Anomalies Detected".

### C. Search & Task Initiation

- **Interface:** A unified search bar that allows filtering by type (Permit, Contractor, Address).
- **Action:** When a user searches, it doesn't just "query"; it often _starts an analysis_.
  - If results exist in D1 (Database), show them immediately.
  - If not, or if requested by the user, **Trigger an Orchestrator Agent** via `POST /api/v1/analyze`.
  - **Redirect** immediately to the **Request Details** page to watch the analysis unfold.

### D. Request Details / Live Console (`/requests/$uuid`)

- **Critical Page:** This is where the "Agentic" feel comes to life.
- **Phase 1: Processing (WebSocket Mode)**
  - Connect to `wss://.../connect/$uuid`.
  - **Terminal View:** detailed scrolling logs of what the backend is doing (e.g., "Fetching SODA dataset...", "Sandbox: Running python/insights/contractors.py...", "AI: Normalizing 'Joes Plumbin' to 'JOE PLUMBING INC'").
  - **Progress Steps:** Visual stepper showing the pipeline stages (Fetch -> Normalize -> Analyze -> Save).
- **Phase 2: Completed (Results Mode)**
  - Once the socket sends "status: COMPLETED", the view transforms into a **Report Dashboard**.
  - **Summary:** AI-generated summary of findings.
  - **Grid/Table:** The raw normalized data.
  - **Insights:** Specific section for "Anomalies" or "Insights" returned by the Python Sandbox.

### E. Entity "Dossiers" (The Deep Dives)

Create specialized views for distinct entity types.

#### 1. Contractor Dossier (`/contractors/$id`)

- **Header:** Canonical Name, License Number, Contact Info.
- **Aliases:** Show known "Raw Names" that map to this contractor (from KV/D1).
- **Performance:** Charts showing "Permit Velocity" (requests per month), "Pass/Fail Rate" on inspections.
- **Associations:** List of addresses they frequently work at.

#### 2. Address/Location Dossier (`/addresses/$id`)

- **Map:** Pinpoint details (integration with Mapbox or similar if needed, or just static lat/long representation for now).
- **Permit History:** Timeline of all permits (Building, Electrical, Plumbing) at this location.
- **Violations:** Highlight any Complaints or NOV (Notice of Violation) data.

#### 3. Permit Type Dashboards

- Specific pages for **Building**, **Plumbing**, **Electrical**.
- These should show aggregate trends (e.g., "Top 10 Plumbers by Volume", "Heatmap of Electrical Permits").

### F. Knowledge Base Interface (`/knowledge`)

- **CRUD Table:** View the "Facts" stored in the database.
- **Actions:**
  - **Edit:** Correct a fact manually.
  - **Soft Delete:** Mark a fact as invalid/outdated.
  - **Search:** Filter facts by entity or confidence score.

## 4. Technical Implementation Guidelines

### WebSocket Hook

Use a custom hook `useAgentSocket` to manage the complex state of the Request Details page. It should handle:

- Connection lifecycle.
- Buffering logs.
- Detecting terminal states (COMPLETED, FAILED).

### APIs

- `POST /api/v1/analyze` - Start a new task.
- `GET /api/v1/requests/{uuid}` - Get task state/results.
- `GET /api/v1/search` - General search.
- `GET /api/v1/facts` - Knowledge Base access.

## 5. Aesthetics & Tone

- **Font:** Inter or similar clean sans-serif.
- **Colors:** Background `#09090b` (zinc-950), Cards `#18181b` (zinc-900), Accents `#3b82f6` (blue-500) or `#8b5cf6` (violet-500).
- **Borders:** Subtle, e.g., `border-zinc-800`.
- **Feedback:** Skeletons for loading, Toasts for actions, Pulse animations for live status.

## 6. Execution Plan

1.  **Scaffold:** (DONE) Routes are scaffolded in `routes/(app)/*`.
2.  **Components:** Build shared UI (Tables, Cards, Badge, Terminal).
3.  **Features:** Implement Search -> Analysis Flow first (The Core Loop).
4.  **Dashboards:** Build the Entity Dossiers.
5.  **Polish:** Animations and transitions.

## 7. Current State (Pre-Wired)

- **Backend:** `/v1/analyze`, `/v1/requests/:id`, `/v1/facts` are implemented in `apps/api`.
- **Backend Binding:** `apps/app` is now bound to `apps/api` via Service Binding `env.API`. If you implement server-side logic (loaders/actions) in `apps/app/worker.ts` or similar, you can use RPC calls like `await env.API.startSearch(...)`.
- **Frontend:** `routes/(app)/search.tsx`, `requests.$requestId.tsx`, `knowledge.tsx`, `contractors.$id.tsx` are created as placeholders.
- **Next Step:** Implement the actual UI components inside these route files.

```text
Design a Desktop Web Application (1440px width) for a "San Francisco DBI Data Analyst" dashboard.
DO NOT generate mobile screens. This is a desktop-only administration tool.

Style:
- Theme: "Shadcn UI" (Clean, White/Zinc, Inter font).
- Layout: Fixed left sidebar (250px), scrollable main content area.

Generate these 2 Desktop Views:

1. The "Mission Control" Dashboard:
   - Top area: 4 Metric Cards (Active Crawls, Records Indexed, API Health, Anomalies).
   - Main area: A dense data table titled "Recent Task History".
   - Table Columns: UUID, Task Type (Badge), Status (Live/Done), Time Elapsed, Actions.
   - Include a "New Search" primary button in the top right.

2. The "Live Task Console" (Detail View):
   - A split-screen desktop layout.
   - Left Panel (1/3 width): A vertical stepper showing progress (Connecting -> Fetching Socrata -> Normalizing -> Saving).
   - Right Panel (2/3 width): A dark-themed code terminal window displaying streaming text logs (e.g., "> [INFO] Found 142 records...").

```

---

### **Option 2: The Actual Code (Skip the Mockup)**

Since you have the repo set up, you can drop this code directly into your `apps/app` folder to get the **Dashboard** and **Live Console** working immediately.

#### **1. The Dashboard Page**

**File:** `apps/app/routes/(app)/dashboard.tsx`

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity, Database, AlertTriangle, Play } from "lucide-react";

export const Route = createFileRoute("/(app)/dashboard")({
  component: Dashboard,
});

// Mock Data - Replace with useQuery calling /api/requests
const recentRequests = [
  {
    id: "req_123",
    type: "Contractor Search",
    status: "processing",
    date: "2 mins ago",
  },
  {
    id: "req_124",
    type: "Bulk Analysis",
    status: "completed",
    date: "1 hour ago",
  },
  { id: "req_125", type: "Permit Audit", status: "failed", date: "Yesterday" },
];

function Dashboard() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
        <Button asChild>
          <Link to="/search">
            <Play className="mr-2 h-4 w-4" /> New Task
          </Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Crawls"
          value="3"
          icon={Activity}
          desc="Currently running"
        />
        <StatsCard
          title="Records Indexed"
          value="1.2M"
          icon={Database}
          desc="+14k today"
        />
        <StatsCard
          title="Anomalies"
          value="12"
          icon={AlertTriangle}
          desc="Requires attention"
          className="border-amber-200 bg-amber-50"
        />
        <StatsCard
          title="API Health"
          value="98.2%"
          icon={Activity}
          desc="Socrata Latency: 45ms"
        />
      </div>

      {/* Recent Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Task History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRequests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-mono text-xs">{req.id}</TableCell>
                  <TableCell>{req.type}</TableCell>
                  <TableCell>
                    <StatusBadge status={req.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {req.date}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/requests/${req.id}`}>View Logs</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, desc, className }: any) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    processing: "bg-blue-100 text-blue-800 hover:bg-blue-100",
    completed: "bg-green-100 text-green-800 hover:bg-green-100",
    failed: "bg-red-100 text-red-800 hover:bg-red-100",
  };
  return (
    <Badge className={styles[status as keyof typeof styles] || ""}>
      {status}
    </Badge>
  );
}
```

#### **2. The Live Console Page (Agent Stream)**

**File:** `apps/app/routes/(app)/requests/$requestId.tsx`

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentSocket } from "@/hooks/use-agent-stream"; // Custom hook we discussed
import { Loader2, CheckCircle2, Terminal } from "lucide-react";

export const Route = createFileRoute("/(app)/requests/$requestId")({
  component: RequestDetails,
});

function RequestDetails() {
  const { requestId } = Route.useParams();
  const { logs, status } = useAgentSocket(requestId); // Assumes hook returns logs[]

  return (
    <div className="grid h-[calc(100vh-4rem)] grid-cols-1 gap-6 p-6 lg:grid-cols-3">
      {/* Left: Status & Metadata */}
      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Task Progress</h2>
          <div className="space-y-4">
            {/* Mock Stepper */}
            <Step label="Queued" active={true} completed={true} />
            <Step
              label="Fetching SODA Data"
              active={status === "processing"}
              completed={status === "completed"}
            />
            <Step label="AI Normalization" active={false} completed={false} />
            <Step label="Finalizing" active={false} completed={false} />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-muted-foreground">
            Request UUID
          </h3>
          <p className="font-mono text-sm">{requestId}</p>
        </Card>
      </div>

      {/* Right: Live Terminal */}
      <div className="lg:col-span-2">
        <Card className="flex h-full flex-col overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-50">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 p-3">
            <Terminal className="h-4 w-4" />
            <span className="text-xs font-mono">agent-logs.log</span>
            {status === "processing" && (
              <span className="ml-auto flex h-2 w-2 animate-pulse rounded-full bg-green-500" />
            )}
          </div>
          <ScrollArea className="flex-1 p-4 font-mono text-sm">
            {logs.length === 0 ? (
              <span className="text-zinc-500 opacity-50">
                Waiting for agent connection...
              </span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="mb-1 break-all">
                  <span className="mr-2 text-zinc-500">
                    [{new Date().toLocaleTimeString()}]
                  </span>
                  <span
                    className={
                      log.includes("ERROR") ? "text-red-400" : "text-zinc-300"
                    }
                  >
                    {log}
                  </span>
                </div>
              ))
            )}
            <div id="log-end" />
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

function Step({ label, active, completed }: any) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full border ${completed ? "bg-green-100 border-green-200" : active ? "border-blue-500 animate-pulse" : "border-zinc-200"}`}
      >
        {completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : active ? (
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-zinc-200" />
        )}
      </div>
      <span
        className={
          active
            ? "font-medium text-blue-900"
            : completed
              ? "text-zinc-900"
              : "text-zinc-400"
        }
      >
        {label}
      </span>
    </div>
  );
}
```
