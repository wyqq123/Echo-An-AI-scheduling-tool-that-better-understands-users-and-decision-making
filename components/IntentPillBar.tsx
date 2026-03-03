import React from 'react';
import { motion } from 'framer-motion';
import { TaskIntent } from '../types';
import { INTENT_MAP } from '../intentConfig';

interface Props {
  selectedIntent?: TaskIntent;
  onSelect: (intent: TaskIntent) => void;
}

const IntentPillBar: React.FC<Props> = ({ selectedIntent, onSelect }) => {
  return (
    <div className="w-full relative">
      {/* Invisible gradient mask: hints user can scroll right */}
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none" />

      <div className="flex overflow-x-auto no-scrollbar gap-2 py-3 px-1 scroll-smooth snap-x">
        {Object.entries(INTENT_MAP).map(([key, config]) => {
          const intentKey = key as TaskIntent;
          const isSelected = selectedIntent === intentKey;
          const Icon = config.icon;

          return (
            <motion.button
              key={intentKey}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(intentKey)}
              className={`
                flex-shrink-0 snap-start flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300
                ${isSelected 
                  ? 'border-opacity-100 shadow-[0_0_12px_rgba(0,0,0,0.2)]' 
                  : 'border-white/10 bg-white/5 grayscale-[0.5] opacity-60 hover:opacity-100'}
              `}
              style={{
                borderColor: isSelected ? config.color : 'transparent',
                backgroundColor: isSelected ? config.bgColor : '',
                color: isSelected ? config.color : '#94a3b8'
              }}
            >
              <Icon size={14} strokeWidth={isSelected ? 2.5 : 2} />
              <span className="text-xs font-medium whitespace-nowrap">
                {config.label}
              </span>

              {/* Magnetic glow animation when selected */}
              {isSelected && (
                <motion.div 
                  layoutId="activeGlow"
                  className="absolute inset-0 rounded-full"
                  style={{ boxShadow: `0 0 15px ${config.bgColor}` }}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default IntentPillBar;
