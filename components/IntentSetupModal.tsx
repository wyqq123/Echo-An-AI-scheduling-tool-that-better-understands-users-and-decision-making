import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, Check, X, Plus } from 'lucide-react';
import { FocusTheme, TaskIntent } from '../types';
import { COMPASS_INTENTS } from './EchoCompass';
import { useUserStore } from '../store/useUserStore';
import { generateFocusTags } from '../services/geminiService';
import { generateId } from '../utils/helpers';

interface IntentSetupModalProps {
  existingTheme?: FocusTheme;
  usedIntents?: TaskIntent[];
  onClose: () => void;
  onSave: (theme: FocusTheme) => void;
}

const IntentSetupModal: React.FC<IntentSetupModalProps> = ({ existingTheme, usedIntents = [], onClose, onSave }) => {
  const isValidTheme = existingTheme && typeof existingTheme === 'object' && 'intent' in existingTheme;
  const [step, setStep] = useState<1 | 2>(isValidTheme ? 2 : 1);
  const [selectedIntent, setSelectedIntent] = useState<TaskIntent | null>(isValidTheme ? existingTheme.intent : null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Tags state
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(isValidTheme && existingTheme.tags ? existingTheme.tags : []);
  const [customInput, setCustomInput] = useState('');

  const { tasks } = useUserStore();

  const fetchAITags = async (intent: TaskIntent) => {
    setIsAiLoading(true);
    setStep(2);
    
    // Default mock tags based on the user's image
    const mockTags: Record<string, string[]> = {
      [TaskIntent.BODY_MIND]: ['Deep Sleep Optimization', 'Stress Threshold Adjustment', 'Physical Function Remodeling'],
      [TaskIntent.CAREER_BREAK]: ['Core Competency Upgrade', 'Workplace Relationship Ice-breaking', 'Side Business Leverage Building'],
      [TaskIntent.ACADEMIC_SPRINT]: ['Knowledge System Internalization', 'Certification/Language Breakthrough', 'Stable GPA Plan'],
      [TaskIntent.DEEP_CONNECT]: ['Intimate Relationship Resonance', 'Family Energy Repair', 'Social Noise Reduction Actions'],
      [TaskIntent.WEALTH_CONTROL]: ['Consumerism Resistance', 'Asset Allocation Optimization', 'Incremental Income Experiments'],
      [TaskIntent.INNER_WILD]: ['Aesthetic Sense Revival', 'Creative Inspiration Recording', 'Spatial/Geographical Wandering']
    };
    
    let tags = mockTags[intent] || ['Focus 1', 'Focus 2', 'Focus 3'];

    // Call Gemini API
    const aiTags = await generateFocusTags(intent, tasks);
    if (aiTags && aiTags.length === 3) {
      tags = aiTags;
    }

    setSuggestedTags(tags);
    
    // Auto-select the first one if no existing tags
    if (!existingTheme?.tags || existingTheme.tags.length === 0) {
      setSelectedTags([tags[0]]);
    }
    
    setIsAiLoading(false);
  };

  // If opening an existing theme, populate suggested tags immediately
  useEffect(() => {
    if (isValidTheme && existingTheme && step === 2 && suggestedTags.length === 0) {
      const mockTags: Record<string, string[]> = {
        [TaskIntent.BODY_MIND]: ['深度睡眠优化', '压力阈值调节', '身体机能重塑'],
        [TaskIntent.CAREER_BREAK]: ['核心竞争力升维', '职场关系破冰', '副业杠杆构建'],
        [TaskIntent.ACADEMIC_SPRINT]: ['知识体系内化', '考证/语言突破', '绩点稳产计划'],
        [TaskIntent.DEEP_CONNECT]: ['亲密关系共振', '家族能量修复', '社交降噪行动'],
        [TaskIntent.WEALTH_CONTROL]: ['消费主义抵抗', '资产配置优化', '增量收入实验'],
        [TaskIntent.INNER_WILD]: ['审美感官复苏', '创意灵感记录', '空间/地理流浪'],
      };
      setSuggestedTags(mockTags[existingTheme.intent] || []);
    }
  }, [existingTheme, step, suggestedTags.length, isValidTheme]);

  const handleIntentSelect = (intent: TaskIntent) => {
    setSelectedIntent(intent);
    setSelectedTags([]); // Reset tags when changing intent
    fetchAITags(intent);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= 3) return prev; // Max 3 tags
      return [...prev, tag];
    });
  };

  const handleAddCustomTag = () => {
    if (customInput.trim() && !selectedTags.includes(customInput.trim()) && selectedTags.length < 3) {
      setSelectedTags(prev => [...prev, customInput.trim()]);
      setCustomInput('');
    }
  };

  const handleSave = () => {
    if (!selectedIntent || selectedTags.length === 0) return;
    onSave({
      id: isValidTheme && existingTheme ? existingTheme.id : generateId(),
      intent: selectedIntent,
      tags: selectedTags,
      isPrimary: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex justify-between items-center p-6 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">
            {step === 1 ? 'Select Compass Intent' : 'Define Focus Areas'}
          </h3>
          <button onClick={onClose} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto no-scrollbar">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              {COMPASS_INTENTS.map(config => {
                const Icon = config.icon;
                const isUsed = usedIntents.includes(config.id) && config.id !== existingTheme?.intent;
                
                return (
                  <button
                    key={config.id}
                    disabled={isUsed}
                    onClick={() => handleIntentSelect(config.id)}
                    className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left relative overflow-hidden group
                      ${isUsed 
                        ? 'bg-slate-900/50 border-slate-800 opacity-40 grayscale cursor-not-allowed' 
                        : 'bg-slate-800/50 border-transparent hover:border-slate-600 hover:bg-slate-800 cursor-pointer'}
                    `}
                  >
                    <Icon size={24} className={`${config.color} mb-3 group-hover:scale-110 transition-transform`} />
                    <span className="text-slate-200 font-medium text-sm">{config.title}</span>
                    {isUsed && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider bg-slate-800 px-2 py-1 rounded-md">In Use</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {isAiLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <Loader2 size={32} className="text-purple-500 animate-spin" />
                    <Sparkles size={16} className="text-yellow-400 absolute -top-2 -right-2 animate-pulse" />
                  </div>
                  <p className="text-slate-400 text-sm animate-pulse">AI is generating your focus areas...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-start gap-3">
                    <Sparkles size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-purple-200/80 leading-relaxed">
                      Based on your choice, I've drafted 3 specific focus areas. Select 1-3 areas or add your own.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Suggestions</p>
                    {suggestedTags.map((tag, index) => {
                      const isSelected = selectedTags.includes(tag);
                      const isDisabled = !isSelected && selectedTags.length >= 3;
                      
                      return (
                        <button
                          key={index}
                          disabled={isDisabled}
                          onClick={() => toggleTag(tag)}
                          className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all text-left
                            ${isSelected 
                              ? 'bg-purple-500/20 border-purple-500/50 text-purple-100' 
                              : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800'}
                            ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                          `}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors
                            ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-slate-500 bg-slate-900'}
                          `}>
                            {isSelected && <Check size={14} className="text-white" />}
                          </div>
                          <span className="text-sm font-medium">{tag}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Custom Focus</p>
                    
                    {/* Render custom tags that are selected but not in suggested list */}
                    {selectedTags.filter(t => !suggestedTags.includes(t)).map((tag, index) => (
                      <div key={`custom-${index}`} className="flex items-center justify-between p-4 rounded-xl bg-purple-500/20 border border-purple-500/50 text-purple-100">
                        <span className="text-sm font-medium">{tag}</span>
                        <button onClick={() => toggleTag(tag)} className="text-purple-300 hover:text-white">
                          <X size={16} />
                        </button>
                      </div>
                    ))}

                    {selectedTags.length < 3 && (
                      <div className="flex gap-2">
                        <input
                          value={customInput}
                          onChange={(e) => setCustomInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTag()}
                          placeholder="Add your own direction..."
                          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none transition-shadow placeholder:text-slate-500"
                        />
                        <button 
                          onClick={handleAddCustomTag}
                          disabled={!customInput.trim()}
                          className="px-4 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                          <Plus size={20} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex justify-between items-center px-1">
                    <button 
                      onClick={() => setStep(1)} 
                      className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-4"
                    >
                      Back to Intents
                    </button>
                    <span className="text-xs font-medium text-slate-500">
                      {selectedTags.length}/3 Selected
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        {step === 2 && !isAiLoading && (
          <div className="p-6 bg-slate-900 border-t border-slate-800">
            <button 
              disabled={selectedTags.length === 0}
              onClick={handleSave}
              className="w-full py-4 bg-white text-black rounded-2xl font-bold text-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex justify-center items-center gap-2"
            >
              Lock Compass <Check size={20} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default IntentSetupModal;
