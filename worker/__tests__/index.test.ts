import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from "vitest";
import worker from "../index";

/**
 * Mock KVNamespace for testing
 */
function createMockKV() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string, options?: { type?: "json" | "text" }) => {
      const value = store.get(key);
      if (value === undefined) return null;
      if (options?.type === "json") {
        return JSON.parse(value);
      }
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    // For test inspection
    _store: store,
  };
}

/**
 * Create a Request object for testing
 */
function createRequest(
  url: string,
  options: RequestInit = {}
): Request {
  return new Request(url, options);
}

/**
 * Create mock environment with KV namespace
 */
function createMockEnv(kv = createMockKV()) {
  return {
    FINANCIAL_PLANS: kv as unknown as KVNamespace,
    JWT_SECRET: "test-jwt-secret-key-for-testing-only",
  };
}

describe("Worker API", () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let env: ReturnType<typeof createMockEnv>;
  const mockContext = {} as ExecutionContext;

  beforeEach(() => {
    mockKV = createMockKV();
    env = createMockEnv(mockKV);
    vi.clearAllMocks();
  });

  describe("GET /api/get_plan/:key", () => {
    it("should return 400 if no key is provided", async () => {
      const request = createRequest("https://example.com/api/get_plan/");
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "No key provided" });
    });

    it("should return 404 if plan does not exist", async () => {
      const request = createRequest(
        "https://example.com/api/get_plan/05788a14-3b16-5695-858c-7bb18a8bc244"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: "Plan not found" });
      expect(mockKV.get).toHaveBeenCalledWith("05788a14-3b16-5695-858c-7bb18a8bc244", {
        type: "json",
      });
    });

    it("should return plan data if it exists", async () => {
      const planData = {
        simulationName: "Test Plan",
        currentAge: 30,
        retirementAge: 65,
        globalInit: "cash = 10000",
        blocks: [],
      };
      mockKV._store.set("836bfae6-f6b6-56b4-b029-35c4b13f143b", JSON.stringify(planData));

      const request = createRequest(
        "https://example.com/api/get_plan/836bfae6-f6b6-56b4-b029-35c4b13f143b"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(planData);
      expect(mockKV.get).toHaveBeenCalledWith("836bfae6-f6b6-56b4-b029-35c4b13f143b", { type: "json" });
    });

    it("should include CORS headers", async () => {
      const request = createRequest(
        "https://example.com/api/get_plan/de90ee42-a095-565d-a81e-48cc10000e9a"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("should accept upper-case UUIDs", async () => {
      const planData = { name: "Special Plan" };
      const specialKey = "123E4567-E89B-42D3-A456-426614174000";
      mockKV._store.set(specialKey, JSON.stringify(planData));

      const request = createRequest(
        `https://example.com/api/get_plan/${specialKey}`
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(planData);
    });
  });

  describe("Keys that are not plan ids", () => {
    it("never reads or writes user or share records as plans", async () => {
      const user = { username: "alice", passwordHash: "h", salt: "s", planIds: [] };
      mockKV._store.set("user:alice", JSON.stringify(user));
      for (const path of ["get_plan/user:alice", "get_plan/share:x", "create_share/user:alice"]) {
        const response = await worker.fetch(createRequest(`https://example.com/api/${path}`), env, mockContext);
        expect(response.status).toBe(400);
      }
      const save = await worker.fetch(
        createRequest("https://example.com/api/save_plan/user:alice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", passwordHash: "mine", salt: "mine", planIds: [] }),
        }),
        env,
        mockContext
      );
      expect(save.status).toBe(400);
      expect(JSON.parse(mockKV._store.get("user:alice")!)).toEqual(user);
    });
  });

  describe("POST /api/save_plan/:key", () => {
    it("should return 400 if no key is provided", async () => {
      const request = createRequest("https://example.com/api/save_plan/", {
        method: "POST",
        body: JSON.stringify({ data: "test" }),
        headers: { "Content-Type": "application/json" },
      });
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "No key provided" });
    });

    it("should save plan data successfully", async () => {
      const planData = {
        simulationName: "My Retirement Plan",
        currentAge: 25,
        retirementAge: 62,
        globalInit: "k401 = 50000\ncash = 10000",
        blocks: [
          {
            id: "block1",
            title: "Savings",
            startDate: "2024-01-01",
            endDate: "2050-01-01",
          },
        ],
      };

      const request = createRequest(
        "https://example.com/api/save_plan/150c2a3c-f245-5248-9b24-3ca64d8b81d4",
        {
          method: "POST",
          body: JSON.stringify(planData),
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true });
      // Verify put was called and check saved data includes our values plus lastModified
      expect(mockKV.put).toHaveBeenCalled();
      const savedData = JSON.parse(mockKV._store.get("150c2a3c-f245-5248-9b24-3ca64d8b81d4")!);
      expect(savedData.simulationName).toBe("My Retirement Plan");
      expect(savedData.currentAge).toBe(25);
      expect(savedData.lastModified).toBeDefined();
    });

    it("should include CORS headers on save response", async () => {
      const request = createRequest(
        "https://example.com/api/save_plan/1152bed0-eca1-5a16-8f77-1ee0a4a77d83",
        {
          method: "POST",
          body: JSON.stringify({ test: true }),
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("should overwrite existing plan data", async () => {
      const originalPlan = { name: "Original" };
      const updatedPlan = { name: "Updated", newField: true };
      mockKV._store.set("9252d1cf-6bd8-54c8-b0c8-b360de26427c", JSON.stringify(originalPlan));

      const request = createRequest(
        "https://example.com/api/save_plan/9252d1cf-6bd8-54c8-b0c8-b360de26427c",
        {
          method: "POST",
          body: JSON.stringify(updatedPlan),
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      // Verify put was called with the key and check the saved data includes our updates
      expect(mockKV.put).toHaveBeenCalled();
      const savedData = JSON.parse(mockKV._store.get("9252d1cf-6bd8-54c8-b0c8-b360de26427c")!);
      expect(savedData.name).toBe("Updated");
      expect(savedData.newField).toBe(true);
      expect(savedData.lastModified).toBeDefined();
    });

    it("should handle large plan data", async () => {
      const largePlan = {
        simulationName: "Large Plan",
        blocks: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: `block-${i}`,
            title: `Block ${i}`,
            init: "x = ".repeat(100) + "1",
            execution: "y = x + 1\n".repeat(50),
          })),
      };

      const request = createRequest(
        "https://example.com/api/save_plan/52a255af-15d1-5687-84f6-4677e33315a7",
        {
          method: "POST",
          body: JSON.stringify(largePlan),
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      expect(mockKV.put).toHaveBeenCalled();
    });
  });

  describe("Unknown routes", () => {
    it("should return 404 for unknown API routes", async () => {
      const request = createRequest("https://example.com/api/unknown");
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-API routes (falls through to frontend)", async () => {
      const request = createRequest("https://example.com/some/page");
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
    });

    it("should return 404 for root path", async () => {
      const request = createRequest("https://example.com/");
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
    });
  });

  describe("Error handling", () => {
    it("should return 500 on KV read error", async () => {
      mockKV.get = vi.fn().mockRejectedValue(new Error("KV read failed"));

      const request = createRequest(
        "https://example.com/api/get_plan/7bdff0a0-25b7-5d9d-b2cc-5881e28068aa"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Uncaught exception" });
    });

    it("should return 500 on KV write error", async () => {
      mockKV.put = vi.fn().mockRejectedValue(new Error("KV write failed"));

      const request = createRequest(
        "https://example.com/api/save_plan/7bdff0a0-25b7-5d9d-b2cc-5881e28068aa",
        {
          method: "POST",
          body: JSON.stringify({ test: true }),
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Uncaught exception" });
    });

    it("should return 500 on invalid JSON in request body", async () => {
      const request = createRequest(
        "https://example.com/api/save_plan/888cd96d-c7ff-5954-948f-e002c6779819",
        {
          method: "POST",
          body: "not valid json {{{",
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Uncaught exception" });
    });

    it("should include CORS headers even on error responses", async () => {
      mockKV.get = vi.fn().mockRejectedValue(new Error("KV error"));

      const request = createRequest(
        "https://example.com/api/get_plan/7bdff0a0-25b7-5d9d-b2cc-5881e28068aa"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("POST /api/create_share/:planId", () => {
    it("should return 400 if no plan ID is provided", async () => {
      const request = createRequest("https://example.com/api/create_share/", {
        method: "POST",
      });
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "No plan ID provided" });
    });

    it("should return 404 if plan does not exist", async () => {
      const request = createRequest(
        "https://example.com/api/create_share/e72bac0d-ce3f-57cd-a60b-450ad95bcbc0",
        { method: "POST" }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: "Plan not found" });
    });

    it("should create a share link for an existing plan", async () => {
      const planData = { simulationName: "Test Plan", currentAge: 30 };
      mockKV._store.set("836bfae6-f6b6-56b4-b029-35c4b13f143b", JSON.stringify(planData));

      const request = createRequest(
        "https://example.com/api/create_share/836bfae6-f6b6-56b4-b029-35c4b13f143b",
        { method: "POST" }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      const body = (await response.json()) as { shareId: string };
      expect(body).toHaveProperty("shareId");
      expect(typeof body.shareId).toBe("string");
      expect(body.shareId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("should store the share mapping in KV", async () => {
      const planData = { simulationName: "Test Plan" };
      mockKV._store.set("47548d7c-be59-5a01-927a-5744fd59d225", JSON.stringify(planData));

      const request = createRequest(
        "https://example.com/api/create_share/47548d7c-be59-5a01-927a-5744fd59d225",
        { method: "POST" }
      );
      const response = await worker.fetch(request, env, mockContext);
      const body = (await response.json()) as { shareId: string };

      expect(mockKV.put).toHaveBeenCalledWith(
        `share:${body.shareId}`,
        "47548d7c-be59-5a01-927a-5744fd59d225"
      );
    });

    it("should include CORS headers", async () => {
      const planData = { simulationName: "Test Plan" };
      mockKV._store.set("3b28d534-3cb0-5004-885f-7622a49683ad", JSON.stringify(planData));

      const request = createRequest(
        "https://example.com/api/create_share/3b28d534-3cb0-5004-885f-7622a49683ad",
        { method: "POST" }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("GET /api/get_share/:shareId", () => {
    it("should return 400 if no share ID is provided", async () => {
      const request = createRequest("https://example.com/api/get_share/");
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "No share ID provided" });
    });

    it("should return 404 if share link does not exist", async () => {
      const request = createRequest(
        "https://example.com/api/get_share/0615561f-9711-5197-bcbc-6c03dd6583d2"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: "Share link not found" });
    });

    it("should return 404 if underlying plan no longer exists", async () => {
      // Store a share mapping but not the actual plan
      mockKV._store.set("share:f4ee19d1-499d-5fa7-b7b5-4f4b653dc369", "deleted-plan-id");

      const request = createRequest(
        "https://example.com/api/get_share/f4ee19d1-499d-5fa7-b7b5-4f4b653dc369"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: "Plan no longer exists" });
    });

    it("should return plan data for valid share link", async () => {
      const planData = {
        simulationName: "Shared Plan",
        currentAge: 35,
        retirementAge: 60,
      };
      mockKV._store.set("original-plan-id", JSON.stringify(planData));
      mockKV._store.set("share:70eedc4e-4d6e-5f15-be85-3e23d55a8c05", "original-plan-id");

      const request = createRequest(
        "https://example.com/api/get_share/70eedc4e-4d6e-5f15-be85-3e23d55a8c05"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(planData);
    });

    it("should include CORS headers", async () => {
      const request = createRequest(
        "https://example.com/api/get_share/72d18675-12ea-51a2-94e3-b505465e53d8"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("Integration scenarios", () => {
    it("should support save then retrieve workflow", async () => {
      const planData = {
        simulationName: "Integration Test Plan",
        currentAge: 28,
        retirementAge: 60,
        globalInit: "investments = 100000",
        graphs: [{ id: "graph1", title: "Net Worth" }],
        blocks: [],
      };
      const planId = "0b7f1c9e-2a44-4c1e-9d55-7a1b3c5d7e90";

      // Save the plan
      const saveRequest = createRequest(
        `https://example.com/api/save_plan/${planId}`,
        {
          method: "POST",
          body: JSON.stringify(planData),
          headers: { "Content-Type": "application/json" },
        }
      );
      const saveResponse = await worker.fetch(saveRequest, env, mockContext);
      expect(saveResponse.status).toBe(200);

      // Retrieve the plan
      const getRequest = createRequest(
        `https://example.com/api/get_plan/${planId}`
      );
      const getResponse = await worker.fetch(getRequest, env, mockContext);
      expect(getResponse.status).toBe(200);

      const retrievedPlan = await getResponse.json() as Record<string, unknown>;
      // Use toMatchObject to ignore lastModified field added by save
      expect(retrievedPlan).toMatchObject(planData);
      expect(retrievedPlan.lastModified).toBeDefined();
    });

    it("should handle multiple plans independently", async () => {
      const plan1 = { name: "Plan 1" };
      const plan2 = { name: "Plan 2" };

      // Save both plans
      await worker.fetch(
        createRequest("https://example.com/api/save_plan/159aed14-5614-55d0-934c-43882aef4d00", {
          method: "POST",
          body: JSON.stringify(plan1),
          headers: { "Content-Type": "application/json" },
        }),
        env,
        mockContext
      );
      await worker.fetch(
        createRequest("https://example.com/api/save_plan/2cc49ad4-a050-5cbd-9923-250d30ca941a", {
          method: "POST",
          body: JSON.stringify(plan2),
          headers: { "Content-Type": "application/json" },
        }),
        env,
        mockContext
      );

      // Retrieve both plans
      const response1 = await worker.fetch(
        createRequest("https://example.com/api/get_plan/159aed14-5614-55d0-934c-43882aef4d00"),
        env,
        mockContext
      );
      const response2 = await worker.fetch(
        createRequest("https://example.com/api/get_plan/2cc49ad4-a050-5cbd-9923-250d30ca941a"),
        env,
        mockContext
      );

      // Use toMatchObject to ignore lastModified field added by save
      expect(await response1.json()).toMatchObject(plan1);
      expect(await response2.json()).toMatchObject(plan2);
    });

    it("should support create share then retrieve via share link workflow", async () => {
      const planData = {
        simulationName: "Share Workflow Test",
        currentAge: 32,
        retirementAge: 65,
        globalInit: "cash = 50000",
        blocks: [],
      };
      const planId = "5e2d8f6a-91b3-4f07-8c2e-3d4a5b6c7d81";

      // Save the plan
      const saveRequest = createRequest(
        `https://example.com/api/save_plan/${planId}`,
        {
          method: "POST",
          body: JSON.stringify(planData),
          headers: { "Content-Type": "application/json" },
        }
      );
      await worker.fetch(saveRequest, env, mockContext);

      // Create a share link
      const createShareRequest = createRequest(
        `https://example.com/api/create_share/${planId}`,
        { method: "POST" }
      );
      const createShareResponse = await worker.fetch(
        createShareRequest,
        env,
        mockContext
      );
      expect(createShareResponse.status).toBe(200);
      const { shareId } = (await createShareResponse.json()) as { shareId: string };

      // Retrieve via share link
      const getShareRequest = createRequest(
        `https://example.com/api/get_share/${shareId}`
      );
      const getShareResponse = await worker.fetch(
        getShareRequest,
        env,
        mockContext
      );
      expect(getShareResponse.status).toBe(200);

      const retrievedPlan = await getShareResponse.json();
      // Use toMatchObject to ignore lastModified field added by save
      expect(retrievedPlan).toMatchObject(planData);
    });

    it("should allow multiple share links for the same plan", async () => {
      const planData = { simulationName: "Multi-share Plan" };
      mockKV._store.set("8faee7f8-db7f-5241-895d-2b3a00ba28c0", JSON.stringify(planData));

      // Create two share links
      const response1 = await worker.fetch(
        createRequest("https://example.com/api/create_share/8faee7f8-db7f-5241-895d-2b3a00ba28c0", {
          method: "POST",
        }),
        env,
        mockContext
      );
      const response2 = await worker.fetch(
        createRequest("https://example.com/api/create_share/8faee7f8-db7f-5241-895d-2b3a00ba28c0", {
          method: "POST",
        }),
        env,
        mockContext
      );

      const { shareId: shareId1 } = (await response1.json()) as { shareId: string };
      const { shareId: shareId2 } = (await response2.json()) as { shareId: string };

      // Both should be different
      expect(shareId1).not.toBe(shareId2);

      // Both should return the same plan
      const getResponse1 = await worker.fetch(
        createRequest(`https://example.com/api/get_share/${shareId1}`),
        env,
        mockContext
      );
      const getResponse2 = await worker.fetch(
        createRequest(`https://example.com/api/get_share/${shareId2}`),
        env,
        mockContext
      );

      expect(await getResponse1.json()).toEqual(planData);
      expect(await getResponse2.json()).toEqual(planData);
    });
  });
});
