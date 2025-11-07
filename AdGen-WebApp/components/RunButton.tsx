"use client";

import { motion } from 'framer-motion';

export default function RunButton({
  isRunning,
  onClick,
  size = 'md'
}: {
  isRunning: boolean;
  onClick: () => void;
  size?: 'md' | 'lg';
}) {
  const sizeClasses =
    size === 'lg' ? 'px-8 py-4 text-base rounded-2xl' : 'px-5 py-3 text-sm rounded-xl';
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: isRunning ? 1 : 1.02 }}
      whileTap={{ scale: isRunning ? 1 : 0.98 }}
      disabled={isRunning}
      className={`relative inline-flex items-center gap-3 ${sizeClasses} font-medium text-white shadow-glow focus:outline-none disabled:opacity-70`}
      style={{
        background:
          'linear-gradient(180deg, rgba(0,122,204,0.9), rgba(0,122,204,0.7))',
        boxShadow: '0 10px 30px rgba(0, 122, 204, 0.35)'
      }}
    >
      <span className="relative z-10">
        {isRunning ? 'Running Agents…' : 'Run Agents Now'}
      </span>
      {!isRunning && (
        <span className="absolute inset-0 rounded-inherit bg-white/10 [mask:radial-gradient(160px_120px_at_10%_0%,_#0000_60%,_#000)]" />
      )}
      {isRunning && (
        <span className="absolute inset-0 rounded-inherit bg-white/10 animate-pulse" />
      )}
    </motion.button>
  );
}


