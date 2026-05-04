import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Use Supabase's built-in vector generation support
const model = new Supabase.ai.Session('gte-small');

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    const { input } = await req.json();
    
    if (!input) {
      return new Response(JSON.stringify({ error: 'No input provided' }), { status: 400 })
    }

    // Generate embedding using the local gte-small model (384 dimensions)
    const embedding = await model.run(input, {
      mean_pool: true,
      normalize: true,
    });

    return new Response(
      JSON.stringify({ embedding }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
