import React, { useEffect, useId, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';

interface InfoHintProps {
  label: string;
  description?: string;
  text?: string;
  theme?: 'dark' | 'light';
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  className?: string;
}

export const InfoHint: React.FC<InfoHintProps> = ({
  label,
  description,
  text,
  theme = 'dark',
  align = 'left',
  size = 'sm',
  className = '',
}) => {
  const hintText = description ?? text ?? '';
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const isLight = theme === 'light';

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const btnPadding = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex items-center shrink-0 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`Mi ez? ${label}`}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        title={`${label}: ${hintText}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`${btnPadding} rounded-full inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
          open
            ? isLight
              ? 'bg-sky-100 text-sky-700 border border-sky-300'
              : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
            : isLight
              ? 'text-slate-400 hover:text-sky-600 hover:bg-slate-200/70'
              : 'text-slate-500 hover:text-sky-300 hover:bg-white/10'
        }`}
      >
        <Info className={iconSize} />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={label}
          className={`absolute top-full mt-2 z-50 w-64 sm:w-72 p-3 rounded-xl border shadow-2xl text-left ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${
            isLight
              ? 'bg-white border-slate-200 text-slate-800 shadow-slate-900/10'
              : 'bg-[#0e1525] border-white/15 text-slate-200 shadow-black/60'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span
              className={`text-xs font-semibold leading-snug ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {label}
            </span>
            <button
              type="button"
              aria-label="Bezárás"
              onClick={() => setOpen(false)}
              className={`p-0.5 rounded transition-colors shrink-0 ${
                isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-white'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p
            className={`text-xs leading-relaxed font-normal whitespace-normal ${
              isLight ? 'text-slate-600' : 'text-slate-300'
            }`}
          >
            {hintText}
          </p>
        </div>
      )}
    </div>
  );
};
