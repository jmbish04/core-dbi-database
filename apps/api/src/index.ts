import { createApp } from "./api";

const app = createApp();

export { Sandbox } from "@cloudflare/sandbox";
export {
  DBIDataAnalystAgent,
  DBIDataExpertAgent,
  DBIInsightsAgent,
  OrchestratorAgent,
} from "./agents";
export { CoreDbiDatabaseRpc } from "./rpc";

export default class extends CoreDbiDatabaseRpc {
  override async fetch(request: Request) {
    return app.fetch(request, this.env, this.ctx);
  }
}
