"use client";
import InstructionEditor from "@/components/InstructionEditor";

export default function SegmentationsPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-semibold mb-4">Segmentation Settings</h1>
      <p className="text-zinc-300 mb-6">Edit the segmentation instruction used by agents.</p>
      <InstructionEditor
        docId="segmentationInstruction"
        defaultModel="gemini-2.5-pro"
        defaultModelName="Gemini 2.5 Pro"
        defaultDescription="Guides how segmentation analysis should be performed."
        title="Segmentation"
        hideModel
      />
    </div>
  );
}


