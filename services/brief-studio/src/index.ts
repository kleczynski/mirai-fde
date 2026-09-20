import { handleRequest } from './http.js';
export { BriefPipelineWorkflow } from './workflows/brief-pipeline.js';
export default { fetch: handleRequest } satisfies ExportedHandler<Env>;
