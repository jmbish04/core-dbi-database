interface Env {
  ASSETS: Fetcher;
  API: Service<{
    startSearch(request: any): Promise<any>;
    startAnalysis(request: any): Promise<any>;
    getFacts(): Promise<any>;
    getStatus(requestId: string): Promise<any>;
  }>;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // This simple worker primarily serves the static assets.
    // It can be expanded to proxy requests to internal services via binding if needed,
    // or to implement server-side logic that calls env.API.

    // Example of using the binding (commented out):
    // const results = await env.API.startSearch({...});

    return env.ASSETS.fetch(request);
  },
};
