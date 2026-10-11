window.AR_UPLOAD_CONFIG = Object.freeze({
    // Automated production workflow:
    // Android -> browser GLB export -> Netlify ticket -> direct Supabase upload.
    // iOS    -> browser USDZ export -> Netlify ticket -> direct Supabase upload.
    mode: 'supabase',
    ticketEndpoint: '/api/ar-upload-ticket',

    // Platform-specific geometry budgets. Google recommends 30k-50k triangles
    // and a model around or below 10 MB for Scene Viewer. USDZ stores geometry
    // as verbose USD data, so it uses a lower triangle budget.
    targetGlbTriangles: 45000,
    targetUsdzTriangles: 22000,

    // The exporter retries automatically with a lower triangle target when an
    // asset exceeds these caps. The USDZ cap remains below Supabase Free's
    // 50 MB global maximum and leaves room for bucket/global size interpretation.
    maxGlbBytes: 10 * 1024 * 1024,
    maxUsdzBytes: 45 * 1024 * 1024,

    // Backward-compatible aliases used by older GLB-only code paths.
    targetTriangles: 45000,
    maxBytes: 10 * 1024 * 1024,

    // Cost-safe manual fallback. The optimized selected-format model can always
    // be downloaded if the automated service is unavailable.
    staticModelDirectory: 'models/',

    // Optional future own-server mode. Set mode to 'api' and provide a public
    // HTTPS endpoint accepting the selected binary content type.
    endpoint: ''
});
