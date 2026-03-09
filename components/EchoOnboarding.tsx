import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles, User, ArrowRight, Check } from 'lucide-react';
import { UserProfile, FocusTheme, TaskIntent } from '../types';
import { useUserStore } from '../store/useUserStore';

// ==========================================
// 1. Data Configuration (Domain Data)
// ==========================================
const DOMAINS = [
  { id: 'health', icon: '🌿', title: 'Body & Mind', desc: 'Sleep, De-stress, Exercise', options: ['Improve Sleep Quality', 'Regular Exercise Habit', 'Mental De-stressing'] },
  { id: 'career', icon: '🚀', title: 'Career Break', desc: 'Skills, New Role, Projects', options: ['Master Core Skills', 'Seek External Opportunities', 'Boost Influence'] },
  { id: 'study', icon: '📚', title: 'Academic Sprint', desc: 'Exams, Languages, GPA', options: ['Ace Major Exams', 'Conquer Weak Subjects', 'Expand Knowledge'] },
  { id: 'relation', icon: '❤️', title: 'Deep Connect', desc: 'Family, Social Quality', options: ['Quality Family Time', 'Prune Toxic Ties', 'Find Soul Resonance'] },
  { id: 'wealth', icon: '💰', title: 'Wealth Control', desc: 'Invest, Side Hustle, Budget', options: ['Control Expenses', 'Start Side Hustle', 'Learn Investing'] },
  { id: 'spirit', icon: '🎨', title: 'Inner Wild', desc: 'Hobbies, Travel, Creativity', options: ['Explore Unknown Places', 'Cultivate New Hobby', 'Creative Expression'] },
];

type Step = 'profile' | 'prompt' | 'skip_modal' | 'select_domains' | 'refine_domains' | 'preview' | 'completed';

interface EchoOnboardingProps {
  onComplete: (profile: UserProfile) => void;
}

export default function EchoOnboarding({ onComplete }: EchoOnboardingProps) {
  const [step, setStep] = useState<Step>('profile');
  
  // State Collection
  const [name, setName] = useState('');
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
  const [refinedFocus, setRefinedFocus] = useState<Record<string, string>>({});

  // --- Interaction Handlers ---
  const toggleDomain = (id: string) => {
    setSelectedDomainIds(prev => {
      if (prev.includes(id)) return prev.filter(d => d !== id);
      if (prev.length >= 3) return prev; // Limit to 3
      return [...prev, id];
    });
  };

  const selectFocus = (domainId: string, focusOption: string) => {
    setRefinedFocus(prev => ({ ...prev, [domainId]: focusOption }));
  };

  const setFocusThemes = useUserStore(state => state.setFocusThemes);

  const handleComplete = () => {
    const themes: FocusTheme[] = selectedDomainIds.map(id => {
      const d = DOMAINS.find(x => x.id === id)!;
      return {
        id: d.id,
        intent: d.title as TaskIntent,
        tags: [refinedFocus[id] || d.options[0]],
        isPrimary: false
      };
    });

    // Write to Global Store
    setFocusThemes(themes);

    const profile: UserProfile = {
      name,
      quarterlyThemes: themes
    };
    
    onComplete(profile);
  };

  // Skip logic: create empty profile or default
  const handleSkip = () => {
    // Clear themes in Global Store
    setFocusThemes([]);

    const profile: UserProfile = {
      name: name || 'Traveler',
      quarterlyThemes: []
    };
    onComplete(profile);
  };

  // Animation Variants
  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-6 font-sans text-slate-50 relative overflow-hidden">
      {/* Background Ambient Light */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <AnimatePresence mode="wait">
          
          {/* Step 1: Profile Setup */}
          {step === 'profile' && (
            <motion.div 
              key="profile"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-8 shadow-xl border border-slate-700">
                <User size={40} className="text-slate-400" />
              </div>
              <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                Welcome to Echo
              </h1>
              <p className="text-slate-400 mb-8">How should we call you?</p>
              <input 
                type="text" 
                placeholder="Your Nickname"
                className="w-full px-6 py-4 bg-slate-900 border border-slate-800 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-center text-xl font-medium placeholder:text-slate-600 transition-all"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
              <button 
                disabled={!name.trim()}
                onClick={() => setStep('prompt')}
                className="mt-12 w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold text-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-indigo-500/10"
              >
                Next
              </button>
            </motion.div>
          )}

          {/* Step 2: Intent Prompt */}
          {step === 'prompt' && (
            <motion.div 
              key="prompt"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center"
            >
              <div className="mb-8 p-4 bg-indigo-500/10 rounded-full">
                <Sparkles size={48} className="text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Set Your Course</h2>
              <p className="text-slate-400 mb-10 leading-relaxed max-w-xs">
                We'd like to help you define <span className="text-indigo-400 font-semibold">3 Quarterly Focus Themes</span>. These will serve as your compass for daily decision making.
              </p>
              <div className="space-y-4 w-full">
                <button 
                  onClick={() => setStep('select_domains')} 
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-500 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/20"
                >
                  Focus Now
                </button>
                <button 
                  onClick={() => setStep('skip_modal')} 
                  className="w-full py-4 bg-transparent text-slate-500 rounded-2xl font-medium hover:text-slate-300 transition-colors"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2.1: Skip Confirmation */}
          {step === 'skip_modal' && (
            <motion.div 
              key="skip_modal"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center bg-slate-900/50 p-8 rounded-3xl border border-slate-800 backdrop-blur-xl"
            >
              <h2 className="text-2xl font-bold mb-4">Explore First?</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                No worries. Great decisions often come from action. You can explore Echo first.
                <br/><br/>
                When you're ready, define your themes in <span className="text-indigo-400">Echo Compass</span> to unlock the full potential of your daily Anchor.
              </p>
              <button 
                onClick={handleSkip} 
                className="w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold flex justify-center items-center gap-2 hover:bg-white hover:scale-[1.02] transition-all"
              >
                Start Exploring <ArrowRight size={18} />
              </button>
              <button 
                onClick={() => setStep('prompt')} 
                className="mt-6 text-sm text-slate-500 hover:text-slate-300 underline underline-offset-4"
              >
                Go Back
              </button>
            </motion.div>
          )}

          {/* Step 3: Domain Selection */}
          {step === 'select_domains' && (
            <motion.div 
              key="select_domains"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col h-full"
            >
              <div className="mb-6 text-center">
                <h2 className="text-xl font-bold">What to change in 90 days?</h2>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Select 3 areas ({selectedDomainIds.length}/3)
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                {DOMAINS.map(domain => {
                  const isSelected = selectedDomainIds.includes(domain.id);
                  const isMaxedOut = selectedDomainIds.length >= 3 && !isSelected;
                  
                  return (
                    <motion.div 
                      key={domain.id}
                      whileTap={{ scale: isMaxedOut ? 1 : 0.95 }}
                      onClick={() => !isMaxedOut && toggleDomain(domain.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex flex-col items-start relative overflow-hidden
                        ${isSelected 
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]' 
                          : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}
                        ${isMaxedOut ? 'opacity-30 grayscale cursor-not-allowed' : ''}
                      `}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      <span className="text-3xl mb-3 block">{domain.icon}</span>
                      <h3 className={`font-bold text-sm ${isSelected ? 'text-indigo-300' : 'text-slate-200'}`}>
                        {domain.title}
                      </h3>
                      <p className="text-[10px] text-slate-500 mt-1 leading-tight">{domain.desc}</p>
                    </motion.div>
                  );
                })}
              </div>

              <button 
                disabled={selectedDomainIds.length !== 3}
                onClick={() => setStep('refine_domains')}
                className="mt-auto w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-white"
              >
                Next Step
              </button>
            </motion.div>
          )}

          {/* Step 4: Refine Domains (Waterfall) */}
          {step === 'refine_domains' && (
            <motion.div 
              key="refine_domains"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col h-full overflow-y-auto no-scrollbar"
            >
              <h2 className="text-xl font-bold mb-2 text-center">Refine Your Focus</h2>
              <p className="text-sm text-slate-500 mb-8 text-center">Help AI understand your specific intent.</p>

              <div className="space-y-6 pb-24">
                {selectedDomainIds.map((id, index) => {
                  const domain = DOMAINS.find(d => d.id === id)!;
                  // Progressive Disclosure: Only show if previous one is answered (or it's the first one)
                  const isVisible = index === 0 || !!refinedFocus[selectedDomainIds[index - 1]];
                  
                  if (!isVisible) return null;

                  return (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 20, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                      className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">{domain.icon}</span>
                        <h3 className="font-bold text-indigo-300">{domain.title}</h3>
                      </div>
                      <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-semibold">I want to focus on:</p>
                      <div className="space-y-2">
                        {domain.options.map((opt, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              selectFocus(id, opt);
                              // Auto-scroll to bottom to reveal next question if needed
                              setTimeout(() => {
                                const container = document.querySelector('.overflow-y-auto');
                                if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                              }, 100);
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border relative overflow-hidden
                              ${refinedFocus[id] === opt 
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/50' 
                                : 'bg-slate-800/50 text-slate-300 border-transparent hover:bg-slate-800'}
                            `}
                          >
                            {refinedFocus[id] === opt && (
                              <motion.div 
                                layoutId={`highlight-${id}`}
                                className="absolute inset-0 bg-white/10" 
                              />
                            )}
                            <span className="relative z-10">{opt}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <div className="fixed bottom-6 left-0 right-0 px-6 max-w-md mx-auto">
                <button 
                  disabled={Object.keys(refinedFocus).length !== 3}
                  onClick={() => setStep('preview')}
                  className="w-full py-4 bg-slate-50 text-slate-950 rounded-2xl font-bold disabled:opacity-30 transition-all shadow-xl shadow-black/50 hover:bg-white"
                >
                  Generate Compass
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 5: Preview (Magic) */}
          {step === 'preview' && (
            <motion.div 
              key="preview"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center text-center justify-center h-full"
            >
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mb-8 border border-yellow-500/30"
              >
                <Sparkles className="text-yellow-400" size={40} />
              </motion.div>
              
              <h2 className="text-2xl font-bold mb-2">Compass Calibrated</h2>
              <p className="text-sm text-slate-400 mb-10">See how your themes work their magic:</p>
              
              {/* Simulated UI Card */}
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-2xl mb-12 relative overflow-hidden max-w-xs mx-auto"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
                <p className="text-xs text-slate-500 text-left mb-2">When you enter:</p>
                <p className="text-xl font-bold text-left mb-4 text-white">"Trip to Yunnan"</p>
                
                <motion.div 
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  className="flex items-start gap-3 bg-yellow-500/10 text-yellow-200 px-4 py-3 rounded-xl text-xs font-medium border border-yellow-500/20"
                >
                  <Sparkles size={16} className="shrink-0 mt-0.5" />
                  <span className="text-left">
                    AI: Matches <span className="text-yellow-400 font-bold">Inner Wild</span>.<br/>
                    Marked as <span className="font-bold text-white">ANCHOR</span> task.
                  </span>
                </motion.div>
              </motion.div>

              <button 
                onClick={handleComplete} 
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Start Your Journey
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
