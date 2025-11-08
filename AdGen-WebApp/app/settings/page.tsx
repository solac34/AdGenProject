"use client";

import TopNav from "../../components/TopNav";
import AgentSettingsForm from "../../components/AgentSettingsForm";
import { motion } from "framer-motion";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl p-5 sm:p-8">
      <TopNav />
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -inset-x-40 -top-20 -z-10 h-56 rotate-6 bg-[radial-gradient(closest-side,_rgba(0,122,204,0.35),_transparent_70%)] blur-2xl" />
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-3xl sm:text-4xl font-semibold tracking-tight bg-gradient-to-r from-white via-white to-brand-blue bg-clip-text text-transparent"
        >
          Agent Settings
        </motion.h1>
        <p className="mt-2 text-sm text-zinc-300">
          Edit agent instructions and prompts. This page is demo-only; values are saved to your browser.
        </p>
      </div>

      <div className="mt-6">
        <AgentSettingsForm />
      </div>
    </div>
  );
}


