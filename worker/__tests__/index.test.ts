import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  type MockInstance,
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
        "https://example.com/api/get_plan/nonexistent-key"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: "Plan not found" });
      expect(mockKV.get).toHaveBeenCalledWith("nonexistent-key", {
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
      mockKV._store.set("test-plan-id", JSON.stringify(planData));

      const request = createRequest(
        "https://example.com/api/get_plan/test-plan-id"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(planData);
      expect(mockKV.get).toHaveBeenCalledWith("test-plan-id", { type: "json" });
    });

    it("should include CORS headers", async () => {
      const request = createRequest(
        "https://example.com/api/get_plan/some-key"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("should handle keys with special characters", async () => {
      const planData = { name: "Special Plan" };
      const specialKey = "plan-with-uuid-123e4567-e89b";
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
        "https://example.com/api/save_plan/my-plan-id",
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
      expect(mockKV.put).toHaveBeenCalledWith(
        "my-plan-id",
        JSON.stringify(planData)
      );
    });

    it("should include CORS headers on save response", async () => {
      const request = createRequest(
        "https://example.com/api/save_plan/test-key",
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
      mockKV._store.set("existing-plan", JSON.stringify(originalPlan));

      const request = createRequest(
        "https://example.com/api/save_plan/existing-plan",
        {
          method: "POST",
          body: JSON.stringify(updatedPlan),
          headers: { "Content-Type": "application/json" },
        }
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(200);
      expect(mockKV.put).toHaveBeenCalledWith(
        "existing-plan",
        JSON.stringify(updatedPlan)
      );
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
        "https://example.com/api/save_plan/large-plan",
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
        "https://example.com/api/get_plan/error-key"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Uncaught exception" });
    });

    it("should return 500 on KV write error", async () => {
      mockKV.put = vi.fn().mockRejectedValue(new Error("KV write failed"));

      const request = createRequest(
        "https://example.com/api/save_plan/error-key",
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
        "https://example.com/api/save_plan/bad-json",
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
        "https://example.com/api/get_plan/error-key"
      );
      const response = await worker.fetch(request, env, mockContext);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
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
      const planId = "integration-test-plan";

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

      const retrievedPlan = await getResponse.json();
      expect(retrievedPlan).toEqual(planData);
    });

    it("should handle multiple plans independently", async () => {
      const plan1 = { name: "Plan 1" };
      const plan2 = { name: "Plan 2" };

      // Save both plans
      await worker.fetch(
        createRequest("https://example.com/api/save_plan/plan-1", {
          method: "POST",
          body: JSON.stringify(plan1),
          headers: { "Content-Type": "application/json" },
        }),
        env,
        mockContext
      );
      await worker.fetch(
        createRequest("https://example.com/api/save_plan/plan-2", {
          method: "POST",
          body: JSON.stringify(plan2),
          headers: { "Content-Type": "application/json" },
        }),
        env,
        mockContext
      );

      // Retrieve both plans
      const response1 = await worker.fetch(
        createRequest("https://example.com/api/get_plan/plan-1"),
        env,
        mockContext
      );
      const response2 = await worker.fetch(
        createRequest("https://example.com/api/get_plan/plan-2"),
        env,
        mockContext
      );

      expect(await response1.json()).toEqual(plan1);
      expect(await response2.json()).toEqual(plan2);
    });
  });
});
