interface Env {
  FINANCIAL_PLANS: KVNamespace;
  JWT_SECRET: string;
}

// Types for auth
interface UserRecord {
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  planIds: string[];
}

interface JWTPayload {
  username: string;
  exp: number;
}

interface SavedPlanData {
  simulationName: string;
  currentAge: number;
  retirementAge: number;
  globalInit: string;
  graphs: unknown[];
  blocks: unknown[];
  owner?: string;
  lastModified?: string;
}

// ============ JWT Utilities ============

async function createJWT(payload: JWTPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signHMAC(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = await signHMAC(`${encodedHeader}.${encodedPayload}`, secret);

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function signHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  return atob(base64);
}

// ============ Password Utilities ============

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(derivedBits)));
}

function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(String.fromCharCode(...bytes));
}

// ============ Auth Helpers ============

async function getUserFromToken(
  request: Request,
  env: Env
): Promise<{ username: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, env.JWT_SECRET);
  return payload ? { username: payload.username } : null;
}

function validateUsername(username: string): string | null {
  const normalized = username.toLowerCase().trim();
  if (normalized.length < 3 || normalized.length > 30) {
    return "Username must be 3-30 characters";
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return "Username can only contain letters, numbers, and underscores";
  }
  const reserved = ["admin", "root", "system", "api", "www", "mail", "support"];
  if (reserved.includes(normalized)) {
    return "This username is reserved";
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }
  return null;
}

// Helper to create JSON response with CORS
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Handle CORS preflight
function handleCORS(): Response {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ============ Default Plan Data ============
// Must match the defaults in src/pages/AppPage.tsx

function createDefaultPlan(owner: string): SavedPlanData {
  return {
    simulationName: "My Retirement Plan",
    currentAge: 30,
    retirementAge: 62,
    globalInit: `k401 = 100000\ncash = 100000\ninvestments = 200000\nbonds = 100000\nproperty = 0\ndebts = 0`,
    graphs: [
      {
        id: generateUUID(),
        title: "Net Worth",
        frequency: "monthly",
        verticals: [],
        expressions: {
          line: ["k401 + cash + investments + bonds + property - debts"],
          stacked: ["k401", "cash", "investments", "bonds", "property", "-debts"],
        },
      },
      {
        id: generateUUID(),
        title: "Mortgage (Interest vs principal)",
        frequency: "monthly",
        verticals: [],
        expressions: {
          line: ["interest_portion", "principal_portion"],
        },
      },
    ],
    blocks: [
      {
        id: generateUUID(),
        state: {
          title: "Home loan",
          startDate: "2025-11-01",
          endDate: "2055-11-01",
          inputs: {
            down: "25000",
            principal: "175000",
            apr: "0.06",
          },
          init: `asset_price = down + principal\nmonthly_interest = apr / 12\npayment = principal * monthly_interest * (1 + monthly_interest) ** total_periods / ((1 + monthly_interest) ** total_periods - 1)\nproperty = property + asset_price\ndebts = debts + principal\ncash = cash - down`,
          frequency: "monthly",
          execution: `interest_portion = principal * monthly_interest\nprincipal_portion = payment - interest_portion\nprincipal = principal - principal_portion\ndebts = debts - principal_portion\ncash = cash - payment`,
          exports: "interest_portion,principal_portion,payment",
          graphs: [
            {
              id: generateUUID(),
              title: "Portions",
              frequency: "monthly",
              verticals: [],
              expressions: {
                line: ["interest_portion", "principal_portion"],
              },
            },
          ],
        },
      },
    ],
    owner,
    lastModified: new Date().toISOString(),
  };
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

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    try {
      // ============ Auth Endpoints ============

      // POST /api/auth/login - Combined login/signup
      if (route === "/api/auth/login" && request.method === "POST") {
        const body = (await request.json()) as { username?: string; password?: string };
        const { username, password } = body;

        if (!username || !password) {
          return jsonResponse({ error: "Username and password required" }, 400);
        }

        // Validate inputs
        const usernameError = validateUsername(username);
        if (usernameError) {
          return jsonResponse({ error: usernameError }, 400);
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
          return jsonResponse({ error: passwordError }, 400);
        }

        const normalizedUsername = username.toLowerCase().trim();
        const userKey = `user:${normalizedUsername}`;
        const existingUser = await env.FINANCIAL_PLANS.get(userKey, { type: "json" }) as UserRecord | null;

        if (existingUser) {
          // Login: verify password
          const hash = await hashPassword(password, existingUser.salt);
          if (hash !== existingUser.passwordHash) {
            return jsonResponse({ error: "Invalid password" }, 401);
          }

          // Create JWT (30 day expiration)
          const token = await createJWT(
            { username: normalizedUsername, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
            env.JWT_SECRET
          );

          return jsonResponse({
            token,
            isNewUser: false,
            username: normalizedUsername,
            planIds: existingUser.planIds,
          });
        } else {
          // Signup: create new user with first plan
          const salt = generateSalt();
          const passwordHash = await hashPassword(password, salt);
          const firstPlanId = generateUUID();

          const newUser: UserRecord = {
            username: normalizedUsername,
            passwordHash,
            salt,
            createdAt: new Date().toISOString(),
            planIds: [firstPlanId],
          };

          // Create the first plan with full defaults (same as anonymous plan)
          const firstPlan = createDefaultPlan(normalizedUsername);

          // Save user and plan
          await env.FINANCIAL_PLANS.put(userKey, JSON.stringify(newUser));
          await env.FINANCIAL_PLANS.put(firstPlanId, JSON.stringify(firstPlan));

          // Create JWT
          const token = await createJWT(
            { username: normalizedUsername, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
            env.JWT_SECRET
          );

          return jsonResponse({
            token,
            isNewUser: true,
            username: normalizedUsername,
            planIds: [firstPlanId],
          });
        }
      }

      // GET /api/auth/me - Get current user info
      if (route === "/api/auth/me" && request.method === "GET") {
        const user = await getUserFromToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Not authenticated" }, 401);
        }

        const userRecord = await env.FINANCIAL_PLANS.get(`user:${user.username}`, { type: "json" }) as UserRecord | null;
        if (!userRecord) {
          return jsonResponse({ error: "User not found" }, 404);
        }

        return jsonResponse({
          username: userRecord.username,
          planIds: userRecord.planIds,
        });
      }

      // POST /api/auth/logout - Logout (client-side token deletion, but endpoint for future blocklist)
      if (route === "/api/auth/logout" && request.method === "POST") {
        // With JWTs, logout is primarily client-side (delete token)
        // This endpoint exists for future blocklist functionality
        return jsonResponse({ success: true });
      }

      // GET /api/plans - Get plan summaries for authenticated user
      if (route === "/api/plans" && request.method === "GET") {
        const user = await getUserFromToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Authentication required" }, 401);
        }

        const userRecord = await env.FINANCIAL_PLANS.get(`user:${user.username}`, { type: "json" }) as UserRecord | null;
        if (!userRecord) {
          return jsonResponse({ error: "User not found" }, 404);
        }

        // Fetch all plans and return summaries
        const planSummaries = await Promise.all(
          userRecord.planIds.map(async (planId) => {
            const plan = await env.FINANCIAL_PLANS.get(planId, { type: "json" }) as SavedPlanData | null;
            if (!plan) return null;
            return {
              id: planId,
              simulationName: plan.simulationName,
              lastModified: plan.lastModified,
            };
          })
        );

        // Filter out null values (deleted plans)
        const validPlans = planSummaries.filter((p) => p !== null);

        return jsonResponse({ plans: validPlans });
      }

      // POST /api/plans/create - Create a new plan for authenticated user
      if (route === "/api/plans/create" && request.method === "POST") {
        const user = await getUserFromToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Authentication required" }, 401);
        }

        // Get user record
        const userRecord = await env.FINANCIAL_PLANS.get(`user:${user.username}`, { type: "json" }) as UserRecord | null;
        if (!userRecord) {
          return jsonResponse({ error: "User not found" }, 404);
        }

        // Create new plan with full defaults (same as anonymous plan)
        const newPlanId = generateUUID();
        const newPlan = createDefaultPlan(user.username);

        // Update user's planIds
        userRecord.planIds.push(newPlanId);

        // Save both
        await env.FINANCIAL_PLANS.put(newPlanId, JSON.stringify(newPlan));
        await env.FINANCIAL_PLANS.put(`user:${user.username}`, JSON.stringify(userRecord));

        return jsonResponse({ planId: newPlanId });
      }

      // POST /api/plans/link - Link anonymous plan to account
      if (route === "/api/plans/link" && request.method === "POST") {
        const user = await getUserFromToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Authentication required" }, 401);
        }

        const body = (await request.json()) as { sourcePlanId?: string };
        const { sourcePlanId } = body;

        if (!sourcePlanId) {
          return jsonResponse({ error: "sourcePlanId required" }, 400);
        }

        // Get source plan
        const sourcePlan = await env.FINANCIAL_PLANS.get(sourcePlanId, { type: "json" }) as SavedPlanData | null;
        if (!sourcePlan) {
          return jsonResponse({ error: "Source plan not found" }, 404);
        }

        // Verify it's anonymous (no owner)
        if (sourcePlan.owner) {
          return jsonResponse({ error: "Plan is already protected" }, 400);
        }

        // Create new plan with ownership
        const newPlanId = generateUUID();
        const newPlan: SavedPlanData = {
          ...sourcePlan,
          owner: user.username,
          lastModified: new Date().toISOString(),
        };

        // Update user's planIds
        const userRecord = await env.FINANCIAL_PLANS.get(`user:${user.username}`, { type: "json" }) as UserRecord | null;
        if (!userRecord) {
          return jsonResponse({ error: "User not found" }, 404);
        }

        userRecord.planIds.push(newPlanId);

        // Save both
        await env.FINANCIAL_PLANS.put(newPlanId, JSON.stringify(newPlan));
        await env.FINANCIAL_PLANS.put(`user:${user.username}`, JSON.stringify(userRecord));

        return jsonResponse({ newPlanId });
      }

      // DELETE /api/plans/:planId - Delete a plan
      if (route.startsWith("/api/plans/") && request.method === "DELETE") {
        const planId = route.replace("/api/plans/", "");
        if (!planId || planId === "create" || planId === "link") {
          return jsonResponse({ error: "Invalid plan ID" }, 400);
        }

        const user = await getUserFromToken(request, env);
        if (!user) {
          return jsonResponse({ error: "Authentication required" }, 401);
        }

        // Get the plan
        const plan = await env.FINANCIAL_PLANS.get(planId, { type: "json" }) as SavedPlanData | null;
        if (!plan) {
          return jsonResponse({ error: "Plan not found" }, 404);
        }

        // Verify ownership
        if (plan.owner !== user.username) {
          return jsonResponse({ error: "Access denied" }, 403);
        }

        // Remove from user's planIds
        const userRecord = await env.FINANCIAL_PLANS.get(`user:${user.username}`, { type: "json" }) as UserRecord | null;
        if (userRecord) {
          userRecord.planIds = userRecord.planIds.filter((id) => id !== planId);
          await env.FINANCIAL_PLANS.put(`user:${user.username}`, JSON.stringify(userRecord));
        }

        // Delete the plan
        await env.FINANCIAL_PLANS.delete(planId);

        return jsonResponse({ success: true });
      }

      // ============ Existing Endpoints ============

      // Create a share link for a plan
      if (route.startsWith("/api/create_share/")) {
        const planId = route.replace("/api/create_share/", "");

        if (!planId) {
          return jsonResponse({ error: "No plan ID provided" }, 400);
        }

        // Verify the plan exists and user has access
        const planData = await env.FINANCIAL_PLANS.get(planId, { type: "json" }) as SavedPlanData | null;
        if (planData === null) {
          return jsonResponse({ error: "Plan not found" }, 404);
        }

        // If protected, verify ownership
        if (planData.owner) {
          const user = await getUserFromToken(request, env);
          if (!user || user.username !== planData.owner) {
            return jsonResponse({ error: "Access denied" }, 403);
          }
        }

        // Generate a new share UUID
        const shareId = generateUUID();

        // Store the mapping: share:{shareId} -> planId
        await env.FINANCIAL_PLANS.put(`share:${shareId}`, planId);

        return jsonResponse({ shareId });
      }

      // Get plan data via share link (read-only, bypasses auth)
      if (route.startsWith("/api/get_share/")) {
        const shareId = route.replace("/api/get_share/", "");

        if (!shareId) {
          return jsonResponse({ error: "No share ID provided" }, 400);
        }

        // Get the planId from the share mapping
        const planId = await env.FINANCIAL_PLANS.get(`share:${shareId}`);
        if (planId === null) {
          return jsonResponse({ error: "Share link not found" }, 404);
        }

        // Get the actual plan data (share links bypass auth)
        const planData = await env.FINANCIAL_PLANS.get(planId, { type: "json" });
        if (planData === null) {
          return jsonResponse({ error: "Plan no longer exists" }, 404);
        }

        return jsonResponse(planData);
      }

      if (route.startsWith("/api/get_plan/")) {
        // Extract the key from the route path
        const key = route.replace("/api/get_plan/", "");

        if (!key) {
          return jsonResponse({ error: "No key provided" }, 400);
        }

        // Get plan data from KV
        const planData = await env.FINANCIAL_PLANS.get(key, { type: "json" }) as SavedPlanData | null;

        if (planData === null) {
          return jsonResponse({ error: "Plan not found" }, 404);
        }

        // Check authorization for protected plans
        if (planData.owner) {
          const user = await getUserFromToken(request, env);
          if (!user) {
            return jsonResponse({ error: "Authentication required" }, 401);
          }
          if (user.username !== planData.owner) {
            return jsonResponse({ error: "Access denied" }, 403);
          }
        }

        return jsonResponse(planData);
      } else if (route.startsWith("/api/save_plan")) {
        // Extract the key from the route path
        const key = route.replace("/api/save_plan/", "");

        if (!key) {
          return jsonResponse({ error: "No key provided" }, 400);
        }

        // Check if plan exists and has an owner
        const existingPlan = await env.FINANCIAL_PLANS.get(key, { type: "json" }) as SavedPlanData | null;

        if (existingPlan?.owner) {
          // Protected plan - require auth from owner
          const user = await getUserFromToken(request, env);
          if (!user) {
            return jsonResponse({ error: "Authentication required" }, 401);
          }
          if (user.username !== existingPlan.owner) {
            return jsonResponse({ error: "Access denied" }, 403);
          }
        }

        // Parse the request body
        const body = (await request.json()) as SavedPlanData;

        // Preserve ownership if it exists
        if (existingPlan?.owner) {
          body.owner = existingPlan.owner;
        }

        // Update lastModified
        body.lastModified = new Date().toISOString();

        // Save to KV
        await env.FINANCIAL_PLANS.put(key, JSON.stringify(body));

        return jsonResponse({ success: true });
      } else {
        // Return a 404 to fall through to the frontend
        return new Response(null, { status: 404 });
      }
    } catch (error) {
      console.error("Uncaught exception:", error);
      return jsonResponse({ error: "Uncaught exception" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
