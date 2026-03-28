import React, { useState } from "react";
import { 
  Home, 
  ClipboardList, 
  Plus, 
  AlertTriangle, 
  CheckSquare,
  BarChart3
} from "lucide-react";
import MobileHierarchy from "./MobileHierarchy";
import MobileMyTasks from "./MobileMyTasks";
import MobileObservations from "./MobileObservations";
import MobileActions from "./MobileActions";
import MobileChat from "./MobileChat";
import MobileAnalytics from "./MobileAnalytics";

const MobileApp = () => {
  const [activeTab, setActiveTab] = useState("home");
  const [showChat, setShowChat] = useState(false);

  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "post", label: "Report", icon: Plus },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "observations", label: "Alerts", icon: AlertTriangle },
  ];

  const handleTabClick = (tabId) => {
    if (tabId === "post") {
      setShowChat(true);
    } else {
      setActiveTab(tabId);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <MobileHierarchy />;
      case "analytics":
        return <MobileAnalytics />;
      case "tasks":
        return <MobileMyTasks />;
      case "observations":
        return <MobileObservations />;
      case "actions":
        return <MobileActions />;
      default:
        return <MobileHierarchy />;
    }
  };

  return (
    <div className="mobile-app" data-testid="mobile-app">
      {/* Status Bar Simulation */}
      <div className="status-bar">
        <span className="time">9:41</span>
        <div className="status-icons">
          <svg width="17" height="10" viewBox="0 0 17 10" fill="currentColor">
            <path d="M0 3a2 2 0 012-2h1a2 2 0 012 2v4a2 2 0 01-2 2H2a2 2 0 01-2-2V3zm5 0a2 2 0 012-2h1a2 2 0 012 2v4a2 2 0 01-2 2H7a2 2 0 01-2-2V3zm5 0a2 2 0 012-2h1a2 2 0 012 2v4a2 2 0 01-2 2h-1a2 2 0 01-2-2V3z"/>
          </svg>
          <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
            <path d="M7.5 2.5l6 6H1.5l6-6z"/>
          </svg>
          <div className="battery">
            <div className="battery-level"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="mobile-content">
        {renderContent()}
      </main>

      {/* Chat Modal */}
      {showChat && (
        <MobileChat onClose={() => setShowChat(false)} />
      )}

      {/* LinkedIn-style Bottom Navigation */}
      <nav className="mobile-nav" data-testid="mobile-nav">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isPost = tab.id === "post";

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`mobile-nav-item ${isActive ? "active" : ""} ${isPost ? "post-btn" : ""}`}
              data-testid={`mobile-nav-${tab.id}`}
            >
              {isPost ? (
                <div className="post-icon-wrapper">
                  <Icon size={20} strokeWidth={2.5} />
                </div>
              ) : (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="nav-label">{tab.label}</span>
                  {isActive && <div className="active-indicator" />}
                </>
              )}
            </button>
          );
        })}
      </nav>

      <style>{`
        .mobile-app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          background: #fafafa;
          color: #1a1a1a;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
          position: relative;
          overflow: hidden;
        }

        /* Status Bar */
        .status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 24px 8px;
          background: #ffffff;
          font-size: 14px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .status-icons {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .battery {
          width: 22px;
          height: 10px;
          border: 1.5px solid #1a1a1a;
          border-radius: 3px;
          padding: 1px;
          position: relative;
        }

        .battery::after {
          content: '';
          position: absolute;
          right: -4px;
          top: 50%;
          transform: translateY(-50%);
          width: 2px;
          height: 5px;
          background: #1a1a1a;
          border-radius: 0 1px 1px 0;
        }

        .battery-level {
          width: 100%;
          height: 100%;
          background: #22c55e;
          border-radius: 1px;
        }

        /* Main Content */
        .mobile-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }

        /* Bottom Navigation - LinkedIn Style */
        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-around;
          align-items: flex-end;
          background: #ffffff;
          border-top: 1px solid #e5e5e5;
          padding: 6px 0 0 0;
          padding-bottom: max(6px, env(safe-area-inset-bottom));
          z-index: 100;
          height: 70px;
        }

        .mobile-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          background: none;
          border: none;
          color: #666666;
          font-size: 10px;
          font-weight: 500;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          min-width: 60px;
        }

        .mobile-nav-item.active {
          color: #0a66c2;
        }

        .mobile-nav-item .nav-label {
          margin-top: 2px;
          font-weight: 500;
        }

        .mobile-nav-item.active .nav-label {
          font-weight: 600;
        }

        .active-indicator {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 28px;
          height: 2px;
          background: #0a66c2;
          border-radius: 0 0 2px 2px;
        }

        .mobile-nav-item.post-btn {
          color: #fff;
          padding: 0;
        }

        .post-icon-wrapper {
          background: linear-gradient(145deg, #f59e0b 0%, #d97706 100%);
          border-radius: 14px;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);
          margin-bottom: 16px;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .mobile-nav-item.post-btn:active .post-icon-wrapper {
          transform: scale(0.95);
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
        }
      `}</style>
    </div>
  );
};

export default MobileApp;
