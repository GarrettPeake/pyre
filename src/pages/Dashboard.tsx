import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "../contexts/AuthContext";
import * as accounts from "../accounts/accounts.js";
import "./Dashboard.css";

function Dashboard() {
  const { user, links, isLoading, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // Not signed in: a GAuth account whose session ran out goes straight back through
  // GAuth (no clicks while GAuth's own session lasts); anyone else to the home page.
  useEffect(() => {
    if (isLoading || user) return;
    if (accounts.mayAutoSignIn()) accounts.autoSignIn("/dashboard");
    else navigate("/", { replace: true });
  }, [isLoading, user, navigate]);

  // The list as it is now (names change as plans are edited).
  const fetched = useRef(false);
  useEffect(() => {
    if (isLoading || !user || fetched.current) return;
    fetched.current = true;
    refresh().finally(() => setIsLoadingPlans(false));
  }, [isLoading, user, refresh]);

  const plans = links.map((link) => ({ id: link.id, simulationName: link.label ?? "Untitled simulation", protectedAt: link.protectedAt }));

  // A new simulation, protected by this account from the start.
  const handleCreatePlan = async () => {
    setIsCreating(true);
    try {
      const id = uuidv4();
      await accounts.protect(id);
      navigate(`/app/${id}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Couldn't create a simulation.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this plan? This cannot be undone.")) {
      return;
    }

    setDeletingPlanId(planId);
    try {
      const response = await fetch(`/api/plans/${planId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't delete the simulation.");
      }
      await refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Couldn't delete the simulation.");
    } finally {
      setDeletingPlanId(null);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const formatDate = (time?: number) => {
    if (!time) return "Never";
    const date = new Date(time);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-header-content">
          <Link to="/" className="dashboard-logo">
            <h1 className="logo-text">PYRE</h1>
          </Link>
          <div className="dashboard-user-section">
            <span className="dashboard-welcome">Welcome, {user.name}</span>
            <button className="dashboard-logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-content">
          <div className="dashboard-title-row">
            <h2 className="dashboard-title">Your Simulations</h2>
            <button
              className="dashboard-create-button"
              onClick={handleCreatePlan}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "+ New Simulation"}
            </button>
          </div>

          {isLoadingPlans ? (
            <div className="dashboard-loading-plans">
              <div className="spinner"></div>
              <p>Loading your simulations...</p>
            </div>
          ) : plans.length === 0 ? (
            <div className="dashboard-empty">
              <p>You don't have any simulations yet.</p>
              <button
                className="dashboard-create-button"
                onClick={handleCreatePlan}
                disabled={isCreating}
              >
                {isCreating ? "Creating..." : "Create Your First Simulation"}
              </button>
            </div>
          ) : (
            <div className="dashboard-plans-grid">
              {plans.map((plan) => (
                <div key={plan.id} className="dashboard-plan-card">
                  <Link to={`/app/${plan.id}`} className="dashboard-plan-link">
                    <h3 className="dashboard-plan-name">{plan.simulationName}</h3>
                    <p className="dashboard-plan-date">
                      Protected {formatDate(plan.protectedAt)}
                    </p>
                  </Link>
                  <button
                    className="dashboard-plan-delete"
                    onClick={() => handleDeletePlan(plan.id)}
                    disabled={deletingPlanId === plan.id}
                    title="Delete simulation"
                  >
                    {deletingPlanId === plan.id ? "..." : "Delete"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
