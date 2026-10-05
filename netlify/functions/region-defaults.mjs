export default async function regionDefaults(_request, context) {
  const countryCode = String(context?.geo?.country?.code || '').trim().toUpperCase();
  return new Response(JSON.stringify({ countryCode }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'Vary': 'Accept-Encoding',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
