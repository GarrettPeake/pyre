interface Env {
  FINANCIAL_PLANS: KVNamespace;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ExecutionContext
  ): Promise<Response> {
    const route = new URL(request.url).pathname;
    try {
      if (route.startsWith("/api/get_plan")) {
        // Extract the key from the route path
        const key = route.replace("/api/get_plan/", "");

        if (!key) {
          return new Response(JSON.stringify({ error: "No key provided" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Get plan data from KV
        const planData = await env.FINANCIAL_PLANS.get(key, { type: "json" });

        if (planData === null) {
          return new Response(JSON.stringify({ error: "Plan not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return new Response(JSON.stringify(planData, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } else if (route.startsWith("/api/save_plan")) {
        // Extract the key from the route path
        const key = route.replace("/api/save_plan/", "");

        if (!key) {
          return new Response(JSON.stringify({ error: "No key provided" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Parse the request body
        const body = await request.json();

        // Save to KV
        await env.FINANCIAL_PLANS.put(key, JSON.stringify(body));

        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } else {
        // Return a 404 to fall through to the frontend
        return new Response(null, { status: 404 });
      }
    } catch (error) {
      console.error("Uncaught exception:", error);
      return new Response(JSON.stringify({ error: "Uncaught exception" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
} satisfies ExportedHandler<Env>;
