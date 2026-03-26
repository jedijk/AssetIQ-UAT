import React, { useState } from "react";
import { Home, Network, Plus, Bell, Briefcase } from "lucide-react";
import MobileHierarchy from "./MobileHierarchy";
import MobileObservations from "./MobileObservations";
import MobileChat from "./MobileChat";
import MobileActions from "./MobileActions";
import MobileNotifications from "./MobileNotifications";

const MobileApp = () => {
  const [activeTab, setActiveTab] = useState("home");
  const [showChat, setShowChat] = useState(false);

  const tabs = [
    { id: "home", label: "Hierarchy", icon: Home },
    { id: "network", label: "Observations", icon: Network },
    { id: "post", label: "Report", icon: Plus },
    { id: "notifications", label: "Actions", icon: Bell },
    { id: "jobs", label: "Alerts", icon: Briefcase },
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
      case "network":
        return <MobileObservations />;
      case "notifications":
        return <MobileActions />;
      case "jobs":
        return <MobileNotifications />;
      default:
        return <MobileHierarchy />;
    }
  };

  return (
    <div className="mobile-app" data-testid="mobile-app">
      {/* Main Content */}
      <main className="mobile-content">
        {renderContent()}
      </main>

      {/* Chat Modal */}
      {showChat && (
        <MobileChat onClose={() => setShowChat(false)} />
      )}

      {/* Bottom Navigation */}
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
                  <Icon size={24} />
                </div>
              ) : (
                <Icon size={24} />
              )}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .mobile-app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0a0a0a;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .mobile-content {
          flex: 1;
          overflow-y: auto;
          padding-bottom: 70px;
        }

        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          justify-content: space-around;
          align-items: center;
          background: #1a1a1a;
          border-top: 1px solid #333;
          padding: 8px 0;
          padding-bottom: max(8px, env(safe-area-inset-bottom));
          z-index: 100;
        }

        .mobile-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: #888;
          font-size: 10px;
          padding: 4px 12px;
          cursor: pointer;
          transition: color 0.2s;
        }

        .mobile-nav-item.active {
          color: #3b82f6;
        }

        .mobile-nav-item.post-btn {
          color: #fff;
        }

        .post-icon-wrapper {
          background: #3b82f6;
          border-radius: 8px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mobile-nav-item:hover {
          color: #3b82f6;
        }

        .mobile-nav-item.post-btn:hover {
          color: #fff;
        }

        .mobile-nav-item.post-btn:hover .post-icon-wrapper {
          background: #2563eb;
        }
      `}</style>
    </div>
  );
};

export default MobileApp;
