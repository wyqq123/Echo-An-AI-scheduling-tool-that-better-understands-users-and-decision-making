import React from 'react';
import { Task, TaskIntent, TaskCategory } from '../types';
import IntentPillBar from './IntentPillBar';
import { StickyNote, ChevronRight, Clock } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
}

const mapIntentToCategory = (intent: TaskIntent): TaskCategory => {
  switch (intent) {
    case TaskIntent.CAREER_BREAK:
    case TaskIntent.WEALTH_CONTROL:
      return TaskCategory.WORK;
    case TaskIntent.ACADEMIC_SPRINT:
      return TaskCategory.STUDY;
    case TaskIntent.INNER_WILD:
      return TaskCategory.GROWTH;
    case TaskIntent.BODY_MIND:
    case TaskIntent.DEEP_CONNECT:
    default:
      return TaskCategory.LIFE;
  }
};

const TaskCard: React.FC<TaskCardProps> = ({ task, onUpdate }) => {
  const handleIntentSelect = (newIntent: TaskIntent) => {
    const newCategory = mapIntentToCategory(newIntent);
    onUpdate(task.id, { intent: newIntent, category: newCategory });
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl backdrop-blur-sm w-full">
      {/* 1. Aggregated Main Title */}
      <div className="flex items-start justify-between mb-3 gap-3">
        <input 
          className="bg-transparent text-lg font-bold text-slate-100 border-none focus:ring-0 w-full placeholder-slate-600"
          value={task.title}
          onChange={(e) => onUpdate(task.id, { title: e.target.value })}
          placeholder="Task Title"
        />
        <div className="flex items-center gap-2 shrink-0">
             <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg text-xs text-slate-400">
                <Clock size={12} />
                <input 
                    type="number"
                    className="bg-transparent w-8 text-center focus:outline-none"
                    value={task.duration}
                    onChange={(e) => onUpdate(task.id, { duration: parseInt(e.target.value) || 30 })}
                />
                <span>m</span>
             </div>
        </div>
      </div>

      {/* 2. Workflow Note (Apple Calendar style) */}
      {task.workflowNote && (
        <div className="flex gap-2 p-3 bg-white/5 rounded-2xl mb-4 border border-white/5">
          <StickyNote size={14} className="text-slate-500 mt-1 flex-shrink-0" />
          <div className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">
            {task.workflowNote}
          </div>
        </div>
      )}

      <div className="h-[1px] w-full bg-slate-800 mb-2" />

      {/* 3. Intent Pill Selector */}
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 ml-1 font-semibold mb-1">
          Intent Alignment
        </span>
        <IntentPillBar 
          selectedIntent={task.intent} 
          onSelect={handleIntentSelect} 
        />
      </div>
    </div>
  );
};

export default TaskCard;
