import { TaskIntent } from './types';
import { Leaf, Rocket, BookOpen, Heart, Coins, Palette } from 'lucide-react';

export const INTENT_MAP = {
  [TaskIntent.BODY_MIND]: {
    label: 'Body & Mind',
    icon: Leaf,
    color: '#10b981', // emerald-500
    bgColor: 'rgba(16, 185, 129, 0.2)'
  },
  [TaskIntent.CAREER_BREAK]: {
    label: 'Career Break',
    icon: Rocket,
    color: '#3b82f6', // blue-500
    bgColor: 'rgba(59, 130, 246, 0.2)'
  },
  [TaskIntent.ACADEMIC_SPRINT]: {
    label: 'Academic Sprint',
    icon: BookOpen,
    color: '#f59e0b', // amber-500
    bgColor: 'rgba(245, 158, 11, 0.2)'
  },
  [TaskIntent.DEEP_CONNECT]: {
    label: 'Deep Connect',
    icon: Heart,
    color: '#ef4444', // red-500
    bgColor: 'rgba(239, 68, 68, 0.2)'
  },
  [TaskIntent.WEALTH_CONTROL]: {
    label: 'Wealth Control',
    icon: Coins,
    color: '#059669', // emerald-600
    bgColor: 'rgba(5, 150, 105, 0.2)'
  },
  [TaskIntent.INNER_WILD]: {
    label: 'Inner Wild',
    icon: Palette,
    color: '#8b5cf6', // violet-500
    bgColor: 'rgba(139, 92, 246, 0.2)'
  }
};
