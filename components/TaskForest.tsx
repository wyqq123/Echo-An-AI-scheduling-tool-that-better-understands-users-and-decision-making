import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { FocusTheme, LeafNode, SynergyLink, TreeData, TaskIntent } from '../types';
import { COMPASS_INTENTS } from './EchoCompass';
import { getCurrentQuarterId, isCurrentQuarter } from '../utils/dateUtils';
import { useUserStore } from '../store/useUserStore';

interface TaskForestProps {
  themes: FocusTheme[];
  forest: LeafNode[];
  synergyLinks: SynergyLink[];
  onAddSynergyLink: (link: SynergyLink) => void;
}

const TaskForest: React.FC<TaskForestProps> = ({ themes, forest, synergyLinks, onAddSynergyLink }) => {
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
  const { aiReport } = useUserStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [treePositions, setTreePositions] = useState<Record<string, { x: number, y: number }>>({});

  // Build Tree Data
  const trees: Record<string, TreeData> = {};
  const positions = ['top', 'bottomLeft', 'bottomRight'];
  const currentQuarterId = getCurrentQuarterId();
  
  themes.forEach((theme, index) => {
    if (index >= 3) return;
    const config = COMPASS_INTENTS.find(c => c.id === theme.intent);
    
    // ✅ FIX: Filter leaves to only show current quarter data
    // Use quarterId for direct filtering (faster than checking each completedTask)
    const leaves = forest
      .filter(leaf => {
        // Check if leaf belongs to current quarter and matches the theme intent
        if (leaf.quarterId && leaf.quarterId !== currentQuarterId) {
          return false;
        }
        if (leaf.intent !== theme.intent) {
          return false;
        }
        
        // For backward compatibility with old data without quarterId
        if (!leaf.quarterId && leaf.completedTasks) {
          const currentQuarterTasks = leaf.completedTasks.filter(t => isCurrentQuarter(t.completedAt));
          return currentQuarterTasks.length > 0;
        }
        
        return true;
      })
      .map(leaf => {
        // Recalculate count based on current quarter tasks
        if (leaf.completedTasks) {
          const currentQuarterTasks = leaf.completedTasks.filter(t => isCurrentQuarter(t.completedAt));
          return {
            ...leaf,
            count: currentQuarterTasks.length,
            isFruit: currentQuarterTasks.length >= 10
          };
        }
        return leaf;
      });

    const totalTasks = leaves.reduce((sum, l) => sum + l.count, 0);
    
    // Extract hex color from tailwind class roughly
    let color = '#3b82f6'; // default blue
    if (config?.color.includes('green')) color = '#4ADE80';
    if (config?.color.includes('purple')) color = '#A855F7';
    if (config?.color.includes('red')) color = '#F87171';
    if (config?.color.includes('yellow')) color = '#FBBF24';
    if (config?.color.includes('orange')) color = '#FB923C';
    if (config?.color.includes('blue')) color = '#60A5FA';

    trees[positions[index]] = {
      intent: theme.intent,
      color,
      leaves,
      totalTasks
    };
  });

  // Measure tree positions for drawing links
  useEffect(() => {
    const updatePositions = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newPositions: Record<string, { x: number, y: number }> = {};
      
      ['top', 'bottomLeft', 'bottomRight'].forEach(pos => {
        const el = document.getElementById(`tree-${pos}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          newPositions[pos] = {
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top + rect.height / 2
          };
        }
      });
      setTreePositions(newPositions);
    };

    updatePositions();
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, [themes]);

  // AI Banner
  const renderAIBanner = () => (
    <motion.div 
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="absolute top-6 left-6 w-80 bg-slate-900/80 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-4 z-50 shadow-2xl"
    >
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="text-purple-400" size={18} />
        <h3 className="text-white font-bold text-sm">先知洞察 (AI 季度报告)</h3>
      </div>
      <p className="text-slate-300 text-xs leading-relaxed">
        {aiReport || "Complete tasks to generate your quarterly ecosystem report..."}
      </p>
    </motion.div>
  );

  return (
    <div ref={containerRef} className="relative w-full h-[600px] bg-slate-950 overflow-hidden rounded-3xl border border-slate-800">
      {renderAIBanner()}

      {/* SVG Link Layer */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
        <defs>
          <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#A855F7" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#4ADE80" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {synergyLinks.map(link => {
          // Find source tree position
          let sourcePosKey = '';
          let targetPosKey = '';
          
          Object.entries(trees).forEach(([key, tree]) => {
            if (tree.leaves.some(l => l.id === link.sourceLeafId)) {
              sourcePosKey = key;
            }
            if (tree.intent === link.targetIntent) {
              targetPosKey = key;
            }
          });

          const sourcePos = treePositions[sourcePosKey];
          const targetPos = treePositions[targetPosKey];

          if (!sourcePos || !targetPos) return null;

          // Draw a curved line
          const dx = targetPos.x - sourcePos.x;
          const dy = targetPos.y - sourcePos.y;
          const cx1 = sourcePos.x + dx * 0.5;
          const cy1 = sourcePos.y;
          const cx2 = sourcePos.x + dx * 0.5;
          const cy2 = targetPos.y;

          return (
            <path
              key={link.id}
              d={`M ${sourcePos.x} ${sourcePos.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${targetPos.x} ${targetPos.y}`}
              fill="none"
              stroke="url(#linkGrad)"
              strokeWidth="2"
              strokeDasharray="5,5"
              className="opacity-60"
            />
          );
        })}
      </svg>

      {/* Triangle Layout */}
      <div className="absolute inset-0 flex flex-col items-center justify-between p-16 z-20">
        
        {/* Top Tree */}
        <div className="w-full flex justify-center" id="tree-top">
          {trees['top'] && (
            <TreeComponent 
              data={trees['top']} 
              position="top" 
              activeLeafId={activeLeafId} 
              onLeafDragEnd={(leafId, targetIntent) => {
                if (targetIntent && targetIntent !== trees['top'].intent) {
                  onAddSynergyLink({ id: Date.now().toString(), sourceLeafId: leafId, targetIntent });
                }
              }}
            />
          )}
        </div>

        {/* Bottom Trees */}
        <div className="w-full flex justify-between px-12 mt-12">
          <div id="tree-bottomLeft">
            {trees['bottomLeft'] && (
              <TreeComponent 
                data={trees['bottomLeft']} 
                position="bottomLeft" 
                activeLeafId={activeLeafId} 
                onLeafDragEnd={(leafId, targetIntent) => {
                  if (targetIntent && targetIntent !== trees['bottomLeft'].intent) {
                    onAddSynergyLink({ id: Date.now().toString(), sourceLeafId: leafId, targetIntent });
                  }
                }}
              />
            )}
          </div>
          <div id="tree-bottomRight">
            {trees['bottomRight'] && (
              <TreeComponent 
                data={trees['bottomRight']} 
                position="bottomRight" 
                activeLeafId={activeLeafId} 
                onLeafDragEnd={(leafId, targetIntent) => {
                  if (targetIntent && targetIntent !== trees['bottomRight'].intent) {
                    onAddSynergyLink({ id: Date.now().toString(), sourceLeafId: leafId, targetIntent });
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TreeComponent = ({ 
  data, 
  position, 
  activeLeafId,
  onLeafDragEnd
}: { 
  data: TreeData, 
  position: string, 
  activeLeafId: string | null,
  onLeafDragEnd: (leafId: string, targetIntent?: string) => void
}) => {
  // Trunk width based on total tasks
  const trunkWidth = Math.min(Math.max(data.totalTasks * 1.5, 10), 40);

  return (
    <div className="flex flex-col items-center relative group" data-intent={data.intent}>
      {/* Intent Label */}
      <div className="absolute -top-8 whitespace-nowrap px-3 py-1 bg-slate-800/80 rounded-full text-xs font-bold border border-slate-700 text-slate-200 z-40">
        {data.intent}
      </div>

      {/* Canopy & Leaves */}
      <div className="relative w-32 h-32 flex items-center justify-center">
        {data.leaves.map((leaf, index) => {
          const isPulsing = activeLeafId === leaf.id;
          const isFruit = leaf.isFruit || leaf.count >= 10;

          return (
            <motion.div
              key={leaf.id}
              animate={isPulsing ? { scale: [1, 1.4, 1], filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)'] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
              drag
              dragSnapToOrigin
              onDragEnd={(e, info) => {
                // Simple hit detection based on screen position
                // In a real app, we'd use getBoundingClientRect on tree containers
                const dropY = info.point.y;
                const dropX = info.point.x;
                const w = window.innerWidth;
                const h = window.innerHeight;
                
                let targetIntent;
                if (dropY < h / 2) {
                  targetIntent = document.getElementById('tree-top')?.querySelector('[data-intent]')?.getAttribute('data-intent');
                } else if (dropX < w / 2) {
                  targetIntent = document.getElementById('tree-bottomLeft')?.querySelector('[data-intent]')?.getAttribute('data-intent');
                } else {
                  targetIntent = document.getElementById('tree-bottomRight')?.querySelector('[data-intent]')?.getAttribute('data-intent');
                }
                
                if (targetIntent) {
                  onLeafDragEnd(leaf.id, targetIntent);
                }
              }}
              className={`absolute cursor-grab active:cursor-grabbing flex items-center justify-center rounded-full shadow-lg border-2 group
                ${isFruit ? 'w-10 h-10 bg-gradient-to-br from-yellow-300 to-orange-500 border-yellow-200 z-30' : 'w-8 h-8 bg-slate-800 border-slate-600 z-20'}
              `}
              style={{
                borderColor: isFruit ? '#FEF08A' : data.color,
                x: Math.sin(index * 2.4) * 35,
                y: Math.cos(index * 2.4) * 35,
              }}
            >
              {/* Tooltip */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700">
                {leaf.canonicalTitle}
              </div>

              {/* Counter */}
              <div className="absolute -top-2 -right-2 bg-slate-900 text-[9px] text-white px-1.5 py-0.5 rounded-full border border-slate-700">
                x{leaf.count}
              </div>
              {isFruit && (
                <span className="text-[10px] text-white font-medium truncate w-full text-center px-1">
                  🌟
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Trunk */}
      <div 
        className="rounded-t-sm bg-gradient-to-t from-slate-900 to-slate-700"
        style={{ width: `${trunkWidth}px`, height: '80px', borderTop: `2px solid ${data.color}` }}
      />
    </div>
  );
};

export default TaskForest;
