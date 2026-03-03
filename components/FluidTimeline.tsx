import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Task, TaskCategory, TaskStatus } from '../types';
import { 
  Plus, Snowflake, Trash2, RefreshCw, MapPin, X, GripHorizontal, 
  ChevronLeft, ChevronRight, Check, Star, Save
} from 'lucide-react';
import { format, addDays, isSameDay } from 'date-fns';
import confetti from 'canvas-confetti';

interface Props {
  tasks: Task[];
  onToggleTask: (id: string) => void;
  onUpdateTasks: (tasks: Task[]) => void;
}

// --- Constants & Helpers ---
const HOUR_HEIGHT = 60;
const SNAP_MINUTES = 15;
const MINUTE_HEIGHT = HOUR_HEIGHT / 60;
const HEADER_HEIGHT = 40; // Height of the sticky day header (h-10)

// Convert time string "09:30" to minutes from 00:00
const timeToMinutes = (time: string | undefined): number => {
  if (!time) return 9 * 60; // Default 9am
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Convert minutes to "HH:MM"
const minutesToTime = (totalMinutes: number): string => {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${String(Math.max(0, Math.min(23, h))).padStart(2, '0')}:${String(Math.max(0, m)).padStart(2, '0')}`;
};

// Convert pixels to snapped minutes (Adjusted for Header Offset)
const pxToMinutes = (px: number) => {
  const contentPx = px - HEADER_HEIGHT; 
  const rawMinutes = contentPx / MINUTE_HEIGHT;
  return Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
};

// Fluid Logic: Resolve collisions by pushing subsequent tasks down
const resolveCollisions = (activeTask: Task, dayTasks: Task[]): Task[] => {
  // 1. Create a list of all tasks on this day, including the active one
  const otherTasks = dayTasks.filter(t => t.id !== activeTask.id);
  const combined = [...otherTasks, activeTask];
  
  // 2. Sort by start time
  combined.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // 3. Iterate and push down
  for (let i = 0; i < combined.length - 1; i++) {
    const current = combined[i];
    const next = combined[i + 1];

    const currentStart = timeToMinutes(current.startTime);
    const currentEnd = currentStart + current.duration;
    const nextStart = timeToMinutes(next.startTime);

    // If current task overlaps or pushes into the next task
    if (currentEnd > nextStart) {
      // Push the next task's start time to immediately follow the current task
      const newNextStart = currentEnd;
      next.startTime = minutesToTime(newNextStart);
      // We keep the duration of the next task constant, it just slides down
    }
  }
  return combined;
};

const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const fireAnchorCelebration = () => {
  const count = 150;
  const defaults = {
    origin: { y: 0.7 },
    spread: 360,
    ticks: 100,
    gravity: 0.8,
    decay: 0.94,
    startVelocity: 30,
  };

  function shoot() {
    confetti({
      ...defaults,
      particleCount: 80,
      scalar: 1.2,
      shapes: ['star'],
      colors: ['#FFD700', '#FFC107', '#FFF3E0'],
    });

    confetti({
      ...defaults,
      particleCount: 40,
      scalar: 0.75,
      shapes: ['circle'],
      colors: ['#FFD700'],
    });
  }

  shoot();
  setTimeout(shoot, 200);
};

const FluidTimeline: React.FC<Props> = ({ tasks, onToggleTask, onUpdateTasks }) => {
  // --- Date State ---
  const [anchorDate, setAnchorDate] = useState<Date>(getStartOfToday());
  const leftDate = anchorDate;
  const rightDate = addDays(anchorDate, 1);

  // --- Data Splitting ---
  const visibleTasks = tasks.filter(t => 
    !t.isFrozen && t.startTime && t.dateStr && 
    (t.dateStr === format(leftDate, 'yyyy-MM-dd') || t.dateStr === format(rightDate, 'yyyy-MM-dd'))
  );

  const drawerTasks = tasks.filter(t => 
    !t.isFrozen && 
    (
      t.status === TaskStatus.DRAWER || 
      (t.status === TaskStatus.PENDING && !t.isAnchor) || 
      (!t.startTime && !t.dateStr)
    )
  );

  const iceboxTasks = tasks.filter(t => t.isFrozen);

  // --- Interaction State ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [dragState, setDragState] = useState<{
    id: string;
    type: 'move' | 'resize';
    startY: number;
    originalStart: number;
    originalDuration: number;
    originalDateStr?: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Handlers ---

  const navigateDate = (direction: 'prev' | 'next') => {
    setAnchorDate(prev => direction === 'prev' ? addDays(prev, -1) : addDays(prev, 1));
  };

  // 1. Right Click on Grid (Create New)
  const handleGridContextMenu = (e: React.MouseEvent, dateStr: string) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top + containerRef.current.scrollTop;
    
    // Snap to 15m
    const startMinutes = pxToMinutes(clickY);
    
    const newTask: Task = {
      id: `temp-${Date.now()}`,
      title: '',
      category: TaskCategory.WORK,
      status: TaskStatus.PENDING, // Default to normal task
      isAnchor: false, // User must manually upgrade to Anchor
      isFrozen: false,
      completed: false,
      duration: 60,
      startTime: minutesToTime(Math.max(0, startMinutes)),
      dateStr: dateStr
    };

    setEditingTask(newTask);
    setIsModalOpen(true);
  };

  // 2. Right Click on Task (Edit)
  const handleTaskContextMenu = (e: React.MouseEvent, task: Task) => {
    e.preventDefault();
    e.stopPropagation(); // Stop bubbling to grid
    setEditingTask({ ...task });
    setIsModalOpen(true);
  };

  // 3. Save Task (Modal)
  const saveTask = () => {
    if (!editingTask) return;

    const finalizedTask = { ...editingTask };
    
    // Sync status if isAnchor is toggled
    if (finalizedTask.isAnchor) {
        finalizedTask.status = TaskStatus.ANCHOR;
    } else if (finalizedTask.status === TaskStatus.ANCHOR) {
        // If it was ANCHOR but now unchecked, change to PENDING
        finalizedTask.status = TaskStatus.PENDING;
    }

    // If it's a temp task, give it a real ID and add it
    if (finalizedTask.id.startsWith('temp')) {
      finalizedTask.id = crypto.randomUUID();
      // Calculate initial collisions for new task
      const dayTasks = tasks.filter(t => t.dateStr === finalizedTask.dateStr);
      const resolved = resolveCollisions(finalizedTask, dayTasks);
      const otherTasks = tasks.filter(t => t.dateStr !== finalizedTask.dateStr);
      onUpdateTasks([...otherTasks, ...resolved]);
    } else {
      // Update existing task
      const dayTasks = tasks.filter(t => t.dateStr === finalizedTask.dateStr && t.id !== finalizedTask.id);
      const resolved = resolveCollisions(finalizedTask, dayTasks);
      const otherTasks = tasks.filter(t => t.dateStr !== finalizedTask.dateStr && t.id !== finalizedTask.id);
      onUpdateTasks([...otherTasks, ...resolved]);
    }

    setIsModalOpen(false);
    setEditingTask(null);
  };

  // 4. Delete Task
  const handleDelete = () => {
    if (!editingTask) return;
    const remainingTasks = tasks.filter(t => t.id !== editingTask.id);
    onUpdateTasks(remainingTasks);
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleTaskToggle = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      if (!task.completed && task.isAnchor) {
        fireAnchorCelebration();
      }
      onToggleTask(taskId);
      if (window.navigator.vibrate) window.navigator.vibrate(10);
    }
  };

  // --- Drag Logic (Unified) ---

  const handleMouseDown = (e: React.MouseEvent, task: Task, type: 'move' | 'resize') => {
    if (task.completed) return;
    // e.stopPropagation(); // Allow bubbling to let parent trackers work if needed, but logic is handled here

    let startMins = timeToMinutes(task.startTime);
    let dateStr = task.dateStr;

    // A. Dragging from Pool/Icebox (Not yet on Grid)
    if (!task.startTime || !task.dateStr || task.isFrozen) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        
        // 1. Calculate Y position (Time) relative to scroll container
        //    Adjust for scrollTop to find absolute position in scrollable area
        const clickY = e.clientY - rect.top + containerRef.current.scrollTop;
        startMins = pxToMinutes(clickY);
        
        // 2. Calculate X position (Date Column)
        const clickX = e.clientX - rect.left;
        const timelineContentX = clickX - 48; // Left label width
        const columnWidth = (rect.width - 48) / 2;
        
        const targetDate = (timelineContentX > 0 && timelineContentX < columnWidth) ? leftDate : rightDate;
        dateStr = format(targetDate, 'yyyy-MM-dd');

        // 3. "Teleport" to grid immediately visually
        const updatedTask = {
          ...task,
          startTime: minutesToTime(Math.max(0, startMins)),
          dateStr: dateStr,
          isFrozen: false,
          status: TaskStatus.ANCHOR // Or retain category, but ensure it shows on grid
        };
        
        // Update state immediately so it renders on grid and we can drag it
        const dayTasks = tasks.filter(t => t.dateStr === updatedTask.dateStr && t.id !== task.id);
        const resolved = resolveCollisions(updatedTask, dayTasks);
        const others = tasks.filter(t => t.dateStr !== updatedTask.dateStr && t.id !== task.id);
        
        onUpdateTasks([...others, ...resolved]);
      }
    }

    setDragState({
      id: task.id,
      type,
      startY: e.clientY,
      originalStart: startMins,
      originalDuration: task.duration,
      originalDateStr: dateStr
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      if (!containerRef.current) return;

      // Calculate Delta Minutes
      // We use raw pixel difference divided by minute height
      const deltaPx = e.clientY - dragState.startY;
      const deltaMinutes = Math.round((deltaPx / MINUTE_HEIGHT) / SNAP_MINUTES) * SNAP_MINUTES;

      // Calculate Grid Column (Date Switch)
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const timelineContentX = clickX - 48;
      const columnWidth = (rect.width - 48) / 2;
      
      let targetDateStr = dragState.originalDateStr;
      if (timelineContentX > 0 && timelineContentX < columnWidth * 2) {
         const targetDate = timelineContentX < columnWidth ? leftDate : rightDate;
         targetDateStr = format(targetDate, 'yyyy-MM-dd');
      }

      let newStart = dragState.originalStart;
      let newDuration = dragState.originalDuration;

      if (dragState.type === 'move') {
        newStart = Math.max(0, dragState.originalStart + deltaMinutes);
      } else {
        newDuration = Math.max(15, dragState.originalDuration + deltaMinutes);
      }

      const updatedActiveTask = {
        ...tasks.find(t => t.id === dragState.id)!,
        startTime: minutesToTime(newStart),
        duration: newDuration,
        dateStr: targetDateStr
      };

      // Real-time Fluid Collision Resolution
      const dayTasks = tasks.filter(t => t.dateStr === updatedActiveTask.dateStr && t.id !== dragState.id);
      const resolvedDayTasks = resolveCollisions(updatedActiveTask, dayTasks);
      
      const otherTasks = tasks.filter(t => t.dateStr !== updatedActiveTask.dateStr && t.id !== dragState.id);
      onUpdateTasks([...otherTasks, ...resolvedDayTasks]);
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, tasks, onUpdateTasks, leftDate, rightDate]);

  return (
    <div className="flex flex-col h-full bg-[#0f172a] overflow-hidden font-sans select-none">
      
      {/* --- TOP 60%: THE GRID --- */}
      <div className="h-[60%] flex flex-col relative border-b border-slate-800">
        
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 bg-slate-900/80 backdrop-blur-xl z-20 border-b border-slate-800/50 relative">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2 italic text-indigo-400">
              ECHO
            </h2>
          </div>

          {/* Date Navigation */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-slate-800/50 rounded-full p-1 border border-slate-700 shadow-inner ml-4">
             <button onClick={() => navigateDate('prev')} className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all">
                <ChevronLeft size={16} />
             </button>
             <span className="px-4 text-[10px] font-bold text-slate-400 tracking-widest uppercase">Schedule</span>
             <button onClick={() => navigateDate('next')} className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all">
                <ChevronRight size={16} />
             </button>
          </div>

          <button 
            onClick={() => {
               setEditingTask({
                 id: `temp-${Date.now()}`,
                 title: '', 
                 category: TaskCategory.WORK, 
                 status: TaskStatus.PENDING, 
                 isAnchor: false, 
                 isFrozen: false, 
                 completed: false, 
                 duration: 60, 
                 startTime: '09:00', 
                 dateStr: format(leftDate, 'yyyy-MM-dd')
               });
               setIsModalOpen(true);
            }}
            className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-all shadow-lg"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Scrollable Timeline */}
        <div className="flex-1 overflow-y-auto no-scrollbar relative flex" ref={containerRef}>
          
          {/* Time Labels */}
          <div className="w-12 flex-shrink-0 bg-slate-900/30 border-r border-slate-800/30 pt-10 z-10 sticky left-0 pointer-events-none">
            {Array.from({ length: 25 }).map((_, i) => (
              <div key={i} className="h-[60px] text-[10px] text-slate-500 text-right pr-2 -mt-2.5">
                {i}:00
              </div>
            ))}
          </div>

          {/* Day Columns Container */}
          <div className="flex-1 flex relative min-h-[1480px]"> 
             {/* Background Grid Lines */}
             <div className="absolute inset-0 z-0 pointer-events-none pt-10">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="h-[60px] border-b border-slate-800/30 w-full" />
              ))}
            </div>

            {/* Columns */}
            {[leftDate, rightDate].map((date, colIdx) => {
               const colDateStr = format(date, 'yyyy-MM-dd');
               const colTasks = visibleTasks.filter(t => t.dateStr === colDateStr);
               const isToday = isSameDay(date, new Date());
               
               return (
                <div 
                  key={colIdx} 
                  className={`flex-1 relative border-r border-slate-800/50 cursor-crosshair ${colIdx === 1 ? 'bg-slate-900/20' : ''}`}
                  onContextMenu={(e) => handleGridContextMenu(e, colDateStr)}
                >
                    {/* Sticky Day Header */}
                    <div className="sticky top-0 h-10 z-10 bg-[#0f172a]/90 backdrop-blur-md border-b border-slate-800 flex flex-col items-center justify-center pointer-events-none">
                       <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-indigo-400' : 'text-slate-500'}`}>
                         {isSameDay(date, new Date()) ? 'Today' : isSameDay(date, addDays(new Date(), 1)) ? 'Tomorrow' : format(date, 'EEEE')}
                       </span>
                       <span className="text-[10px] text-slate-600 font-mono">
                         {format(date, 'yyyy-MM-dd')}
                       </span>
                    </div>

                    {/* Tasks */}
                    <div className="relative"> 
                      {colTasks.map(task => (
                        <FluidTaskCard 
                          key={task.id} 
                          task={task} 
                          onToggle={() => handleTaskToggle(task.id)}
                          onMouseDown={(e, type) => handleMouseDown(e, task, type)}
                          onContextMenu={(e) => handleTaskContextMenu(e, task)}
                          isDragging={dragState?.id === task.id}
                        />
                      ))}
                    </div>
                </div>
               )
            })}
          </div>
        </div>
      </div>

      {/* --- BOTTOM 40%: DRAWERS --- */}
      <div className="h-[40%] flex overflow-hidden">
        
        {/* Pool (Includes Drawer & Pending) */}
        <div className="w-1/2 border-r border-slate-800 bg-[#0f172a] flex flex-col relative">
          <div className="p-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pool ({drawerTasks.length})</span>
            <MapPin size={14} className="text-slate-600" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar relative">
            <AnimatePresence>
              {drawerTasks.map((task) => (
                <div
                  key={task.id}
                  className="cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => handleMouseDown(e, task, 'move')}
                >
                  <motion.div
                    layoutId={task.id}
                    className="bg-slate-800/80 border border-slate-700/50 p-3 rounded-xl shadow-lg group relative overflow-hidden"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center justify-between pointer-events-none">
                      <span className="text-sm text-slate-200 font-medium">{task.title}</span>
                      <GripHorizontal size={14} className="text-slate-600" />
                    </div>
                    <div className="flex gap-2 mt-2 pointer-events-none">
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-400">{task.category}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-400">{task.duration}m</span>
                    </div>
                  </motion.div>
                </div>
              ))}
            </AnimatePresence>
            {drawerTasks.length === 0 && (
              <div className="text-center mt-10 text-slate-600 text-xs px-4">
                Pool empty. All pending tasks assigned.
              </div>
            )}
          </div>
        </div>

        {/* Icebox */}
        <div className="w-1/2 relative bg-slate-900 overflow-hidden flex flex-col">
          <div className="absolute inset-0 bg-cyan-900/10 z-0" />
          <div className="absolute inset-0 backdrop-blur-[2px] z-0" />
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

          <div className="p-4 border-b border-cyan-900/30 flex justify-between items-center relative z-10 bg-cyan-950/30">
            <span className="text-xs font-bold text-cyan-400/80 uppercase tracking-widest flex items-center gap-1">
              <Snowflake size={12} /> Icebox ({iceboxTasks.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar relative z-10">
            {iceboxTasks.map((task) => (
              <div
                key={task.id}
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => handleMouseDown(e, task, 'move')}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.6 }}
                  className="bg-cyan-950/40 border border-cyan-800/30 p-3 rounded-xl flex items-center justify-between"
                  whileHover={{ scale: 1.02 }}
                >
                  <span className="text-xs text-cyan-100 line-through decoration-cyan-500/50 pointer-events-none">{task.title}</span>
                  <Snowflake size={12} className="text-cyan-600 pointer-events-none" />
                </motion.div>
              </div>
            ))}
            {iceboxTasks.length === 0 && <div className="text-center mt-10 text-cyan-800/50 text-xs">No frozen tasks.</div>}
          </div>
          
           {iceboxTasks.length > 0 && (
            <div className="p-3 border-t border-cyan-900/30 bg-cyan-950/50 relative z-10 flex gap-2">
              <button className="flex-1 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1 hover:bg-cyan-500/30 transition-colors">
                <RefreshCw size={12} /> Shatter
              </button>
              <button className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-500/20 transition-colors">
                <Trash2 size={12} /> Melt
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- Modal --- */}
      {isModalOpen && editingTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in fade-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-50 border-b flex justify-between items-center">
              <h3 className="font-bold text-gray-700">
                {editingTask.id.startsWith('temp') ? '✨ New Task' : '📝 Edit Task'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Title</label>
                <input 
                  autoFocus
                  className="w-full bg-gray-100 border-none rounded-xl px-4 py-3 text-gray-900 focus:ring-2 focus:ring-indigo-500 mt-1"
                  placeholder="What needs to be done?"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({...editingTask, title: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Start</label>
                  <input 
                    type="time"
                    className="w-full bg-gray-100 border-none rounded-xl px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 mt-1"
                    value={editingTask.startTime || ''}
                    onChange={(e) => setEditingTask({...editingTask, startTime: e.target.value})}
                  />
                </div>
                <div>
                   <label className="text-xs font-bold text-gray-400 uppercase">Duration (m)</label>
                   <input 
                    type="number"
                    step="15"
                    className="w-full bg-gray-100 border-none rounded-xl px-4 py-2 text-gray-900 focus:ring-2 focus:ring-indigo-500 mt-1"
                    value={editingTask.duration}
                    onChange={(e) => setEditingTask({...editingTask, duration: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Category</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.values(TaskCategory).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setEditingTask({...editingTask, category: cat})}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        editingTask.category === cat 
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' 
                          : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority Decision */}
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase">Priority Decision</label>
                <button
                  onClick={() => setEditingTask({ ...editingTask, isAnchor: !editingTask.isAnchor })}
                  className={`w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all duration-300
                    ${editingTask.isAnchor 
                      ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-md scale-[1.02]' 
                      : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}
                  `}
                >
                  <Star 
                    size={18} 
                    className={editingTask.isAnchor ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} 
                  />
                  <span className="font-bold text-sm">
                    {editingTask.isAnchor ? 'Marked as Core Anchor' : 'Mark as Core Anchor'}
                  </span>
                </button>
                <p className="mt-2 text-[10px] text-slate-400 text-center">
                  Hint: Core anchors count towards Echo Compass stats.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3">
              {!editingTask.id.startsWith('temp') && (
                 <button 
                  onClick={handleDelete}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors mr-auto"
                >
                  <Trash2 size={18} />
                </button>
              )}
              
              <button 
                onClick={saveTask}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
              >
                <Save size={18} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

interface CardProps {
  task: Task;
  onToggle: () => void;
  onMouseDown: (e: React.MouseEvent, type: 'move' | 'resize') => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isDragging?: boolean;
}

const FluidTaskCard: React.FC<CardProps> = ({ task, onToggle, onMouseDown, onContextMenu, isDragging }) => {
  const startMins = timeToMinutes(task.startTime);
  const topPos = (startMins / 60) * HOUR_HEIGHT;
  const height = (task.duration / 60) * HOUR_HEIGHT;

  const getCategoryColor = (cat: TaskCategory) => {
    switch(cat) {
        case TaskCategory.WORK: return 'bg-blue-500';
        case TaskCategory.STUDY: return 'bg-emerald-500';
        case TaskCategory.GROWTH: return 'bg-purple-500';
        case TaskCategory.LIFE: return 'bg-amber-500';
        default: return 'bg-slate-500';
    }
  }
  const colorClass = getCategoryColor(task.category);

  return (
    <div
      onContextMenu={onContextMenu}
      className={`
        absolute left-2 right-2 rounded-xl p-2 flex flex-col justify-center
        backdrop-blur-md border overflow-hidden
        transition-all duration-300 ease-out group
        ${isDragging ? 'z-50 opacity-90 scale-[1.02] shadow-2xl ring-2 ring-indigo-400' : 'z-20 shadow-sm'}
        ${task.completed 
           ? 'bg-slate-800/80 border-slate-700 grayscale-[0.8] opacity-60' 
           : `${colorClass} bg-opacity-20 hover:bg-opacity-30 border-white/10 cursor-grab active:cursor-grabbing`
        }
      `}
      style={{
        top: topPos,
        height: Math.max(height, 40),
      }}
      onMouseDown={(e) => onMouseDown(e, 'move')}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Anchor Star - Top Right */}
      {task.isAnchor && (
        <div className="absolute top-1 right-1 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse pointer-events-none">
           <Star size={12} fill="currentColor" strokeWidth={0} />
        </div>
      )}

      <div className="relative z-10 flex items-start gap-2 h-full pointer-events-none">
         {/* Checkbox */}
         <div
            onClick={(e) => {
              e.stopPropagation(); // Stop propagation to prevent drag
              onToggle();
            }}
            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-all flex items-center justify-center z-50 cursor-pointer pointer-events-auto
              ${task.completed 
                ? 'bg-green-500 border-transparent' 
                : 'bg-white/10 border-white/40 hover:bg-white/30'
              }
            `}
          >
            {task.completed && <Check size={10} className="text-white" />}
          </div>

         <div className="flex-1 min-w-0">
            <span className={`text-xs font-bold block truncate ${task.completed ? 'line-through text-slate-400' : 'text-white'}`}>
              {task.title || 'New Task'}
            </span>
            <div className={`flex items-center gap-2 mt-0.5 ${task.completed ? 'opacity-50' : 'opacity-80'}`}>
              <span className="text-[9px] font-mono text-white/80">{task.startTime}</span>
              <span className="text-[9px] px-1 rounded bg-black/20 text-white/80">{task.duration}m</span>
            </div>
         </div>
      </div>

      {!task.completed && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize hover:bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
          onMouseDown={(e) => onMouseDown(e, 'resize')}
        >
          <GripHorizontal size={12} className="text-white/50" />
        </div>
      )}
    </div>
  );
};

export default FluidTimeline;