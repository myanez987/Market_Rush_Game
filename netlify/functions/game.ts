import { createHandler } from "../../serverless/handler.js";
import { blobStore } from "../../serverless/storage.js";

// Netlify supplies Blobs context automatically. The filename defines the endpoint.
export default async function game(request: Request): Promise<Response> {
  return createHandler(blobStore())(request);
}
