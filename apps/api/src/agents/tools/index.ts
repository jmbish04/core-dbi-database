import * as dbi from "./dbi";
import * as sandbox from "./sandbox";
import * as socrata from "./socrata";

export { dbi, sandbox, socrata };

export type { SodaDatasetKey } from "./socrata";

/**
 * Returns an instance of every available tool, initialized with the provided environment.
 */
export function getAllTools(env: Env) {
  return [
    new sandbox.ContainerInitializeTool(env),
    new sandbox.ContainerPingTool(env),
    new sandbox.ContainerExecTool(env),
    new sandbox.ContainerFileWriteTool(env),
    new sandbox.ContainerFileReadTool(env),
    new sandbox.ContainerFilesListTool(env),
    new sandbox.ContainerFileDeleteTool(env),
    new sandbox.RunPythonScriptTool(env),
    new sandbox.RunNotebookTool(env),
    new dbi.ContractorWildcardsTool(env),
    new dbi.ClassifyIntentTool(env),
    new socrata.SocrataQueryTool(env),
  ];
}
