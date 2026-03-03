import React from 'react';
import { Tab } from '../types';
import { Filter, Calendar, Zap, Compass } from 'lucide-react';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const BottomNav: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: Tab.FUNNEL, icon: Filter, label: 'Funnel' },
    { id: Tab.TIMELINE, icon: Calendar, label: 'Timeline' },
    { id: Tab.PODS, icon: Zap, label: 'Pods' },
    { id: Tab.COMPASS, icon: Compass, label: 'Compass' },
  ];

  return (
    <div className="glass-panel border-t border-t-white/10 px-6 py-4 flex justify-between items-center relative z-50">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative flex flex-col items-center gap-1 w-16"
          >
            <div className={`
              p-2 rounded-xl transition-all duration-300
              ${isActive ? 'bg-white text-slate-900 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-slate-400 hover:text-slate-200'}
            `}>
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            {isActive && (
              <span className="absolute -bottom-2 w-1 h-1 rounded-full bg-white" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BottomNav;
