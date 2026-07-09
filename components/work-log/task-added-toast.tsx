"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";

const AUTO_DISMISS_MS = 2000;

export function TaskAddedToast({
  open,
  dismissKey = 0,
  message = "Task added",
  onClose,
}: {
  open: boolean;
  dismissKey?: number;
  message?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [open, onClose, dismissKey]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="task-added-backdrop"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-black/35"
            onClick={onClose}
            aria-label="Dismiss notification"
          />
          <motion.div
            key="task-added-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto relative w-full max-w-[400px] rounded-lg bg-white px-6 pb-10 pt-12 text-center shadow-[0_4px_16px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded p-1 text-[#666666] transition-colors hover:bg-black/5 hover:text-[#191919]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] border-[#057642] bg-white">
                <Check className="h-9 w-9 text-[#191919]" strokeWidth={2.5} />
              </div>
              <p className="text-[17px] font-normal leading-snug text-[rgba(0,0,0,0.75)]">{message}</p>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
