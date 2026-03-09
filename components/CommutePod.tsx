import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, BatteryCharging, Leaf, Gamepad2 } from 'lucide-react';
import { PodType } from '../types';
import { useUserStore } from '../store/useUserStore';

const CommutePod: React.FC = () => {
  const [activePod, setActivePod] = useState<PodType | null>(null);
  const [timeLeft, setTimeLeft] = useState(900); // 15 mins default
  const [isRunning, setIsRunning] = useState(false);
  const { updateCommuteStats } = useUserStore();

  useEffect(() => {
    let interval: any;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Timer finished
            setIsRunning(false);
            if (activePod) {
               updateCommuteStats(activePod as 'production' | 'growth' | 'recovery', 900); // Add full session
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, activePod, updateCommuteStats]);

  const startPod = (type: PodType) => {
    setActivePod(type);
    setTimeLeft(900); // Reset to 15m
    setIsRunning(true);
  };

  const closePod = () => {
    // If closing early, save progress? 
    // For now, let's only save on completion or maybe save partial?
    // Let's save partial progress on close for better accuracy
    if (activePod && timeLeft < 900) {
        const elapsed = 900 - timeLeft;
        updateCommuteStats(activePod as 'production' | 'growth' | 'recovery', elapsed);
    }

    setIsRunning(false);
    setActivePod(null);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPodConfig = (type: PodType) => {
    switch(type) {
      case PodType.PRODUCTION: 
        return { color: 'bg-blue-500', icon: <BatteryCharging size={32} />, label: 'Production', sub: 'Work tasks' };
      case PodType.GROWTH: 
        return { color: 'bg-emerald-500', icon: <Leaf size={32} />, label: 'Growth', sub: 'Reading / Learning' };
      case PodType.RECOVERY: 
        return { color: 'bg-purple-500', icon: <Gamepad2 size={32} />, label: 'Recovery', sub: 'Rest / Play' };
      default: return { color: 'bg-slate-500', icon: null, label: '', sub: '' };
    }
  };

  if (activePod) {
    const config = getPodConfig(activePod);
    const progress = 1 - (timeLeft / 900); // 0 to 1

    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="h-full flex flex-col items-center justify-center p-8 relative bg-slate-900"
      >
        {/* Close Button */}
        <button onClick={closePod} className="absolute top-6 right-6 text-slate-400 hover:text-white">
          <X size={24} />
        </button>

        {/* Dynamic Background Pulse */}
        <div className={`absolute inset-0 ${config.color} opacity-5 blur-3xl animate-pulse`} />

        <div className="relative z-10 flex flex-col items-center">
          <div className={`p-4 rounded-full ${config.color} bg-opacity-20 mb-6`}>
            <div className={`text-${config.color.split('-')[1]}-200`}>
              {config.icon}
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-2">{config.label}</h2>
          <p className="text-slate-400 mb-12">{config.sub}</p>

          {/* Timer Visual */}
          <div className="relative w-64 h-64 flex items-center justify-center mb-12">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="128"
                cy="128"
                r="120"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-slate-800"
              />
              <circle
                cx="128"
                cy="128"
                r="120"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={2 * Math.PI * 120}
                strokeDashoffset={2 * Math.PI * 120 * (1 - progress)}
                className={`${config.color.replace('bg-', 'text-')} transition-all duration-1000 ease-linear`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-5xl font-mono text-white font-light tracking-wider">
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Controls */}
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`w-16 h-16 rounded-full ${config.color} text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform`}
          >
            {isRunning ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
          </button>
        </div>
      </motion.div>
    );
  }

  // Selection Screen
  return (
    <div className="h-full p-6 flex flex-col justify-center">
      <h2 className="text-2xl font-bold text-white mb-2">Commute Pods</h2>
      <p className="text-slate-400 mb-8">Declare your intent. Enter the bubble.</p>

      <div className="space-y-4">
        {[PodType.PRODUCTION, PodType.GROWTH, PodType.RECOVERY].map(type => {
          const config = getPodConfig(type);
          return (
            <motion.button
              key={type}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startPod(type)}
              className={`w-full p-6 rounded-2xl glass-panel border-l-4 ${config.color.replace('bg-', 'border-')} flex items-center justify-between group text-left`}
            >
              <div>
                <h3 className="text-xl font-medium text-white group-hover:text-opacity-100 transition-colors">
                  {config.label}
                </h3>
                <p className="text-sm text-slate-400 mt-1">{config.sub}</p>
              </div>
              <div className={`p-3 rounded-full bg-slate-800 ${config.color.replace('bg-', 'text-')}`}>
                {config.icon}
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  );
};

export default CommutePod;
