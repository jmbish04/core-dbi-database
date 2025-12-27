Please build a cloudflare worker that will provide an agentic data analyst api (rest and websocket apis, rpc entrypoint for service binding, and /mcp for mcp tooling) for querying, listing, filtering DBI permits (building, plumbing, electrical, addenda), contractor information with several ways to search and always have options to retrieve the same paginated responses everytime. 
The worker will be named core-dbi-database (I have attached the fresh clone of react-kit)

- frontend will be served using react-kit framework (cloned as https://github.com/jmbish04/core-dbi-database) and navigation will include /openapi.json, /openapi.yaml, /swagger (with openapi built and served dynamically using hono and zod in v3.1.0 with operation id on every method for full gpt compliance) 
- there will be a shared KV for all agents which will contain key information learned by agents about how to navigate the sometimes messy sf data (like how contractors are sometimes in there by first and last name or business name, address can be in different fields, license can be in different fields, sometimes business address and sometimes not, sometimes sf license and sometimes not, etc -- but the key facts will instruct agents on this based on continuous learning and refinement of the facts) 

* The frontend will offer a page to see this key learned from agents and will offer a CRUD interface to easily update facts line by line as well as an agentic chat interface to help make complex or bulk changes 
* Agents do not have the ability to delete KV records but rather only to soft delete records by setting something like isActive = false so that when they list the facts from kv they are filtering out soft deletes like ...Where isActive =1
* Users on the frontend can both soft delete and hard delete records using the interface buttons 

- sandbox sdk (container sandbox-sdk) binding with preloaded python scripts to parse the data based on soda dataset (permit/building.py, permit/plumbing.py, permit/electrical.py, permit/addenda.py, permit/complaint.py, contractor.py, etc) with each python script utilizing pandas etc and specifying pydantic response schema, modules for worker ai insights and anomolies (insights/contractors.py, insights/inspectors.py, insights/permits/building.py, insights/permits/plumbing.py, insights/permits/electrical.py, insights/permits/addenda.py, insights/permits/complaints.py, anomalies/contractors.py, anomalies/inspectors.py, anomalies/permits/building.py, anomalies/permits/plumbing.py, anomalies/permits/electrical.py, anomalies/permits/addenda.py, anomalies/permits/complaints.py, full service purpose designed notebooks available for hosting on the host worker frontend (https://github.com/cloudflare/notebook-examples.git), direct pathways to index the normalized data into d1 db using prisma schema on the host worker to manage schema
- all incoming requests (api, websocket api, rpc, mcp) will be recorded into d1 with all of the request details and there will be a request uuid assigned along with date and time
- since these tasks will be long running, the api,websocket api, rpc, mcp methods should allow for listing status on a request_id, requesting full logs on a request_id, and provide a streaming method where a connection is made over websocket api with request_id logs being streamed in realtime
- all responses wil include a link to the workers frontend with request uuid prefilled for the user to monitor status, websocket realtime logging for ongoing tasks, and once completed -- standard shadcn dashboard [which may differ based on the request type -- like perhaps theres a standard dashboard for contractors, building permits w/ addenda, plumbing permits, electrical permits, complaints, and an overview dashboard that will provide links to drill into the other standard pages allowing for the overview page to show stat cards, common graphs etc -- and all pages having an agent chat popup for agentic interactions about the data -- these pages would also be different charts based on if the user was querying for permit data broadly or for a specific address -- pulling the results in from d1 using request uuid to filter (the agent assigned to the request always saves results requested in d1 with request uuid)
- there will be several agents 
- main orchestrator -- centralized entrypoint for all requests that ensures the request is handled correctly and passed to the right agent (if agent is needed)
- dbi data expert -- extracts key gotchas and lessons learned and best practices from the shared KV to respond to requests received for a data pull request (like an api/websocket/rpc/mcp request to obtain all records for a contractor (or street, or address, or addresses etc), downloading the soda payloads locally into a sandbox-sdk using r2 fuse bucket if need be for holding the data and then utilizing the prebuilt python packages to parse data and of course having agentic capabilities to execute code to customize data processing by need or if soda data changes from expected schema etc (if that happens, notating KV of course) and then indexing normalized data into d1 tables along with the request uuid associated for the task 
  -- dbi insight and anomolies agent -- again using sandbox sdk, processing all dbi data for all time using the same standard python modules to process the dbi data payloads returned from soda api storing this in r2 pyspark tables and then running standard python modules to updated pyspark table insights ... these insights are built on cron so that whenever a request comes through for pulling data, the agent pulling the report can also include insights or anomalies related to their request broadly or the user could also ask in their initial request of pulling permits (say for a contractor) to also pair the data pull with general insights for the specified contractor compared to all contractors in dbi (that are similar to the contractor in question --eg, if searching for a plumber give insights about plumbers broadly) ... like avg. number of permits for {contractor type} in san francisco, avg time to receive approval on {related permits}, contractor trends in {neighborhood}
  -- data analyst: expert in the entire sandbox sdk python module offering and responds to natural language queries from frontend or from api like - "im about to start on a home remodel that involves xyz -- can you look accross DBI records for the past 10 years and look for similar permits to give me a better understanding for cost, top contractors, any inspectors by name to be concerned with (aka, shady fbi stuff), avg time to complete similar projects, top contractors in my area in the last 6 years, etc" 
  Examples of common use cases, but please expand comprehensively on these
- query by project location (macro: neighborhoods, zips, streets, blocks, etc; micro: home addresses, home block/lots)
- pulls in all permits and addenda and complaints
- query by contractor exact and fuzzy since the data is messy (license, contractor first and last name, business/dba)
- query by inspector or other dbi official that interacted with a permit or complaint or addenda 
- query by permit type, permit details, permit review status, permit addenda comments, etc 
  Of course the api would be filter able by date range, contractor array, location objects like searching with a geo area or across multiple addresses, addenda comments, keywords, etc. 
  And also integrating worker ai to help evaluate and normalize the data like if searching by contractor the user specifies contractor full name , contractor business name, email, phone, address, license (all the things) since the dbi data on contractors is sloppy and hit or miss — sometimes all the info is filled in and sometimes none of the info filled in — there would be a worker AI agent running Cloudflare agent SDK that would accept the api request and then using its tool (soda api) the agent would begin constructing queries to sample the contractor api for wildcards on name and license etc to find all the variations so that it could then run multiple api calls to pull in all the responses and store those in kv and then that would be returned over api or indexed in d1 more likely which would be served from api .. perhaps the initial api call would issue a request uuid for a long running operation and then the Cloudflare agent would begin sampling and collecting data - indexing the data relevant to the request to d1 with request uuid and the endpoint perhaps subscribed on websocket api would see some indexing had occurred and it begins to make get requests to the rest api providing request id to sample the data the agent is collecting. 
  Or another flow could be that the agent is using cloudflare sandbox-SDK to pull the data into a python sandbox first where it downloads several csv or json payloads from soda and processes the data with python modules we preloaded on sandbox SDK that would utilize pandas etc to parse the soda responses .. with the agent also able to execute custom python on the sandbox SDK to custom tailor the data analysis to the request. 
  Implementing a Semantic Data Integration Layer for San Francisco DBI Records on Cloudflare Workers
  Executive Summary
  The digitalization of municipal records has created a vast ocean of public data, yet accessibility remains hindered by fragmentation, inconsistent schemas, and legacy data entry practices. The San Francisco Department of Building Inspection (DBI) publishes extensive datasets via the Socrata Open Data API (SODA), covering building permits, plumbing, electrical work, complaints, and addenda. However, these datasets exist in silos. A contractor searching for their history across all permit types, or a homeowner seeking a holistic view of a property’s compliance history, faces significant friction. They must navigate disparate endpoints with varying column names (permit_number vs. application_number), handle non-standardized contractor names (e.g., "Acme Construction" vs. "Acme Const. Inc."), and manually correlate addenda with parent permits.
  This report outlines a comprehensive architectural specification for a Semantic Data Integration Layer deployed on Cloudflare Workers. This system transforms the raw, disjointed DBI SODA APIs into a unified, normalized, and intelligent query engine. By leveraging Cloudflare Agents SDK for stateful orchestration, Workers AI for semantic entity resolution (cleaning "messy" contractor data), and the Cloudflare Sandbox SDK for heavy-duty Python/Pandas processing, this solution offers a paradigm shift in how open data is consumed.
  The proposed architecture moves beyond simple API proxying. It implements an "Agentic" middleware that actively interprets user intent. When a user searches for a contractor, the system does not merely pass the string to Socrata; it employs an AI Agent to generate phonetic and fuzzy variations, queries multiple endpoints in parallel, consolidates the results, and uses an LLM to normalize the identity of the records before returning a clean, paginated response. For complex queries involving macro-locations (neighborhoods) or historical analysis, the system leverages a Python Sandbox to ingest bulk CSV data and perform in-memory joins and filtering that SoQL (Socrata Query Language) cannot support natively. This report provides the exhaustive implementation research, data mappings, and architectural patterns required to build this robust system.

1. The San Francisco Open Data Ecosystem: Endpoint Reconnaissance
   The foundation of this system is a precise map of the underlying data sources. The San Francisco Open Data Portal uses Socrata, which exposes data via unique identifiers (4x4 alphanumeric codes). Connecting these distinct datasets is the primary challenge.
   1.1 Core Dataset Inventory
   To build a "Unified Permit Search," the Worker must federate queries across five primary silos. Our research has identified the specific, stable API endpoints and their unique characteristics.
   1.1.1 Building Permits (The Backbone)
   Dataset ID: p4e4-a5a7 (Post-2013 filtered view) or i98e-djp9 (All years).
   Recommendation: Use p4e4-a5a7 for active/recent queries to reduce latency, falling back to i98e-djp9 only for archival searches.1
   Key Fields:
   permit_number: The primary identifier.
   form_number: Distinguishes permit types (e.g., Form 3/8 for alterations).
   block and lot: Critical for location normalization.
   street_number, street_name, street_suffix: For address matching.
   status: (e.g., "filed", "issued", "complete", "cancelled").
   Contractor Data: Note that p4e4-a5a7 contains some contractor fields (contractor_name, contractor_license), but they are often incomplete. The robust source is the linked Building Permits Contacts dataset.
   1.1.2 Building Permits Contacts (The Identity Source)
   Dataset ID: 3pee-9qhc.
   Role: This dataset is a child table to Building Permits. It provides the detailed "Who" for a project.2
   Key Fields:
   application_number: Foreign key to p4e4-a5a7 (Permit Number).
   contact_name: Often the specific human POC.
   company_name: The business entity.
   role: (e.g., "Contractor", "Authorized Agent", "Owner").
   Join Strategy: The Worker must perform a LEFT JOIN logic: fetch the Permit, then fetch rows from 3pee-9qhc where application_number matches.
   1.1.3 Plumbing & Electrical Permits (The Specialty Trades)
   These exist as separate datasets, often with slightly different schema conventions.
   Plumbing Permits ID: k2ra-p3nq.3
   Quirk: Often references the parent Building Permit but stands alone for minor work (boiler replacements, etc.).
   Key Fields: permit_number, application_number, plumbing_contractor_name.
   Electrical Permits ID: ftty-kx6y.4
   Quirk: Contains specific status codes relevant to electrical inspections.
   Key Fields: permit_number, job_address, electrical_contractor_name.
   1.1.4 Complaints (The Compliance History)
   Dataset ID: gm2e-bten.5
   Role: Tracks public complaints and Notices of Violation (NOV).
   Linkage Challenge: Complaints often do not have a permit number. They are linked to the property.
   Normalization Strategy: Links must be established via Block/Lot or Geospatial coordinates. A "Property History" query must search Permits by Address AND Complaints by Block/Lot.
   Violations Detail: The dataset nbtm-fbw5 contains the specific line-item violations for a complaint.6
   1.1.5 Permit Addenda (The "Scope Creep")
   Dataset ID: vckc-dh2h (Building Permit Addenda with Routing).7
   Role: Tracks changes to an issued site permit. This is critical for complex projects where the initial permit is just a placeholder.
   Key Fields: addenda_number, parent_permit_number, routing_date.
   1.2 The "Dirty Data" Challenge
   The primary obstacle to a unified API is data cleanliness. The SODA APIs reflect the raw input from DBI's internal systems.
   Contractor Names: "Bobs Plumbing," "Bob's Plumbing Inc," and "Robert Smith dba Bob's Plumbing" are likely the same entity but distinct strings in the database. A simple WHERE contractor_name = 'Bob' will fail.
   Addresses: "123 Main St" vs "123 Main Street" vs "123 Main" prevents simple string matching.
   Null Schema: Fields like contractor_license are populated in the Electrical dataset but might be missing in older Building Permits.
   Inspector Identifiers: Searching by "inspector" is complicated because inspector names appear in varying formats across datasets, or sometimes only their initials or badge numbers are recorded in internal comments or status fields.
   This necessitates the Cloudflare Worker acting not just as a proxy, but as an ETL (Extract, Transform, Load) engine.
2. Architecting the Semantic Middleware
   To meet the requirement of a dedicated Cloudflare Worker that offers "several ways to search" and "always retrieves paginated responses," we propose a Stateful Agent Architecture. This design decouples the request for data from the gathering of data, allowing the system to handle the high latency of multi-endpoint fetching and AI normalization.
   The architecture strictly separates the Request API (Stateless Worker) from the Processing Logic (Stateful Agent). The process initiates when the client sends a search request. The Worker then spawns an Agent (Durable Object) which acts as the orchestrator. This Agent performs the multi-step retrieval and AI normalization. Once the data is processed, it is indexed into D1, allowing the Client to retrieve the finalized, normalized view via WebSocket or Polling.
   2.1 Component Breakdown
   2.1.1 The Gateway Worker (The Receptionist)
   This is a standard Cloudflare Worker (JavaScript/TypeScript). Its primary role is Routing and Request Validation.
   Endpoints:
   GET /search/location: Validates geo-parameters.
   GET /search/contractor: Validates name/license inputs.
   GET /task/{uuid}: Checks the status of a long-running search.
   WS /connect/{uuid}: Establishes a WebSocket connection for real-time updates.
   Logic: It does not perform the heavy lifting. Upon receiving a complex request (e.g., "Find all permits for 'Turner Construction'"), it generates a request_uuid, instantiates a specific Cloudflare Agent (Durable Object), and returns the UUID to the client immediately.
   2.1.2 The Search Agent (Cloudflare Agents SDK + Durable Object)
   This is the core "Intelligent" component. The Agents SDK allows this object to maintain state (the progress of the search) and define tools (functions that call the SODA API).
   State: Holds the search_criteria, status (processing, complete), logs, and a temporary buffer of results.
   Tools:
   query_soda_permits(params)
   query_soda_electrical(params)
   normalize_contractor_name(raw_name) -> Calls Workers AI.
   Workflow:
   Plan: The Agent analyzes the request. If the user asks for "Turner Construction," the Agent knows it needs to query Building, Plumbing, and Electrical APIs.
   Fan-Out: It executes parallel fetch() requests to the disparate Socrata endpoints.
   Aggregation: As results arrive, it dumps them into the local storage of the Durable Object or a bound KV namespace.
   AI Normalization: It batches the raw results and sends them to Workers AI (e.g., Llama 3) to standardize the data.
   Finalize: It writes the structured, clean rows into Cloudflare D1 (SQLite) for fast, paginated retrieval and notifies the client via WebSocket.
   2.1.3 The Data Sandbox (Cloudflare Sandbox SDK)
   For "Macro" queries (e.g., "All permits in the Mission District from 2020-2024"), SODA's API limits and lack of complex JOINs become a bottleneck.
   Role: Bulk Data Processor.
   Workflow:
   The Agent spawns a Sandbox instance (Python environment).
   The Agent streams the raw CSVs from Socrata into the Sandbox.
   The Sandbox runs a pre-loaded Python script using Pandas.
   Pandas performs filtering, merging (Permits + Addenda + Complaints), and aggregation.
   The Sandbox returns a JSON payload of the processed view.
   Why Python? JavaScript is fast, but Pandas provides superior primitives for manipulating tabular data (DataFrames), handling NaN values, and performing vectorized operations on datasets with 100k+ rows.
3. Data Ingestion & Normalization Strategy
   This section details how the Worker interacts with Socrata and cleans the data.
   3.1 Advanced SoQL Querying Strategies
   To minimize data transfer, the Worker must push as much logic as possible to the Socrata Cloud using SoQL (Socrata Query Language).
   3.1.1 Location Queries (Macro & Micro)
   The user requires searching by "neighborhoods, zips, streets, blocks" (Macro) and "home addresses" (Micro).
   Micro-Location (Exact Address):
   Strategy: Normalize the user input (e.g., "123 Main St") to Socrata's format.
   SoQL: SELECT \* WHERE street_number='123' AND street_name='Main'.
   Optimization: Also query by block and lot if known, as addresses can change or have typos.
   Macro-Location (Geo-Fencing):
   Strategy: Use Socrata's geospatial functions.
   SoQL Functions: within_circle(location, lat, long, radius) or within_box(location, y1, x1, y2, x2).8
   Note on Polygons: within_polygon is available in SoQL 2.1/3.0 but can be fragile with complex geometries.10
   Recommendation: For neighborhood searches (e.g., "The Mission"), the Worker should maintain a local mapping of Neighborhood Names -> Bounding Boxes (Lat/Long sets). When a user requests "The Mission," the Worker translates this into a within_box query to Socrata.
   3.1.2 Date & Status Filtering
   SoQL: $where=status_date > '2023-01-01T00:00:00'.
Implementation: The Worker must accept standard ISO dates from the client and format them into the floating timestamp format Socrata expects (YYYY-MM-DDTHH:mm:ss).
3.2 The "Contractor Normalization" Engine (AI-Powered)
This is the system's "Killer Feature." Raw contractor data is messy.
Problem: User searches "Turner".
DBI Record 1: "Turner Const."
DBI Record 2: "Turner Construction Company"
DBI Record 3: "TURNER CONSTRUCTION CO"
Solution: The AI Entity Resolver Agent.
Expansion Phase (Prompt Engineering):
The Agent calls Workers AI (Llama 3) with the prompt: "Generate a list of likely SoQL wildcard search strings for a contractor named 'Turner Construction'. Include abbreviations and common typos."
Output: ``.
Multi-Pass Querying:
The Agent fires parallel SODA requests using LIKE operators with these wildcards.12
$where=contractor_name LIKE '%Turner Const%' OR contractor_name LIKE...
   Resolution Phase:
   The API returns 50 raw records.
   The Agent passes these records back to the AI: "Group these records by unique business entity. Identify the canonical name and license number for each group."
   Result: The Agent creates a normalized "Contractor Object" merging the variations.
   3.2.1 Inspector and Official Normalization
   Just as with contractors, the user has a requirement to search by "inspector or other dbi official that interacted with a permit." This data is scattered.
   Permit Issuance: The p4e4-a5a7 dataset often contains a column for permit_issued_by or processed_by, though it may use internal user IDs (e.g., "JDOE") rather than full names.
   Complaints: The gm2e-bten dataset typically contains an inspector_name or district_inspector field.
   Resolution Strategy: The AI Agent must also be trained to recognize and normalize these official identifiers.
   Input: "Inspector Smith"
   AI Action: Generate variations like "Smith, J", "J. Smith", "Inspector #42".
   Cross-Reference: The Worker should maintain a lookup table (cached in KV) of known DBI inspectors and their associated ID codes if available from the metadata, or build this dynamically as it encounters distinct inspector names in the complaints dataset.
4. Implementation Details: Building the Worker
   This section provides the implementation specifications for the Coding Agent.
   4.1 The Agent/Worker Interface (Agents SDK)
   The Cloudflare Agents SDK is the framework of choice. It simplifies the deployment of Durable Objects that act as intelligent agents.14
   Key Implementation Specs:
   State Management: The Agent class (extending Agent from the SDK) must implement an onConnect handler for WebSockets.
   Task Queue: Use this.ctx.storage (SQLite in DO) to queue search tasks.
   Communication:
   Client -> Worker -> Agent: agent.fetch()
   Agent -> Client: server.broadcast() (over WebSocket).
   4.2 The Python Sandbox Integration (Sandbox SDK)
   For the "Download several CSV or JSON payloads" flow 16:
   Trigger: When the requested dataset size exceeds a threshold (e.g., > 5,000 records) or involves complex cross-dataset joins.
   Setup:
   The Worker spawns a Sandbox: const sandbox = getSandbox(env.SANDBOX, 'data-proc-01').
   It writes a Python script to the sandbox: await sandbox.writeFile('/main.py', pythonScript).
   It executes: await sandbox.exec('python /main.py').
   The Python Script:
   Should use pandas and requests.
   Fetches CSVs from Socrata: pd.read_csv("https://data.sfgov.org/...").
   Performs joins: merged_df = permits.merge(addenda, on='permit_number').
   Exports to JSON: print(merged_df.to_json()).
   Constraint: Ensure the Sandbox has internet access enabled to fetch SODA data.
   4.3 Storage & Caching (D1 & KV)
   KV (Key-Value): Use for caching exact API responses.
   Key: soda_request_hash (MD5 of the full query URL).
   Value: Raw JSON response from Socrata.
   TTL: 24 hours (Socrata updates nightly 1).
   D1 (SQL Database): Use for storing the normalized index.
   Once the Agent/AI cleans a contractor record, store it in D1.
   Table: normalized_contractors (id, canonical_name, raw_variations_json, license).
   Benefit: Future searches for "Turner" hit the local D1 database first, bypassing the expensive AI resolution step.
5. Coding Agent Prompt
   The following prompt is designed to be fed directly into your coding agent. It encapsulates all the research findings, endpoint IDs, and architectural decisions detailed above.
   Prompt for Coding Agent
   You are an expert Cloudflare Developer Tasked with building a "San Francisco DBI Semantic Search" Worker.
   This is a complex, multi-component system using the Agents SDK, Workers AI, and Socrata SODA API.
   Project Scope:
   Build a Cloudflare Worker that acts as a unified API for SF Department of Building Inspection data.
   It must handle "messy" data, provide paginated results, and normalize inputs using AI.
   Core Components to Implement:
   The "Orchestrator" Agent (Durable Object via Agents SDK):
   Create a class DBISearchAgent extending Agent.
   State: Manage a searchJob object (status, results, query_params).
   Methods:
   search(params): The main entry point.
   normalizeParams(params): Use Workers AI (Llama 3) to convert fuzzy inputs (e.g., "Bob's Plumbing") into Socrata-compatible wildcards (e.g., %Bob%Plumb%).
   executeSODAQueries(queries): Run fetch in parallel against the endpoints listed below.
   consolidateResults(results): Merge data from disparate endpoints.
   WebSocket: Implement onConnect to stream progress ("Searching...", "Normalizing...", "Done") to the client.
   Socrata Data Integration (The "Tool" Layer):
   Implement a SocrataClient class helper.
   Base URL: https://data.sfgov.org/resource/
   Endpoints (HARDCODE THESE IDS):
   Building Permits: p4e4-a5a7.json (Primary).
   Contacts: 3pee-9qhc.json (Join on application_number -> permit_number).
   Plumbing: k2ra-p3nq.json.
   Electrical: ftty-kx6y.json.
   Complaints: gm2e-bten.json.
   Addenda: vckc-dh2h.json.
   SoQL Generation: Implement a builder for Socrata Query Language.
   Support $$app_token header (placeholder for env var).
Support $where clauses for:
within_circle(location,...) for Geo.
date > '...' for Date Ranges.
LIKE '%...%' for Contractor text search.
The "Sandbox" Offloader (Optional Path):
If params.mode === 'bulk_analysis', use getSandbox from @cloudflare/sandbox.
Write a Python script (analyze.py) to the sandbox that:
Uses pandas (assume pre-installed in your Docker image).
Downloads the CSV versions of the endpoints.
Joins Permits + Addenda on permit_number.
Returns a JSON summary.
Storage Layer:
KV: Cache every raw Socrata response. Key: MD5(url). Check KV before fetching.
D1: Create a table search_history to log request_uuid, query_params, timestamp.
Specific Logic - Contractor Normalization:
When searching for a contractor:
Ask AI: "Given input '${input}', generate 3 wildcard strings for a SQL LIKE query."
   Query Socrata with OR logic: $where=contractor_name LIKE '...' OR contractor_name LIKE '...'.
   Collect results.
   Ask AI: "Normalize this JSON list of contractors. Group by entity and return a single 'canonical' name for each group."
   Return the Normalized List.
   Output Requirements:
   Use TypeScript.
   Use wrangler.toml for bindings (AI, KV, D1, DURABLE_OBJECT_NAMESPACE).
   Follow the "Agents SDK" patterns for class structure.
6. Conclusion & Road Map
   The current fragmentation of San Francisco's building data represents a significant inefficiency for stakeholders. By implementing the Semantic Middleware described in this report, developers can bridge the gap between raw open data and actionable intelligence.
   This architecture leverages the unique strengths of the Cloudflare platform: Workers for low-latency routing, Agents/Durable Objects for complex state management, Workers AI for cognitive tasks (data cleaning), and Sandbox for heavy computational lifting.
   Future Road Map:
   Phase 1: Deploy the Agent with basic Building Permit and Contact search.
   Phase 2: Integrate Plumbing and Electrical datasets with the "Unified Permit View."
   Phase 3: Implement the Sandbox-based geospatial aggregator for neighborhood-level analytics.
   Phase 4: Build a frontend dashboard that connects to the Agent's WebSocket for real-time, "Chat with Data" experiences.
   This system effectively transforms the static rows of the Socrata portal into a dynamic, queryable knowledge graph, fulfilling the user's vision of an exhaustive, robust, and intelligent DBI API.
   San Francisco Open Data (SODA) Ecosystem Deep Dive
7. Introduction to Socrata Open Data API (SODA)
   The City and County of San Francisco hosts its open data on the Socrata platform. Understanding SODA is prerequisite to building the Worker. SODA provides a RESTful interface where every dataset is an "endpoint" accessible via a unique 4x4 identifier (e.g., i98e-djp9).
   1.1 The API Protocol
   Base URL: https://data.sfgov.org/resource/{dataset_id}.json
   Authentication: While public data can be accessed without a token, rate limits are strict. The Worker must include an X-App-Token header in every request.
   Query Language (SoQL): SODA uses a SQL-like syntax passed as query parameters.
   $select: Choose columns (critical for reducing bandwidth).
$where: Filtering logic (SQL-like syntax).
   $order: Sort order.
$limit / $offset: Pagination.
$q: Full-text search (rudimentary, often insufficient for specific fields).
   1.2 Cataloging the Endpoints: The "Truth" Sources
   A critical finding of this research is the identification of the correct and active dataset IDs. Socrata often hosts multiple versions (legacy, filtered, views). The Worker must target the definitive sources.
   1.2.1 Building Permits
   Primary Source: p4e4-a5a7
   Description: Filtered view of permits filed on or after Jan 1, 2013.1 This is the most performant endpoint for modern applications.
   Alternative: i98e-djp9 (All permits since the 1980s).17 Use only if date < 2013.
   Critical Fields:
   permit_number: The master key.
   status: Current state (Filed, Issued, Completed, Cancelled).
   status_date: Timestamp of the last status change.
   site_permit: 'Y' indicates a high-level conceptual permit that will have addenda.
   1.2.2 The "Hidden" Contractor Data
   A common pitfall is assuming the Building Permits dataset contains all contractor info. It contains some (fields contractor_name, contractor_license), but these are often null for older permits or complex projects.
   The Solution: The Building Permits Contacts dataset (3pee-9qhc).2
   Schema:
   application_number: Links to permit_number in the parent dataset.
   contact_name: The individual.
   company_name: The business entity.
   street_number, street_name: Contractor's mailing address (useful for identity resolution).
   1.2.3 Plumbing & Electrical: The Specialty Silos
   These permits often have their own lifecycle, independent of the main building permit.
   Plumbing Permits: k2ra-p3nq.3
   Context: Covers gas, water, and boiler work.
   Key Field: plumbing_contractor_name. This field is notoriously messy (hand-typed).
   Electrical Permits: ftty-kx6y.4
   Context: Covers wiring, service upgrades, and low-voltage work.
   Key Field: electrical_contractor_name.
   1.2.4 Complaints: The Compliance Shadow
   Complaints data is structurally different. It is property-centric, not permit-centric.
   Dataset: gm2e-bten.5
   Violations: nbtm-fbw5.6
   The Linkage Problem: You cannot easily join Complaints to Permits via a Permit Number.
   The Linkage Solution: Location Normalization.
   Both datasets contain block and lot.
   Strategy: To show "Complaints for this Permit," the Worker must:
   Fetch Permit -> Extract block, lot.
   Query Complaints -> $where=block='...' AND lot='...'.
   Filter results by date (Complaints filed during the permit's active window).
   1.2.5 Addenda: The Child Records
   For major projects ("Site Permits"), the actual work is authorized via Addenda.
   Dataset: vckc-dh2h (Building Permit Addenda with Routing).7
   Linkage: parent_permit_number matches the permit_number of the Site Permit.
   Insight: A "Complete" permit history must effectively recursively fetch children.
   Query: SELECT \* FROM vckc-dh2h WHERE parent_permit_number = '202301010001'.
8. Advanced Data Normalization & Cleaning
   The "Sloppy Data" problem requires a robust normalization strategy.
   2.1 The "Contractor Entity" Problem
   Contractor names are free-text fields in many legacy records.
   Variations:
   "TURNER CONSTRUCTION"
   "TURNER CONST CO"
   "TURNER CONSTRUCTION COMPANY"
   The "License" Fallback: Ideally, we normalized by the State License Board (CSLB) number. However, this field is often blank or contains data entry errors (e.g., "pending", "owner builder").
   AI-Driven Resolution Strategy:
   The Cloudflare Worker will implement a "Two-Factor Normalization":
   License Match: If contractor_license is present and valid (regex check), use it as the primary key.
   Fuzzy Name Match: If License is missing, use the AI Agent to generate a "canonical name" hash.
   Prompt: "Standardize these company names to their legal entity form. Ignore 'Inc', 'Corp', 'LLC' suffixes for the purpose of grouping."
   2.2 Address Normalization
   Problem: Socrata stores addresses in parts (street_number, street_name, street_suffix). User queries are typically full strings ("123 Market St").
   Solution: The Worker needs a lightweight parser.
   Input: "123 Market St"
   Regex Parse: ^(\d+)\s+(.\*)\s+(St|Street|Ave|Avenue|...)$
   SoQL Construction: $where=street_number='123' AND (street_name='Market' OR street_name LIKE 'Market%').
9. Architecting the Cloudflare Worker
   This section details the specific Cloudflare technologies and patterns required.
   3.1 Why "Agents" and "Durable Objects"?
   Standard Workers are stateless and have short execution limits (usually 30s or less for the standard tier, though Unbound is higher). A "Search All DBI" query is a Long-Running Operation. It requires:
   Fetching from 5+ APIs.
   Waiting for AI Inference.
   Aggregating potentially thousands of rows.
   Cloudflare Durable Objects (DO) provide the persistence needed for this "Agentic" behavior.14
   The Pattern:
   Client POSTs search criteria -> Worker.
   Worker generates job_id and spawns a DO.
   Worker returns job_id to client.
   DO runs the search asynchronously in the background.
   DO stores results in its own transactional storage.
   Client polls (or uses WebSocket) to get results.
   3.2 The "Agents SDK"
   The newly released Agents SDK 14 abstracts much of the DO boilerplate. It allows you to define an Agent class that inherently understands "Tasks" and "Tools".
   Tool Definition: We define each SODA endpoint as a "Tool" the agent can call.
   tool_fetch_permits
   tool_fetch_complaints
   Planning: The Agent can be prompted: "The user wants the history of 123 Market St. Which tools should I use?" The AI (Llama 3 via Workers AI) will select the relevant tools (Permits, Complaints) and skip irrelevant ones (Contractor Lookup).
   3.3 The Sandbox Option (Python)
   The user queried about using the Cloudflare Sandbox SDK.16 This is a powerful alternative for Analytical Queries.
   Scenario: "Calculate the average time from filing to issuance for all plumbing permits in 94110 zip code for the last 5 years."
   Why Sandbox?
   SoQL cannot calculate averages or time-deltas easily across filtered sets.
   JavaScript (Worker) memory limits might struggle with the dataset size.
   Sandbox Workflow:
   The Worker spawns a Sandbox (micro-VM).
   It injects a Python script using pandas.
   The script downloads the CSV export of the Plumbing dataset (filtered by Zip).
   Pandas calculates the delta: df['days'] = (df['issued_date'] - df['filed_date']).dt.days.
   Pandas calculates the mean: df['days'].mean().
   The JSON result is returned to the Worker.
   Verdict: This is "Overkill" for simple search, but essential for the "Exhaustive/Analytical" requirement of the user prompt. The report recommends a hybrid approach: Agents for Search, Sandbox for Analytics.
10. Implementation: The Coding Agent Guide
    The following technical specifications are for the coding agent that will build this system.
    4.1 Dependency Graph
    wrangler: CLI for deployment.
    @cloudflare/agents: For the Agent/DO logic.
    @cloudflare/ai: For Llama 3 integration.
    @cloudflare/sandbox: For Python offloading.
    hono or itty-router: For the Worker's routing layer.
    4.2 Storage Schema (D1)
    While the Durable Object holds active search state, we need a permanent index for the "Normalized" data to avoid re-running expensive AI jobs.
    Table: normalized_contractors
    ColumnTypeDescriptionidINTEGER PKAuto-inc ID.canonical_nameTEXTThe AI-cleaned name (e.g., "TURNER CONSTRUCTION").cslb_licenseTEXTCA State License Number.raw_variationsJSONArray of raw strings mapped to this entity (e.g., ``).last_updatedDATETIMETimestamp of the last AI verification.
Table: cached_searches
ColumnTypeDescriptionquery_hashTEXT PKMD5 of the search parameters.result_blob_keyTEXTKey to the detailed results in KV.created_atDATETIMEFor TTL management.
4.3 SoQL Query Builder Logic
The coding agent needs a robust function to construct SoQL.
TypeScript
// Conceptual Helper for Coding Agentfunction buildSoQL(params: SearchParams): string {
let whereClauses: string =;
if (params.dateRange) {
whereClauses.push(`status_date BETWEEN '${params.dateRange.start}' AND '${params.dateRange.end}'`);
}
if (params.contractor) {
// Generated by AI Agent previously
const wildcards = params.contractor.wildcards; 
const orGroup = wildcards.map(w => `contractor_name LIKE '${w}'`).join(' OR ');
whereClauses.push(`(${orGroup})`);
}
if (params.geo) {
whereClauses.push(`within_circle(location, ${params.geo.lat}, ${params.geo.lon}, ${params.geo.radius})`);
}
return `$where=${whereClauses.join(' AND ')}&$limit=1000`;
    }
11. Security & operational Considerations
    5.1 Rate Limiting & Quotas
    Socrata: San Francisco's open data portal has rate limits.
    Mitigation: The Worker must implement caching. All identical queries within a 24-hour window should hit Cloudflare KV, not Socrata.
    Header: Always send X-App-Token.
    Cloudflare: Durable Objects and Workers AI have cost implications.
    Mitigation: Implement a "Credit System" or strict Rate Limiting (using Cloudflare Rate Limiting) on the API endpoint to prevent abuse of the expensive AI/Sandbox resources.
    5.2 Data Freshness
    DBI updates data nightly.1
    Strategy: Set KV cache TTL to 24 hours.
    WebHooks: Socrata supports a "Global Dataset Alert" system, but it's unreliable for real-time triggers. Polling/Caching is the safer architecture.
12. Detailed API Specification (The Output)
    The Worker will expose the following REST interface:
    6.1 POST /v1/search
    Initiates a search.
    Body:
    JSON
    {
    "query": "Plumbing permits for Turner Construction in the Mission District since 2022",
    "filters": {
    "type": ["plumbing", "building"],
    "date_min": "2022-01-01",
    "location": "Mission District" // Macro
    }
    }
    Response:
    JSON
    {
    "job_id": "uuid-1234-5678",
    "status": "queued",
    "websocket_url": "wss://api.example.com/v1/connect/uuid-1234-5678"
    }
    6.2 GET /v1/results/{job_id}
    Retrieves the results (Polling fallback).
    Response (Complete):
    JSON
    {
    "status": "complete",
    "data": {
    "permits": [...],
    "complaints": [...],
    "contractor_summary": {
    "canonical_name": "TURNER CONSTRUCTION",
    "variations_found":
    }
    }
    }
13. Conclusion
    This research confirms that building a Semantic Data Integration Layer for SF DBI data on Cloudflare Workers is not only feasible but highly advantageous. The combination of Durable Objects for stateful orchestration, Workers AI for "fuzzy" normalization, and Socrata's SoQL for efficient filtering addresses the core challenges of fragmented and messy public data.
    The resulting system will provide the user with a "Super-API"—a single, intelligent entry point that understands "Contractor Identity" and "Project History" in a way that the raw Socrata endpoints cannot. The provided architectural diagrams, schema mappings, and coding prompts offer a complete blueprint for execution.

To build this comprehensive Agentic Data Analyst for SF DBI data, we need to architect a solution that tightly integrates Cloudflare's emerging capabilities (Workers AI, Agents SDK, Sandbox) with a robust schema management system.

Here is the comprehensive implementation plan and the core code blocks required to transform the `core-dbi-database` repository into the requested ecosystem.

### **Phase 1: Infrastructure & Configuration (`apps/api`)**

First, we must configure the Worker to support Durable Objects (Agents), Browser Rendering (for complex scraping if SODA fails), AI, and the Sandbox.

**1. Update `apps/api/wrangler.jsonc**`
We need to bind the necessary namespaces and capabilities.

```jsonc
{
  "name": "core-dbi-database-api",
  "main": "index.ts",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "observability": {
    "enabled": true,
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "core-dbi-database",
      "database_id": "YOUR_D1_ID",
    },
  ],
  "kv_namespaces": [
    {
      "binding": "KNOWLEDGE_BASE", // Shared facts (aliases, normalization rules)
      "id": "YOUR_KV_ID",
    },
  ],
  "ai": {
    "binding": "AI",
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "ORCHESTRATOR",
        "class_name": "OrchestratorAgent",
      },
      {
        "name": "DATA_EXPERT",
        "class_name": "DataExpertAgent",
      },
    ],
  },
  // Ensure you have the assets uploaded for the Sandbox
  "assets": {
    "directory": "./python-src",
    "binding": "PYTHON_ASSETS",
  },
  "browser": {
    "binding": "BROWSER", // Useful for difficult scraping or PDF rendering
  },
}
```

---

### **Phase 2: Database Schema (`db`)**

We need structured logging for requests and a place to store the normalized "Truth" derived by the agents.

**2. Update `db/schema/index.ts` (and create new files)**

```typescript
// db/schema/requests.ts
import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(), // UUID
  type: text("type").notNull(), // 'api', 'websocket', 'rpc', 'mcp'
  query: text("query"),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  metadata: text("metadata", { mode: "json" }), // Filters, user info
  resultPath: text("result_path"), // Path to result in R2 or D1
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

export const requestLogs = sqliteTable("request_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: text("request_id").references(() => requests.id),
  level: text("level"), // info, warn, error, insight
  message: text("message"),
  timestamp: integer("timestamp", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
});

// db/schema/normalized_data.ts
// Stores the "Truth" derived from SODA
export const contractors = sqliteTable("contractors", {
  id: text("id").primaryKey(), // Generated UUID
  license: text("license"),
  businessName: text("business_name"),
  canonicalName: text("canonical_name"), // The normalized AI name
  metadata: text("metadata", { mode: "json" }), // Aliases found, raw rows
  softDelete: integer("is_active", { mode: "boolean" }).default(true),
  lastVerified: integer("last_verified", { mode: "timestamp" }),
});
```

---

### **Phase 3: The Python Sandbox (`apps/api/python-src`)**

We will create a specific folder for the Python logic that the Sandbox SDK will execute. This isolates the heavy lifting (Pandas/Pydantic).

**3. `apps/api/python-src/main.py**`
A dispatcher that loads specific modules.

```python
import sys
import json
from permit import building, plumbing, electrical
from insights import anomalies

def handler(command, payload):
    if command == "parse_building":
        return building.parse(payload)
    elif command == "analyze_contractor":
        return anomalies.contractor_analysis(payload)
    else:
        return {"error": "Unknown command"}

if __name__ == "__main__":
    # Input is passed via stdin or args in sandbox
    try:
        input_data = json.loads(sys.stdin.read())
        result = handler(input_data.get("command"), input_data.get("payload"))
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

```

**4. `apps/api/python-src/permit/building.py**`

```python
import pandas as pd
import io

def parse(soda_json):
    # Load JSON into DataFrame
    df = pd.DataFrame(soda_json)

    # Normalize Columns
    df.rename(columns={
        "permit_number": "permitId",
        "street_name": "street",
        "existing_units": "units"
    }, inplace=True)

    # Standardize Status
    if 'status' in df.columns:
        df['status'] = df['status'].str.lower().str.strip()

    # Filter out withdrawn/cancelled if needed for this view
    active_df = df[~df['status'].isin(['withdrawn', 'cancelled', 'expired'])]

    # Return stats and records
    return {
        "stats": {
            "total_count": len(df),
            "active_count": len(active_df),
            "total_estimated_cost": df['estimated_cost'].astype(float).sum() if 'estimated_cost' in df.columns else 0
        },
        "records": active_df.to_dict(orient="records")
    }

```

---

### **Phase 4: The Agents (`apps/api/lib/agents`)**

We will use the Cloudflare `Durable Object` primitive, structured as Agents using standard classes.

**5. `apps/api/lib/agents/orchestrator.ts**`
The entry point that assigns tasks.

```typescript
import { DurableObject } from "cloudflare:workers";
import { generateId } from "../utils";

export class OrchestratorAgent extends DurableObject {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // WebSocket Upgrade for Realtime Status
    if (url.pathname === "/websocket") {
      const pair = new WebSocketPair();
      await this.handleSession(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // RPC Method to dispatch task
    if (request.method === "POST" && url.pathname === "/dispatch") {
      const body = await request.json();
      return this.dispatchTask(body);
    }

    return new Response("Orchestrator Ready");
  }

  async dispatchTask(task: any) {
    const taskId = generateId("task");

    // 1. Log Request to D1
    await this.env.DB.prepare(
      "INSERT INTO requests (id, type, query, status) VALUES (?, ?, ?, ?)",
    )
      .bind(taskId, task.type, task.query, "processing")
      .run();

    // 2. Decide which sub-agent to use
    // If querying data -> DataExpert
    // If analyzing -> DataExpert + Sandbox
    const expertId = this.env.DATA_EXPERT.idFromName("SF_DBI_EXPERT_V1");
    const expertStub = this.env.DATA_EXPERT.get(expertId);

    // Fire and forget (or await if blocking)
    this.ctx.waitUntil(
      expertStub.fetch("http://internal/process", {
        method: "POST",
        body: JSON.stringify({ ...task, taskId }),
      }),
    );

    return new Response(JSON.stringify({ taskId, status: "queued" }));
  }

  async handleSession(ws: WebSocket) {
    ws.accept();
    // Subscribe this websocket to specific task updates via DO storage/channels
  }
}
```

**6. `apps/api/lib/agents/data-expert.ts**`
The agent that talks to Socrata, KV, and the Python Sandbox.

```typescript
import { DurableObject } from "cloudflare:workers";
import { runSandbox } from "../sandbox"; // Helper to call Sandbox SDK

export class DataExpertAgent extends DurableObject {
  // ... constructor ...

  async fetch(req: Request) {
    const task = await req.json();

    // 1. Check Learned Facts in KV (Cache/Optimization)
    const facts = await this.env.KNOWLEDGE_BASE.get(`facts:${task.query}`, {
      type: "json",
    });

    // 2. Fetch Raw Data from SODA (Socrata)
    // Note: Using "p4e4-a5a7" for Building Permits
    const socrataUrl = `https://data.sfgov.org/resource/p4e4-a5a7.json?$where=street_name like '%${task.query}%'`;
    const rawResponse = await fetch(socrataUrl, {
      headers: { "X-App-Token": this.env.SOCRATA_TOKEN },
    });
    const data = await rawResponse.json();

    // 3. Normalize using AI (if data is messy)
    const normalizedData = await this.normalizeContractors(data);

    // 4. Advanced Insights via Sandbox (Python)
    let insights = null;
    if (task.includeInsights) {
      // Runs the Python script defined in Phase 3
      insights = await runSandbox(this.env, "parse_building", normalizedData);
    }

    // 5. Save Results & Update Request Status
    // ... D1 Update Logic ...

    return new Response("OK");
  }

  async normalizeContractors(data: any[]) {
    // Use Workers AI to fix messy names
    // "Turner Construction" vs "Turner Const."
    const inputs = data.map(
      (d) => `Contractor: ${d.contractor_name}, Lic: ${d.contractor_license}`,
    );

    // Batch inference or simple loop depending on model limits
    // This updates the internal "Truth" KV
    return data;
  }
}
```

---

### **Phase 5: API Layer (`apps/api/index.ts`)**

Hono + OpenAPI + MCP.

```typescript
import { Hono } from "hono";
import { openAPISpecs } from "hono-openapi";
import { describeRoute } from "hono-openapi";
import { resolver, validator } from "hono-openapi/zod";
import { z } from "zod";
import { OrchestratorAgent } from "./lib/agents/orchestrator";

const app = new Hono<{ Bindings: Env }>();

// 1. MCP Endpoint (Model Context Protocol)
app.get("/mcp", (c) => {
  return c.json({
    jsonrpc: "2.0",
    result: {
      tools: [
        {
          name: "search_permits",
          description: "Search SF DBI permits by address, contractor, or type",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              type: {
                type: "string",
                enum: ["building", "electrical", "plumbing"],
              },
            },
            required: ["query"],
          },
        },
        // Add more tools definitions here
      ],
    },
  });
});

// 2. OpenAPI Search Route
const searchSchema = z.object({
  query: z.string().openapi({ example: "123 Market St" }),
  mode: z.enum(["simple", "deep_analysis"]).default("simple"),
});

app.post(
  "/api/search",
  describeRoute({
    description: "Initiate a DBI search task",
    responses: {
      200: {
        description: "Task created",
        content: {
          "application/json": { schema: z.object({ taskId: z.string() }) },
        },
      },
    },
  }),
  validator("json", searchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const id = c.env.ORCHESTRATOR.idFromName("global");
    const stub = c.env.ORCHESTRATOR.get(id);

    // Dispatch to Orchestrator
    const response = await stub.fetch("http://internal/dispatch", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return c.json(await response.json());
  },
);

// 3. Serve OpenAPI UI
app.get(
  "/openapi.json",
  openAPISpecs(app, {
    documentation: {
      info: { title: "SF DBI Agent API", version: "1.0.0" },
      servers: [
        {
          url: "https://core-dbi-database.jmbish04.workers.dev",
          description: "Production",
        },
      ],
    },
  }),
);

export default {
  fetch: app.fetch,
  // Export Durable Objects
  OrchestratorAgent,
  DataExpertAgent,
};
```

---

### **Phase 6: Frontend Integration (`apps/app`)**

You need to add a page to visualize the KV "Facts" and the streaming Agent logs.

**7. `apps/app/routes/(app)/knowledge-base.tsx**`

```tsx
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// ... imports ...

// Use ShadCN Table to list KV records
export const Route = createFileRoute("/(app)/knowledge-base")({
  component: KnowledgeBasePage,
});

function KnowledgeBasePage() {
  // This would query your API which reads from KV
  const [facts, setFacts] = useState([]);

  const handleSoftDelete = (key: string) => {
    // Call API to set isActive = false in KV
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Agent Knowledge Base</h1>
      <Card>
        <CardHeader>
          <CardTitle>Learned Facts</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Render Table of Contractor Aliases / Address corrections */}
        </CardContent>
      </Card>
    </div>
  );
}
```

**8. Real-time Status Hook**

In your frontend `hooks/use-agent-stream.ts`, implement the WebSocket connection logic that connects to the `core-dbi-database` worker's `/websocket` endpoint using the `taskId` returned from the REST API.

### **Summary of Execution Flow**

1. **User** sends a request via **MCP** or **React Frontend**.
2. **Hono API** receives request, validates via **Zod**, and forwards to **Orchestrator DO**.
3. **Orchestrator** logs request to **D1**, checks if **DataExpert** is needed.
4. **DataExpert** pulls from **Socrata**, checks **KV** for known aliases (e.g., "Bob's Plumbing" = "Robert Smith Inc").
5. If deep analysis is requested, **DataExpert** sends payload to **Python Sandbox**.
6. **Sandbox** runs Pandas script, returns statistical anomalies.
7. **DataExpert** stores final result in **D1** (or R2 for large reports).
8. **Frontend** receives live updates via WebSocket and displays the Shadcn Dashboard.
