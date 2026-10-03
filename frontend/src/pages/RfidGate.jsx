import React, { useState } from 'react';
import { Radio, Cpu } from 'lucide-react';
import GateMonitor from './GateMonitor';
import DevicePairing from './DevicePairing';

export default function RfidGate({ onNavigate, currentUser }) {
  const [activeTab, setActiveTab] = useState('monitor');

  const allTabs = [
    { id: 'monitor', label: 'Monitor Gate',      icon: Radio, roles: ['superadmin', 'pm', 'pic_lapangan'] },
    { id: 'pairing', label: 'Konfigurasi Reader', icon: Cpu,   roles: ['superadmin', 'pm'] },
  ];

  const canSeePairing = !currentUser || ['superadmin', 'pm'].includes(currentUser.role);
  const tabs = allTabs.filter((t) => !currentUser || t.roles.includes(currentUser.role));

  // If active tab becomes hidden after role change, reset to first allowed
  React.useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [currentUser?.role]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
                isActive
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'monitor' && (
        <GateMonitor
          onNavigate={onNavigate}
          onOpenPairing={canSeePairing ? () => setActiveTab('pairing') : null}
          currentUser={currentUser}
        />
      )}
      {activeTab === 'pairing' && (
        <DevicePairing currentUser={currentUser} />
      )}
    </div>
  );
}
