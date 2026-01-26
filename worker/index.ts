interface Env {
  FINANCIAL_PLANS: KVNamespace;
}

// Generate a UUID v4 (for share links)
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
      // Create a share link for a plan
      if (route.startsWith("/api/create_share/")) {
        const planId = route.replace("/api/create_share/", "");

        if (!planId) {
          return new Response(JSON.stringify({ error: "No plan ID provided" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Verify the plan exists
        const planData = await env.FINANCIAL_PLANS.get(planId);
        if (planData === null) {
          return new Response(JSON.stringify({ error: "Plan not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Generate a new share UUID
        const shareId = generateUUID();

        // Store the mapping: share:{shareId} -> planId
        await env.FINANCIAL_PLANS.put(`share:${shareId}`, planId);

        return new Response(JSON.stringify({ shareId }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Get plan data via share link (read-only)
      if (route.startsWith("/api/get_share/")) {
        const shareId = route.replace("/api/get_share/", "");

        if (!shareId) {
          return new Response(JSON.stringify({ error: "No share ID provided" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Get the planId from the share mapping
        const planId = await env.FINANCIAL_PLANS.get(`share:${shareId}`);
        if (planId === null) {
          return new Response(JSON.stringify({ error: "Share link not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // Get the actual plan data
        const planData = await env.FINANCIAL_PLANS.get(planId, { type: "json" });
        if (planData === null) {
          return new Response(JSON.stringify({ error: "Plan no longer exists" }), {
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
      }

      if (route.startsWith("/api/get_plan/")) {
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
