window.AR_UPLOAD_CONFIG = Object.freeze({
    // Automated production workflow:
    // browser GLB export -> small Netlify ticket function -> direct resumable
    // upload to Supabase Storage -> public URL -> Scene Viewer QR.
    mode: 'supabase',
    ticketEndpoint: '/api/ar-upload-ticket',
    uploadKeySessionStorageName: 'configurator360.arUploadKey',

    // Scene Viewer recommendations and hard application guard.
    targetTriangles: 90000,
    maxBytes: 15 * 1024 * 1024,

    // Cost-safe manual fallback. The optimized GLB can always be downloaded if
    // the automated service is unavailable.
    staticModelDirectory: 'models/',

    // Optional future own-server mode. Set mode to 'api' and provide a public
    // HTTPS endpoint accepting POST model/gltf-binary.
    endpoint: ''
});
