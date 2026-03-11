import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Compass, Star, Leaf, Rocket, BookOpen, Heart, DollarSign, Palette, PieChart, Activity } from 'lucide-react';
import { FocusTheme, TaskIntent, LeafNode, SynergyLink } from '../types';
import IntentSetupModal from './IntentSetupModal';
import TaskForest from './TaskForest';
import { useUserStore } from '../store/useUserStore';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface EchoCompassProps {
  themes: FocusTheme[];
  onUpdateThemes: (themes: FocusTheme[]) => void;
  forest: LeafNode[];
  synergyLinks: SynergyLink[];
  onAddSynergyLink: (link: SynergyLink) => void;
}

export const COMPASS_INTENTS = [
  { 
    id: TaskIntent.BODY_MIND, 
    title: 'Body & Mind', 
    icon: Leaf, 
    color: 'text-green-400', 
    gradient: 'from-green-500/10 to-emerald-900/20 border-green-500/20' 
  },
  { 
    id: TaskIntent.CAREER_BREAK, 
    title: 'Career Break', 
    icon: Rocket, 
    color: 'text-purple-400', 
    gradient: 'from-purple-500/10 to-indigo-900/20 border-purple-500/20' 
  },
  { 
    id: TaskIntent.ACADEMIC_SPRINT, 
    title: 'Academic Sprint', 
    icon: BookOpen, 
    color: 'text-blue-400', 
    gradient: 'from-blue-500/10 to-cyan-900/20 border-blue-500/20' 
  },
  { 
    id: TaskIntent.DEEP_CONNECT, 
    title: 'Deep Connect', 
    icon: Heart, 
    color: 'text-red-400', 
    gradient: 'from-red-500/10 to-rose-900/20 border-red-500/20' 
  },
  { 
    id: TaskIntent.WEALTH_CONTROL, 
    title: 'Wealth Control', 
    icon: DollarSign, 
    color: 'text-yellow-400', 
    gradient: 'from-yellow-500/10 to-amber-900/20 border-yellow-500/20' 
  },
  { 
    id: TaskIntent.INNER_WILD, 
    title: 'Inner Wild', 
    icon: Palette, 
    color: 'text-orange-400', 
    gradient: 'from-orange-500/10 to-pink-900/20 border-orange-500/20' 
  },
];

const EchoCompass: React.FC<EchoCompassProps> = ({ themes, onUpdateThemes, forest, synergyLinks, onAddSynergyLink }) => {
  console.log("EchoCompass received themes:", themes);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);
  const { dailyAnchorsCompleted, dailyCommuteStats } = useUserStore();
  const safeAnchorsCompleted = dailyAnchorsCompleted || 0;

  // Safe fallback for legacy state where dailyCommuteStats might be undefined
  const safeCommuteStats = dailyCommuteStats || { production: 0, growth: 0, recovery: 0 };

  // --- Data for Pie Chart ---
  const pieData = [
    { name: 'Production', value: safeCommuteStats.production, color: '#3b82f6' }, // Blue
    { name: 'Growth', value: safeCommuteStats.growth, color: '#10b981' },     // Green
    { name: 'Recovery', value: safeCommuteStats.recovery, color: '#a855f7' },   // Purple
  ].filter(d => d.value > 0);

  const totalSeconds = safeCommuteStats.production + safeCommuteStats.growth + safeCommuteStats.recovery;

  // 打开配置弹窗
  const handleOpenSetup = (index: number) => {
    setEditingSlotIndex(index);
    setIsModalOpen(true);
  };

  // 渲染单个意图卡片（已配置状态）
  const renderFilledSlot = (theme: FocusTheme, index: number) => {
    const config = COMPASS_INTENTS.find(c => c.id === theme.intent);
    console.log("renderFilledSlot:", { theme, config });
    
    // Fallback if config is missing (e.g. legacy data)
    if (!config) {
      return renderEmptySlot(index);
    }

    const Icon = config.icon;

    return (
      <motion.div
        key={index}
        layoutId={`slot-${index}`}
        onClick={() => handleOpenSetup(index)}
        className={`relative flex flex-col p-5 rounded-3xl border bg-gradient-to-br ${config.gradient} cursor-pointer hover:brightness-110 transition-all h-[220px]`}
      >
        {/* 核心意图权重星标 */}
        {theme.isPrimary && (
          <div className="absolute top-4 right-4 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">
            <Star size={16} fill="currentColor" />
          </div>
        )}

        <div className={`p-3 rounded-2xl bg-slate-900/50 w-fit mb-4 border border-white/5 ${config.color}`}>
          <Icon size={24} />
        </div>
        <h3 className="text-white font-bold text-lg mb-3">{theme.intent}</h3>
        
        {/* 具体的 AI 聚焦标签 */}
        <div className="flex flex-wrap gap-2 mt-auto">
          {theme.tags.map((tag, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-md bg-black/30 text-slate-300 border border-white/5 truncate max-w-full">
              {tag}
            </span>
          ))}
        </div>
      </motion.div>
    );
  };

  // 渲染空槽位
  const renderEmptySlot = (index: number) => (
    <motion.button
      key={index}
      layoutId={`slot-${index}`}
      onClick={() => handleOpenSetup(index)}
      className="flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/30 hover:bg-slate-800/50 hover:border-slate-700 transition-colors h-[220px] group"
    >
      <div className="p-3 rounded-full bg-slate-800 text-slate-400 group-hover:text-purple-400 group-hover:scale-110 transition-all">
        <Plus size={24} />
      </div>
      <span className="mt-4 text-sm font-medium text-slate-500 group-hover:text-slate-300">
        Add Quarterly Intent
      </span>
    </motion.button>
  );

  return (
    <div className="w-full space-y-8 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto h-full no-scrollbar">
      
      {/* --- Section 1: Daily Pulse (Stars & Pie) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
        {/* Daily Anchors */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[200px]">
           <div className="absolute top-4 left-4 flex items-center gap-2 text-slate-400">
              <Star size={14} />
              <span className="text-xs font-bold uppercase tracking-wider">Daily Anchors</span>
           </div>
           
           <div className="flex gap-2 mt-4">
             {[0, 1, 2].map(i => (
               <motion.div
                 key={i}
                 initial={false}
                 animate={{ 
                   scale: i < safeAnchorsCompleted ? [1, 1.2, 1] : 1,
                   filter: i < safeAnchorsCompleted ? 'grayscale(0%)' : 'grayscale(100%) opacity(30%)'
                 }}
                 transition={{ duration: 0.5, delay: i * 0.1 }}
               >
                 <Star 
                   size={32} 
                   className={i < safeAnchorsCompleted ? "text-amber-400 fill-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]" : "text-slate-600"} 
                   strokeWidth={i < safeAnchorsCompleted ? 0 : 2}
                 />
               </motion.div>
             ))}
           </div>
           <p className="text-xs text-slate-500 mt-4 font-mono">
             {safeAnchorsCompleted}/3 Completed Today
           </p>
        </div>

        {/* Commute Distribution */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[200px]">
           <div className="absolute top-4 left-4 flex items-center gap-2 text-slate-400">
              <PieChart size={14} />
              <span className="text-xs font-bold uppercase tracking-wider">Intent Flow</span>
           </div>

           <div className="w-full h-32 mt-4 relative">
             {totalSeconds === 0 ? (
               <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-600">
                 No data yet
               </div>
             ) : (
               <ResponsiveContainer width="100%" height="100%">
                 <RechartsPieChart>
                   <Pie
                     data={pieData}
                     cx="50%"
                     cy="50%"
                     innerRadius={30}
                     outerRadius={50}
                     paddingAngle={5}
                     dataKey="value"
                     stroke="none"
                   >
                     {pieData.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.color} />
                     ))}
                   </Pie>
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                     itemStyle={{ color: '#fff' }}
                     formatter={(value: number) => [`${Math.round(value / 60)}m`, '']}
                   />
                 </RechartsPieChart>
               </ResponsiveContainer>
             )}
           </div>
           <div className="flex gap-3 mt-2">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-[10px] text-slate-400">Prod</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-slate-400">Grow</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500" /><span className="text-[10px] text-slate-400">Rec</span></div>
           </div>
        </div>
      </div>

      {/* --- Section 2: Quarterly Themes --- */}
      <div>
        <div className="flex items-center gap-2 mb-4 px-2">
          <Compass className="text-purple-500" size={20} />
          <h2 className="text-xl font-bold text-white">Quarterly Focus</h2>
          <span className="ml-auto text-xs text-slate-500 font-medium">{themes.length}/3 Set</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map(index => {
            const theme = themes[index];
            return theme ? renderFilledSlot(theme, index) : renderEmptySlot(index);
          })}
        </div>
      </div>

      {/* --- Section 3: Task Forest --- */}
      {themes.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4 px-2">
            <Leaf className="text-green-500" size={20} />
            <h2 className="text-xl font-bold text-white">Task Forest</h2>
          </div>
          <TaskForest 
            themes={themes} 
            forest={forest} 
            synergyLinks={synergyLinks} 
            onAddSynergyLink={onAddSynergyLink} 
          />
        </div>
      )}

      {/* 配置弹窗 */}
      <AnimatePresence>
        {isModalOpen && editingSlotIndex !== null && (
          <IntentSetupModal
            existingTheme={themes[editingSlotIndex]}
            usedIntents={themes.map(t => t?.intent).filter(Boolean) as TaskIntent[]}
            onClose={() => setIsModalOpen(false)}
            onSave={(newTheme) => {
              const newThemes = [...themes];
              newThemes[editingSlotIndex] = newTheme;
              onUpdateThemes(newThemes.filter(Boolean)); // 过滤掉空洞
              setIsModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default EchoCompass;
