// @netlify/blobs 11.1.4's emulator omits ETags on GET although PUT enforces them.
// Local development/test ONLY: use the emulator's own version calculation.
// Production never imports this file and never accepts unversioned reads.
export function enableLocalBlobEtags(BlobsServer) {
  const original = BlobsServer.prototype.get;
  if (original.etagCompatibility) return;
  async function get(request) {
    const response = await original.call(this, request);
    if (response.status === 200 && !response.headers.has("etag")) {
      const api = this.parseAPIRequest(request);
      const url = api?.url ?? new URL(request.url, this.address);
      const { dataPath, key } = this.getLocalPaths(url);
      if (dataPath && key && !api?.useSignedURL) {
        const etag = await BlobsServer.generateETag(dataPath);
        if (etag) response.headers.set("etag", etag);
      }
    }
    return response;
  }
  get.etagCompatibility = true;
  BlobsServer.prototype.get = get;
}
