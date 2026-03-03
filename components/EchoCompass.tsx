import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Edit2, Check, X } from 'lucide-react';
import { Task, LeafNode, TaskCategory } from '../types';
import { useUserStore } from '../store/useUserStore';

const data = [
  { name: 'Production', value: 35, color: '#3b82f6' }, // Blue
  { name: 'Growth', value: 25, color: '#10b981' }, // Green
  { name: 'Recovery', value: 40, color: '#a855f7' }, // Purple
];

interface Props {
  tasks: Task[];
  forest: LeafNode[];
}

const Leaf = ({ leaf }: { leaf: LeafNode }) => {
  // Scale based on count (completion), capped at 1.8x
  const scale = Math.min(1 + leaf.count * 0.15, 1.8);
  // Opacity increases with count
  const opacity = Math.min(0.5 + leaf.count * 0.1, 1);
  
  const categoryColors: Record<string, string> = {
    [TaskCategory.WORK]: 'bg-blue-500',
    [TaskCategory.GROWTH]: 'bg-emerald-500',
    [TaskCategory.STUDY]: 'bg-amber-500',
    [TaskCategory.LIFE]: 'bg-purple-500'
  };

  const color = categoryColors[leaf.category] || 'bg-slate-500';

  return (
    <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale, opacity }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative flex flex-col items-center group -mb-2 mx-1"
    >
      {/* Count Badge */}
      <span className="absolute -top-6 bg-white/10 border border-white/20 px-1.5 py-0.5 rounded text-[8px] backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
        ×{leaf.count}
      </span>
      
      {/* Leaf Shape */}
      <div 
        className={`w-4 h-6 rounded-tr-[100%] rounded-bl-[100%] ${color} shadow-[0_0_10px_rgba(255,255,255,0.1)] cursor-pointer hover:brightness-125 transition-all`} 
        style={{ transform: `rotate(-45deg)` }}
      />
      
      {/* Task Name Tooltip */}
      <div className="absolute top-8 opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
        <span className="text-[10px] text-white bg-slate-900 px-2 py-1 rounded shadow-xl whitespace-nowrap border border-slate-700">
          {leaf.canonicalTitle}
        </span>
      </div>
    </motion.div>
  );
};

const Tree = ({ category, leaves }: { category: string, leaves: LeafNode[] }) => {
  return (
    <div className="flex flex-col items-center justify-end w-1/4 h-full relative">
       {/* Leaves Container */}
      <div className="flex flex-wrap justify-center content-end gap-1 mb-1 pb-4 w-full px-1 min-h-[60px] max-h-[200px] overflow-y-visible z-10">
        <AnimatePresence mode='popLayout'>
          {leaves.map(leaf => (
            <Leaf key={leaf.id} leaf={leaf} />
          ))}
        </AnimatePresence>
      </div>

      {/* Trunk */}
      <div className="w-1.5 h-12 bg-gradient-to-t from-slate-800 to-slate-700 rounded-t-sm relative z-0">
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-widest text-slate-500">
          {category}
        </div>
        {/* Roots/Ground effect */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-800 rounded-full blur-[2px]" />
      </div>
    </div>
  );
};


const EchoCompass: React.FC<Props> = ({ tasks, forest }) => {
  // Store Hooks
  const { focusThemes, setFocusThemes } = useUserStore();
  const [isEditingThemes, setIsEditingThemes] = useState(false);
  const [tempThemes, setTempThemes] = useState<string[]>([]);

  // Calculate completed anchors
  const completedAnchors = tasks.filter(t => t.isAnchor && t.completed).length;

  const categories = [TaskCategory.WORK, TaskCategory.STUDY, TaskCategory.GROWTH, TaskCategory.LIFE];

  const handleEditThemes = () => {
    setTempThemes([...focusThemes]);
    setIsEditingThemes(true);
  };

  const handleSaveThemes = () => {
    setFocusThemes(tempThemes.filter(t => t.trim() !== ''));
    setIsEditingThemes(false);
  };

  const handleThemeChange = (index: number, value: string) => {
    const newThemes = [...tempThemes];
    newThemes[index] = value;
    setTempThemes(newThemes);
  };

  const addTheme = () => {
    if (tempThemes.length < 3) {
      setTempThemes([...tempThemes, '']);
    }
  };

  const removeTheme = (index: number) => {
    setTempThemes(tempThemes.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-[#0f172a] text-white flex flex-col">
      {/* 1. Review & Achievement */}
      <div className="p-6 shrink-0">
        <h2 className="text-2xl font-bold mb-4">Daily Resonance</h2>
        
        {/* Anchor Completion (Stars) */}
        <div className="flex justify-center gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={false}
              animate={{ 
                scale: i <= completedAnchors ? [1, 1.2, 1] : 1,
                rotate: i <= completedAnchors ? [0, 10, -10, 0] : 0
              }}
              transition={{ duration: 0.4 }}
            >
              <Star 
                size={48} 
                className={`transition-all duration-500 ${
                  i <= completedAnchors 
                    ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" 
                    : "text-slate-700 fill-transparent"
                }`} 
                strokeWidth={1}
              />
            </motion.div>
          ))}
        </div>
        <p className="text-center text-slate-400 mb-8">{completedAnchors} of 3 Anchors secured.</p>

        {/* Focus Themes Section */}
        <div className="glass-panel rounded-3xl p-6 mb-8 relative">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Quarterly Focus Themes</h3>
            {!isEditingThemes ? (
              <button onClick={handleEditThemes} className="text-slate-400 hover:text-white">
                <Edit2 size={16} />
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setIsEditingThemes(false)} className="text-red-400 hover:text-red-300">
                  <X size={16} />
                </button>
                <button onClick={handleSaveThemes} className="text-green-400 hover:text-green-300">
                  <Check size={16} />
                </button>
              </div>
            )}
          </div>

          {isEditingThemes ? (
            <div className="space-y-2">
              {tempThemes.map((theme, idx) => (
                <div key={idx} className="flex gap-2">
                  <input 
                    value={theme}
                    onChange={(e) => handleThemeChange(idx, e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Enter focus theme..."
                  />
                  <button onClick={() => removeTheme(idx)} className="text-slate-500 hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {tempThemes.length < 3 && (
                <button 
                  onClick={addTheme}
                  className="w-full py-2 border border-dashed border-slate-700 rounded text-slate-500 text-sm hover:bg-slate-800 hover:text-slate-300"
                >
                  + Add Theme
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {focusThemes.length > 0 ? (
                focusThemes.map((theme, idx) => (
                  <div key={idx} className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-3 text-sm text-indigo-200">
                    {theme}
                  </div>
                ))
              ) : (
                <div className="text-slate-500 text-sm italic text-center py-4">
                  No themes set. Add some to guide your daily focus.
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Intent Map (Pie Chart) */}
        <div className="glass-panel rounded-3xl p-6 mb-8">
          <h3 className="text-lg font-medium mb-4 text-center">Intent Distribution</h3>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 3. Task Forest (Visual Metaphor) */}
      <div className="flex-1 bg-slate-900/50 border-t border-slate-800 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold">Task Forest</h3>
             <span className="text-xs text-slate-500">Cultivate your ecosystem</span>
          </div>
          
          <div className="flex-1 flex items-end justify-between px-2 pb-6 relative">
             {/* Atmosphere */}
             <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent pointer-events-none" />
             
             {categories.map(cat => (
               <Tree 
                 key={cat} 
                 category={cat} 
                 leaves={forest.filter(l => l.category === cat)} 
               />
             ))}
          </div>
      </div>
    </div>
  );
};

export default EchoCompass;
