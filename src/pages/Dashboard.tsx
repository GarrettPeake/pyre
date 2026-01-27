import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Dashboard.css";

interface PlanSummary {
  id: string;
  simulationName: string;
  lastModified?: string;
}

function Dashboard() {
  const { user, token, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/");
    }
  }, [isLoading, user, navigate]);

  // Fetch plans
  useEffect(() => {
    const fetchPlans = async () => {
      if (!token) return;

      try {
        const response = await fetch("/api/plans", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans);
        }
      } catch (error) {
        console.error("Error fetching plans:", error);
      } finally {
        setIsLoadingPlans(false);
      }
    };

    if (user && token) {
      fetchPlans();
    }
  }, [user, token]);

  const handleCreatePlan = async () => {
    if (!token) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/plans/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        navigate(`/app/${data.planId}`);
      }
    } catch (error) {
      console.error("Error creating plan:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to delete this plan? This cannot be undone.")) {
      return;
    }

    setDeletingPlanId(planId);
    try {
      const response = await fetch(`/api/plans/${planId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== planId));
      }
    } catch (error) {
      console.error("Error deleting plan:", error);
    } finally {
      setDeletingPlanId(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
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
            <span className="dashboard-welcome">Welcome, {user.username}</span>
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
                      Last modified: {formatDate(plan.lastModified)}
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
