import { fileURLToPath } from "node:url";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";
import type { Plugin } from "vite";
import { createHandler } from "../serverless/handler.js";
import { blobStore } from "../serverless/storage.js";
import { enableLocalBlobEtags } from "./local-blobs-compat.mjs";

// Development only: run the same standard function handler, backed by local Blobs.
// Nothing in this module is imported into the client or production function.
export function localGame(): Plugin {
  return {
    name: "market-rush-local-function", apply: "serve",
    async configureServer(vite) {
      enableLocalBlobEtags(BlobsServer);
      const server = new BlobsServer({ directory: fileURLToPath(new URL("../.netlify/local-blobs", import.meta.url)) });
      const { port } = await server.start();
      setEnvironmentContext({ siteID: "market-rush-local", token: "local-preview", edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}` });
      vite.httpServer?.once("close", () => { void server.stop(); });
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== "/.netlify/functions/game") return next();
        try {
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            if (length > 16384) { res.statusCode = 413; res.end(); return; }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers,
            ...(!["GET", "HEAD"].includes(req.method ?? "GET") ? { body: Buffer.concat(chunks).toString() } : {}) });
          const response = await createHandler(blobStore())(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) { next(error); }
      });
    }
  };
}
