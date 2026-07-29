window.AR_UPLOAD_CONFIG = Object.freeze({
    // Default, cost-safe workflow: the browser creates an optimized GLB and
    // checks for the same filename under this site's /models/ directory.
    mode: 'static',
    staticModelDirectory: 'models/',

    // Scene Viewer recommends <=100,000 triangles and <=10 MB. The exporter
    // aims slightly below the triangle recommendation while preserving detail.
    targetTriangles: 90000,
    maxBytes: 15 * 1024 * 1024,

    // Optional future own-server mode. Set mode to 'api' and provide a public
    // HTTPS endpoint accepting POST model/gltf-binary. No Cloudflare is needed.
    endpoint: ''
});
