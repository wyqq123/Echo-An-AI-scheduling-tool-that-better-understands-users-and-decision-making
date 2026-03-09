import React from 'react';
import { Tab } from '../types';
import { Filter, Calendar, Zap, Compass, LogOut } from 'lucide-react';

interface Props {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const Sidebar: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: Tab.FUNNEL, icon: Filter, label: 'Funnel' },
    { id: Tab.TIMELINE, icon: Calendar, label: 'Timeline' },
    { id: Tab.PODS, icon: Zap, label: 'Pods' },
    { id: Tab.COMPASS, icon: Compass, label: 'Compass' },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 h-full bg-slate-900 border-r border-white/10 p-6">
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
          <Zap size={18} className="text-white" fill="currentColor" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Echo</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                ${isActive 
                  ? 'bg-white/10 text-white shadow-lg shadow-purple-500/10 border border-white/5' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}
              `}
            >
              <Icon 
                size={20} 
                className={`transition-colors ${isActive ? 'text-purple-400' : 'text-slate-500 group-hover:text-slate-300'}`} 
              />
              <span className="font-medium">{tab.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/5">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-white/5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-xs font-bold text-white">
            U
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium text-white truncate">User</p>
            <p className="text-xs text-slate-500 truncate">Free Plan</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
